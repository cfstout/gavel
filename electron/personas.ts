import { readdir, readFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { existsSync } from 'node:fs'
import { app } from 'electron'
import type { Persona } from '../src/shared/types'

// Path to built-in personas
// In development: relative to app root
// In production: in the resources directory
function getBuiltinPersonasDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'personas')
  }
  return join(app.getAppPath(), 'personas')
}

// Path to user personas
const USER_PERSONAS_DIR = join(app.getPath('userData'), 'personas')

/**
 * Load all available personas (built-in + user)
 */
export async function loadPersonas(): Promise<Persona[]> {
  const personas: Persona[] = []

  // Load built-in personas
  const builtInPersonas = await loadPersonasFromDir(getBuiltinPersonasDir(), true)
  personas.push(...builtInPersonas)

  // Load user personas
  if (existsSync(USER_PERSONAS_DIR)) {
    const userPersonas = await loadPersonasFromDir(USER_PERSONAS_DIR, false)
    personas.push(...userPersonas)
  }

  return personas
}

/**
 * Load personas from a directory
 */
async function loadPersonasFromDir(dir: string, isBuiltIn: boolean): Promise<Persona[]> {
  const personas: Persona[] = []

  try {
    const files = await readdir(dir)
    const mdFiles = files.filter((f) => f.endsWith('.md'))

    for (const file of mdFiles) {
      const filePath = join(dir, file)
      const content = await readFile(filePath, 'utf-8')
      const persona = parsePersonaFile(file, content, isBuiltIn)
      personas.push(persona)
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return personas
}

/**
 * Parse a persona markdown file
 * Expected format:
 * ---
 * name: Security Audit
 * description: Focus on security vulnerabilities
 * ---
 * [Content of the persona instructions]
 */
function parsePersonaFile(filename: string, content: string, isBuiltIn: boolean): Persona {
  const id = basename(filename, '.md')
  let name = id
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
  let description = ''
  let personaContent = content

  // Try to parse frontmatter
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1]
    personaContent = frontmatterMatch[2]

    // Parse name
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m)
    if (nameMatch) {
      name = nameMatch[1].trim()
    }

    // Parse description
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m)
    if (descMatch) {
      description = descMatch[1].trim()
    }
  }

  return {
    id,
    name,
    description,
    content: personaContent.trim(),
    isBuiltIn,
  }
}

/**
 * Get user personas directory path
 */
export function getUserPersonasDir(): string {
  return USER_PERSONAS_DIR
}
