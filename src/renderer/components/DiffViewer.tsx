import { useMemo, Component, ReactNode } from 'react'
import { Diff, Hunk, parseDiff } from 'react-diff-view'
import type { ReviewComment } from '@shared/types'
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
}

export function DiffViewer({ diff, filename, comments }: DiffViewerProps) {
  const { files, parseError } = useMemo(() => {
    if (!diff) return { files: [], parseError: null }
    try {
      const parsed = parseDiff(diff)
      return { files: parsed, parseError: null }
    } catch (err) {
      console.error('Failed to parse diff:', err)
      return { files: [], parseError: err instanceof Error ? err.message : 'Unknown error' }
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

  const file = files[0]

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
    </DiffErrorBoundary>
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
