import { spawn } from 'node:child_process'
import type {
  PRData,
  PRMetadata,
  PRFile,
  ReviewComment,
  GitHubSearchPR,
  PRStatusResult,
} from '../src/shared/types'

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
 * @param args - Command arguments
 * @param stdin - Optional stdin input (for --input -)
 */
async function execGh(args: string[], stdin?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('gh', args, {
      stdio: [stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    })

    // Write stdin if provided
    if (stdin && proc.stdin) {
      proc.stdin.write(stdin)
      proc.stdin.end()
    }

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
 * Uses the "Create a review" endpoint to batch all comments into one review
 */
export async function postComments(
  prRef: string,
  comments: ReviewComment[],
  commitSha: string
): Promise<{ posted: number; failed: Array<{ file: string; line: number; error: string }> }> {
  const { owner, repo, number } = parsePRReference(prRef)

  // Build the review payload with all comments
  const reviewComments = comments.map((c) => ({
    path: c.file,
    line: c.line,
    side: 'RIGHT',
    body: formatCommentBody(c),
  }))

  // Create the review JSON payload
  const payload = JSON.stringify({
    commit_id: commitSha,
    event: 'COMMENT', // Submit immediately (not pending)
    comments: reviewComments,
  })

  try {
    await execGh([
      'api',
      '--method',
      'POST',
      `/repos/${owner}/${repo}/pulls/${number}/reviews`,
      '--input',
      '-',
    ], payload)

    return { posted: comments.length, failed: [] }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'

    // Try to parse the error to see if specific comments failed
    // GitHub returns errors for individual comments in the response
    if (errorMsg.includes('Validation Failed')) {
      // If the batch fails, try posting comments individually as a fallback
      // This helps identify which specific comments are problematic
      return await postCommentsIndividually(owner, repo, number, comments, commitSha)
    }

    throw new Error(`Failed to create review: ${errorMsg}`)
  }
}

/**
 * Fallback: post comments individually to identify which ones fail
 */
async function postCommentsIndividually(
  owner: string,
  repo: string,
  number: number,
  comments: ReviewComment[],
  commitSha: string
): Promise<{ posted: number; failed: Array<{ file: string; line: number; error: string }> }> {
  const results = { posted: 0, failed: [] as Array<{ file: string; line: number; error: string }> }

  for (const comment of comments) {
    // Create a single-comment review for each
    const payload = JSON.stringify({
      commit_id: commitSha,
      event: 'COMMENT',
      comments: [{
        path: comment.file,
        line: comment.line,
        side: 'RIGHT',
        body: formatCommentBody(comment),
      }],
    })

    try {
      await execGh([
        'api',
        '--method',
        'POST',
        `/repos/${owner}/${repo}/pulls/${number}/reviews`,
        '--input',
        '-',
      ], payload)
      results.posted++
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      results.failed.push({
        file: comment.file,
        line: comment.line,
        error: errorMsg.slice(0, 200),
      })
    }
  }

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
 * Fetch just the PR body/description (lightweight call for previews)
 */
export async function fetchPRBody(prRef: string): Promise<string> {
  const { owner, repo, number } = parsePRReference(prRef)

  const result = await execGh([
    'pr',
    'view',
    String(number),
    '--repo',
    `${owner}/${repo}`,
    '--json',
    'body',
  ])

  const data = JSON.parse(result) as { body: string }
  return data.body || ''
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

interface GhSearchResult {
  number: number
  title: string
  body: string
  author: { login: string }
  repository: { nameWithOwner: string }
  url: string
  headRefOid: string
  state: string
  isDraft: boolean
}

/**
 * Search for PRs using a GitHub search query
 */
export async function searchPRs(query: string): Promise<GitHubSearchPR[]> {
  const result = await execGh([
    'search',
    'prs',
    query,
    '--json',
    'number,title,body,author,repository,url,headRefOid,state,isDraft',
    '--limit',
    '50',
  ])

  const prs = JSON.parse(result) as GhSearchResult[]

  return prs.map((pr) => {
    const [owner, repo] = pr.repository.nameWithOwner.split('/')
    return {
      owner,
      repo,
      number: pr.number,
      title: pr.title,
      author: pr.author.login,
      url: pr.url,
      headSha: pr.headRefOid,
      body: pr.body || undefined,
      state: mapPRState(pr.state),
    }
  })
}

/**
 * Get the current status of a PR (for detecting changes)
 */
export async function getPRStatus(prRef: string): Promise<PRStatusResult> {
  const { owner, repo, number } = parsePRReference(prRef)

  const result = await execGh([
    'pr',
    'view',
    String(number),
    '--repo',
    `${owner}/${repo}`,
    '--json',
    'headRefOid,state,mergedAt',
  ])

  const data = JSON.parse(result) as { headRefOid: string; state: string; mergedAt: string | null }

  return {
    headSha: data.headRefOid,
    state: data.mergedAt ? 'merged' : mapPRState(data.state),
  }
}

/**
 * Map GitHub PR state strings to our state type
 */
function mapPRState(state: string): 'open' | 'closed' | 'merged' {
  switch (state.toUpperCase()) {
    case 'MERGED':
      return 'merged'
    case 'CLOSED':
      return 'closed'
    default:
      return 'open'
  }
}
