import type { PRFile } from '@shared/types'
import './FileTree.css'

interface FileTreeProps {
  files: PRFile[]
  onScrollToFile: (filename: string) => void
  commentsByFile: Record<string, number>
}

export function FileTree({
  files,
  onScrollToFile,
  commentsByFile,
}: FileTreeProps) {
  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <span className="file-tree-title">Files</span>
        <span className="file-tree-count">{files.length}</span>
      </div>
      <div className="file-tree-list">
        {files.map((file) => (
          <button
            key={file.filename}
            className="file-tree-item"
            onClick={() => onScrollToFile(file.filename)}
          >
            <span className={`file-status status-${file.status}`}>
              {getStatusIcon(file.status)}
            </span>
            <span className="file-name" title={file.filename}>
              {getDisplayName(file.filename)}
            </span>
            <span className="file-stats">
              <span className="stat-add">+{file.additions}</span>
              <span className="stat-del">-{file.deletions}</span>
            </span>
            {commentsByFile[file.filename] > 0 && (
              <span className="file-comments">
                {commentsByFile[file.filename]}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

function getStatusIcon(status: PRFile['status']): string {
  switch (status) {
    case 'added':
      return '+'
    case 'deleted':
      return '−'
    case 'modified':
      return '•'
    case 'renamed':
      return '→'
    default:
      return '•'
  }
}

function getDisplayName(filename: string): string {
  // Show just the filename, not the full path
  const parts = filename.split('/')
  return parts[parts.length - 1]
}
