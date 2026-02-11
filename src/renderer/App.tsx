import { useCallback, useEffect, useRef, Component, ReactNode } from 'react'
import { useReviewStore } from './store/reviewStore'
import { useInboxStore } from './store/inboxStore'
import { InboxScreen } from './components/InboxScreen'
import { PRInput } from './components/PRInput'
import { PersonaSelect } from './components/PersonaSelect'
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
  const { screen, setScreen, setPRRef, setPRData, prData, error, setError, reset, isRestored, restoreState } = useReviewStore()
  const { addPR, movePR } = useInboxStore()

  // Track the current PR being reviewed from inbox
  const currentInboxPRRef = useReviewStore((state) => state.prRef)

  // Track how the user entered the review flow (inbox vs manual entry)
  const enteredFromRef = useRef<'inbox' | 'pr-input'>('inbox')

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
        enteredFromRef.current = 'inbox'
        const fetchedPR = await window.electronAPI.fetchPR(pr.url)
        setPRRef(pr.url)
        setPRData(fetchedPR)
        setScreen('persona-select')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch PR'
        setError(message)
      }
    },
    [setPRRef, setPRData, setScreen, setError]
  )

  const handleManualEntry = useCallback(() => {
    enteredFromRef.current = 'pr-input'
    setScreen('pr-input')
  }, [setScreen])

  const handlePRInputNext = useCallback(() => {
    setScreen('persona-select')
  }, [setScreen])

  const handlePRInputBack = useCallback(() => {
    setScreen('inbox')
  }, [setScreen])

  const handlePersonaBack = useCallback(() => {
    setScreen(enteredFromRef.current)
  }, [setScreen])

  const startAnalysisInBackground = useReviewStore((state) => state.startAnalysisInBackground)

  const handlePersonaNext = useCallback(() => {
    const { prData, selectedPersona } = useReviewStore.getState()
    if (!prData || !selectedPersona) {
      setError('Missing PR data or persona')
      return
    }
    startAnalysisInBackground(prData.diff, selectedPersona.id)
    setScreen('review')
  }, [setScreen, setError, startAnalysisInBackground])

  const handleReviewBack = useCallback(() => {
    setScreen('persona-select')
  }, [setScreen])

  const handleReviewSubmitSuccess = useCallback(async () => {
    if (currentInboxPRRef) {
      const match = currentInboxPRRef.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
      if (match) {
        const [, owner, repo, number] = match
        const prId = `${owner}/${repo}#${number}`

        // Ensure the PR exists in the inbox (handles manual entry)
        if (prData) {
          const now = new Date().toISOString()
          await addPR({
            id: prId,
            owner,
            repo,
            number: parseInt(number, 10),
            title: prData.metadata.title,
            author: prData.metadata.author,
            url: currentInboxPRRef,
            headSha: '', // Will be backfilled on next poll (skips SHA comparison while empty)
            column: 'inbox',
            source: 'github-search',
            sourceId: 'manual',
            addedAt: now,
            lastCheckedAt: now,
          })
        }

        // Move to reviewed
        await movePR(prId, 'reviewed')
      }
    }

    // After successful submission, go back to inbox
    reset()
    setScreen('inbox')
  }, [currentInboxPRRef, prData, addPR, movePR, reset, setScreen])

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
        return <PRInput onNext={handlePRInputNext} onBack={handlePRInputBack} />

      case 'persona-select':
        return (
          <PersonaSelect onNext={handlePersonaNext} onBack={handlePersonaBack} />
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
