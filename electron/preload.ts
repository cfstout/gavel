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
  analyzePR: (diff: string, persona: string) =>
    ipcRenderer.invoke('claude:analyzePR', diff, persona),
  refinementChat: (commentId: string, message: string) =>
    ipcRenderer.invoke('claude:refinementChat', commentId, message),

  // Persona operations
  getPersonas: () => ipcRenderer.invoke('personas:getAll'),

  // Event listeners for streaming
  onAnalysisProgress: (callback: (progress: string) => void) => {
    ipcRenderer.on('claude:progress', (_event, progress) => callback(progress))
    return () => ipcRenderer.removeAllListeners('claude:progress')
  },
})
