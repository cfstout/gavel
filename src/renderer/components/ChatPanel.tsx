import { useState, useRef, useEffect } from 'react'
import { useReviewStore } from '../store/reviewStore'
import type { ReviewComment } from '@shared/types'
import './ChatPanel.css'

interface ChatPanelProps {
  comment: ReviewComment
  onClose: () => void
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function ChatPanel({ comment, onClose }: ChatPanelProps) {
  const { updateCommentMessage, updateCommentStatus } = useReviewStore()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')
    setError(null)

    // Add user message
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    setIsLoading(true)

    try {
      const refined = await window.electronAPI.refinementChat(
        comment.id,
        comment,
        userMessage
      )

      // Add assistant response
      setMessages((prev) => [...prev, { role: 'assistant', content: refined }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get response')
    } finally {
      setIsLoading(false)
    }
  }

  const handleApplyLatest = () => {
    // Find the last assistant message
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === 'assistant')

    if (lastAssistant) {
      updateCommentMessage(comment.id, lastAssistant.content)
      updateCommentStatus(comment.id, 'approved')
      onClose()
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-panel-header">
        <h3>Refine Comment</h3>
        <button className="chat-close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="chat-original">
        <div className="chat-original-label">Original Comment</div>
        <div className="chat-original-content">{comment.originalMessage}</div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-hint">
            Describe how you'd like to modify this comment. For example:
            <ul>
              <li>"Make it more concise"</li>
              <li>"Suggest using X instead"</li>
              <li>"Add more context about why this matters"</li>
            </ul>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-message ${msg.role}`}>
            <div className="chat-message-label">
              {msg.role === 'user' ? 'You' : 'Claude'}
            </div>
            <div className="chat-message-content">{msg.content}</div>
          </div>
        ))}

        {isLoading && (
          <div className="chat-message assistant loading">
            <div className="chat-message-label">Claude</div>
            <div className="chat-message-content">Thinking...</div>
          </div>
        )}

        {error && <div className="chat-error">{error}</div>}

        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe how to modify this comment..."
          disabled={isLoading}
        />
        <button type="submit" disabled={!input.trim() || isLoading}>
          Send
        </button>
      </form>

      {messages.some((m) => m.role === 'assistant') && (
        <div className="chat-actions">
          <button className="primary" onClick={handleApplyLatest}>
            Apply & Approve
          </button>
        </div>
      )}
    </div>
  )
}
