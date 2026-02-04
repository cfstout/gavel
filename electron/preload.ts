import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // GitHub operations
  checkGitHubAuth: () => ipcRenderer.invoke('github:checkAuth'),
  fetchPR: (prUrl: string) => ipcRenderer.invoke('github:fetchPR', prUrl),
  postComments: (prUrl: string, comments: unknown[]) =>
    ipcRenderer.invoke('github:postComments', prUrl, comments),

  // Claude operations
  checkClaudeAuth: () => ipcRenderer.invoke('claude:checkAuth'),
  analyzePR: (diff: string, personaId: string) =>
    ipcRenderer.invoke('claude:analyzePR', diff, personaId),
  refinementChat: (commentId: string, comment: unknown, message: string) =>
    ipcRenderer.invoke('claude:refinementChat', commentId, comment, message),

  // Persona operations
  getPersonas: () => ipcRenderer.invoke('personas:getAll'),

  // Event listeners for streaming
  onAnalysisProgress: (callback: (progress: string) => void) => {
    ipcRenderer.on('claude:progress', (_event, progress) => callback(progress))
    return () => ipcRenderer.removeAllListeners('claude:progress')
  },
})
