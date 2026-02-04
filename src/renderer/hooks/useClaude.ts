import { useState, useCallback, useEffect } from 'react'
import type { ReviewComment, Persona } from '@shared/types'

interface UseClaudeResult {
  isClaudeAvailable: boolean | null
  personas: Persona[]
  isAnalyzing: boolean
  analysisProgress: string
  error: string | null
  checkAuth: () => Promise<boolean>
  loadPersonas: () => Promise<Persona[]>
  analyze: (diff: string, personaId: string) => Promise<ReviewComment[]>
  refineComment: (comment: ReviewComment, message: string) => Promise<string>
}

export function useClaude(): UseClaudeResult {
  const [isClaudeAvailable, setIsClaudeAvailable] = useState<boolean | null>(null)
  const [personas, setPersonas] = useState<Persona[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Set up progress listener
  useEffect(() => {
    const cleanup = window.electronAPI.onAnalysisProgress((progress) => {
      setAnalysisProgress((prev) => prev + progress)
    })
    return cleanup
  }, [])

  const checkAuth = useCallback(async () => {
    try {
      const available = await window.electronAPI.checkClaudeAuth()
      setIsClaudeAvailable(available)
      return available
    } catch {
      setIsClaudeAvailable(false)
      return false
    }
  }, [])

  const loadPersonas = useCallback(async () => {
    try {
      const loaded = await window.electronAPI.getPersonas()
      setPersonas(loaded)
      return loaded
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load personas'
      setError(message)
      return []
    }
  }, [])

  const analyze = useCallback(async (diff: string, personaId: string) => {
    setIsAnalyzing(true)
    setAnalysisProgress('')
    setError(null)

    try {
      const comments = await window.electronAPI.analyzePR(diff, personaId)
      return comments
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed'
      setError(message)
      throw err
    } finally {
      setIsAnalyzing(false)
    }
  }, [])

  const refineComment = useCallback(async (comment: ReviewComment, message: string) => {
    setError(null)

    try {
      const refined = await window.electronAPI.refinementChat(comment.id, comment, message)
      return refined
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Refinement failed'
      setError(errorMessage)
      throw err
    }
  }, [])

  return {
    isClaudeAvailable,
    personas,
    isAnalyzing,
    analysisProgress,
    error,
    checkAuth,
    loadPersonas,
    analyze,
    refineComment,
  }
}
