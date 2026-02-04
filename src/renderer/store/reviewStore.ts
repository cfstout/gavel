import { create } from 'zustand'
import type {
  AppScreen,
  PRData,
  Persona,
  ReviewComment,
  CommentStatus,
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
}

export const useReviewStore = create<ReviewState>((set) => ({
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

  reset: () => set(initialState),
}))

// Selector helpers
export const useApprovedComments = () =>
  useReviewStore((state) => state.comments.filter((c) => c.status === 'approved'))

export const usePendingComments = () =>
  useReviewStore((state) => state.comments.filter((c) => c.status === 'pending'))
