import { useEffect, useState } from 'react'
import { useReviewStore } from '../store/reviewStore'
import type { Persona } from '@shared/types'
import './PersonaSelect.css'

interface PersonaSelectProps {
  onNext: () => void
  onBack: () => void
}

export function PersonaSelect({ onNext, onBack }: PersonaSelectProps) {
  const { prData, selectedPersona, setSelectedPersona } = useReviewStore()
  const [personas, setPersonas] = useState<Persona[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadPersonas() {
      try {
        const loaded = await window.electronAPI.getPersonas()
        setPersonas(loaded)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load personas')
      } finally {
        setIsLoading(false)
      }
    }
    loadPersonas()
  }, [])

  const handleSelect = (persona: Persona) => {
    setSelectedPersona(persona)
  }

  const handleContinue = () => {
    if (selectedPersona) {
      onNext()
    }
  }

  if (isLoading) {
    return (
      <div className="persona-select-screen">
        <div className="persona-loading">Loading review templates...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="persona-select-screen">
        <div className="persona-error">{error}</div>
      </div>
    )
  }

  return (
    <div className="persona-select-screen">
      <div className="persona-select-content">
        <header className="persona-header">
          <button className="back-button" onClick={onBack}>
            ← Back
          </button>
          <div className="persona-header-text">
            <h2>Select Review Type</h2>
            <p>
              Reviewing <strong>{prData?.metadata.title}</strong>
            </p>
          </div>
        </header>

        <div className="persona-grid">
          {personas.map((persona) => (
            <button
              key={persona.id}
              className={`persona-card ${
                selectedPersona?.id === persona.id ? 'selected' : ''
              }`}
              onClick={() => handleSelect(persona)}
            >
              <div className="persona-card-header">
                <span className="persona-name">{persona.name}</span>
                {persona.isBuiltIn && (
                  <span className="persona-badge">Built-in</span>
                )}
              </div>
              <p className="persona-description">{persona.description}</p>
            </button>
          ))}
        </div>

        <div className="persona-actions">
          <button
            className="primary"
            disabled={!selectedPersona}
            onClick={handleContinue}
          >
            Start Analysis
          </button>
        </div>
      </div>
    </div>
  )
}
