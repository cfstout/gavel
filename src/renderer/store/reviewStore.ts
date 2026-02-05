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
  updateCommentStatus: (commentId: string, status: CommentStatus) => void
  updateCommentMessage: (commentId: string, message: string) => void

  // Analysis state
  isAnalyzing: boolean
  analysisProgress: string
  setAnalyzing: (analyzing: boolean) => void
  setAnalysisProgress: (progress: string) => void
  appendAnalysisProgress: (chunk: string) => void

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
  screen: 'pr-input' as AppScreen,
  prRef: '',
  prData: null,
  selectedPersona: null,
  comments: [],
  isAnalyzing: false,
  analysisProgress: '',
  isSubmitting: false,
  error: null,
  isRestored: false,
}

export const useReviewStore = create<ReviewState>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    setScreen: (screen) => set({ screen }),

    setPRRef: (prRef) => set({ prRef }),

    setPRData: (prData) => set({ prData }),

    setSelectedPersona: (selectedPersona) => set({ selectedPersona }),

    setComments: (comments) => set({ comments }),

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
      set({ isRestored: true })
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
      // Clear persisted state when resetting
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
