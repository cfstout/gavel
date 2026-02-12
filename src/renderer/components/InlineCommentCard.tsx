import { useState, useRef, useEffect } from 'react'
import type { ReviewComment, CommentStatus } from '@shared/types'
import './InlineCommentCard.css'

interface InlineCommentCardProps {
  comment: ReviewComment
  onApprove: () => void
  onReject: () => void
  onUpdateMessage: (commentId: string, message: string) => void
  onUpdateStatus: (commentId: string, status: CommentStatus) => void
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function InlineCommentCard({
  comment,
  onApprove,
  onReject,
  onUpdateMessage,
  onUpdateStatus,
}: InlineCommentCardProps) {
  const [isRefining, setIsRefining] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isRefining) inputRef.current?.focus()
  }, [isRefining])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleRefineSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')
    setError(null)
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    setIsLoading(true)

    try {
      const refined = await window.electronAPI.refinementChat(
        comment.id,
        comment,
        userMessage
      )
      setMessages((prev) => [...prev, { role: 'assistant', content: refined }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get response')
    } finally {
      setIsLoading(false)
    }
  }

  const handleApplyLatest = () => {
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === 'assistant')

    if (lastAssistant) {
      onUpdateMessage(comment.id, lastAssistant.content)
      onUpdateStatus(comment.id, 'approved')
      setIsRefining(false)
      setMessages([])
    }
  }

  return (
    <div
      className={`inline-comment-card severity-${comment.severity} status-${comment.status}${comment.source === 'manual' ? ' source-manual' : ''}`}
    >
      <div className="inline-card-body">
        <div className="inline-card-left">
          <span className="inline-card-severity">{comment.severity}:</span>
          <span className="inline-card-message">{comment.message}</span>
        </div>
        <div className="inline-card-right">
          {comment.source === 'manual' && (
            <span className="comment-source-badge">manual</span>
          )}
          <span className={`inline-card-status status-${comment.status}`}>
            {comment.status}
          </span>
          <button
            className={`inline-action approve${comment.status === 'approved' ? ' active' : ''}`}
            onClick={onApprove}
            title="Approve"
          >
            ✓
          </button>
          <button
            className={`inline-action reject${comment.status === 'rejected' ? ' active' : ''}`}
            onClick={onReject}
            title="Reject"
          >
            ✗
          </button>
          <button
            className={`inline-action refine${isRefining ? ' active' : ''}`}
            onClick={() => setIsRefining(!isRefining)}
            title="Refine"
          >
            Refine
          </button>
        </div>
      </div>

      {isRefining && (
        <div className="inline-refine-thread">
          <div className="refine-original">
            <span className="refine-label">Original:</span>
            <span className="refine-original-text">
              {comment.originalMessage}
            </span>
          </div>

          {messages.map((msg, i) => (
            <div key={i} className={`refine-message ${msg.role}`}>
              <span className="refine-message-label">
                {msg.role === 'user' ? 'You' : 'Claude'}
              </span>
              <span className="refine-message-content">{msg.content}</span>
            </div>
          ))}

          {isLoading && (
            <div className="refine-message assistant loading">
              <span className="refine-message-label">Claude</span>
              <span className="refine-message-content">Thinking...</span>
            </div>
          )}

          {error && <div className="refine-error">{error}</div>}

          <div ref={messagesEndRef} />

          <form className="refine-input-form" onSubmit={handleRefineSubmit}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="How should this comment change?"
              disabled={isLoading}
            />
            <button type="submit" disabled={!input.trim() || isLoading}>
              Send
            </button>
          </form>

          {messages.some((m) => m.role === 'assistant') && (
            <div className="refine-actions">
              <button className="primary" onClick={handleApplyLatest}>
                Apply & Approve
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
