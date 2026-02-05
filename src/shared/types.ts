// Inbox/Kanban types
export type KanbanColumn = 'inbox' | 'needs-attention' | 'reviewed' | 'done'

export interface InboxPR {
  id: string // "{owner}/{repo}#{number}"
  owner: string
  repo: string
  number: number
  title: string
  author: string
  url: string
  headSha: string // Track for change detection
  column: KanbanColumn
  source: 'github-search' | 'slack'
  sourceId: string // Which source found this PR
  addedAt: string // ISO timestamp
  lastCheckedAt: string
  ignoredAt?: string // If ignored
  reviewedAt?: string // When moved to reviewed
  doneAt?: string // When merged/closed
}

export type PRSource = GitHubSearchSource | SlackChannelSource

export interface GitHubSearchSource {
  id: string
  type: 'github-search'
  name: string
  query: string // e.g., "is:pr is:open review-requested:@me"
  enabled: boolean
}

export interface SlackChannelSource {
  id: string
  type: 'slack'
  name: string // User-friendly name
  channelName: string // e.g., "code-reviews" (without #)
  enabled: boolean
}

export interface InboxState {
  prs: InboxPR[]
  sources: PRSource[]
  lastPollAt: string | null
  pollIntervalMs: number // Default 300000 (5 min)
}

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
  | 'inbox'
  | 'pr-input'
  | 'persona-select'
  | 'analyzing'
  | 'review'
  | 'submitting'

// Result from posting comments
export interface PostCommentsResult {
  posted: number
  failed: Array<{ file: string; line: number; error: string }>
}

// Persisted state for resuming reviews
export interface PersistedState {
  prRef: string
  prData: PRData | null
  selectedPersona: Persona | null
  comments: ReviewComment[]
  screen: AppScreen
  savedAt: string
}

// GitHub search result
export interface GitHubSearchPR {
  owner: string
  repo: string
  number: number
  title: string
  author: string
  url: string
  headSha: string
  state: 'open' | 'closed' | 'merged'
}

// PR status check result
export interface PRStatusResult {
  headSha: string
  state: 'open' | 'closed' | 'merged'
}

// IPC API type for renderer
export interface ElectronAPI {
  // GitHub
  checkGitHubAuth: () => Promise<boolean>
  fetchPR: (prUrl: string) => Promise<PRData>
  postComments: (prUrl: string, comments: ReviewComment[]) => Promise<PostCommentsResult>
  searchPRs: (query: string) => Promise<GitHubSearchPR[]>
  getPRStatus: (prRef: string) => Promise<PRStatusResult>
  // Claude
  checkClaudeAuth: () => Promise<boolean>
  analyzePR: (diff: string, personaId: string) => Promise<ReviewComment[]>
  refinementChat: (commentId: string, comment: ReviewComment, message: string) => Promise<string>
  // Personas
  getPersonas: () => Promise<Persona[]>
  // Persistence
  saveState: (state: Omit<PersistedState, 'savedAt'>) => Promise<void>
  loadState: () => Promise<PersistedState | null>
  clearState: () => Promise<void>
  // Inbox
  loadInboxState: () => Promise<InboxState>
  saveInboxState: (state: InboxState) => Promise<void>
  fetchSlackPRs: (channelName: string, since?: string) => Promise<GitHubSearchPR[]>
  // Slack token
  hasSlackToken: () => Promise<boolean>
  saveSlackToken: (token: string) => Promise<void>
  // Polling
  startPolling: () => void
  stopPolling: () => void
  triggerPoll: () => Promise<void>
  // Events
  onAnalysisProgress: (callback: (progress: string) => void) => () => void
  onInboxUpdate: (callback: (state: InboxState) => void) => () => void
  onPollError: (callback: (error: string) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
