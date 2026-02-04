import { useState, useCallback } from 'react'
import type { PRData, ReviewComment } from '@shared/types'

interface UseGitHubResult {
  isAuthenticated: boolean | null
  prData: PRData | null
  isLoading: boolean
  error: string | null
  checkAuth: () => Promise<boolean>
  fetchPR: (prRef: string) => Promise<PRData | null>
  postComments: (comments: ReviewComment[]) => Promise<void>
}

export function useGitHub(): UseGitHubResult {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [prData, setPRData] = useState<PRData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkAuth = useCallback(async () => {
    try {
      const authed = await window.electronAPI.checkGitHubAuth()
      setIsAuthenticated(authed)
      return authed
    } catch (err) {
      setIsAuthenticated(false)
      return false
    }
  }, [])

  const fetchPR = useCallback(async (prRef: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const data = await window.electronAPI.fetchPR(prRef)
      setPRData(data)
      return data
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch PR'
      setError(message)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  const postComments = useCallback(
    async (comments: ReviewComment[]) => {
      if (!prData) {
        throw new Error('No PR loaded')
      }

      setIsLoading(true)
      setError(null)

      try {
        const prRef = `${prData.metadata.owner}/${prData.metadata.repo}#${prData.metadata.number}`
        await window.electronAPI.postComments(prRef, comments)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to post comments'
        setError(message)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [prData]
  )

  return {
    isAuthenticated,
    prData,
    isLoading,
    error,
    checkAuth,
    fetchPR,
    postComments,
  }
}
