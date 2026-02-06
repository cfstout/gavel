import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // GitHub operations
  checkGitHubAuth: () => ipcRenderer.invoke('github:checkAuth'),
  fetchPR: (prUrl: string) => ipcRenderer.invoke('github:fetchPR', prUrl),
  fetchPRBody: (prRef: string) => ipcRenderer.invoke('github:fetchPRBody', prRef),
  postComments: (prUrl: string, comments: unknown[]) =>
    ipcRenderer.invoke('github:postComments', prUrl, comments),
  searchPRs: (query: string) => ipcRenderer.invoke('github:searchPRs', query),
  getPRStatus: (prRef: string) => ipcRenderer.invoke('github:getPRStatus', prRef),

  // Claude operations
  checkClaudeAuth: () => ipcRenderer.invoke('claude:checkAuth'),
  analyzePR: (diff: string, personaId: string) =>
    ipcRenderer.invoke('claude:analyzePR', diff, personaId),
  refinementChat: (commentId: string, comment: unknown, message: string) =>
    ipcRenderer.invoke('claude:refinementChat', commentId, comment, message),

  // Persona operations
  getPersonas: () => ipcRenderer.invoke('personas:getAll'),

  // Persistence operations
  saveState: (state: unknown) => ipcRenderer.invoke('state:save', state),
  loadState: () => ipcRenderer.invoke('state:load'),
  clearState: () => ipcRenderer.invoke('state:clear'),

  // Inbox operations
  loadInboxState: () => ipcRenderer.invoke('inbox:load'),
  saveInboxState: (state: unknown) => ipcRenderer.invoke('inbox:save', state),
  fetchSlackPRs: (channelName: string, since?: string) =>
    ipcRenderer.invoke('inbox:fetchSlackPRs', channelName, since),

  // Slack token
  hasSlackToken: () => ipcRenderer.invoke('slack:hasToken'),
  saveSlackToken: (token: string) => ipcRenderer.invoke('slack:saveToken', token),

  // Polling operations
  startPolling: () => ipcRenderer.invoke('polling:start'),
  stopPolling: () => ipcRenderer.invoke('polling:stop'),
  triggerPoll: () => ipcRenderer.invoke('polling:trigger'),

  // Event listeners for streaming
  onAnalysisProgress: (callback: (progress: string) => void) => {
    const handler = (_event: unknown, progress: string) => callback(progress)
    ipcRenderer.on('claude:progress', handler)
    return () => { ipcRenderer.removeListener('claude:progress', handler) }
  },

  // Inbox event listeners
  onInboxUpdate: (callback: (state: unknown) => void) => {
    const handler = (_event: unknown, state: unknown) => callback(state)
    ipcRenderer.on('inbox:update', handler)
    return () => { ipcRenderer.removeListener('inbox:update', handler) }
  },

  onPollError: (callback: (error: string) => void) => {
    const handler = (_event: unknown, error: string) => callback(error)
    ipcRenderer.on('inbox:pollError', handler)
    return () => { ipcRenderer.removeListener('inbox:pollError', handler) }
  },
})
