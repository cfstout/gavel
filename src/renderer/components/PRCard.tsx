import type { InboxPR } from '@shared/types'

interface PRCardProps {
  pr: InboxPR
  onReview: (pr: InboxPR) => void
  onIgnore?: (pr: InboxPR) => void
  onCardClick?: (pr: InboxPR) => void
  showActions?: boolean
}

function formatAge(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m`

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays}d`

  return new Date(isoString).toLocaleDateString()
}

export function PRCard({ pr, onReview, onIgnore, onCardClick, showActions = true }: PRCardProps) {
  const sourceIcon = pr.source === 'github-search' ? '🔍' : '💬'
  const sourceLabel = pr.source === 'github-search' ? 'GitHub' : 'Slack'

  return (
    <div className="pr-card" onClick={() => onCardClick?.(pr)}>
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
        <span className="pr-card-age">{formatAge(pr.addedAt)}</span>
      </div>

      {showActions && (
        <div className="pr-card-actions" onClick={(e) => e.stopPropagation()}>
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
