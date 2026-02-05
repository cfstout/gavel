import type { InboxPR } from '@shared/types'

interface PRCardProps {
  pr: InboxPR
  onReview: (pr: InboxPR) => void
  onIgnore?: (pr: InboxPR) => void
  showActions?: boolean
}

export function PRCard({ pr, onReview, onIgnore, showActions = true }: PRCardProps) {
  const sourceIcon = pr.source === 'github-search' ? '🔍' : '💬'
  const sourceLabel = pr.source === 'github-search' ? 'GitHub' : 'Slack'

  return (
    <div className="pr-card">
      <div className="pr-card-header">
        <span className="pr-card-title">{pr.title}</span>
        <span className="pr-card-number">#{pr.number}</span>
      </div>

      <div className="pr-card-meta">
        <span className="pr-card-repo">
          {pr.owner}/{pr.repo}
        </span>
        <span className="pr-card-author">{pr.author}</span>
        <span className={`source-badge ${pr.source === 'github-search' ? 'github' : 'slack'}`}>
          {sourceIcon} {sourceLabel}
        </span>
      </div>

      {showActions && (
        <div className="pr-card-actions">
          <button className="review-btn" onClick={() => onReview(pr)}>
            Review
          </button>
          {onIgnore && (
            <button className="ignore-btn" onClick={() => onIgnore(pr)}>
              Ignore
            </button>
          )}
        </div>
      )}
    </div>
  )
}
