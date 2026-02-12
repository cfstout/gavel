import { useMemo, useState, useCallback, Component, ReactNode } from 'react'
import { Diff, Hunk, parseDiff, getChangeKey } from 'react-diff-view'
import type { ChangeData } from 'react-diff-view'
import type { ReviewComment, CommentStatus } from '@shared/types'
import { InlineCommentCard } from './InlineCommentCard'
import 'react-diff-view/style/index.css'
import './DiffViewer.css'

// Error boundary to catch rendering errors in diff view
class DiffErrorBoundary extends Component<
  { children: ReactNode; filename: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode; filename: string }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="diff-viewer-error">
          <p>Error rendering diff for {this.props.filename}</p>
          <pre>{this.state.error?.message}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

interface DiffViewerProps {
  diff: string
  filename: string
  comments: ReviewComment[]
  onLineClick?: (line: number) => void
  commentingOnLine?: number | null
  onCommentSubmit?: (message: string, severity: ReviewComment['severity']) => void
  onCommentCancel?: () => void
  onApprove: (commentId: string) => void
  onReject: (commentId: string) => void
  onUpdateMessage: (commentId: string, message: string) => void
  onUpdateStatus: (commentId: string, status: CommentStatus) => void
}

// Type for react-diff-view change objects
interface DiffChange {
  type: 'insert' | 'delete' | 'normal'
  lineNumber?: number
  oldLineNumber?: number
  newLineNumber?: number
  content: string
  isNormal?: boolean
  isInsert?: boolean
  isDelete?: boolean
}

// Type for react-diff-view hunk objects
interface DiffHunk {
  content: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  changes: DiffChange[]
}

export function DiffViewer({
  diff,
  filename,
  comments,
  onLineClick,
  commentingOnLine,
  onCommentSubmit,
  onCommentCancel,
  onApprove,
  onReject,
  onUpdateMessage,
  onUpdateStatus,
}: DiffViewerProps) {
  const { files, parseError } = useMemo(() => {
    if (!diff) return { files: [], parseError: null }
    try {
      const parsed = parseDiff(diff, { nearbySequences: 'zip' })
      return { files: parsed, parseError: null }
    } catch (err) {
      console.error('Failed to parse diff:', err)
      return { files: [], parseError: err instanceof Error ? err.message : 'Unknown error' }
    }
  }, [diff])

  const file = files[0]

  // Build a map of new line numbers to change keys for widget placement
  const lineToChangeKey = useMemo(() => {
    const map = new Map<number, string>()
    if (!file?.hunks) return map

    for (const hunk of file.hunks as DiffHunk[]) {
      for (const change of hunk.changes) {
        // For inserts and normal lines, map the new line number to the change key
        const newLine = change.newLineNumber ?? change.lineNumber
        if (newLine !== undefined && (change.type === 'insert' || change.type === 'normal')) {
          const key = getChangeKey(change as ChangeData)
          map.set(newLine, key)
        }
      }
    }
    return map
  }, [file?.hunks])

  // Handle gutter clicks to add manual comments
  const handleGutterClick = useCallback((change: DiffChange) => {
    if (!onLineClick) return
    if (change.type === 'delete') return
    const line = change.newLineNumber
    if (line !== undefined) {
      onLineClick(line)
    }
  }, [onLineClick])

  // Create widgets for comments + comment form, keyed by change key
  const widgets = useMemo(() => {
    const result: Record<string, React.ReactElement> = {}

    for (const comment of comments) {
      const changeKey = lineToChangeKey.get(comment.line)
      if (changeKey) {
        const existing = result[changeKey]
        result[changeKey] = (
          <div key={`widgets-${comment.id}`}>
            {existing}
            <InlineCommentCard
              comment={comment}
              onApprove={() => onApprove(comment.id)}
              onReject={() => onReject(comment.id)}
              onUpdateMessage={onUpdateMessage}
              onUpdateStatus={onUpdateStatus}
            />
          </div>
        )
      }
    }

    // Add comment form widget if user is commenting on a line
    if (commentingOnLine != null && onCommentSubmit && onCommentCancel) {
      const changeKey = lineToChangeKey.get(commentingOnLine)
      if (changeKey) {
        const existing = result[changeKey]
        result[changeKey] = (
          <div key={`widgets-form-${commentingOnLine}`}>
            {existing}
            <CommentForm onSubmit={onCommentSubmit} onCancel={onCommentCancel} />
          </div>
        )
      }
    }

    return result
  }, [comments, lineToChangeKey, commentingOnLine, onCommentSubmit, onCommentCancel, onApprove, onReject, onUpdateMessage, onUpdateStatus])

  if (parseError) {
    return (
      <div className="diff-viewer-error">
        <p>Failed to parse diff for {filename}</p>
        <pre>{parseError}</pre>
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="diff-viewer-empty">
        <p>No diff available for this file</p>
      </div>
    )
  }

  // Safety check for hunks
  if (!file.hunks || file.hunks.length === 0) {
    return (
      <div className="diff-viewer-empty">
        <p>No changes in {filename}</p>
      </div>
    )
  }

  return (
    <DiffErrorBoundary filename={filename}>
      <div className="diff-viewer">
        <div className="diff-header">
          <span className="diff-filename">{filename}</span>
          {comments.length > 0 && (
            <span className="diff-comment-count">{comments.length} comment{comments.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <div className={`diff-content${onLineClick ? ' gutter-clickable' : ''}`}>
          <Diff
            viewType="split"
            diffType={file.type}
            hunks={file.hunks}
            widgets={widgets}
            gutterEvents={{ onClick: ({ change }: { change: DiffChange | null }) => { if (change) handleGutterClick(change) } }}
          >
            {(hunks) =>
              hunks.map((hunk) => (
                <Hunk key={hunk.content} hunk={hunk} />
              ))
            }
          </Diff>
        </div>
      </div>
    </DiffErrorBoundary>
  )
}

function CommentForm({ onSubmit, onCancel }: {
  onSubmit: (message: string, severity: ReviewComment['severity']) => void
  onCancel: () => void
}) {
  const [message, setMessage] = useState('')
  const [severity, setSeverity] = useState<ReviewComment['severity']>('suggestion')

  const handleSubmit = useCallback(() => {
    const trimmed = message.trim()
    if (!trimmed) return
    onSubmit(trimmed, severity)
  }, [message, severity, onSubmit])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }, [handleSubmit, onCancel])

  return (
    <div className="comment-form-widget">
      <textarea
        className="comment-form-textarea"
        placeholder="Add a comment..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
        rows={3}
      />
      <div className="comment-form-actions">
        <select
          className="comment-form-severity"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as ReviewComment['severity'])}
        >
          <option value="suggestion">Suggestion</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </select>
        <div className="comment-form-buttons">
          <button className="comment-form-cancel" onClick={onCancel}>Cancel</button>
          <button className="comment-form-submit primary" onClick={handleSubmit} disabled={!message.trim()}>
            Comment
          </button>
        </div>
      </div>
    </div>
  )
}
