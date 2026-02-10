import { spawn } from 'node:child_process'
import { BrowserWindow } from 'electron'
import type { ReviewComment } from '../src/shared/types'

/**
 * Parse a diff to extract valid line ranges for each file
 * Returns a map of file path -> Set of valid line numbers
 */
export function parseValidDiffLines(diff: string): Map<string, Set<number>> {
  const validLines = new Map<string, Set<number>>()
  let currentFile: string | null = null
  let newLineNum = 0

  for (const line of diff.split('\n')) {
    // Match file header: diff --git a/path b/path
    const fileMatch = line.match(/^diff --git a\/.+ b\/(.+)$/)
    if (fileMatch) {
      currentFile = fileMatch[1]
      if (!validLines.has(currentFile)) {
        validLines.set(currentFile, new Set())
      }
      continue
    }

    // Match hunk header: @@ -old,count +new,count @@
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunkMatch) {
      newLineNum = parseInt(hunkMatch[1], 10)
      continue
    }

    // Track line numbers in the hunk
    if (currentFile && newLineNum > 0) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        // Added line - valid for comments
        validLines.get(currentFile)!.add(newLineNum)
        newLineNum++
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        // Deleted line - don't increment new line number
      } else if (!line.startsWith('\\')) {
        // Context line - valid for comments
        validLines.get(currentFile)!.add(newLineNum)
        newLineNum++
      }
    }
  }

  return validLines
}

/**
 * Validate comments against the diff and mark invalid ones
 */
export function validateComments(
  comments: ReviewComment[],
  diff: string
): ReviewComment[] {
  const validLines = parseValidDiffLines(diff)

  return comments.map((comment) => {
    const fileLines = validLines.get(comment.file)
    const isValid = fileLines?.has(comment.line) ?? false

    if (!isValid) {
      // Mark as invalid by adding a note to the message
      return {
        ...comment,
        status: 'rejected' as const,
        message: `[LINE NOT IN DIFF - Cannot post to GitHub]\n\n${comment.message}`,
      }
    }

    return comment
  })
}

/**
 * Generate a unique ID for comments
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 15)
}

/**
 * Analyze a PR diff using Claude CLI
 * Returns structured review comments
 */
export async function analyzePR(
  diff: string,
  personaContent: string,
  mainWindow: BrowserWindow | null
): Promise<ReviewComment[]> {
  const prompt = buildAnalysisPrompt(diff, personaContent)

  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['-p', prompt, '--output-format', 'text'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => {
      const chunk = data.toString()
      stdout += chunk

      // Send progress to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('claude:progress', chunk)
      }
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        if (stderr.includes('not found') || stderr.includes('ENOENT')) {
          reject(new Error('Claude CLI not found. Please install Claude Code: https://claude.ai/code'))
        } else if (stderr.includes('not authenticated') || stderr.includes('login')) {
          reject(new Error('Claude CLI not authenticated. Please run: claude login'))
        } else {
          reject(new Error(stderr || `Claude command failed with code ${code}`))
        }
      } else {
        try {
          const comments = parseClaudeResponse(stdout)
          // Validate comments against the diff and mark invalid ones
          const validatedComments = validateComments(comments, diff)
          resolve(validatedComments)
        } catch (err) {
          reject(new Error(`Failed to parse Claude response: ${err}`))
        }
      }
    })

    proc.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error('Claude CLI not found. Please install Claude Code: https://claude.ai/code'))
      } else {
        reject(err)
      }
    })
  })
}

/**
 * Chat with Claude to refine a specific comment
 */
export async function refinementChat(
  originalComment: ReviewComment,
  userMessage: string,
  conversationContext: string
): Promise<string> {
  const prompt = buildRefinementPrompt(originalComment, userMessage, conversationContext)

  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['-p', prompt, '--output-format', 'text'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Claude command failed with code ${code}`))
      } else {
        // Extract the refined comment from Claude's response
        const refined = extractRefinedComment(stdout)
        resolve(refined)
      }
    })

    proc.on('error', (err) => {
      reject(err)
    })
  })
}

/**
 * Annotate a unified diff with new-file line numbers on context and added lines.
 *
 * Produces output like:
 *   @@ -10,6 +10,8 @@ function example()
 *   [L10]  existing line
 *   [L11]  another line
 *   [L12] +new line
 *         -removed line
 *   [L13]  more context
 */
export function annotateDiffWithLineNumbers(diff: string): string {
  const lines = diff.split('\n')
  const output: string[] = []
  let newLineNum = 0

  for (const line of lines) {
    // Hunk header — reset line counter
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunkMatch) {
      newLineNum = parseInt(hunkMatch[1], 10)
      output.push(line)
      continue
    }

    // Inside a hunk
    if (newLineNum > 0) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        output.push(`[L${newLineNum}] ${line}`)
        newLineNum++
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        // Removed lines don't have a new-file line number
        output.push(`      ${line}`)
      } else if (line.startsWith('\\')) {
        output.push(line)
      } else {
        // Context line
        output.push(`[L${newLineNum}] ${line}`)
        newLineNum++
      }
    } else {
      // File headers, etc.
      output.push(line)
    }
  }

  return output.join('\n')
}

/**
 * Build the analysis prompt for Claude
 */
function buildAnalysisPrompt(diff: string, personaContent: string): string {
  const annotatedDiff = annotateDiffWithLineNumbers(diff)

  return `You are a code reviewer. Your task is to analyze the following pull request diff and provide review comments.

## Review Instructions
${personaContent}

## Line Numbers
Each context and added line in the diff is prefixed with \`[L##]\` showing its line number in the new file.
Use these line numbers directly when creating comments. Removed lines have no prefix — you cannot comment on them.
You can ONLY comment on lines that have a \`[L##]\` prefix.

## Output Format
Respond with a JSON array. Each comment needs:
- file: exact file path from the diff (e.g., "src/utils.ts")
- line: the number from the \`[L##]\` prefix on the line you're commenting on
- message: specific, actionable feedback
- severity: "suggestion" | "warning" | "critical"

Example:
\`\`\`json
[
  {
    "file": "src/utils.ts",
    "line": 42,
    "message": "Consider using a Map for O(1) lookups instead of repeated array.find() calls.",
    "severity": "suggestion"
  }
]
\`\`\`

Return an empty array [] if no issues found.

## Pull Request Diff
\`\`\`diff
${annotatedDiff}
\`\`\`

Analyze this diff and return ONLY the JSON array.`
}

/**
 * Build the refinement prompt
 */
function buildRefinementPrompt(
  comment: ReviewComment,
  userMessage: string,
  context: string
): string {
  return `You are helping refine a code review comment. Here's the context:

## Original Comment
File: ${comment.file}
Line: ${comment.line}
Severity: ${comment.severity}
Message: ${comment.message}

## Previous Conversation
${context || 'No previous conversation.'}

## User's Request
${userMessage}

Please provide a refined version of the comment based on the user's feedback.
Respond with ONLY the new comment text, nothing else.`
}

/**
 * Parse Claude's response into structured comments
 */
function parseClaudeResponse(response: string): ReviewComment[] {
  // Try to extract JSON from the response
  // Claude might wrap it in markdown code blocks
  let jsonStr = response

  // Remove markdown code blocks if present
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1]
  }

  // Try to find JSON array in the response
  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    jsonStr = arrayMatch[0]
  }

  const parsed = JSON.parse(jsonStr.trim())

  if (!Array.isArray(parsed)) {
    throw new Error('Expected JSON array')
  }

  return parsed.map((item: { file: string; line: number; message: string; severity: string }) => ({
    id: generateId(),
    file: item.file,
    line: item.line,
    message: item.message,
    severity: item.severity as ReviewComment['severity'],
    status: 'pending' as const,
    originalMessage: item.message,
  }))
}

/**
 * Extract the refined comment from Claude's response
 */
function extractRefinedComment(response: string): string {
  // Claude should return just the comment text
  // Clean up any potential markdown or extra whitespace
  return response.trim()
}

/**
 * Check if Claude CLI is available and authenticated
 */
export async function checkClaudeAuth(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('claude', ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    proc.on('close', (code) => {
      resolve(code === 0)
    })

    proc.on('error', () => {
      resolve(false)
    })
  })
}
