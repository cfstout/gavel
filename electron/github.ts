import { spawn } from 'node:child_process'
import type { PRData, PRMetadata, PRFile, ReviewComment } from '../src/shared/types'

interface GhPRResponse {
  number: number
  title: string
  author: { login: string }
  headRefName: string
  baseRefName: string
  url: string
  files: Array<{
    path: string
    additions: number
    deletions: number
  }>
}

/**
 * Execute a gh CLI command and return the output
 */
async function execGh(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('gh', args, {
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
        if (stderr.includes('gh auth login')) {
          reject(new Error('GitHub CLI not authenticated. Please run: gh auth login'))
        } else if (stderr.includes('Could not resolve')) {
          reject(new Error('Repository not found or not accessible'))
        } else {
          // Include stdout in error for API responses that return error details
          const errorDetails = stdout || stderr
          reject(new Error(errorDetails || `gh command failed with code ${code}`))
        }
      } else {
        resolve(stdout)
      }
    })

    proc.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error('GitHub CLI (gh) not found. Please install: https://cli.github.com'))
      } else {
        reject(err)
      }
    })
  })
}

/**
 * Parse a PR reference (owner/repo#123 or URL) into components
 */
export function parsePRReference(input: string): { owner: string; repo: string; number: number } {
  // Try URL format first: https://github.com/owner/repo/pull/123
  const urlMatch = input.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2], number: parseInt(urlMatch[3], 10) }
  }

  // Try short format: owner/repo#123
  const shortMatch = input.match(/^([^/]+)\/([^#]+)#(\d+)$/)
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2], number: parseInt(shortMatch[3], 10) }
  }

  throw new Error('Invalid PR reference. Use owner/repo#123 or a GitHub PR URL')
}

/**
 * Fetch PR metadata using gh CLI
 */
export async function fetchPR(prRef: string): Promise<PRData> {
  const { owner, repo, number } = parsePRReference(prRef)
  const repoArg = `${owner}/${repo}`

  // Fetch PR metadata
  const prJson = await execGh([
    'pr',
    'view',
    String(number),
    '--repo',
    repoArg,
    '--json',
    'number,title,author,headRefName,baseRefName,url,files',
  ])

  const prData = JSON.parse(prJson) as GhPRResponse

  // Fetch the diff
  const diff = await execGh(['pr', 'diff', String(number), '--repo', repoArg])

  // Map files to our format
  const files: PRFile[] = prData.files.map((f) => ({
    filename: f.path,
    status: f.additions > 0 && f.deletions > 0 ? 'modified' : f.additions > 0 ? 'added' : 'deleted',
    additions: f.additions,
    deletions: f.deletions,
  }))

  const metadata: PRMetadata = {
    owner,
    repo,
    number: prData.number,
    title: prData.title,
    author: prData.author.login,
    headRef: prData.headRefName,
    baseRef: prData.baseRefName,
    url: prData.url,
  }

  return { metadata, files, diff }
}

/**
 * Post review comments to a PR using gh API
 * Returns info about which comments succeeded/failed
 */
export async function postComments(
  prRef: string,
  comments: ReviewComment[],
  commitSha: string
): Promise<{ posted: number; failed: Array<{ file: string; line: number; error: string }> }> {
  const { owner, repo, number } = parsePRReference(prRef)

  const results = { posted: 0, failed: [] as Array<{ file: string; line: number; error: string }> }

  // Post each comment individually using the pull request review comments API
  for (const comment of comments) {
    try {
      await execGh([
        'api',
        '--method',
        'POST',
        `/repos/${owner}/${repo}/pulls/${number}/comments`,
        '-f',
        `body=${formatCommentBody(comment)}`,
        '-f',
        `path=${comment.file}`,
        '-F',
        `line=${comment.line}`, // -F sends as raw JSON (integer)
        '-f',
        `commit_id=${commitSha}`,
        '-f',
        'side=RIGHT', // Comment on the new version of the file
        '-f',
        'subject_type=line', // Required for line comments
      ])
      results.posted++
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      // Check if it's a line-not-in-diff error
      if (errorMsg.includes('422') || errorMsg.includes('Validation Failed')) {
        results.failed.push({
          file: comment.file,
          line: comment.line,
          error: `Line ${comment.line} is not part of the diff - comment skipped`,
        })
      } else {
        results.failed.push({
          file: comment.file,
          line: comment.line,
          error: errorMsg,
        })
      }
    }
  }

  // If all comments failed, throw an error
  if (results.posted === 0 && results.failed.length > 0) {
    const failureDetails = results.failed
      .map((f) => `  ${f.file}:${f.line} - ${f.error}`)
      .join('\n')
    throw new Error(`Failed to post any comments:\n${failureDetails}`)
  }

  return results
}

/**
 * Get the latest commit SHA for a PR
 */
export async function getPRHeadSha(prRef: string): Promise<string> {
  const { owner, repo, number } = parsePRReference(prRef)

  const result = await execGh([
    'pr',
    'view',
    String(number),
    '--repo',
    `${owner}/${repo}`,
    '--json',
    'headRefOid',
  ])

  const data = JSON.parse(result) as { headRefOid: string }
  return data.headRefOid
}

/**
 * Format a comment body with severity indicator
 */
function formatCommentBody(comment: ReviewComment): string {
  const severityEmoji = {
    suggestion: '💡',
    warning: '⚠️',
    critical: '🚨',
  }

  return `${severityEmoji[comment.severity]} **${comment.severity.toUpperCase()}**\n\n${comment.message}`
}

/**
 * Check if gh CLI is authenticated
 */
export async function checkAuth(): Promise<boolean> {
  try {
    await execGh(['auth', 'status'])
    return true
  } catch {
    return false
  }
}
