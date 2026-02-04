import { useEffect, useRef } from 'react'
import { useReviewStore } from '../store/reviewStore'
import './AnalysisProgress.css'

interface AnalysisProgressProps {
  onComplete: () => void
  onError: () => void
}

export function AnalysisProgress({ onComplete, onError }: AnalysisProgressProps) {
  const {
    prData,
    selectedPersona,
    setComments,
    setAnalyzing,
    analysisProgress,
    appendAnalysisProgress,
    setError,
  } = useReviewStore()

  const hasStarted = useRef(false)
  const outputRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (hasStarted.current) return
    hasStarted.current = true

    async function runAnalysis() {
      if (!prData || !selectedPersona) {
        setError('Missing PR data or persona')
        onError()
        return
      }

      try {
        // Check Claude auth first
        const isClaudeAvailable = await window.electronAPI.checkClaudeAuth()
        if (!isClaudeAvailable) {
          setError('Claude CLI not found. Please install Claude Code: https://claude.ai/code')
          onError()
          return
        }

        setAnalyzing(true)

        // Set up progress listener
        const cleanup = window.electronAPI.onAnalysisProgress((chunk) => {
          appendAnalysisProgress(chunk)
        })

        // Run analysis
        const comments = await window.electronAPI.analyzePR(
          prData.diff,
          selectedPersona.id
        )

        cleanup()
        setComments(comments)
        setAnalyzing(false)
        onComplete()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Analysis failed'
        setError(message)
        setAnalyzing(false)
        onError()
      }
    }

    runAnalysis()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [analysisProgress])

  return (
    <div className="analysis-screen">
      <div className="analysis-content">
        <div className="analysis-header">
          <div className="analysis-spinner" />
          <div>
            <h2>Analyzing Pull Request</h2>
            <p>
              {selectedPersona?.name} review of{' '}
              <strong>{prData?.metadata.title}</strong>
            </p>
          </div>
        </div>

        <div className="analysis-info">
          <div className="analysis-stat">
            <span className="stat-label">Files</span>
            <span className="stat-value">{prData?.files.length}</span>
          </div>
          <div className="analysis-stat">
            <span className="stat-label">Additions</span>
            <span className="stat-value stat-add">
              +{prData?.files.reduce((sum, f) => sum + f.additions, 0)}
            </span>
          </div>
          <div className="analysis-stat">
            <span className="stat-label">Deletions</span>
            <span className="stat-value stat-del">
              -{prData?.files.reduce((sum, f) => sum + f.deletions, 0)}
            </span>
          </div>
        </div>

        {analysisProgress && (
          <div className="analysis-output-container">
            <div className="analysis-output-header">Claude Output</div>
            <pre className="analysis-output" ref={outputRef}>
              {analysisProgress}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
