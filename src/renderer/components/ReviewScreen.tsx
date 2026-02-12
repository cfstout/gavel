import { useState, useMemo, useCallback, memo } from 'react'
import { useReviewStore } from '../store/reviewStore'
import { DiffViewer } from './DiffViewer'
import { FileTree } from './FileTree'
import { SubmitModal } from './SubmitModal'
import type { ReviewComment, CommentStatus } from '@shared/types'
import './ReviewScreen.css'

interface ReviewScreenProps {
  onSubmitSuccess: () => void
  onBack: () => void
}

export function ReviewScreen({ onSubmitSuccess, onBack }: ReviewScreenProps) {
  const {
    prData,
    comments,
    selectedPersona,
    reset,
    isAnalyzing,
    addComment,
    updateCommentStatus,
    updateCommentMessage,
  } = useReviewStore()
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [commentingOnLine, setCommentingOnLine] = useState<{ file: string; line: number } | null>(null)

  const handleExit = useCallback(() => {
    reset()
    onSubmitSuccess() // Reuses the same navigation (goes to pr-input)
  }, [reset, onSubmitSuccess])

  // Compute approved comments with useMemo to avoid infinite loops
  const approvedComments = useMemo(
    () => comments.filter((c) => c.status === 'approved'),
    [comments]
  )

  const [showSubmitModal, setShowSubmitModal] = useState(false)

  const commentsByFile = useMemo(() => getCommentsByFile(comments), [comments])

  const handleScrollToFile = useCallback((filename: string) => {
    document.getElementById(`file-diff-${encodeURIComponent(filename)}`)
      ?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const handleLineClick = useCallback((file: string, line: number) => {
    setCommentingOnLine({ file, line })
  }, [])

  const handleCommentSubmit = useCallback((message: string, severity: ReviewComment['severity']) => {
    if (!commentingOnLine) return
    const comment: ReviewComment = {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file: commentingOnLine.file,
      line: commentingOnLine.line,
      message,
      severity,
      status: 'approved',
      originalMessage: message,
      source: 'manual',
    }
    addComment(comment)
    setCommentingOnLine(null)
  }, [commentingOnLine, addComment])

  const handleCommentCancel = useCallback(() => {
    setCommentingOnLine(null)
  }, [])

  if (!prData) {
    return <div className="review-screen">No PR data loaded</div>
  }

  return (
    <div className="review-screen">
      <div className="review-toolbar">
        <div className="review-toolbar-left">
          <button className="back-button" onClick={onBack}>
            ← Back
          </button>
          <div className="review-info">
            <span className="review-title">{prData.metadata.title}</span>
            <span className="review-meta">
              {selectedPersona?.name} • {comments.length} comments
            </span>
          </div>
          {isAnalyzing && (
            <div className="analysis-indicator">
              <div className="analysis-indicator-spinner" />
              <span>Analyzing...</span>
            </div>
          )}
        </div>
        <div className="review-toolbar-right">
          <button
            className="exit-button"
            onClick={() => setShowExitConfirm(true)}
          >
            Exit Review
          </button>
          <button
            className="primary"
            onClick={() => setShowSubmitModal(true)}
          >
            Submit Review{approvedComments.length > 0 ? ` (${approvedComments.length})` : ''}
          </button>
        </div>
      </div>

      {showExitConfirm && (
        <div className="modal-overlay" onClick={() => setShowExitConfirm(false)}>
          <div className="exit-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Exit Review?</h3>
            <p>This will discard all comments and start fresh.</p>
            <div className="exit-confirm-buttons">
              <button onClick={() => setShowExitConfirm(false)}>Cancel</button>
              <button className="danger" onClick={handleExit}>Exit</button>
            </div>
          </div>
        </div>
      )}

      <div className="review-content">
        <FileTree
          files={prData.files}
          onScrollToFile={handleScrollToFile}
          commentsByFile={commentsByFile}
        />

        <div className="review-main">
          {prData.files.map((file) => (
            <FileDiffSection
              key={file.filename}
              filename={file.filename}
              fullDiff={prData.diff}
              comments={comments}
              commentingOnLine={commentingOnLine}
              onLineClick={handleLineClick}
              onCommentSubmit={handleCommentSubmit}
              onCommentCancel={handleCommentCancel}
              onUpdateMessage={updateCommentMessage}
              onUpdateStatus={updateCommentStatus}
            />
          ))}
        </div>
      </div>

      {showSubmitModal && (
        <SubmitModal
          onClose={() => setShowSubmitModal(false)}
          onSuccess={onSubmitSuccess}
        />
      )}
    </div>
  )
}

/**
 * Wrapper component to memoize per-file diff extraction and comment filtering.
 */
interface FileDiffSectionProps {
  filename: string
  fullDiff: string
  comments: ReviewComment[]
  commentingOnLine: { file: string; line: number } | null
  onLineClick: (file: string, line: number) => void
  onCommentSubmit: (message: string, severity: ReviewComment['severity']) => void
  onCommentCancel: () => void
  onUpdateMessage: (commentId: string, message: string) => void
  onUpdateStatus: (commentId: string, status: CommentStatus) => void
}

const FileDiffSection = memo(function FileDiffSection({
  filename,
  fullDiff,
  comments,
  commentingOnLine,
  onLineClick,
  onCommentSubmit,
  onCommentCancel,
  onUpdateMessage,
  onUpdateStatus,
}: FileDiffSectionProps) {
  const fileDiff = useMemo(() => extractFileDiff(fullDiff, filename), [fullDiff, filename])
  const fileComments = useMemo(() => comments.filter((c) => c.file === filename), [comments, filename])

  return (
    <div id={`file-diff-${encodeURIComponent(filename)}`}>
      <DiffViewer
        diff={fileDiff}
        filename={filename}
        comments={fileComments}
        onLineClick={(line) => onLineClick(filename, line)}
        commentingOnLine={commentingOnLine?.file === filename ? commentingOnLine.line : null}
        onCommentSubmit={onCommentSubmit}
        onCommentCancel={onCommentCancel}
        onUpdateMessage={onUpdateMessage}
        onUpdateStatus={onUpdateStatus}
      />
    </div>
  )
})

/**
 * Extract the diff for a specific file from the full diff
 */
function extractFileDiff(fullDiff: string, filename: string): string {
  const lines = fullDiff.split('\n')
  let inFile = false
  const fileLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      // Check if this is the file we want
      if (inFile) {
        // We were in the target file, we're done
        break
      }
      inFile = line.includes(`b/${filename}`)
      if (inFile) {
        fileLines.push(line)
      }
    } else if (inFile) {
      fileLines.push(line)
    }
  }

  return fileLines.join('\n')
}

/**
 * Group comments by file
 */
function getCommentsByFile(
  comments: { file: string }[]
): Record<string, number> {
  const byFile: Record<string, number> = {}
  for (const c of comments) {
    byFile[c.file] = (byFile[c.file] || 0) + 1
  }
  return byFile
}
