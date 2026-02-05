import { useReviewStore } from '../store/reviewStore'
import type { ReviewComment } from '@shared/types'
import './CommentList.css'

interface CommentListProps {
  comments: ReviewComment[]
  onFileClick: (file: string) => void
  onRefine: (comment: ReviewComment) => void
}

export function CommentList({ comments, onFileClick, onRefine }: CommentListProps) {
  const { updateCommentStatus } = useReviewStore()

  const pendingComments = comments.filter((c) => c.status === 'pending')
  const approvedComments = comments.filter((c) => c.status === 'approved')
  const rejectedComments = comments.filter((c) => c.status === 'rejected')

  return (
    <div className="comment-list">
      <div className="comment-list-header">
        <span className="comment-list-title">Comments</span>
        <span className="comment-list-count">{comments.length}</span>
      </div>

      <div className="comment-list-content">
        {pendingComments.length > 0 && (
          <div className="comment-section">
            <div className="comment-section-header">
              <span>Pending Review</span>
              <span className="section-count">{pendingComments.length}</span>
            </div>
            {pendingComments.map((comment) => (
              <CommentCard
                key={comment.id}
                comment={comment}
                onApprove={() => updateCommentStatus(comment.id, 'approved')}
                onReject={() => updateCommentStatus(comment.id, 'rejected')}
                onRefine={() => onRefine(comment)}
                onFileClick={onFileClick}
              />
            ))}
          </div>
        )}

        {approvedComments.length > 0 && (
          <div className="comment-section">
            <div className="comment-section-header approved">
              <span>Approved</span>
              <span className="section-count">{approvedComments.length}</span>
            </div>
            {approvedComments.map((comment) => (
              <CommentCard
                key={comment.id}
                comment={comment}
                onApprove={() => updateCommentStatus(comment.id, 'approved')}
                onReject={() => updateCommentStatus(comment.id, 'rejected')}
                onRefine={() => onRefine(comment)}
                onFileClick={onFileClick}
              />
            ))}
          </div>
        )}

        {rejectedComments.length > 0 && (
          <div className="comment-section">
            <div className="comment-section-header rejected">
              <span>Rejected</span>
              <span className="section-count">{rejectedComments.length}</span>
            </div>
            {rejectedComments.map((comment) => (
              <CommentCard
                key={comment.id}
                comment={comment}
                onApprove={() => updateCommentStatus(comment.id, 'approved')}
                onReject={() => updateCommentStatus(comment.id, 'rejected')}
                onRefine={() => onRefine(comment)}
                onFileClick={onFileClick}
              />
            ))}
          </div>
        )}

        {comments.length === 0 && (
          <div className="comment-list-empty">
            No comments generated. The analysis found no issues.
          </div>
        )}
      </div>
    </div>
  )
}

interface CommentCardProps {
  comment: ReviewComment
  onApprove: () => void
  onReject: () => void
  onRefine: () => void
  onFileClick: (file: string) => void
}

function CommentCard({
  comment,
  onApprove,
  onReject,
  onRefine,
  onFileClick,
}: CommentCardProps) {
  const shortFile = comment.file.split('/').pop()

  return (
    <div className={`comment-card status-${comment.status}`}>
      <div className="comment-card-header">
        <button
          className="comment-file-link"
          onClick={() => onFileClick(comment.file)}
        >
          {shortFile}:{comment.line}
        </button>
        <span className={`comment-severity severity-${comment.severity}`}>
          {getSeverityIcon(comment.severity)}
        </span>
      </div>
      <div className="comment-card-body">{comment.message}</div>
      <div className="comment-card-actions">
        <button
          className={`action-btn approve ${
            comment.status === 'approved' ? 'active' : ''
          }`}
          onClick={onApprove}
          title="Approve comment"
        >
          ✓
        </button>
        <button
          className={`action-btn reject ${
            comment.status === 'rejected' ? 'active' : ''
          }`}
          onClick={onReject}
          title="Reject comment"
        >
          ✗
        </button>
        <button
          className="action-btn refine"
          onClick={onRefine}
          title="Refine comment"
        >
          💬
        </button>
      </div>
    </div>
  )
}

function getSeverityIcon(severity: ReviewComment['severity']): string {
  switch (severity) {
    case 'critical':
      return '🚨'
    case 'warning':
      return '⚠️'
    case 'suggestion':
      return '💡'
    default:
      return '💬'
  }
}
