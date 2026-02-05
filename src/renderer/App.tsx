import { useCallback, useEffect, Component, ReactNode } from 'react'
import { useReviewStore } from './store/reviewStore'
import { useInboxStore } from './store/inboxStore'
import { InboxScreen } from './components/InboxScreen'
import { PRInput } from './components/PRInput'
import { PersonaSelect } from './components/PersonaSelect'
import { AnalysisProgress } from './components/AnalysisProgress'
import { ReviewScreen } from './components/ReviewScreen'
import type { InboxPR } from '@shared/types'
import './styles/App.css'

// Top-level error boundary to catch React crashes
class AppErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode; onReset: () => void }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('React error:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    this.props.onReset()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app">
          <header className="app-header">
            <h1>Gavel</h1>
            <span className="tagline">AI Code Review Assistant</span>
          </header>
          <main className="app-content">
            <div className="error-screen">
              <h2>Something went wrong</h2>
              <pre className="error-details">{this.state.error?.message}</pre>
              <pre className="error-stack">{this.state.error?.stack}</pre>
              <button className="primary" onClick={this.handleReset}>
                Start Over
              </button>
            </div>
          </main>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const { screen, setScreen, setPRRef, setPRData, error, setError, reset, isRestored, restoreState } = useReviewStore()
  const { movePR } = useInboxStore()

  // Track the current PR being reviewed from inbox
  const currentInboxPRRef = useReviewStore((state) => state.prRef)

  // Restore saved state on mount
  useEffect(() => {
    if (!isRestored) {
      restoreState()
    }
  }, [isRestored, restoreState])

  // Handle starting a review from the inbox
  const handleReviewFromInbox = useCallback(
    async (pr: InboxPR) => {
      try {
        // Fetch full PR data
        const prData = await window.electronAPI.fetchPR(pr.url)
        setPRRef(pr.url)
        setPRData(prData)
        setScreen('persona-select')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch PR'
        setError(message)
      }
    },
    [setPRRef, setPRData, setScreen, setError]
  )

  const handleManualEntry = useCallback(() => {
    setScreen('pr-input')
  }, [setScreen])

  const handlePRInputNext = useCallback(() => {
    setScreen('persona-select')
  }, [setScreen])

  const handlePersonaBack = useCallback(() => {
    // Go back to inbox if we came from there, otherwise pr-input
    setScreen('inbox')
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

  const handleReviewSubmitSuccess = useCallback(async () => {
    // Move the PR to reviewed column if it came from inbox
    if (currentInboxPRRef) {
      // Extract PR ID from the ref
      const match = currentInboxPRRef.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
      if (match) {
        const prId = `${match[1]}/${match[2]}#${match[3]}`
        await movePR(prId, 'reviewed')
      }
    }

    // After successful submission, go back to inbox
    reset()
    setScreen('inbox')
  }, [currentInboxPRRef, movePR, reset, setScreen])

  const renderScreen = () => {
    switch (screen) {
      case 'inbox':
        return (
          <InboxScreen
            onReviewPR={handleReviewFromInbox}
            onManualEntry={handleManualEntry}
          />
        )

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

  // Show loading state while restoring
  if (!isRestored) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>Gavel</h1>
          <span className="tagline">AI Code Review Assistant</span>
        </header>
        <main className="app-content">
          <div className="loading-screen">
            <div className="loading-spinner" />
            <p>Loading...</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <AppErrorBoundary onReset={reset}>
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
    </AppErrorBoundary>
  )
}
