import { useMemo } from 'react'
import { Diff, Hunk, parseDiff } from 'react-diff-view'
import type { ReviewComment } from '@shared/types'
import 'react-diff-view/style/index.css'
import './DiffViewer.css'

interface DiffViewerProps {
  diff: string
  filename: string
  comments: ReviewComment[]
}

export function DiffViewer({ diff, filename, comments }: DiffViewerProps) {
  const files = useMemo(() => {
    if (!diff) return []
    try {
      return parseDiff(diff)
    } catch {
      return []
    }
  }, [diff])

  // Create widgets for comments
  const widgets = useMemo(() => {
    const result: Record<string, React.ReactElement> = {}
    for (const comment of comments) {
      const key = `${comment.line}-new`
      result[key] = (
        <div
          key={comment.id}
          className={`diff-comment-widget severity-${comment.severity}`}
        >
          <div className="comment-header">
            <span className="comment-severity">{getSeverityIcon(comment.severity)}</span>
            <span className="comment-file-line">Line {comment.line}</span>
          </div>
          <div className="comment-message">{comment.message}</div>
        </div>
      )
    }
    return result
  }, [comments])

  if (files.length === 0) {
    return (
      <div className="diff-viewer-empty">
        <p>No diff available for this file</p>
      </div>
    )
  }

  const file = files[0]

  return (
    <div className="diff-viewer">
      <div className="diff-header">
        <span className="diff-filename">{filename}</span>
      </div>
      <div className="diff-content">
        <Diff
          viewType="unified"
          diffType={file.type}
          hunks={file.hunks}
          widgets={widgets}
        >
          {(hunks) =>
            hunks.map((hunk) => (
              <Hunk key={hunk.content} hunk={hunk} />
            ))
          }
        </Diff>
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
