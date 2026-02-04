import { ipcMain } from 'electron'
import { fetchPR, postComments, checkAuth, getPRHeadSha } from './github'
import type { ReviewComment } from '../src/shared/types'

/**
 * Register all IPC handlers for the main process
 */
export function registerIpcHandlers(): void {
  // GitHub handlers
  ipcMain.handle('github:checkAuth', async () => {
    return checkAuth()
  })

  ipcMain.handle('github:fetchPR', async (_event, prRef: string) => {
    return fetchPR(prRef)
  })

  ipcMain.handle('github:postComments', async (_event, prRef: string, comments: ReviewComment[]) => {
    const commitSha = await getPRHeadSha(prRef)
    return postComments(prRef, comments, commitSha)
  })

  // Claude handlers (placeholder - will be implemented in Phase 3)
  ipcMain.handle('claude:analyzePR', async (_event, _diff: string, _persona: string) => {
    // TODO: Implement in Phase 3
    return []
  })

  ipcMain.handle('claude:refinementChat', async (_event, _commentId: string, _message: string) => {
    // TODO: Implement in Phase 3
    return ''
  })

  // Persona handlers (placeholder - will be implemented in Phase 3)
  ipcMain.handle('personas:getAll', async () => {
    // TODO: Implement in Phase 3
    return []
  })
}
