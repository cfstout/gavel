import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { InboxState, InboxPR, PRSource, KanbanColumn } from '@shared/types'

interface InboxStoreState {
  // State
  prs: InboxPR[]
  sources: PRSource[]
  lastPollAt: string | null
  pollIntervalMs: number
  ignoredPRIds: Record<string, string>
  isLoading: boolean
  error: string | null
  isInitialized: boolean

  // Actions
  initialize: () => Promise<void>
  refresh: () => Promise<void>
  addSource: (source: PRSource) => Promise<void>
  removeSource: (sourceId: string) => Promise<void>
  updateSource: (sourceId: string, updates: Partial<PRSource>) => Promise<void>
  addPR: (pr: InboxPR) => Promise<void>
  movePR: (prId: string, column: KanbanColumn) => Promise<void>
  ignorePR: (prId: string) => Promise<void>
  setError: (error: string | null) => void

  // Computed getters
  getPRsByColumn: (column: KanbanColumn) => InboxPR[]
}

const DEFAULT_POLL_INTERVAL = 300000 // 5 minutes
const cleanupFns: Array<() => void> = []

/** Build an InboxState for persistence from current store state with overrides */
function buildInboxState(store: InboxStoreState, overrides: Partial<InboxState> = {}): InboxState {
  return {
    prs: store.prs,
    sources: store.sources,
    lastPollAt: store.lastPollAt,
    pollIntervalMs: store.pollIntervalMs,
    ignoredPRIds: store.ignoredPRIds,
    ...overrides,
  }
}

export const useInboxStore = create<InboxStoreState>()(
  subscribeWithSelector((set, get) => ({
    prs: [],
    sources: [],
    lastPollAt: null,
    pollIntervalMs: DEFAULT_POLL_INTERVAL,
    ignoredPRIds: {},
    isLoading: false,
    error: null,
    isInitialized: false,

    initialize: async () => {
      if (get().isInitialized) {
        return
      }

      set({ isLoading: true })

      try {
        const state = await window.electronAPI.loadInboxState()
        set({
          prs: state.prs,
          sources: state.sources,
          lastPollAt: state.lastPollAt,
          pollIntervalMs: state.pollIntervalMs,
          ignoredPRIds: state.ignoredPRIds ?? {},
          isInitialized: true,
          isLoading: false,
        })

        // Clean up any previous listeners before registering new ones
        if (cleanupFns.length > 0) {
          cleanupFns.forEach((fn) => fn())
          cleanupFns.length = 0
        }

        // Set up event listeners for updates from polling
        cleanupFns.push(
          window.electronAPI.onInboxUpdate((inboxState: InboxState) => {
            set({
              prs: inboxState.prs,
              sources: inboxState.sources,
              lastPollAt: inboxState.lastPollAt,
            })
          })
        )

        cleanupFns.push(
          window.electronAPI.onPollError((error: string) => {
            set({ error })
          })
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load inbox'
        set({ error: message, isLoading: false, isInitialized: true })
      }
    },

    refresh: async () => {
      set({ isLoading: true, error: null })

      try {
        await window.electronAPI.triggerPoll()
        // The poll will emit an inbox:update event which will update the state
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to refresh'
        set({ error: message })
      } finally {
        set({ isLoading: false })
      }
    },

    addSource: async (source) => {
      const newSources = [...get().sources, source]
      const newState = buildInboxState(get(), { sources: newSources })

      try {
        await window.electronAPI.saveInboxState(newState)
        set({ sources: newSources })

        // Trigger a poll to fetch PRs from the new source
        get().refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add source'
        set({ error: message })
      }
    },

    removeSource: async (sourceId) => {
      const newSources = get().sources.filter((s) => s.id !== sourceId)
      const newPRs = get().prs.filter((pr) => pr.sourceId !== sourceId)
      const newState = buildInboxState(get(), { prs: newPRs, sources: newSources })

      try {
        await window.electronAPI.saveInboxState(newState)
        set({ sources: newSources, prs: newPRs })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to remove source'
        set({ error: message })
      }
    },

    updateSource: async (sourceId, updates) => {
      const newSources = get().sources.map((s) =>
        s.id === sourceId ? { ...s, ...updates } : s
      ) as PRSource[]
      const newState = buildInboxState(get(), { sources: newSources })

      try {
        await window.electronAPI.saveInboxState(newState)
        set({ sources: newSources })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update source'
        set({ error: message })
      }
    },

    addPR: async (pr) => {
      // Deduplicate by ID — if it already exists, don't add again
      if (get().prs.some((p) => p.id === pr.id)) {
        return
      }

      const newPRs = [...get().prs, pr]
      const newState = buildInboxState(get(), { prs: newPRs })

      try {
        await window.electronAPI.saveInboxState(newState)
        set({ prs: newPRs })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add PR'
        set({ error: message })
      }
    },

    movePR: async (prId, column) => {
      const now = new Date().toISOString()
      const newPRs = get().prs.map((pr) => {
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
      })
      const newState = buildInboxState(get(), { prs: newPRs })

      try {
        await window.electronAPI.saveInboxState(newState)
        set({ prs: newPRs })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to move PR'
        set({ error: message })
      }
    },

    ignorePR: async (prId) => {
      const now = new Date().toISOString()
      const newPRs = get().prs.filter((pr) => pr.id !== prId)
      const newIgnoredPRIds = { ...get().ignoredPRIds, [prId]: now }
      const newState = buildInboxState(get(), { prs: newPRs, ignoredPRIds: newIgnoredPRIds })

      try {
        await window.electronAPI.saveInboxState(newState)
        set({ prs: newPRs, ignoredPRIds: newIgnoredPRIds })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to ignore PR'
        set({ error: message })
      }
    },

    setError: (error) => set({ error }),

    getPRsByColumn: (column) => {
      return get().prs.filter((pr) => pr.column === column)
    },
  }))
)
