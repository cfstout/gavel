import { spawn } from 'node:child_process'
import { BrowserWindow } from 'electron'
import type { ReviewComment } from '../src/shared/types'

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
          resolve(comments)
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
 * Build the analysis prompt for Claude
 */
function buildAnalysisPrompt(diff: string, personaContent: string): string {
  return `You are a code reviewer. Your task is to analyze the following pull request diff and provide review comments.

## Review Instructions
${personaContent}

## Output Format
You MUST respond with a JSON array of review comments. Each comment should have:
- file: the file path
- line: the line number in the NEW version of the file (from the + lines in the diff)
- message: your review comment (be specific and actionable)
- severity: "suggestion" | "warning" | "critical"

Example output:
\`\`\`json
[
  {
    "file": "src/utils.ts",
    "line": 42,
    "message": "Consider using a Map instead of an object for better performance with frequent lookups.",
    "severity": "suggestion"
  }
]
\`\`\`

If there are no issues to report, return an empty array: []

## Pull Request Diff
\`\`\`diff
${diff}
\`\`\`

Now analyze this diff and return ONLY the JSON array of comments, no other text.`
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
