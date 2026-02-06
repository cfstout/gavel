import { useState, useEffect, useCallback } from 'react'
import Markdown from 'react-markdown'
import type { InboxPR } from '@shared/types'

interface PRDetailModalProps {
  pr: InboxPR
  onClose: () => void
}

export function PRDetailModal({ pr, onClose }: PRDetailModalProps) {
  const [body, setBody] = useState<string | null>(pr.body ?? null)
  const [loading, setLoading] = useState(!pr.body)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (pr.body != null) return

    // Fallback: fetch body on-demand for PRs that predate the cached body
    setLoading(true)
    const prRef = `${pr.owner}/${pr.repo}#${pr.number}`
    window.electronAPI
      .fetchPRBody(prRef)
      .then((result) => setBody(result))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load description'))
      .finally(() => setLoading(false))
  }, [pr])

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose]
  )

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  return (
    <div className="pr-detail-overlay" onClick={handleOverlayClick}>
      <div className="pr-detail-modal">
        <div className="pr-detail-header">
          <div className="pr-detail-title-row">
            <span className="pr-detail-title">{pr.title}</span>
            <span className="pr-detail-number">#{pr.number}</span>
          </div>
          <div className="pr-detail-meta">
            <span className="pr-detail-repo">{pr.owner}/{pr.repo}</span>
            <span className="pr-detail-author">@{pr.author}</span>
          </div>
          <button className="pr-detail-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="pr-detail-body">
          {loading && <div className="pr-detail-loading">Loading description...</div>}
          {error && <div className="pr-detail-error">{error}</div>}
          {!loading && !error && (
            body ? (
              <div className="pr-detail-description">
                <Markdown>{body}</Markdown>
              </div>
            ) : (
              <div className="pr-detail-empty">No description provided.</div>
            )
          )}
        </div>

        <div className="pr-detail-footer">
          <a
            className="pr-detail-link"
            href={pr.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.preventDefault()
              window.open(pr.url, '_blank')
            }}
          >
            Open on GitHub
          </a>
        </div>
      </div>
    </div>
  )
}
