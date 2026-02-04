import { ipcMain, BrowserWindow } from 'electron'
import { fetchPR, postComments, checkAuth, getPRHeadSha } from './github'
import { analyzePR, refinementChat, checkClaudeAuth } from './claude'
import { loadPersonas } from './personas'
import type { ReviewComment, Persona } from '../src/shared/types'

// Cache for personas and conversation context
let personasCache: Persona[] | null = null
const refinementContexts = new Map<string, string>()

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

  // Claude handlers
  ipcMain.handle('claude:checkAuth', async () => {
    return checkClaudeAuth()
  })

  ipcMain.handle('claude:analyzePR', async (event, diff: string, personaId: string) => {
    // Get the persona content
    const personas = await getPersonas()
    const persona = personas.find((p) => p.id === personaId)

    if (!persona) {
      throw new Error(`Persona not found: ${personaId}`)
    }

    // Get the main window for progress updates
    const mainWindow = BrowserWindow.fromWebContents(event.sender)

    return analyzePR(diff, persona.content, mainWindow)
  })

  ipcMain.handle(
    'claude:refinementChat',
    async (_event, commentId: string, comment: ReviewComment, message: string) => {
      // Get existing context for this comment's refinement conversation
      const existingContext = refinementContexts.get(commentId) || ''

      // Call Claude for refinement
      const refined = await refinementChat(comment, message, existingContext)

      // Update context with new exchange
      const newContext = `${existingContext}\n\nUser: ${message}\nAssistant: ${refined}`
      refinementContexts.set(commentId, newContext)

      return refined
    }
  )

  // Persona handlers
  ipcMain.handle('personas:getAll', async () => {
    return getPersonas()
  })
}

/**
 * Get personas (with caching)
 */
async function getPersonas(): Promise<Persona[]> {
  if (!personasCache) {
    personasCache = await loadPersonas()
  }
  return personasCache
}

/**
 * Clear the personas cache (useful when user adds new personas)
 */
export function clearPersonasCache(): void {
  personasCache = null
}
