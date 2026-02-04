import { useState } from 'react'
import type { AppScreen } from '@shared/types'
import './styles/App.css'

export default function App() {
  const [screen] = useState<AppScreen>('pr-input')

  return (
    <div className="app">
      <header className="app-header">
        <h1>Gavel</h1>
        <span className="tagline">AI Code Review Assistant</span>
      </header>
      <main className="app-content">
        {screen === 'pr-input' && (
          <div className="screen pr-input-screen">
            <div className="input-card">
              <h2>Start a Review</h2>
              <p>Enter a GitHub Pull Request URL or reference to begin.</p>
              <input
                type="text"
                placeholder="owner/repo#123 or https://github.com/..."
                className="pr-input"
              />
              <button className="primary" disabled>
                Continue
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
