import { useMemo, Component, ReactNode } from 'react'
import { Diff, Hunk, parseDiff } from 'react-diff-view'
import type { ReviewComment } from '@shared/types'
import 'react-diff-view/style/index.css'
import './DiffViewer.css'

// Generate change key matching react-diff-view's internal format
function getChangeKey(change: DiffChange): string {
  if (change.type === 'insert') {
    return `I${change.lineNumber ?? change.newLineNumber}`
  }
  if (change.type === 'delete') {
    return `D${change.lineNumber ?? change.oldLineNumber}`
  }
  // Normal line
  return `N${change.oldLineNumber},${change.newLineNumber}`
}

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
          const key = getChangeKey(change)
          map.set(newLine, key)
        }
      }
    }
    return map
  }, [file?.hunks])

  // Create widgets for comments, keyed by change key
  const widgets = useMemo(() => {
    const result: Record<string, React.ReactElement> = {}

    for (const comment of comments) {
      const changeKey = lineToChangeKey.get(comment.line)
      if (changeKey) {
        result[changeKey] = (
          <div
            key={comment.id}
            className={`diff-inline-comment severity-${comment.severity}`}
          >
            <div className="inline-comment-marker">
              <span className="comment-severity">{getSeverityIcon(comment.severity)}</span>
              <span className="comment-label">{comment.severity}</span>
            </div>
            <div className="inline-comment-body">
              <div className="inline-comment-message">{comment.message}</div>
            </div>
          </div>
        )
      }
    }
    return result
  }, [comments, lineToChangeKey])

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
