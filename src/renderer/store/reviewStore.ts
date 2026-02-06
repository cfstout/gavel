import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type {
  AppScreen,
  PRData,
  Persona,
  ReviewComment,
  CommentStatus,
  PersistedState,
} from '@shared/types'

interface ReviewState {
  // Navigation
  screen: AppScreen
  setScreen: (screen: AppScreen) => void

  // PR data
  prRef: string
  prData: PRData | null
  setPRRef: (ref: string) => void
  setPRData: (data: PRData | null) => void

  // Persona
  selectedPersona: Persona | null
  setSelectedPersona: (persona: Persona | null) => void

  // Comments
  comments: ReviewComment[]
  setComments: (comments: ReviewComment[]) => void
  addComment: (comment: ReviewComment) => void
  addComments: (comments: ReviewComment[]) => void
  updateCommentStatus: (commentId: string, status: CommentStatus) => void
  updateCommentMessage: (commentId: string, message: string) => void

  // Analysis state
  isAnalyzing: boolean
  analysisProgress: string
  analysisGeneration: number
  setAnalyzing: (analyzing: boolean) => void
  setAnalysisProgress: (progress: string) => void
  appendAnalysisProgress: (chunk: string) => void
  startAnalysisInBackground: (diff: string, personaId: string) => void

  // Submission state
  isSubmitting: boolean
  setSubmitting: (submitting: boolean) => void

  // Error state
  error: string | null
  setError: (error: string | null) => void

  // Persistence
  isRestored: boolean
  restoreState: () => Promise<boolean>
  saveState: () => Promise<void>

  // Reset
  reset: () => void
}

const initialState = {
  screen: 'inbox' as AppScreen,
  prRef: '',
  prData: null,
  selectedPersona: null,
  comments: [] as ReviewComment[],
  isAnalyzing: false,
  analysisProgress: '',
  analysisGeneration: 0,
  isSubmitting: false,
  error: null,
  isRestored: false,
}

// Stored outside Zustand state so reset() can call it without it being part of the state shape
let analysisCleanup: (() => void) | null = null

export const useReviewStore = create<ReviewState>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    setScreen: (screen) => set({ screen }),

    setPRRef: (prRef) => set({ prRef }),

    setPRData: (prData) => set({ prData }),

    setSelectedPersona: (selectedPersona) => set({ selectedPersona }),

    setComments: (comments) => set({ comments }),

    addComment: (comment) =>
      set((state) => ({ comments: [...state.comments, comment] })),

    addComments: (comments) =>
      set((state) => ({ comments: [...state.comments, ...comments] })),

    updateCommentStatus: (commentId, status) =>
      set((state) => ({
        comments: state.comments.map((c) =>
          c.id === commentId ? { ...c, status } : c
        ),
      })),

    updateCommentMessage: (commentId, message) =>
      set((state) => ({
        comments: state.comments.map((c) =>
          c.id === commentId ? { ...c, message } : c
        ),
      })),

    setAnalyzing: (isAnalyzing) => set({ isAnalyzing }),

    setAnalysisProgress: (analysisProgress) => set({ analysisProgress }),

    appendAnalysisProgress: (chunk) =>
      set((state) => ({ analysisProgress: state.analysisProgress + chunk })),

    startAnalysisInBackground: (diff, personaId) => {
      // Clean up any previous listener before starting a new analysis
      if (analysisCleanup) {
        analysisCleanup()
        analysisCleanup = null
      }

      const generation = get().analysisGeneration + 1
      set({ isAnalyzing: true, analysisProgress: '', analysisGeneration: generation, error: null })

      analysisCleanup = window.electronAPI.onAnalysisProgress((chunk) => {
        if (get().analysisGeneration !== generation) return
        get().appendAnalysisProgress(chunk)
      })

      window.electronAPI.analyzePR(diff, personaId)
        .then((comments) => {
          if (analysisCleanup) { analysisCleanup(); analysisCleanup = null }
          if (get().analysisGeneration !== generation) return
          const tagged = comments.map((c) => ({ ...c, source: 'claude' as const }))
          get().addComments(tagged)
          set({ isAnalyzing: false })
        })
        .catch((err) => {
          if (analysisCleanup) { analysisCleanup(); analysisCleanup = null }
          if (get().analysisGeneration !== generation) return
          const message = err instanceof Error ? err.message : 'Analysis failed'
          set({ isAnalyzing: false, error: message })
        })
    },

    setSubmitting: (isSubmitting) => set({ isSubmitting }),

    setError: (error) => set({ error }),

    restoreState: async () => {
      try {
        const saved = await window.electronAPI.loadState()
        if (saved && saved.prData && saved.comments.length > 0) {
          set({
            prRef: saved.prRef,
            prData: saved.prData,
            selectedPersona: saved.selectedPersona,
            comments: saved.comments,
            // Always go to review screen if we have comments
            screen: 'review',
            isRestored: true,
          })
          return true
        }
      } catch (err) {
        console.error('Failed to restore state:', err)
      }
      // Default to inbox screen
      set({ isRestored: true, screen: 'inbox' })
      return false
    },

    saveState: async () => {
      const state = get()
      // Only save if we have meaningful data to persist
      if (state.prData && state.comments.length > 0) {
        try {
          const toSave: Omit<PersistedState, 'savedAt'> = {
            prRef: state.prRef,
            prData: state.prData,
            selectedPersona: state.selectedPersona,
            comments: state.comments,
            screen: state.screen,
          }
          await window.electronAPI.saveState(toSave)
        } catch (err) {
          console.error('Failed to save state:', err)
        }
      }
    },

    reset: () => {
      if (analysisCleanup) { analysisCleanup(); analysisCleanup = null }
      window.electronAPI.clearState().catch(console.error)
      set(initialState)
    },
  }))
)

// Auto-save when comments change (status updates, new comments, etc.)
// Debounce to avoid excessive saves
let saveTimeout: ReturnType<typeof setTimeout> | null = null
useReviewStore.subscribe(
  (state) => state.comments,
  () => {
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => {
      useReviewStore.getState().saveState()
    }, 1000) // Save 1 second after last change
  }
)
