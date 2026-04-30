import { useCallback, useEffect, useMemo, useState } from 'react'
import { ipcBridge } from '@shared/ipcBridge'
import type { ExamTier, Question } from '@shared/types'
import { ModeBar } from '../components/ModeBar'
import { QuestionCard } from '../components/QuestionCard'
import { SectionTabs } from '../components/SectionTabs'
import { useSRS } from '../hooks/useSRS'

type CustomQuizScreenProps = {
  onBackToModes: () => void
  onAskAboutQuestion?: (question: Question) => void
  onExplainDifferently?: (question: Question) => void
}

type ScreenPhase = 'builder' | 'quiz' | 'complete'

// TASK: Shuffle an array without mutating the original.
// HOW CODE SOLVES: Fisher-Yates in-place on a copy — O(n) uniform shuffle.
function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

type SessionSummary = {
  attempted: number
  correct: number
}

// TASK: Provide a user-configurable quiz flow based on tier/sub-element filters.
// HOW CODE SOLVES: Loads available sub-elements for selected tier, builds a filtered
//                  randomized pool, then runs the existing submit/feedback cycle.
export function CustomQuizScreen({ onBackToModes, onAskAboutQuestion, onExplainDifferently }: CustomQuizScreenProps) {
  const TABS = [
    { id: 'setup', label: 'Setup' },
    { id: 'practice', label: 'Practice Workspace' },
  ] as const
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]['id']>('setup')
  const [phase, setPhase] = useState<ScreenPhase>('builder')
  const [tier, setTier] = useState<ExamTier>('technician')
  const [questionCount, setQuestionCount] = useState<number>(20)
  const [availableSubElements, setAvailableSubElements] = useState<string[]>([])
  const [selectedSubElements, setSelectedSubElements] = useState<string[]>([])

  const [loading, setLoading] = useState<boolean>(false)
  const [saving, setSaving] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const [questions, setQuestions] = useState<Question[]>([])
  const [index, setIndex] = useState<number>(0)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState<boolean>(false)
  const [startedAt, setStartedAt] = useState<number>(0)
  const [isSrsBridgeAvailable, setIsSrsBridgeAvailable] = useState(true)
  const [sessionSummary, setSessionSummary] = useState<SessionSummary>({ attempted: 0, correct: 0 })
  const [sessionId, setSessionId] = useState<string>(() => `custom-${Date.now()}`)
  const { recordReview, resetLocalCards } = useSRS()

  const currentQuestion = questions[index] ?? null

  const currentSubElementLabel = useMemo(() => {
    if (!currentQuestion) return null
    return `${currentQuestion.subElement} • ${currentQuestion.groupId}`
  }, [currentQuestion])

  // TASK: Load available sub-elements whenever the selected tier changes.
  // HOW CODE SOLVES: Uses existing tier pool endpoint and derives unique sorted sub-elements.
  const loadSubElements = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)

    const pool = await ipcBridge.getQuestionPool({ tier })
    const unique = Array.from(new Set(pool.map((q) => q.subElement))).sort((a, b) => a.localeCompare(b))

    setAvailableSubElements(unique)
    setSelectedSubElements([])
    setLoading(false)
  }, [tier])

  // TASK: Toggle inclusion of a sub-element in custom filter selection.
  // HOW CODE SOLVES: Adds/removes from local selected set while preserving click order.
  function handleToggleSubElement(subElement: string): void {
    setSelectedSubElements((prev) => {
      if (prev.includes(subElement)) {
        return prev.filter((v) => v !== subElement)
      }
      return [...prev, subElement]
    })
  }

  // TASK: Start a custom quiz using builder selections.
  // HOW CODE SOLVES: Calls dedicated custom pool endpoint and initializes quiz state.
  function handleStartQuiz(): void {
    setLoading(true)
    setError(null)

    const requestedCount = Number.isFinite(questionCount) ? questionCount : 20
    const boundedCount = Math.min(Math.max(requestedCount, 1), 100)

    void ipcBridge
      .getCustomQuizQuestionPool({
        tier,
        subElements: selectedSubElements,
        limit: boundedCount,
      })
      .then((pool) => {
        if (pool.length === 0) {
          throw new Error('No questions matched the selected filters.')
        }

        // ISSUE: Pool was not shuffled, so questions always appeared in DB order.
        // FIX APPLIED: Shuffle before setting state so each session has a unique order.
        setQuestions(shuffleArray(pool))
        setIndex(0)
        setSelectedIndex(null)
        setSubmitted(false)
        setStartedAt(Date.now())
        setSessionSummary({ attempted: 0, correct: 0 })
        setSessionId(`custom-${Date.now()}`)
        setPhase('quiz')
        setActiveTab('practice')
      })
      .catch((err: unknown) => {
        const details = err instanceof Error ? err.message : String(err)
        if (details.includes('IPC bridge is not available')) {
          setError(details)
        } else {
          setError(`Failed to start custom quiz. ${details}`)
        }
      })
      .finally(() => {
        setLoading(false)
      })
  }

  // TASK: Persist answer attempts in custom quiz mode.
  // HOW CODE SOLVES: Reuses progress endpoint and updates local + global stats after submit.
  function handleSubmitAnswer(): void {
    if (!currentQuestion || selectedIndex === null) return

    const elapsedMs = Math.max(0, Date.now() - startedAt)
    const isCorrect = selectedIndex === currentQuestion.correctIndex

    setSaving(true)
    void ipcBridge
      .saveAnswer({
        questionId: currentQuestion.id,
        selectedIndex,
        isCorrect,
        timeTakenMs: elapsedMs,
        sessionId,
      })
      .then(async () => {
        setSubmitted(true)
        setSessionSummary((prev) => ({
          attempted: prev.attempted + 1,
          correct: prev.correct + (isCorrect ? 1 : 0),
        }))

        // TASK: Apply SRS updates from custom-quiz answer events.
        // HOW CODE SOLVES: Uses shared hook to keep SM-2 logic centralized
        //                  and degrades gracefully if persistence becomes unavailable.
        const srsResult = await recordReview(
          {
            questionId: currentQuestion.id,
            isCorrect,
          },
          { persistRemotely: isSrsBridgeAvailable },
        )

        if (!srsResult.persisted && srsResult.reason === 'persist-failed') {
          setIsSrsBridgeAvailable(false)
        }

      })
      .catch((err: unknown) => {
        const details = err instanceof Error ? err.message : String(err)
        setError(`Failed to save custom quiz answer. ${details}`)
      })
      .finally(() => {
        setSaving(false)
      })
  }

  // TASK: Advance through the shuffled pool without repeating questions.
  // HOW CODE SOLVES: Increments index linearly; when the last question is reached
  //                  transitions to 'complete' phase instead of wrapping around.
  function handleNextQuestion(): void {
    if (questions.length === 0) return

    if (index + 1 >= questions.length) {
      setPhase('complete')
      return
    }

    setIndex(index + 1)
    setSelectedIndex(null)
    setSubmitted(false)
    setStartedAt(Date.now())
  }

  // TASK: Restart the quiz with a freshly shuffled version of the same pool.
  // HOW CODE SOLVES: Re-shuffles in place and resets all session state without re-fetching.
  function handleRestartQuiz(): void {
    setQuestions((prev) => shuffleArray(prev))
    setIndex(0)
    setSelectedIndex(null)
    setSubmitted(false)
    setStartedAt(Date.now())
    setSessionSummary({ attempted: 0, correct: 0 })
    setSessionId(`custom-${Date.now()}`)
    setPhase('quiz')
    setActiveTab('practice')
  }

  // TASK: Return from quiz phase to filter builder without leaving mode.
  // HOW CODE SOLVES: Preserves filter selections while resetting active question state.
  function handleBackToBuilder(): void {
    setPhase('builder')
    resetLocalCards()
    setQuestions([])
    setIndex(0)
    setSelectedIndex(null)
    setSubmitted(false)
    setStartedAt(0)
    setSessionSummary({ attempted: 0, correct: 0 })
    setError(null)
  }

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([loadSubElements()])
      } catch (err: unknown) {
        const details = err instanceof Error ? err.message : String(err)
        if (details.includes('IPC bridge is not available')) {
          setError(details)
        } else {
          setError(`Failed to initialize custom quiz builder. ${details}`)
        }
        setLoading(false)
      }
    })()
  }, [loadSubElements])

  const accuracy =
    sessionSummary.attempted > 0 ? Number(((sessionSummary.correct / sessionSummary.attempted) * 100).toFixed(2)) : 0

  return (
    <main className="app-shell">
      <ModeBar
        title="Custom Quiz"
        onBack={onBackToModes}
        actions={
          phase === 'quiz' ? (
            <button type="button" className="ghost-btn" onClick={handleBackToBuilder}>
              Builder
            </button>
          ) : undefined
        }
      />

      <SectionTabs items={[...TABS]} activeId={activeTab} onChange={(id) => setActiveTab(id as any)} />

      {activeTab === 'setup' ? (
        <div className="app-shell-scroll">
      {phase === 'builder' ? (
        <section className="panel mode-config-panel custom-builder-panel">
          <div className="mode-config-card">
            <span className="mode-config-label">Tier</span>
            <div className="exam-tier-buttons">
              <button type="button" className={`exam-tier-btn ${tier === 'technician' ? 'active' : ''}`} onClick={() => setTier('technician')} disabled={loading}>
                Technician
              </button>
              <button type="button" className={`exam-tier-btn ${tier === 'general' ? 'active' : ''}`} onClick={() => setTier('general')} disabled={loading}>
                General
              </button>
              <button type="button" className={`exam-tier-btn ${tier === 'extra' ? 'active' : ''}`} onClick={() => setTier('extra')} disabled={loading}>
                Extra
              </button>
            </div>
          </div>

          <div className="mode-config-card">
            <span className="mode-config-label">Study Setup</span>
            <div className="custom-controls">
              <label>
                Target questions
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Number(e.target.value))}
                />
              </label>

              <button type="button" className="ghost-btn" onClick={() => setSelectedSubElements([])} disabled={loading}>
                Clear Topics
              </button>

              <button
                type="button"
                className="ghost-btn"
                onClick={() => setSelectedSubElements([...availableSubElements])}
                disabled={loading || availableSubElements.length === 0}
              >
                Select All
              </button>
            </div>
          </div>

          <div className="mode-config-card">
            <span className="mode-config-label">Topics</span>
            <div className="custom-sub-elements">
              {availableSubElements.map((subElement) => {
                const selected = selectedSubElements.includes(subElement)
                return (
                  <button
                    key={subElement}
                    type="button"
                    className={`custom-chip${selected ? ' selected' : ''}`}
                    onClick={() => handleToggleSubElement(subElement)}
                    disabled={loading}
                  >
                    {subElement}
                  </button>
                )
              })}
            </div>

            <div className="mode-config-copy">
              <p className="meta">
                {selectedSubElements.length > 0
                  ? `Selected topics: ${selectedSubElements.join(', ')}`
                  : 'No topic selected: quiz will pull from all topics in this tier.'}
              </p>
            </div>
          </div>

          <div className="action-row">
            <button type="button" className="primary-button" onClick={handleStartQuiz} disabled={loading || saving}>
              Start Custom Quiz
            </button>
          </div>

          {loading ? <p>Loading custom quiz builder data...</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
        </section>
      ) : (
        <section className="panel">
          <p className="meta">A quiz session is currently running. Switch to the Practice Workspace tab to resume, or reset the quiz below.</p>
          <button type="button" className="danger-btn" onClick={handleBackToBuilder}>Discard Session and Reconfigure</button>
        </section>
      )}
      </div>
      ) : null}

      {activeTab === 'practice' ? (
        <div className="app-shell-fixed">
      {phase === 'complete' ? (
        <section className="panel">
          <p className="mode-tagline">Quiz complete — all {questions.length} questions answered.</p>
          <p className="meta">
            Session score: {sessionSummary.correct} / {sessionSummary.attempted} correct ({accuracy}%)
          </p>
          <div className="action-row">
            <button type="button" className="primary-button" onClick={handleRestartQuiz}>
              Restart (reshuffle)
            </button>
            <button type="button" className="ghost-btn" onClick={handleBackToBuilder}>
              New Quiz
            </button>
          </div>
        </section>
      ) : null}

      {phase === 'quiz' ? (
        <section className="panel scroll-pane question-panel" style={{ flex: 1 }}>
          {error ? <p className="error-text">{error}</p> : null}
          {!isSrsBridgeAvailable ? <p className="meta">SRS updates unavailable in this run. Restart app to re-enable.</p> : null}
          {currentSubElementLabel ? <p className="meta">{currentSubElementLabel}</p> : null}

          {currentQuestion ? (
            <div key={currentQuestion.id} className="question-stage">
              <QuestionCard
                question={currentQuestion}
                currentIndex={index}
                total={questions.length}
                selectedIndex={selectedIndex}
                submitted={submitted}
                saving={saving}
                onSelectAnswer={setSelectedIndex}
              />

              <div className="action-row">
                <button type="button" onClick={handleSubmitAnswer} disabled={selectedIndex === null || submitted || saving}>
                  Submit Answer
                </button>
                <button type="button" onClick={handleNextQuestion} disabled={saving || questions.length === 0}>
                  Next Question
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => onAskAboutQuestion?.(currentQuestion)}
                  disabled={saving}
                >
                  Ask About This Question
                </button>
              </div>

              {submitted ? (
                <>
                  <p className="feedback-text">
                    {selectedIndex === currentQuestion.correctIndex
                      ? 'Correct. Filtered practice is on track.'
                      : `Incorrect. Correct answer: ${String.fromCharCode(65 + currentQuestion.correctIndex)}.`}
                  </p>
                  <div className="action-row">
                    <button type="button" className="ghost-btn" onClick={() => onExplainDifferently?.(currentQuestion)} disabled={saving}>
                      Explain It Differently
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <p>No custom quiz questions available.</p>
          )}
        </section>
      ) : phase === 'builder' ? (
        <section className="panel">
          <p className="meta">Configure your parameters in the Setup tab and start the quiz to begin.</p>
        </section>
      ) : null}
      </div>
      ) : null}
    </main>
  )
}
