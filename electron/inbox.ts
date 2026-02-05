import { app } from 'electron'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { InboxState, InboxPR, PRSource, KanbanColumn } from '../src/shared/types'

const INBOX_FILE = 'inbox-state.json'
const DEFAULT_POLL_INTERVAL = 300000 // 5 minutes
const DONE_CLEANUP_HOURS = 24
const IGNORE_DURATION_DAYS = 7

/**
 * Get the path to the inbox state file
 */
function getInboxPath(): string {
  return join(app.getPath('userData'), INBOX_FILE)
}

/**
 * Create default inbox state
 */
function getDefaultState(): InboxState {
  return {
    prs: [],
    sources: [],
    lastPollAt: null,
    pollIntervalMs: DEFAULT_POLL_INTERVAL,
  }
}

/**
 * Load inbox state from disk
 */
export async function loadInboxState(): Promise<InboxState> {
  const inboxPath = getInboxPath()

  if (!existsSync(inboxPath)) {
    return getDefaultState()
  }

  try {
    const content = await readFile(inboxPath, 'utf-8')
    const state = JSON.parse(content) as InboxState

    // Clean up old done items
    state.prs = cleanupDonePRs(state.prs)

    return state
  } catch {
    return getDefaultState()
  }
}

/**
 * Save inbox state to disk
 */
export async function saveInboxState(state: InboxState): Promise<void> {
  const inboxPath = getInboxPath()
  const dir = app.getPath('userData')

  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }

  await writeFile(inboxPath, JSON.stringify(state, null, 2), 'utf-8')
}

/**
 * Remove PRs from done column older than 24 hours
 */
function cleanupDonePRs(prs: InboxPR[]): InboxPR[] {
  const now = Date.now()
  const cutoff = now - DONE_CLEANUP_HOURS * 60 * 60 * 1000

  return prs.filter((pr) => {
    if (pr.column !== 'done' || !pr.doneAt) {
      return true
    }
    return new Date(pr.doneAt).getTime() > cutoff
  })
}

/**
 * Check if a PR was ignored recently (within 7 days)
 */
export function isRecentlyIgnored(pr: InboxPR): boolean {
  if (!pr.ignoredAt) {
    return false
  }

  const ignoredTime = new Date(pr.ignoredAt).getTime()
  const cutoff = Date.now() - IGNORE_DURATION_DAYS * 24 * 60 * 60 * 1000

  return ignoredTime > cutoff
}

/**
 * Generate a unique ID for a PR
 */
export function generatePRId(owner: string, repo: string, number: number): string {
  return `${owner}/${repo}#${number}`
}

/**
 * Add a new source to the inbox state
 */
export function addSource(state: InboxState, source: PRSource): InboxState {
  // Check for duplicate
  if (state.sources.some((s) => s.id === source.id)) {
    return state
  }

  return {
    ...state,
    sources: [...state.sources, source],
  }
}

/**
 * Remove a source and its associated PRs
 */
export function removeSource(state: InboxState, sourceId: string): InboxState {
  return {
    ...state,
    sources: state.sources.filter((s) => s.id !== sourceId),
    prs: state.prs.filter((pr) => pr.sourceId !== sourceId),
  }
}

/**
 * Update a source
 */
export function updateSource(state: InboxState, sourceId: string, updates: Partial<PRSource>): InboxState {
  return {
    ...state,
    sources: state.sources.map((s) => (s.id === sourceId ? { ...s, ...updates } : s)),
  }
}

/**
 * Add or update a PR in the inbox
 */
export function upsertPR(state: InboxState, pr: InboxPR): InboxState {
  const existing = state.prs.find((p) => p.id === pr.id)

  if (existing) {
    // Update existing PR, preserving certain fields
    return {
      ...state,
      prs: state.prs.map((p) =>
        p.id === pr.id
          ? {
              ...pr,
              addedAt: existing.addedAt,
              ignoredAt: existing.ignoredAt,
              reviewedAt: existing.reviewedAt,
              doneAt: existing.doneAt,
              column: existing.column,
            }
          : p
      ),
    }
  }

  // Add new PR
  return {
    ...state,
    prs: [...state.prs, pr],
  }
}

/**
 * Move a PR to a different column
 */
export function movePRToColumn(state: InboxState, prId: string, column: KanbanColumn): InboxState {
  const now = new Date().toISOString()

  return {
    ...state,
    prs: state.prs.map((pr) => {
      if (pr.id !== prId) {
        return pr
      }

      const updates: Partial<InboxPR> = { column }

      if (column === 'reviewed') {
        updates.reviewedAt = now
      } else if (column === 'done') {
        updates.doneAt = now
      }

      return { ...pr, ...updates }
    }),
  }
}

/**
 * Mark a PR as ignored
 */
export function ignorePR(state: InboxState, prId: string): InboxState {
  const now = new Date().toISOString()

  return {
    ...state,
    prs: state.prs.filter((pr) => {
      if (pr.id === prId) {
        // Track the ignore time but remove from display
        // The PR will be re-added on next poll but filtered out by isRecentlyIgnored
        return false
      }
      return true
    }),
  }
}

/**
 * Track ignored PRs separately (so they don't reappear)
 */
export function trackIgnoredPR(state: InboxState, prId: string): InboxState {
  const pr = state.prs.find((p) => p.id === prId)
  if (!pr) {
    return state
  }

  return {
    ...state,
    prs: state.prs.map((p) =>
      p.id === prId ? { ...p, ignoredAt: new Date().toISOString() } : p
    ),
  }
}
