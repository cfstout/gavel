import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { InboxState, InboxPR, PRSource, KanbanColumn } from '@shared/types'

interface InboxStoreState {
  // State
  prs: InboxPR[]
  sources: PRSource[]
  lastPollAt: string | null
  pollIntervalMs: number
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

export const useInboxStore = create<InboxStoreState>()(
  subscribeWithSelector((set, get) => ({
    prs: [],
    sources: [],
    lastPollAt: null,
    pollIntervalMs: DEFAULT_POLL_INTERVAL,
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
          isInitialized: true,
          isLoading: false,
        })

        // Set up event listeners for updates from polling
        window.electronAPI.onInboxUpdate((inboxState: InboxState) => {
          set({
            prs: inboxState.prs,
            sources: inboxState.sources,
            lastPollAt: inboxState.lastPollAt,
          })
        })

        window.electronAPI.onPollError((error: string) => {
          set({ error })
        })
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
      const { prs, sources, lastPollAt, pollIntervalMs } = get()

      const newSources = [...sources, source]
      const newState: InboxState = {
        prs,
        sources: newSources,
        lastPollAt,
        pollIntervalMs,
      }

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
      const { prs, sources, lastPollAt, pollIntervalMs } = get()

      const newSources = sources.filter((s) => s.id !== sourceId)
      const newPRs = prs.filter((pr) => pr.sourceId !== sourceId)
      const newState: InboxState = {
        prs: newPRs,
        sources: newSources,
        lastPollAt,
        pollIntervalMs,
      }

      try {
        await window.electronAPI.saveInboxState(newState)
        set({ sources: newSources, prs: newPRs })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to remove source'
        set({ error: message })
      }
    },

    updateSource: async (sourceId, updates) => {
      const { prs, sources, lastPollAt, pollIntervalMs } = get()

      const newSources = sources.map((s) =>
        s.id === sourceId ? { ...s, ...updates } : s
      ) as PRSource[]

      const newState: InboxState = {
        prs,
        sources: newSources,
        lastPollAt,
        pollIntervalMs,
      }

      try {
        await window.electronAPI.saveInboxState(newState)
        set({ sources: newSources })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update source'
        set({ error: message })
      }
    },

    addPR: async (pr) => {
      const { prs, sources, lastPollAt, pollIntervalMs } = get()

      // Deduplicate by ID — if it already exists, don't add again
      if (prs.some((p) => p.id === pr.id)) {
        return
      }

      const newPRs = [...prs, pr]
      const newState: InboxState = {
        prs: newPRs,
        sources,
        lastPollAt,
        pollIntervalMs,
      }

      try {
        await window.electronAPI.saveInboxState(newState)
        set({ prs: newPRs })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add PR'
        set({ error: message })
      }
    },

    movePR: async (prId, column) => {
      const { prs, sources, lastPollAt, pollIntervalMs } = get()

      const now = new Date().toISOString()
      const newPRs = prs.map((pr) => {
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

      const newState: InboxState = {
        prs: newPRs,
        sources,
        lastPollAt,
        pollIntervalMs,
      }

      try {
        await window.electronAPI.saveInboxState(newState)
        set({ prs: newPRs })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to move PR'
        set({ error: message })
      }
    },

    ignorePR: async (prId) => {
      const { prs, sources, lastPollAt, pollIntervalMs } = get()

      // Mark as ignored and filter out
      const now = new Date().toISOString()
      const newPRs = prs
        .map((pr) => (pr.id === prId ? { ...pr, ignoredAt: now } : pr))
        .filter((pr) => pr.id !== prId)

      const newState: InboxState = {
        prs: newPRs,
        sources,
        lastPollAt,
        pollIntervalMs,
      }

      try {
        await window.electronAPI.saveInboxState(newState)
        set({ prs: newPRs })
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
