// PR types
export interface PRMetadata {
  owner: string
  repo: string
  number: number
  title: string
  author: string
  headRef: string
  baseRef: string
  url: string
}

export interface PRFile {
  filename: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  additions: number
  deletions: number
  patch?: string
}

export interface PRData {
  metadata: PRMetadata
  files: PRFile[]
  diff: string
}

// Review persona
export interface Persona {
  id: string
  name: string
  description: string
  content: string // The full prompt content
  isBuiltIn: boolean
}

// Review comment states
export type CommentStatus = 'pending' | 'approved' | 'rejected' | 'refining'

export interface ReviewComment {
  id: string
  file: string
  line: number
  message: string
  severity: 'suggestion' | 'warning' | 'critical'
  status: CommentStatus
  originalMessage: string // Keep original for comparison
}

// Application state
export type AppScreen =
  | 'pr-input'
  | 'persona-select'
  | 'analyzing'
  | 'review'
  | 'submitting'

// IPC API type for renderer
export interface ElectronAPI {
  fetchPR: (prUrl: string) => Promise<PRData>
  postComments: (prUrl: string, comments: ReviewComment[]) => Promise<void>
  analyzePR: (diff: string, persona: string) => Promise<ReviewComment[]>
  refinementChat: (commentId: string, message: string) => Promise<string>
  getPersonas: () => Promise<Persona[]>
  onAnalysisProgress: (callback: (progress: string) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
