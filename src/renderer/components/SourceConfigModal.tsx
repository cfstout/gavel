import { useState } from 'react'
import type { GitHubSearchSource, SlackChannelSource } from '@shared/types'
import { useInboxStore } from '../store/inboxStore'

interface SourceConfigModalProps {
  onClose: () => void
}

type SourceType = 'github-search' | 'slack'

export function SourceConfigModal({ onClose }: SourceConfigModalProps) {
  const { sources, addSource, removeSource, updateSource } = useInboxStore()

  const [sourceType, setSourceType] = useState<SourceType>('github-search')
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [channelName, setChannelName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Please enter a name for this source')
      return
    }

    if (sourceType === 'github-search' && !query.trim()) {
      setError('Please enter a GitHub search query')
      return
    }

    if (sourceType === 'slack' && !channelName.trim()) {
      setError('Please enter a Slack channel name')
      return
    }

    setIsSubmitting(true)

    try {
      const id = `${sourceType}-${Date.now()}`

      if (sourceType === 'github-search') {
        const source: GitHubSearchSource = {
          id,
          type: 'github-search',
          name: name.trim(),
          query: query.trim(),
          enabled: true,
        }
        await addSource(source)
      } else {
        const source: SlackChannelSource = {
          id,
          type: 'slack',
          name: name.trim(),
          channelName: channelName.trim().replace(/^#/, ''),
          enabled: true,
        }
        await addSource(source)
      }

      // Reset form
      setName('')
      setQuery('')
      setChannelName('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add source'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleSource = async (sourceId: string, enabled: boolean) => {
    await updateSource(sourceId, { enabled })
  }

  const handleDeleteSource = async (sourceId: string) => {
    await removeSource(sourceId)
  }

  return (
    <div className="source-modal-overlay" onClick={onClose}>
      <div className="source-modal" onClick={(e) => e.stopPropagation()}>
        <div className="source-modal-header">
          <h3>Configure PR Sources</h3>
          <button className="source-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="source-modal-content">
          <div className="source-type-tabs">
            <button
              className={`source-type-tab ${sourceType === 'github-search' ? 'active' : ''}`}
              onClick={() => setSourceType('github-search')}
            >
              🔍 GitHub Search
            </button>
            <button
              className={`source-type-tab ${sourceType === 'slack' ? 'active' : ''}`}
              onClick={() => setSourceType('slack')}
            >
              💬 Slack Channel
            </button>
          </div>

          <form className="source-form" onSubmit={handleSubmit}>
            <div className="source-form-field">
              <label htmlFor="source-name">Name</label>
              <input
                id="source-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., My Review Requests"
                disabled={isSubmitting}
              />
            </div>

            {sourceType === 'github-search' && (
              <div className="source-form-field">
                <label htmlFor="github-query">Search Query</label>
                <input
                  id="github-query"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="is:pr is:open review-requested:@me"
                  disabled={isSubmitting}
                />
                <span className="hint">
                  Uses GitHub search syntax. Common queries:
                  <br />• <code>review-requested:@me</code> - PRs requesting your review
                  <br />• <code>author:@me</code> - Your open PRs
                  <br />• <code>involves:@me</code> - PRs you're involved in
                </span>
              </div>
            )}

            {sourceType === 'slack' && (
              <div className="source-form-field">
                <label htmlFor="slack-channel">Channel Name</label>
                <input
                  id="slack-channel"
                  type="text"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  placeholder="code-reviews"
                  disabled={isSubmitting}
                />
                <span className="hint">
                  Enter the channel name without the # symbol.
                  <br />
                  Requires Claude Code Slack MCP plugin to be configured.
                </span>
              </div>
            )}

            {error && <div className="pr-input-error">{error}</div>}

            <button type="submit" className="primary" disabled={isSubmitting}>
              {isSubmitting ? 'Adding...' : 'Add Source'}
            </button>
          </form>

          {sources.length > 0 && (
            <div className="sources-list">
              <h4>Active Sources</h4>
              {sources.map((source) => (
                <div key={source.id} className="source-item">
                  <div className="source-item-info">
                    <span className="source-item-name">
                      {source.type === 'github-search' ? '🔍' : '💬'} {source.name}
                    </span>
                    <span className="source-item-detail">
                      {source.type === 'github-search'
                        ? (source as GitHubSearchSource).query
                        : `#${(source as SlackChannelSource).channelName}`}
                    </span>
                  </div>
                  <div className="source-item-actions">
                    <button
                      onClick={() => handleToggleSource(source.id, !source.enabled)}
                    >
                      {source.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button onClick={() => handleDeleteSource(source.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="source-modal-actions">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
