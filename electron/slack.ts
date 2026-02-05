import { spawn } from 'node:child_process'
import type { GitHubSearchPR } from '../src/shared/types'
import { getPRStatus } from './github'

// Regex to extract GitHub PR URLs from text
const PR_URL_REGEX = /https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/g

interface SlackMessage {
  text: string
  ts: string
  user?: string
}

interface SlackSearchResponse {
  messages: {
    matches: SlackMessage[]
  }
}

/**
 * Execute a claude command to access Slack MCP
 * This runs the Claude CLI which has MCP access configured
 */
async function execClaudeMcp(toolName: string, params: Record<string, unknown>): Promise<string> {
  return new Promise((resolve, reject) => {
    // Build the MCP call as a JSON request
    const request = JSON.stringify({
      tool: toolName,
      params,
    })

    // We'll use the gh CLI approach - spawn a process
    // For now, we'll use a simple approach: call the Slack API via the gh-like pattern
    // In practice, this would integrate with the MCP server

    // Since we can't directly call MCP from the Electron app,
    // we'll use a workaround: parse slack message exports or use gh to fetch

    reject(new Error('Slack MCP integration requires Claude CLI context'))
  })
}

/**
 * Extract GitHub PR URLs from a text string
 */
export function extractPRUrls(text: string): Array<{ owner: string; repo: string; number: number }> {
  const matches: Array<{ owner: string; repo: string; number: number }> = []
  let match: RegExpExecArray | null

  // Reset regex state
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
 * Deduplicate PR matches
 */
function deduplicatePRs(prs: Array<{ owner: string; repo: string; number: number }>): Array<{ owner: string; repo: string; number: number }> {
  const seen = new Set<string>()
  return prs.filter((pr) => {
    const key = `${pr.owner}/${pr.repo}#${pr.number}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

/**
 * Fetch PR details from GitHub for extracted URLs
 */
async function fetchPRDetails(
  prs: Array<{ owner: string; repo: string; number: number }>
): Promise<GitHubSearchPR[]> {
  const results: GitHubSearchPR[] = []

  for (const pr of prs) {
    try {
      const prRef = `${pr.owner}/${pr.repo}#${pr.number}`
      const status = await getPRStatus(prRef)

      // Fetch full PR details using gh
      const proc = spawn('gh', [
        'pr',
        'view',
        String(pr.number),
        '--repo',
        `${pr.owner}/${pr.repo}`,
        '--json',
        'title,author,url,headRefOid,state,mergedAt',
      ])

      const output = await new Promise<string>((resolve, reject) => {
        let stdout = ''
        let stderr = ''

        proc.stdout.on('data', (data) => {
          stdout += data.toString()
        })
        proc.stderr.on('data', (data) => {
          stderr += data.toString()
        })

        proc.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(stderr || `gh failed with code ${code}`))
          } else {
            resolve(stdout)
          }
        })

        proc.on('error', reject)
      })

      const data = JSON.parse(output) as {
        title: string
        author: { login: string }
        url: string
        headRefOid: string
        state: string
        mergedAt: string | null
      }

      results.push({
        owner: pr.owner,
        repo: pr.repo,
        number: pr.number,
        title: data.title,
        author: data.author.login,
        url: data.url,
        headSha: data.headRefOid,
        state: data.mergedAt ? 'merged' : status.state,
      })
    } catch (err) {
      // Skip PRs we can't access
      console.warn(`Failed to fetch PR ${pr.owner}/${pr.repo}#${pr.number}:`, err)
    }
  }

  return results
}

/**
 * Fetch PRs from a Slack channel
 *
 * This function attempts to use the Slack MCP to search for PR URLs in a channel.
 * If MCP is not available, it returns an error that guides the user to configure it.
 */
export async function fetchSlackPRs(
  channelName: string,
  since?: string
): Promise<{ prs: GitHubSearchPR[]; error?: string }> {
  try {
    // Build search query - search for github.com/*/pull URLs in the channel
    const searchQuery = `in:${channelName} github.com/*/pull`

    // Try to use Slack MCP via Claude CLI
    // For now, we'll simulate the expected response format

    // The actual implementation would call:
    // mcp__slack__conversations_search_messages({
    //   search_query: searchQuery,
    //   filter_date_after: since,
    //   limit: 50
    // })

    // Since we can't directly call MCP from Electron's main process,
    // we need to use a different approach:

    // Option 1: Use a local file that contains exported Slack messages
    // Option 2: Use a Slack bot token directly (requires user setup)
    // Option 3: Return an error prompting the user to configure Slack integration

    return {
      prs: [],
      error:
        'Slack integration requires the Slack MCP plugin to be enabled in Claude Code. ' +
        'To use this feature, please configure the Slack MCP server in your Claude Code settings.',
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return {
      prs: [],
      error: `Failed to fetch from Slack: ${message}`,
    }
  }
}

/**
 * Parse Slack messages and extract PR URLs
 * This is used when we have raw message data (e.g., from an export)
 */
export function parseSlackMessages(messages: Array<{ text: string }>): Array<{ owner: string; repo: string; number: number }> {
  const allPRs: Array<{ owner: string; repo: string; number: number }> = []

  for (const message of messages) {
    const prs = extractPRUrls(message.text)
    allPRs.push(...prs)
  }

  return deduplicatePRs(allPRs)
}
