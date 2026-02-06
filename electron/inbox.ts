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
    ignoredPRIds: {},
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

    // Backfill ignoredPRIds for older state files
    if (!state.ignoredPRIds) {
      state.ignoredPRIds = {}
    }

    // Clean up old done items and expired ignores
    state.prs = cleanupDonePRs(state.prs)
    state.ignoredPRIds = cleanupExpiredIgnores(state.ignoredPRIds)

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
 * Check if a PR ID was ignored recently (within 7 days)
 */
export function isRecentlyIgnored(prId: string, ignoredPRIds: Record<string, string>): boolean {
  const ignoredAt = ignoredPRIds[prId]
  if (!ignoredAt) {
    return false
  }

  const ignoredTime = new Date(ignoredAt).getTime()
  const cutoff = Date.now() - IGNORE_DURATION_DAYS * 24 * 60 * 60 * 1000

  return ignoredTime > cutoff
}

/**
 * Remove expired ignores (older than 7 days)
 */
function cleanupExpiredIgnores(ignoredPRIds: Record<string, string>): Record<string, string> {
  const cutoff = Date.now() - IGNORE_DURATION_DAYS * 24 * 60 * 60 * 1000
  const cleaned: Record<string, string> = {}

  for (const [prId, ignoredAt] of Object.entries(ignoredPRIds)) {
    if (new Date(ignoredAt).getTime() > cutoff) {
      cleaned[prId] = ignoredAt
    }
  }

  return cleaned
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
 * Mark a PR as ignored — removes from display and records in ignoredPRIds
 */
export function ignorePR(state: InboxState, prId: string): InboxState {
  const now = new Date().toISOString()

  return {
    ...state,
    prs: state.prs.filter((pr) => pr.id !== prId),
    ignoredPRIds: { ...state.ignoredPRIds, [prId]: now },
  }
}
