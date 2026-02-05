import { app } from 'electron'
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { PRData, Persona, ReviewComment, AppScreen } from '../src/shared/types'

// State that we persist between sessions
export interface PersistedState {
  prRef: string
  prData: PRData | null
  selectedPersona: Persona | null
  comments: ReviewComment[]
  screen: AppScreen
  savedAt: string // ISO timestamp
}

const STATE_FILE = 'review-state.json'

/**
 * Get the path to the state file in userData directory
 */
function getStatePath(): string {
  return join(app.getPath('userData'), STATE_FILE)
}

/**
 * Save review state to disk
 */
export async function saveState(state: Omit<PersistedState, 'savedAt'>): Promise<void> {
  const statePath = getStatePath()
  const dir = app.getPath('userData')

  // Ensure directory exists
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }

  const persistedState: PersistedState = {
    ...state,
    savedAt: new Date().toISOString(),
  }

  await writeFile(statePath, JSON.stringify(persistedState, null, 2), 'utf-8')
}

/**
 * Load review state from disk
 */
export async function loadState(): Promise<PersistedState | null> {
  const statePath = getStatePath()

  if (!existsSync(statePath)) {
    return null
  }

  try {
    const content = await readFile(statePath, 'utf-8')
    const state = JSON.parse(content) as PersistedState

    // Validate the loaded state has required fields
    if (!state.prRef || !state.prData) {
      return null
    }

    return state
  } catch {
    // If file is corrupted, return null
    return null
  }
}

/**
 * Clear persisted state (called after successful submission or explicit reset)
 */
export async function clearState(): Promise<void> {
  const statePath = getStatePath()

  if (existsSync(statePath)) {
    try {
      await unlink(statePath)
    } catch {
      // Ignore errors when deleting
    }
  }
}

/**
 * Check if there's a saved review session
 */
export async function hasSavedState(): Promise<boolean> {
  const state = await loadState()
  return state !== null
}
