import { ipcMain, BrowserWindow } from 'electron'
import { fetchPR, fetchPRBody, postComments, checkAuth, getPRHeadSha, searchPRs, getPRStatus } from './github'
import { analyzePR, refinementChat, checkClaudeAuth } from './claude'
import { loadPersonas } from './personas'
import { saveState, loadState, clearState } from './persistence'
import { loadInboxState, saveInboxState } from './inbox'
import { fetchSlackPRs, hasSlackToken, saveSlackToken } from './slack'
import { startPolling, stopPolling, triggerPoll } from './polling'
import type { ReviewComment, ReviewEventType, Persona, PersistedState, InboxState } from '../src/shared/types'

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

  ipcMain.handle('github:fetchPRBody', async (_event, prRef: string) => {
    return fetchPRBody(prRef)
  })

  ipcMain.handle('github:postComments', async (_event, prRef: string, comments: ReviewComment[], reviewType: ReviewEventType) => {
    const commitSha = await getPRHeadSha(prRef)
    return postComments(prRef, comments, commitSha, reviewType)
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

  // Persistence handlers
  ipcMain.handle('state:save', async (_event, state: Omit<PersistedState, 'savedAt'>) => {
    return saveState(state)
  })

  ipcMain.handle('state:load', async () => {
    return loadState()
  })

  ipcMain.handle('state:clear', async () => {
    return clearState()
  })

  // GitHub search handlers
  ipcMain.handle('github:searchPRs', async (_event, query: string) => {
    return searchPRs(query)
  })

  ipcMain.handle('github:getPRStatus', async (_event, prRef: string) => {
    return getPRStatus(prRef)
  })

  // Inbox handlers
  ipcMain.handle('inbox:load', async () => {
    return loadInboxState()
  })

  ipcMain.handle('inbox:save', async (_event, state: InboxState) => {
    return saveInboxState(state)
  })

  ipcMain.handle('inbox:fetchSlackPRs', async (_event, channelName: string, since?: string) => {
    const result = await fetchSlackPRs(channelName, since)
    if (result.error) {
      throw new Error(result.error)
    }
    return result.prs
  })

  // Slack token handlers
  ipcMain.handle('slack:hasToken', async () => {
    return hasSlackToken()
  })

  ipcMain.handle('slack:saveToken', async (_event, token: string) => {
    return saveSlackToken(token)
  })

  // Polling handlers
  ipcMain.handle('polling:start', () => {
    startPolling()
  })

  ipcMain.handle('polling:stop', () => {
    stopPolling()
  })

  ipcMain.handle('polling:trigger', async () => {
    return triggerPoll()
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
