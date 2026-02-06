import { useState, useMemo } from 'react'
import { useReviewStore } from '../store/reviewStore'
import type { ReviewComment, ReviewEventType } from '@shared/types'
import './SubmitModal.css'

interface SubmitModalProps {
  onClose: () => void
  onSuccess: () => void
}

export function SubmitModal({ onClose, onSuccess }: SubmitModalProps) {
  const { prData, comments, setSubmitting, setError, reset } = useReviewStore()
  const approvedComments = useMemo(
    () => comments.filter((c) => c.status === 'approved'),
    [comments]
  )
  const [reviewType, setReviewType] = useState<ReviewEventType>('COMMENT')
  const [reviewBody, setReviewBody] = useState('')
  const [isSubmitting, setIsSubmittingLocal] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitResult, setSubmitResult] = useState<{
    posted: number
    failed: Array<{ file: string; line: number; error: string }>
  } | null>(null)

  const hasBody = reviewBody.trim().length > 0
  const hasComments = approvedComments.length > 0
  const canSubmit =
    reviewType === 'APPROVE'
      ? true // Approve is always valid
      : hasComments || hasBody // Comment/Request Changes need at least one

  const handleSubmit = async () => {
    if (!prData || !canSubmit) return

    setIsSubmittingLocal(true)
    setSubmitting(true)
    setSubmitError(null)
    setSubmitResult(null)

    try {
      const prRef = `${prData.metadata.owner}/${prData.metadata.repo}#${prData.metadata.number}`
      const body = reviewBody.trim() || undefined
      const result = await window.electronAPI.postComments(prRef, approvedComments, reviewType, body)

      setSubmitResult(result)

      // If all comments succeeded (or there were none), it's a full success
      if (result.failed.length === 0) {
        onSuccess()
        reset()
      }
      // Partial success - stay open to show results
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit comments'
      setSubmitError(message)
      setError(message)
    } finally {
      setIsSubmittingLocal(false)
      setSubmitting(false)
    }
  }

  const handleDone = () => {
    reset()
    onSuccess()
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
          {submitResult ? (
            // Show results after submission
            <>
              {submitResult.posted > 0 && (
                <div className="submit-success">
                  Successfully posted {submitResult.posted} comment{submitResult.posted !== 1 ? 's' : ''} to GitHub
                </div>
              )}
              {submitResult.failed.length > 0 && (
                <div className="submit-partial-failure">
                  <p>{submitResult.failed.length} comment{submitResult.failed.length !== 1 ? 's' : ''} could not be posted:</p>
                  <ul className="failure-list">
                    {submitResult.failed.map((f, i) => (
                      <li key={i}>
                        <code>{f.file}:{f.line}</code> - {f.error}
                      </li>
                    ))}
                  </ul>
                  <p className="failure-hint">
                    This usually happens when the line number is outside the diff context.
                  </p>
                </div>
              )}
            </>
          ) : (
            // Show preview before submission
            <>
              <p className="submit-summary">
                Submitting review to{' '}
                <strong>
                  {prData?.metadata.owner}/{prData?.metadata.repo}#{prData?.metadata.number}
                </strong>
                {hasComments && (
                  <> with <strong>{approvedComments.length} inline comment{approvedComments.length !== 1 ? 's' : ''}</strong></>
                )}
              </p>

              <div className="review-type-selector">
                <div className="review-type-label">Review type</div>
                <div className="review-type-options">
                  {([
                    { value: 'COMMENT', label: 'Comment', icon: '💬' },
                    { value: 'APPROVE', label: 'Approve', icon: '✅' },
                    { value: 'REQUEST_CHANGES', label: 'Request Changes', icon: '🔄' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      className={`review-type-option${reviewType === opt.value ? ' selected' : ''}`}
                      onClick={() => setReviewType(opt.value)}
                      type="button"
                    >
                      <span className="review-type-icon">{opt.icon}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="review-body-field">
                <div className="review-body-label">Review body</div>
                <textarea
                  className="review-body-textarea"
                  placeholder="Optional summary for the review..."
                  value={reviewBody}
                  onChange={(e) => setReviewBody(e.target.value)}
                  rows={3}
                />
              </div>

              {hasComments && (
                <div className="submit-preview">
                  <div className="submit-preview-header">Comments to Submit</div>
                  <div className="submit-preview-list">
                    {approvedComments.map((comment) => (
                      <CommentPreview key={comment.id} comment={comment} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {submitError && (
            <div className="submit-error">{submitError}</div>
          )}
        </div>

        <div className="submit-modal-footer">
          {submitResult ? (
            <button className="primary" onClick={handleDone}>
              Done
            </button>
          ) : (
            <>
              <button onClick={onClose} disabled={isSubmitting}>
                Cancel
              </button>
              <button
                className="primary"
                onClick={handleSubmit}
                disabled={isSubmitting || !canSubmit}
              >
                {isSubmitting ? 'Submitting...' : 'Submit to GitHub'}
              </button>
            </>
          )}
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
