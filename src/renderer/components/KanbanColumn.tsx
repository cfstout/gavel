import type { InboxPR, KanbanColumn as KanbanColumnType } from '@shared/types'
import { PRCard } from './PRCard'

interface KanbanColumnProps {
  title: string
  column: KanbanColumnType
  prs: InboxPR[]
  emptyMessage: string
  onReview: (pr: InboxPR) => void
  onIgnore?: (pr: InboxPR) => void
  showActions?: boolean
}

export function KanbanColumn({
  title,
  column,
  prs,
  emptyMessage,
  onReview,
  onIgnore,
  showActions = true,
}: KanbanColumnProps) {
  return (
    <div className={`kanban-column ${column}`}>
      <div className="kanban-column-header">
        <h3>{title}</h3>
        <span className="kanban-column-count">{prs.length}</span>
      </div>

      <div className="kanban-column-content">
        {prs.length === 0 ? (
          <div className="kanban-column-empty">{emptyMessage}</div>
        ) : (
          prs.map((pr) => (
            <PRCard
              key={pr.id}
              pr={pr}
              onReview={onReview}
              onIgnore={onIgnore}
              showActions={showActions}
            />
          ))
        )}
      </div>
    </div>
  )
}
