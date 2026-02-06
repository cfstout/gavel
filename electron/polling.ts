import { BrowserWindow } from 'electron'
import type { InboxState, InboxPR, GitHubSearchPR, PRSource, PRStatusResult } from '../src/shared/types'
import {
  loadInboxState,
  saveInboxState,
  generatePRId,
  isRecentlyIgnored,
  movePRToColumn,
} from './inbox'
import { searchPRs, getPRStatus } from './github'
import { fetchSlackPRs } from './slack'

let pollTimer: ReturnType<typeof setInterval> | null = null
let isPolling = false
let rateLimitUntil = 0 // Timestamp (ms) until which we should back off
const MAX_BACKOFF_MS = 30 * 60 * 1000 // 30 minutes
const PR_STATUS_CONCURRENCY = 5

/**
 * Get the main window for sending IPC events
 */
function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows()
  return windows.length > 0 ? windows[0] : null
}

/**
 * Send inbox update to renderer
 */
function emitInboxUpdate(state: InboxState): void {
  const mainWindow = getMainWindow()
  if (mainWindow) {
    mainWindow.webContents.send('inbox:update', state)
  }
}

/**
 * Send poll error to renderer
 */
function emitPollError(error: string): void {
  const mainWindow = getMainWindow()
  if (mainWindow) {
    mainWindow.webContents.send('inbox:pollError', error)
  }
}

/**
 * Start the polling timer
 */
export function startPolling(): void {
  if (pollTimer) {
    return
  }

  // Load state to get poll interval
  loadInboxState().then((state) => {
    const interval = Math.max(state.pollIntervalMs, 60000) // Minimum 1 minute

    // Do an initial poll
    runPoll(false)

    // Set up recurring poll
    pollTimer = setInterval(() => {
      runPoll(false)
    }, interval)
  })
}

/**
 * Stop the polling timer
 */
export function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

/**
 * Trigger an immediate poll (for manual refresh)
 * Manual triggers bypass the isPolling lock and rate limit backoff
 */
export async function triggerPoll(): Promise<void> {
  await runPoll(true)
}

/**
 * Run a single poll cycle
 * @param force - If true, bypass isPolling guard and rate limit backoff (for manual refresh)
 */
async function runPoll(force: boolean): Promise<void> {
  if (isPolling && !force) {
    return
  }

  // Skip if rate limited (unless manual refresh)
  if (!force && rateLimitUntil > Date.now()) {
    const remainingMs = rateLimitUntil - Date.now()
    emitPollError(`Rate limited, retrying in ${Math.ceil(remainingMs / 60000)} minutes`)
    return
  }

  // Reset rate limit on manual refresh
  if (force) {
    rateLimitUntil = 0
  }

  isPolling = true

  try {
    let state = await loadInboxState()
    const enabledSources = state.sources.filter((s) => s.enabled)

    if (enabledSources.length === 0) {
      // Nothing to poll, still update timestamp
      state = { ...state, lastPollAt: new Date().toISOString() }
      await saveInboxState(state)
      emitInboxUpdate(state)
      return
    }

    for (const source of enabledSources) {
      try {
        state = await pollSource(state, source)
      } catch (err) {
        handlePollError(err, source)
      }
    }

    // Check for PR status changes (new commits, merged, closed)
    state = await checkPRStatusChanges(state)

    // Update last poll time
    state = {
      ...state,
      lastPollAt: new Date().toISOString(),
    }

    await saveInboxState(state)
    emitInboxUpdate(state)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown polling error'
    console.error('Polling error:', message)
    emitPollError(message)
  } finally {
    isPolling = false
  }
}

/**
 * Poll a single source for new PRs
 */
async function pollSource(state: InboxState, source: PRSource): Promise<InboxState> {
  let prs: GitHubSearchPR[] = []

  if (source.type === 'github-search') {
    prs = await searchPRs(source.query)
  } else if (source.type === 'slack') {
    // For Slack, only pass `since` if we already have PRs from this source.
    // On first poll of a new source, fetch without time filter to get existing PR links.
    const hasExistingPRs = state.prs.some((p) => p.sourceId === source.id)
    const since = hasExistingPRs ? state.lastPollAt ?? undefined : undefined

    const result = await fetchSlackPRs(source.channelName, since)
    if (result.error) {
      emitPollError(result.error)
    }
    prs = result.prs
  }

  // Process discovered PRs
  for (const pr of prs) {
    const prId = generatePRId(pr.owner, pr.repo, pr.number)

    // Check if PR already exists in inbox
    const existing = state.prs.find((p) => p.id === prId)

    if (existing) {
      // Update PR data but keep column/timestamps
      state = {
        ...state,
        prs: state.prs.map((p) =>
          p.id === prId
            ? {
                ...p,
                title: pr.title,
                headSha: pr.headSha,
                lastCheckedAt: new Date().toISOString(),
              }
            : p
        ),
      }
    } else {
      // Check if this PR was recently ignored
      const tempPR: InboxPR = {
        id: prId,
        owner: pr.owner,
        repo: pr.repo,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        url: pr.url,
        headSha: pr.headSha,
        column: 'inbox',
        source: source.type,
        sourceId: source.id,
        addedAt: new Date().toISOString(),
        lastCheckedAt: new Date().toISOString(),
      }

      if (!isRecentlyIgnored(prId, state.ignoredPRIds)) {
        // Add new PR to inbox
        state = {
          ...state,
          prs: [...state.prs, tempPR],
        }
      }
    }
  }

  return state
}

/**
 * Check all PRs for status changes (new commits, merged, closed)
 * Uses capped concurrency to avoid hammering the GitHub API.
 */
async function checkPRStatusChanges(state: InboxState): Promise<InboxState> {
  // Only check PRs that aren't already done
  const activePRs = state.prs.filter((pr) => pr.column !== 'done')

  // Fetch statuses in parallel with capped concurrency
  type StatusResult = { pr: InboxPR; status: PRStatusResult } | { pr: InboxPR; error: unknown }

  const results: StatusResult[] = []
  for (let i = 0; i < activePRs.length; i += PR_STATUS_CONCURRENCY) {
    const batch = activePRs.slice(i, i + PR_STATUS_CONCURRENCY)
    const batchResults = await Promise.allSettled(
      batch.map(async (pr) => {
        const prRef = `${pr.owner}/${pr.repo}#${pr.number}`
        const status = await getPRStatus(prRef)
        return { pr, status }
      })
    )

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      } else {
        // Find which PR failed (order matches batch)
        const idx = batchResults.indexOf(result)
        results.push({ pr: batch[idx], error: result.reason })
      }
    }
  }

  for (const result of results) {
    if ('error' in result) {
      console.warn(`Failed to check PR status for ${result.pr.id}:`, result.error)
      continue
    }

    const { pr, status } = result

    // Check if PR was merged or closed
    if (status.state === 'merged' || status.state === 'closed') {
      state = movePRToColumn(state, pr.id, 'done')
      continue
    }

    // Check if head SHA changed (new commits)
    // Skip comparison when headSha is empty (e.g. just-reviewed manual PRs)
    if (pr.headSha && status.headSha !== pr.headSha) {
      if (pr.column === 'reviewed') {
        state = movePRToColumn(state, pr.id, 'needs-attention')
      }
    }

    // Always update to the latest SHA
    if (status.headSha !== pr.headSha) {
      state = {
        ...state,
        prs: state.prs.map((p) =>
          p.id === pr.id
            ? {
                ...p,
                headSha: status.headSha,
                lastCheckedAt: new Date().toISOString(),
              }
            : p
        ),
      }
    }
  }

  return state
}

/**
 * Handle errors during polling, including rate limiting
 */
function handlePollError(err: unknown, source: PRSource): void {
  const message = err instanceof Error ? err.message : 'Unknown error'

  // Check for rate limiting
  if (message.includes('403') || message.includes('429') || message.includes('rate limit')) {
    // Exponential backoff — double the remaining backoff or start at 1 minute
    const currentBackoff = Math.max(rateLimitUntil - Date.now(), 0)
    const nextBackoff = Math.min((currentBackoff * 2) || 60000, MAX_BACKOFF_MS)
    rateLimitUntil = Date.now() + nextBackoff
    emitPollError(`Rate limited while polling ${source.name}. Backing off for ${Math.ceil(nextBackoff / 60000)} minutes.`)
  } else {
    emitPollError(`Error polling ${source.name}: ${message}`)
  }
}
