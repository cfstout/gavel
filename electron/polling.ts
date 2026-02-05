import { BrowserWindow } from 'electron'
import type { InboxState, InboxPR, GitHubSearchPR, PRSource } from '../src/shared/types'
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
let rateLimitBackoffMs = 0
const MAX_BACKOFF_MS = 30 * 60 * 1000 // 30 minutes

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

  // Skip rate limit backoff only for automatic polls
  if (!force && rateLimitBackoffMs > 0) {
    rateLimitBackoffMs = Math.max(0, rateLimitBackoffMs - 60000)
    if (rateLimitBackoffMs > 0) {
      emitPollError(`Rate limited, retrying in ${Math.ceil(rateLimitBackoffMs / 60000)} minutes`)
      return
    }
  }

  // Reset rate limit on manual refresh
  if (force) {
    rateLimitBackoffMs = 0
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
    const since = hasExistingPRs ? (state.lastPollAt || undefined) : undefined

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

      if (!isRecentlyIgnored(tempPR)) {
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
 */
async function checkPRStatusChanges(state: InboxState): Promise<InboxState> {
  // Only check PRs that aren't already done
  const activePRs = state.prs.filter((pr) => pr.column !== 'done')

  for (const pr of activePRs) {
    try {
      const prRef = `${pr.owner}/${pr.repo}#${pr.number}`
      const status = await getPRStatus(prRef)

      // Check if PR was merged or closed
      if (status.state === 'merged' || status.state === 'closed') {
        state = movePRToColumn(state, pr.id, 'done')
        continue
      }

      // Check if head SHA changed (new commits)
      if (status.headSha !== pr.headSha) {
        // If PR was in 'reviewed' column, move to 'needs-attention'
        if (pr.column === 'reviewed') {
          state = movePRToColumn(state, pr.id, 'needs-attention')
        }

        // Update the head SHA
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
    } catch (err) {
      // Skip PRs we can't check (deleted, inaccessible)
      console.warn(`Failed to check PR status for ${pr.id}:`, err)
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
    // Exponential backoff
    rateLimitBackoffMs = Math.min(rateLimitBackoffMs * 2 || 60000, MAX_BACKOFF_MS)
    emitPollError(`Rate limited while polling ${source.name}. Backing off for ${Math.ceil(rateLimitBackoffMs / 60000)} minutes.`)
  } else {
    emitPollError(`Error polling ${source.name}: ${message}`)
  }
}
