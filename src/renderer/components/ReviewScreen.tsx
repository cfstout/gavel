import { useState, useMemo } from 'react'
import { useReviewStore, useApprovedComments } from '../store/reviewStore'
import { DiffViewer } from './DiffViewer'
import { FileTree } from './FileTree'
import { CommentList } from './CommentList'
import './ReviewScreen.css'

interface ReviewScreenProps {
  onSubmit: () => void
  onBack: () => void
}

export function ReviewScreen({ onSubmit, onBack }: ReviewScreenProps) {
  const { prData, comments, selectedPersona } = useReviewStore()
  const approvedComments = useApprovedComments()

  const [selectedFile, setSelectedFile] = useState<string | null>(
    prData?.files[0]?.filename ?? null
  )
  const [showCommentPanel, setShowCommentPanel] = useState(true)

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
            className="toggle-comments"
            onClick={() => setShowCommentPanel(!showCommentPanel)}
          >
            {showCommentPanel ? 'Hide Comments' : 'Show Comments'}
          </button>
          <button
            className="primary"
            onClick={onSubmit}
            disabled={approvedComments.length === 0}
          >
            Submit {approvedComments.length > 0 && `(${approvedComments.length})`}
          </button>
        </div>
      </div>

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
          />
        )}
      </div>
    </div>
  )
}

/**
 * Extract the diff for a specific file from the full diff
 */
function extractFileDiff(fullDiff: string, filename: string): string {
  const lines = fullDiff.split('\n')
  let inFile = false
  let fileLines: string[] = []

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
