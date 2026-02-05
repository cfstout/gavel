import { spawn } from 'node:child_process'
import type { GitHubSearchPR } from '../src/shared/types'

// Regex to extract GitHub PR URLs from text
const PR_URL_REGEX = /https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/g

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
 * Fetch PRs from a Slack channel using Claude CLI with Slack MCP
 *
 * This spawns the Claude CLI and asks it to use the Slack MCP tools to
 * search for GitHub PR URLs in the specified channel.
 */
export async function fetchSlackPRs(
  channelName: string,
  since?: string
): Promise<{ prs: GitHubSearchPR[]; error?: string }> {
  const prompt = buildSlackFetchPrompt(channelName, since)

  return new Promise((resolve) => {
    const proc = spawn('claude', ['-p', prompt, '--output-format', 'text'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

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
        // Check for common errors
        if (stderr.includes('not found') || stderr.includes('ENOENT')) {
          resolve({
            prs: [],
            error: 'Claude CLI not found. Please install Claude Code.',
          })
        } else if (stderr.includes('slack') && stderr.includes('not configured')) {
          resolve({
            prs: [],
            error: 'Slack MCP plugin not configured. Enable it in Claude Code settings.',
          })
        } else {
          resolve({
            prs: [],
            error: stderr || `Claude command failed with code ${code}`,
          })
        }
        return
      }

      try {
        const result = parseSlackResponse(stdout)
        resolve(result)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        resolve({
          prs: [],
          error: `Failed to parse Slack response: ${message}`,
        })
      }
    })

    proc.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        resolve({
          prs: [],
          error: 'Claude CLI not found. Please install Claude Code.',
        })
      } else {
        resolve({
          prs: [],
          error: err.message,
        })
      }
    })
  })
}

/**
 * Build the prompt for Claude to fetch Slack messages
 */
function buildSlackFetchPrompt(channelName: string, since?: string): string {
  const sinceClause = since
    ? `Only include messages from after ${since}.`
    : 'Include messages from the last 7 days.'

  return `You have access to Slack via MCP tools. I need you to search for GitHub Pull Request URLs in a Slack channel.

## Task
1. Use the Slack MCP tool to search for messages in the channel "${channelName}" that contain "github.com" and "pull"
2. Extract all GitHub PR URLs from the messages (format: https://github.com/owner/repo/pull/number)
3. For each unique PR URL found, use the GitHub CLI (gh) to fetch the PR details
4. Return the results as JSON

${sinceClause}

## Output Format
Return ONLY a JSON object with this structure:
\`\`\`json
{
  "prs": [
    {
      "owner": "string",
      "repo": "string",
      "number": 123,
      "title": "PR title",
      "author": "username",
      "url": "https://github.com/owner/repo/pull/123",
      "headSha": "abc123...",
      "state": "open"
    }
  ],
  "error": null
}
\`\`\`

If you cannot access Slack (MCP not configured), return:
\`\`\`json
{
  "prs": [],
  "error": "Slack MCP plugin not configured. Enable it in Claude Code settings."
}
\`\`\`

If the channel doesn't exist or you can't access it:
\`\`\`json
{
  "prs": [],
  "error": "Cannot access channel: ${channelName}"
}
\`\`\`

If no PR URLs are found, return:
\`\`\`json
{
  "prs": [],
  "error": null
}
\`\`\`

Return ONLY the JSON, no other text.`
}

/**
 * Parse Claude's response containing Slack PR data
 */
function parseSlackResponse(response: string): { prs: GitHubSearchPR[]; error?: string } {
  // Try to extract JSON from the response
  let jsonStr = response

  // Remove markdown code blocks if present
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1]
  }

  // Try to find JSON object in the response
  const objectMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    jsonStr = objectMatch[0]
  }

  const parsed = JSON.parse(jsonStr.trim())

  // Validate the response structure
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Expected JSON object')
  }

  if (parsed.error) {
    return { prs: [], error: parsed.error }
  }

  if (!Array.isArray(parsed.prs)) {
    return { prs: [], error: 'Invalid response: missing prs array' }
  }

  // Validate and map each PR
  const prs: GitHubSearchPR[] = parsed.prs
    .filter((pr: unknown) => {
      if (typeof pr !== 'object' || pr === null) return false
      const p = pr as Record<string, unknown>
      return (
        typeof p.owner === 'string' &&
        typeof p.repo === 'string' &&
        typeof p.number === 'number' &&
        typeof p.title === 'string' &&
        typeof p.author === 'string' &&
        typeof p.url === 'string'
      )
    })
    .map((pr: Record<string, unknown>) => ({
      owner: pr.owner as string,
      repo: pr.repo as string,
      number: pr.number as number,
      title: pr.title as string,
      author: pr.author as string,
      url: pr.url as string,
      headSha: (pr.headSha as string) || '',
      state: mapState(pr.state as string),
    }))

  return { prs }
}

/**
 * Map state string to our type
 */
function mapState(state: string | undefined): 'open' | 'closed' | 'merged' {
  if (!state) return 'open'
  const lower = state.toLowerCase()
  if (lower === 'merged') return 'merged'
  if (lower === 'closed') return 'closed'
  return 'open'
}
