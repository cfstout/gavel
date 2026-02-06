import { useEffect, useState, useCallback, useMemo } from 'react'
import type { InboxPR } from '@shared/types'
import { useInboxStore } from '../store/inboxStore'
import { KanbanColumn } from './KanbanColumn'
import { PRDetailModal } from './PRDetailModal'
import { SourceConfigModal } from './SourceConfigModal'
import '../styles/Inbox.css'

interface InboxScreenProps {
  onReviewPR: (pr: InboxPR) => void
  onManualEntry: () => void
}

export function InboxScreen({ onReviewPR, onManualEntry }: InboxScreenProps) {
  const {
    prs,
    sources,
    lastPollAt,
    isLoading,
    error,
    isInitialized,
    initialize,
    refresh,
    ignorePR,
    setError,
  } = useInboxStore()

  const [showSourceModal, setShowSourceModal] = useState(false)
  const [selectedPR, setSelectedPR] = useState<InboxPR | null>(null)

  useEffect(() => {
    if (!isInitialized) {
      initialize()
    }
  }, [isInitialized, initialize])

  const handleReview = useCallback(
    (pr: InboxPR) => {
      onReviewPR(pr)
    },
    [onReviewPR]
  )

  const handleIgnore = useCallback(
    async (pr: InboxPR) => {
      await ignorePR(pr.id)
    },
    [ignorePR]
  )

  const handleCardClick = useCallback((pr: InboxPR) => {
    setSelectedPR(pr)
  }, [])

  const formatLastPoll = (timestamp: string | null) => {
    if (!timestamp) return 'Never'

    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`

    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`

    return date.toLocaleDateString()
  }

  // Filter PRs by column
  const inboxPRs = useMemo(() => prs.filter((pr) => pr.column === 'inbox'), [prs])
  const needsAttentionPRs = useMemo(() => prs.filter((pr) => pr.column === 'needs-attention'), [prs])
  const reviewedPRs = useMemo(() => prs.filter((pr) => pr.column === 'reviewed'), [prs])
  const donePRs = useMemo(() => prs.filter((pr) => pr.column === 'done'), [prs])

  // Show loading state while initializing
  if (!isInitialized) {
    return (
      <div className="inbox-screen">
        <div className="loading-screen">
          <div className="loading-spinner" />
          <p>Loading inbox...</p>
        </div>
      </div>
    )
  }

  // Show empty state if no sources configured
  if (sources.length === 0) {
    return (
      <div className="inbox-screen">
        <div className="inbox-empty-state">
          <h3>Welcome to your PR Inbox</h3>
          <p>
            Configure PR sources to automatically track pull requests that need your attention.
            You can add GitHub search queries or monitor Slack channels for PR links.
          </p>
          <button className="primary" onClick={() => setShowSourceModal(true)}>
            Add PR Source
          </button>
          <button onClick={onManualEntry}>Or enter a PR manually</button>
        </div>

        {showSourceModal && <SourceConfigModal onClose={() => setShowSourceModal(false)} />}
      </div>
    )
  }

  return (
    <div className="inbox-screen">
      <div className="inbox-header">
        <h2>PR Inbox</h2>
        <div className="inbox-actions">
          <span className="last-poll">Last updated: {formatLastPoll(lastPollAt)}</span>
          <button
            className={`refresh-btn ${isLoading ? 'loading' : ''}`}
            onClick={refresh}
            disabled={isLoading}
          >
            <span className="refresh-icon">↻</span>
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button onClick={() => setShowSourceModal(true)}>Configure Sources</button>
        </div>
      </div>

      {error && (
        <div className="inbox-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="kanban-board">
        <KanbanColumn
          title="Inbox"
          column="inbox"
          prs={inboxPRs}
          emptyMessage="No new PRs"
          onReview={handleReview}
          onIgnore={handleIgnore}
          onCardClick={handleCardClick}
        />

        <KanbanColumn
          title="Reviewed"
          column="reviewed"
          prs={reviewedPRs}
          emptyMessage="No reviewed PRs"
          onReview={handleReview}
          onCardClick={handleCardClick}
          showActions={false}
        />

        <KanbanColumn
          title="Needs Attention"
          column="needs-attention"
          prs={needsAttentionPRs}
          emptyMessage="All caught up!"
          onReview={handleReview}
          onIgnore={handleIgnore}
          onCardClick={handleCardClick}
        />

        <KanbanColumn
          title="Done"
          column="done"
          prs={donePRs}
          emptyMessage="No completed PRs"
          onReview={handleReview}
          onCardClick={handleCardClick}
          showActions={false}
        />
      </div>

      <div className="manual-entry-link">
        <button onClick={onManualEntry}>Enter a PR manually</button>
      </div>

      {showSourceModal && <SourceConfigModal onClose={() => setShowSourceModal(false)} />}
      {selectedPR && <PRDetailModal pr={selectedPR} onClose={() => setSelectedPR(null)} />}
    </div>
  )
}
