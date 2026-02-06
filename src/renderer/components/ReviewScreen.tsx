import { useState, useMemo, useCallback } from 'react'
import { useReviewStore } from '../store/reviewStore'
import { DiffViewer } from './DiffViewer'
import { FileTree } from './FileTree'
import { CommentList } from './CommentList'
import { ChatPanel } from './ChatPanel'
import { SubmitModal } from './SubmitModal'
import type { ReviewComment } from '@shared/types'
import './ReviewScreen.css'

interface ReviewScreenProps {
  onSubmitSuccess: () => void
  onBack: () => void
}

export function ReviewScreen({ onSubmitSuccess, onBack }: ReviewScreenProps) {
  const { prData, comments, selectedPersona, reset } = useReviewStore()
  const [showExitConfirm, setShowExitConfirm] = useState(false)

  const handleExit = useCallback(() => {
    reset()
    onSubmitSuccess() // Reuses the same navigation (goes to pr-input)
  }, [reset, onSubmitSuccess])

  // Compute approved comments with useMemo to avoid infinite loops
  const approvedComments = useMemo(
    () => comments.filter((c) => c.status === 'approved'),
    [comments]
  )

  const [selectedFile, setSelectedFile] = useState<string | null>(
    prData?.files[0]?.filename ?? null
  )
  const [showCommentPanel, setShowCommentPanel] = useState(true)
  const [refiningComment, setRefiningComment] = useState<ReviewComment | null>(null)
  const [showSubmitModal, setShowSubmitModal] = useState(false)

  // Get comments for the selected file
  const fileComments = useMemo(() => {
    if (!selectedFile) return []
    return comments.filter((c) => c.file === selectedFile)
  }, [comments, selectedFile])

  // Get diff for selected file from the full diff
  const fileDiff = useMemo(() => {
    if (!selectedFile || !prData?.diff) return ''
    return extractFileDiff(prData.diff, selectedFile)
  }, [prData?.diff, selectedFile])

  const handleRefine = (comment: ReviewComment) => {
    setRefiningComment(comment)
  }

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
        </div>
        <div className="review-toolbar-right">
          <button
            className="exit-button"
            onClick={() => setShowExitConfirm(true)}
          >
            Exit Review
          </button>
          <button
            className="toggle-comments"
            onClick={() => setShowCommentPanel(!showCommentPanel)}
          >
            {showCommentPanel ? 'Hide Comments' : 'Show Comments'}
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
          selectedFile={selectedFile}
          onSelectFile={setSelectedFile}
          commentsByFile={getCommentsByFile(comments)}
        />

        <div className="review-main">
          {selectedFile ? (
            <DiffViewer
              diff={fileDiff}
              filename={selectedFile}
              comments={fileComments}
            />
          ) : (
            <div className="no-file-selected">
              Select a file from the sidebar to view changes
            </div>
          )}
        </div>

        {showCommentPanel && (
          <CommentList
            comments={comments}
            onFileClick={(file) => setSelectedFile(file)}
            onRefine={handleRefine}
          />
        )}
      </div>

      {refiningComment && (
        <ChatPanel
          comment={refiningComment}
          onClose={() => setRefiningComment(null)}
        />
      )}

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
