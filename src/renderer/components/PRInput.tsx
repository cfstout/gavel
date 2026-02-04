import { useState, useCallback } from 'react'
import { useReviewStore } from '../store/reviewStore'
import './PRInput.css'

interface PRInputProps {
  onNext: () => void
}

export function PRInput({ onNext }: PRInputProps) {
  const { prRef, setPRRef, setPRData, setError, error } = useReviewStore()
  const [isLoading, setIsLoading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()

      if (!prRef.trim()) {
        setLocalError('Please enter a PR reference')
        return
      }

      setIsLoading(true)
      setLocalError(null)
      setError(null)

      try {
        // Check GitHub auth first
        const isAuthed = await window.electronAPI.checkGitHubAuth()
        if (!isAuthed) {
          setLocalError(
            'GitHub CLI not authenticated. Please run: gh auth login'
          )
          return
        }

        // Fetch PR data
        const data = await window.electronAPI.fetchPR(prRef.trim())
        setPRData(data)
        onNext()
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to fetch PR'
        setLocalError(message)
      } finally {
        setIsLoading(false)
      }
    },
    [prRef, setPRData, setError, onNext]
  )

  const displayError = localError || error

  return (
    <div className="pr-input-screen">
      <form className="pr-input-card" onSubmit={handleSubmit}>
        <div className="pr-input-header">
          <h2>Start a Review</h2>
          <p>Enter a GitHub Pull Request to begin your AI-assisted code review.</p>
        </div>

        <div className="pr-input-field">
          <label htmlFor="pr-ref">Pull Request</label>
          <input
            id="pr-ref"
            type="text"
            value={prRef}
            onChange={(e) => setPRRef(e.target.value)}
            placeholder="owner/repo#123 or https://github.com/..."
            disabled={isLoading}
            autoFocus
          />
          <span className="pr-input-hint">
            Examples: facebook/react#1234, https://github.com/owner/repo/pull/123
          </span>
        </div>

        {displayError && (
          <div className="pr-input-error">
            <span className="error-icon">⚠</span>
            {displayError}
          </div>
        )}

        <div className="pr-input-actions">
          <button
            type="submit"
            className="primary"
            disabled={isLoading || !prRef.trim()}
          >
            {isLoading ? 'Loading...' : 'Continue'}
          </button>
        </div>
      </form>
    </div>
  )
}
