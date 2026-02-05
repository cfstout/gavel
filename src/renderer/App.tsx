import { useCallback } from 'react'
import { useReviewStore } from './store/reviewStore'
import { PRInput } from './components/PRInput'
import { PersonaSelect } from './components/PersonaSelect'
import { AnalysisProgress } from './components/AnalysisProgress'
import { ReviewScreen } from './components/ReviewScreen'
import './styles/App.css'

export default function App() {
  const { screen, setScreen, error, setError } = useReviewStore()

  const handlePRInputNext = useCallback(() => {
    setScreen('persona-select')
  }, [setScreen])

  const handlePersonaBack = useCallback(() => {
    setScreen('pr-input')
  }, [setScreen])

  const handlePersonaNext = useCallback(() => {
    setScreen('analyzing')
  }, [setScreen])

  const handleAnalysisComplete = useCallback(() => {
    setScreen('review')
  }, [setScreen])

  const handleAnalysisError = useCallback(() => {
    // Stay on persona select so user can try again
    setScreen('persona-select')
  }, [setScreen])

  const handleReviewBack = useCallback(() => {
    setScreen('persona-select')
  }, [setScreen])

  const handleReviewSubmitSuccess = useCallback(() => {
    // After successful submission, go back to PR input for next review
    setScreen('pr-input')
  }, [setScreen])

  const renderScreen = () => {
    switch (screen) {
      case 'pr-input':
        return <PRInput onNext={handlePRInputNext} />

      case 'persona-select':
        return (
          <PersonaSelect onNext={handlePersonaNext} onBack={handlePersonaBack} />
        )

      case 'analyzing':
        return (
          <AnalysisProgress
            onComplete={handleAnalysisComplete}
            onError={handleAnalysisError}
          />
        )

      case 'review':
        return (
          <ReviewScreen
            onSubmitSuccess={handleReviewSubmitSuccess}
            onBack={handleReviewBack}
          />
        )

      default:
        return null
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Gavel</h1>
        <span className="tagline">AI Code Review Assistant</span>
      </header>
      <main className="app-content">
        {error && (
          <div className="global-error">
            <span>{error}</span>
            <button onClick={() => setError(null)}>Dismiss</button>
          </div>
        )}
        {renderScreen()}
      </main>
    </div>
  )
}
