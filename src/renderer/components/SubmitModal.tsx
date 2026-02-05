import { useState } from 'react'
import { useReviewStore, useApprovedComments } from '../store/reviewStore'
import type { ReviewComment } from '@shared/types'
import './SubmitModal.css'

interface SubmitModalProps {
  onClose: () => void
  onSuccess: () => void
}

export function SubmitModal({ onClose, onSuccess }: SubmitModalProps) {
  const { prData, setSubmitting, setError, reset } = useReviewStore()
  const approvedComments = useApprovedComments()
  const [isSubmitting, setIsSubmittingLocal] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!prData || approvedComments.length === 0) return

    setIsSubmittingLocal(true)
    setSubmitting(true)
    setSubmitError(null)

    try {
      const prRef = `${prData.metadata.owner}/${prData.metadata.repo}#${prData.metadata.number}`
      await window.electronAPI.postComments(prRef, approvedComments)
      onSuccess()
      reset() // Clear state for next review
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit comments'
      setSubmitError(message)
      setError(message)
    } finally {
      setIsSubmittingLocal(false)
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="submit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="submit-modal-header">
          <h3>Submit Review Comments</h3>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="submit-modal-body">
          <p className="submit-summary">
            You are about to submit{' '}
            <strong>{approvedComments.length} comment{approvedComments.length !== 1 ? 's' : ''}</strong>{' '}
            to{' '}
            <strong>
              {prData?.metadata.owner}/{prData?.metadata.repo}#{prData?.metadata.number}
            </strong>
          </p>

          <div className="submit-preview">
            <div className="submit-preview-header">Comments to Submit</div>
            <div className="submit-preview-list">
              {approvedComments.map((comment) => (
                <CommentPreview key={comment.id} comment={comment} />
              ))}
            </div>
          </div>

          {submitError && (
            <div className="submit-error">{submitError}</div>
          )}
        </div>

        <div className="submit-modal-footer">
          <button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            className="primary"
            onClick={handleSubmit}
            disabled={isSubmitting || approvedComments.length === 0}
          >
            {isSubmitting ? 'Submitting...' : 'Submit to GitHub'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CommentPreview({ comment }: { comment: ReviewComment }) {
  const shortFile = comment.file.split('/').pop()

  return (
    <div className="comment-preview">
      <div className="comment-preview-header">
        <span className="comment-preview-file">
          {shortFile}:{comment.line}
        </span>
        <span className={`comment-preview-severity severity-${comment.severity}`}>
          {getSeverityIcon(comment.severity)}
        </span>
      </div>
      <div className="comment-preview-message">{comment.message}</div>
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
