import { app, safeStorage } from 'electron'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import type { GitHubSearchPR } from '../src/shared/types'

const PR_URL_REGEX = /https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/g
const SLACK_TOKEN_FILE = 'slack-token.enc'
const SLACK_API_BASE = 'https://slack.com/api'

// Cache channel name -> ID mappings
const channelIdCache = new Map<string, string>()

// --- Token Management ---

/**
 * Get the Slack token file path
 */
function getTokenPath(): string {
  return join(app.getPath('userData'), SLACK_TOKEN_FILE)
}

/**
 * Get Slack token - checks env var first, then safeStorage
 */
export async function getSlackToken(): Promise<string | null> {
  // Env var takes priority
  const envToken = process.env.SLACK_USER_TOKEN
  if (envToken) {
    return envToken
  }

  // Try safeStorage
  const tokenPath = getTokenPath()
  if (!existsSync(tokenPath)) {
    return null
  }

  try {
    const encrypted = await readFile(tokenPath)
    return safeStorage.decryptString(encrypted)
  } catch {
    return null
  }
}

/**
 * Save Slack token using safeStorage
 */
export async function saveSlackToken(token: string): Promise<void> {
  const tokenPath = getTokenPath()
  const dir = app.getPath('userData')

  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }

  const encrypted = safeStorage.encryptString(token)
  await writeFile(tokenPath, encrypted)
}

/**
 * Check if a Slack token is available
 */
export async function hasSlackToken(): Promise<boolean> {
  const token = await getSlackToken()
  return token !== null
}

// --- Slack API ---

/**
 * Make a Slack API call
 */
async function slackAPI<T>(method: string, params: Record<string, string> = {}): Promise<T> {
  const token = await getSlackToken()
  if (!token) {
    throw new Error('No Slack token configured. Set SLACK_USER_TOKEN env var or enter a token in Settings.')
  }

  const url = new URL(`${SLACK_API_BASE}/${method}`)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    throw new Error(`Slack API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json() as T & { ok: boolean; error?: string }

  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error || 'unknown error'}`)
  }

  return data
}

/**
 * Resolve a channel name to its ID
 * Paginates through conversations.list to find the match
 */
async function resolveChannelId(channelName: string): Promise<string> {
  // Strip # prefix if present
  const name = channelName.replace(/^#/, '')

  // Check cache
  const cached = channelIdCache.get(name)
  if (cached) {
    return cached
  }

  let cursor: string | undefined

  do {
    const params: Record<string, string> = {
      types: 'public_channel,private_channel',
      exclude_archived: 'true',
      limit: '200',
    }
    if (cursor) {
      params.cursor = cursor
    }

    const data = await slackAPI<{
      channels: Array<{ id: string; name: string }>
      response_metadata?: { next_cursor?: string }
    }>('conversations.list', params)

    for (const channel of data.channels) {
      // Cache all results while we're at it
      channelIdCache.set(channel.name, channel.id)

      if (channel.name === name) {
        return channel.id
      }
    }

    cursor = data.response_metadata?.next_cursor || undefined
  } while (cursor)

  throw new Error(`Channel not found: #${name}`)
}

/**
 * Fetch messages from a channel
 */
async function fetchChannelMessages(
  channelId: string,
  since?: string,
  limit = 100
): Promise<Array<{ text: string; ts: string }>> {
  const params: Record<string, string> = {
    channel: channelId,
    limit: String(limit),
  }

  if (since) {
    // Convert ISO timestamp to Slack's epoch format
    const epochSeconds = Math.floor(new Date(since).getTime() / 1000)
    params.oldest = String(epochSeconds)
  }

  const data = await slackAPI<{
    messages: Array<{ text: string; ts: string }>
  }>('conversations.history', params)

  return data.messages || []
}

// --- PR Extraction ---

/**
 * Extract GitHub PR URLs from a text string
 */
export function extractPRUrls(text: string): Array<{ owner: string; repo: string; number: number }> {
  const matches: Array<{ owner: string; repo: string; number: number }> = []
  let match: RegExpExecArray | null

  PR_URL_REGEX.lastIndex = 0

  while ((match = PR_URL_REGEX.exec(text)) !== null) {
    matches.push({
      owner: match[1],
      repo: match[2],
      number: parseInt(match[3], 10),
    })
  }

  return matches
}

/**
 * Deduplicate PRs by owner/repo#number
 */
function deduplicatePRs(
  prs: Array<{ owner: string; repo: string; number: number }>
): Array<{ owner: string; repo: string; number: number }> {
  const seen = new Set<string>()
  return prs.filter((pr) => {
    const key = `${pr.owner}/${pr.repo}#${pr.number}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Fetch PR details from GitHub for a single PR
 */
async function fetchPRDetails(
  owner: string,
  repo: string,
  number: number
): Promise<GitHubSearchPR | null> {
  return new Promise((resolve) => {
    const proc = spawn('gh', [
      'pr', 'view', String(number),
      '--repo', `${owner}/${repo}`,
      '--json', 'title,author,url,headRefOid,state,mergedAt',
    ])

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (d) => { stdout += d.toString() })
    proc.stderr.on('data', (d) => { stderr += d.toString() })

    proc.on('close', (code) => {
      if (code !== 0) {
        console.warn(`Failed to fetch PR ${owner}/${repo}#${number}: ${stderr}`)
        resolve(null)
        return
      }

      try {
        const data = JSON.parse(stdout) as {
          title: string
          author: { login: string }
          url: string
          headRefOid: string
          state: string
          mergedAt: string | null
        }

        resolve({
          owner,
          repo,
          number,
          title: data.title,
          author: data.author.login,
          url: data.url,
          headSha: data.headRefOid,
          state: data.mergedAt ? 'merged' : mapState(data.state),
        })
      } catch {
        resolve(null)
      }
    })

    proc.on('error', () => resolve(null))
  })
}

// --- Public API ---

/**
 * Fetch PRs from a Slack channel
 *
 * Resolves channel name -> ID, fetches messages, extracts PR URLs,
 * and fetches PR metadata from GitHub.
 */
export async function fetchSlackPRs(
  channelName: string,
  since?: string
): Promise<{ prs: GitHubSearchPR[]; error?: string }> {
  try {
    // Resolve channel name to ID
    const channelId = await resolveChannelId(channelName)

    // Fetch messages
    const messages = await fetchChannelMessages(channelId, since)

    // Extract PR URLs from all messages
    const allPRRefs: Array<{ owner: string; repo: string; number: number }> = []
    for (const msg of messages) {
      allPRRefs.push(...extractPRUrls(msg.text))
    }

    const uniquePRs = deduplicatePRs(allPRRefs)

    if (uniquePRs.length === 0) {
      return { prs: [] }
    }

    // Fetch details for each PR (in parallel, capped at 5 concurrent)
    const results: GitHubSearchPR[] = []
    const batchSize = 5

    for (let i = 0; i < uniquePRs.length; i += batchSize) {
      const batch = uniquePRs.slice(i, i + batchSize)
      const batchResults = await Promise.all(
        batch.map((pr) => fetchPRDetails(pr.owner, pr.repo, pr.number))
      )
      for (const result of batchResults) {
        if (result) results.push(result)
      }
    }

    return { prs: results }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { prs: [], error: message }
  }
}

/**
 * Map state string to our type
 */
function mapState(state: string | undefined): 'open' | 'closed' | 'merged' {
  if (!state) return 'open'
  const upper = state.toUpperCase()
  if (upper === 'MERGED') return 'merged'
  if (upper === 'CLOSED') return 'closed'
  return 'open'
}
