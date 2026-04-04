import { useCallback, useEffect, useMemo, useState } from 'react'
import { ipcBridge, type ProgressStats } from '@shared/ipcBridge'
import type { ExamTier, Question } from '@shared/types'
import { QuestionCard } from '../components/QuestionCard'
import { ScreenHeader } from '../components/ScreenHeader'
import { StatPill } from '../components/StatPill'
import { useSRS } from '../hooks/useSRS'

type WeakAreaScreenProps = {
  onBackToModes: () => void
  onAskAboutQuestion?: (question: Question) => void
  onExplainDifferently?: (question: Question) => void
}

type LocalWeakStats = {
  attempted: number
  correct: number
}

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

  // TASK: Run a targeted weak-area drill using DB-ranked weak topics.
// HOW CODE SOLVES: Loads `questions:get-weak-area-pool`, persists answers,
//                  and keeps both local drill metrics and global stats in sync.
export function WeakAreaScreen({ onBackToModes, onAskAboutQuestion, onExplainDifferently }: WeakAreaScreenProps) {
  const [tier, setTier] = useState<ExamTier>('technician')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [questions, setQuestions] = useState<Question[]>([])
  const [index, setIndex] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [startedAt, setStartedAt] = useState<number>(0)
  const [isSrsBridgeAvailable, setIsSrsBridgeAvailable] = useState(true)
  const [localStats, setLocalStats] = useState<LocalWeakStats>({ attempted: 0, correct: 0 })
  const [globalStats, setGlobalStats] = useState<ProgressStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState(() => `weak-area-${Date.now()}`)
  const [poolComplete, setPoolComplete] = useState(false)
  const { recordReview, resetLocalCards } = useSRS()

  const currentQuestion = questions[index] ?? null
  const hasQuestion = Boolean(currentQuestion)

  function formatTierLabel(value: ExamTier): string {
    if (value === 'technician') return 'Technician'
    if (value === 'general') return 'General'
    return 'Extra'
  }

  const weakSubElements = useMemo(() => {
    const set = new Set(questions.map((q) => q.subElement))
    return Array.from(set)
  }, [questions])

  const weakTopicCardTitle = useMemo(() => {
    if (weakSubElements.length <= 1) {
      return 'Targeted Topic'
    }

    return 'Targeted Topics'
  }, [weakSubElements])

  const weakTopicSummary = useMemo(() => {
    if (weakSubElements.length === 0) {
      return 'Loading weak-topic focus...'
    }

    return weakSubElements.join(', ')
  }, [weakSubElements])

  const weakTopicSupportCopy = useMemo(() => {
    if (weakSubElements.length === 0) {
      return 'The drill is analyzing your answer history to choose what needs work most.'
    }

    if (weakSubElements.length === 1) {
      return 'This pass is concentrated on one weak sub-element so you can improve it quickly.'
    }

    return `${weakSubElements.length} weak sub-elements are currently included in this drill.`
  }, [weakSubElements])

  // TASK: Refresh shared aggregate progress for cross-mode consistency.
  // HOW CODE SOLVES: Pulls persisted totals from progress IPC endpoint.
  const refreshGlobalStats = useCallback(async (): Promise<void> => {
    const next = await ipcBridge.getProgressStats()
    setGlobalStats(next)
  }, [])

  // TASK: Load weak-area prioritized pool from backend ranking query.
  // HOW CODE SOLVES: Requests pre-ranked questions from main DB logic and initializes local drill state.
  const loadWeakAreaPool = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    const pool = await ipcBridge.getWeakAreaQuestionPool({
      tier,
      limit: 35,
      recentAnswers: 250,
      weakSubElements: 4,
    })

    // ISSUE: Pool was not shuffled, so questions always appeared in DB rank order.
    // FIX APPLIED: Shuffle before setting state so each drill session has a unique order.
    setQuestions(shuffleArray(pool))
    setIndex(0)
    setSelectedIndex(null)
    setSubmitted(false)
    setStartedAt(Date.now())
    setPoolComplete(false)
    setLoading(false)
  }, [tier])

  // TASK: Persist weak-area answer attempt and update drill metrics.
  // HOW CODE SOLVES: Saves answer via existing progress endpoint, updates local stats,
  //                  refreshes global stats, and keeps current question feedback visible.
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
        setLocalStats((prev) => ({
          attempted: prev.attempted + 1,
          correct: prev.correct + (isCorrect ? 1 : 0),
        }))

        // TASK: Apply SRS updates from weak-area answer outcomes.
        // HOW CODE SOLVES: Routes correctness results through shared SRS hook
        //                  and marks bridge unavailable if persistence fails.
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

        await refreshGlobalStats()
      })
      .catch((err: unknown) => {
        const details = err instanceof Error ? err.message : String(err)
        setError(`Failed to save weak-area answer. ${details}`)
      })
      .finally(() => {
        setSaving(false)
      })
  }

  // TASK: Advance through the shuffled weak-area pool without repeating questions.
  // HOW CODE SOLVES: Increments index linearly; at the end of the pool shows a
  //                  completion indicator — user must use Refresh to start a new pass.
  function handleNextQuestion(): void {
    if (questions.length === 0) return

    if (index + 1 >= questions.length) {
      setPoolComplete(true)
      return
    }

    setIndex(index + 1)
    setSelectedIndex(null)
    setSubmitted(false)
    setStartedAt(Date.now())
  }

  // TASK: Restart local weak-area drill session without deleting history.
  // HOW CODE SOLVES: Clears local counters and rotates session id while preserving persisted data.
  function handleResetDrill(): void {
    setLocalStats({ attempted: 0, correct: 0 })
    resetLocalCards()
    setSessionId(`weak-area-${Date.now()}`)
    setSelectedIndex(null)
    setSubmitted(false)
    setStartedAt(Date.now())
    setPoolComplete(false)
    setIndex(0)
    setQuestions((prev) => shuffleArray(prev))
    setError(null)
  }

  const accuracy = localStats.attempted > 0 ? Number(((localStats.correct / localStats.attempted) * 100).toFixed(2)) : 0

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([loadWeakAreaPool(), refreshGlobalStats()])
      } catch (err: unknown) {
        const details = err instanceof Error ? err.message : String(err)
        if (details.includes('IPC bridge is not available')) {
          setError(details)
        } else {
          setError(`Failed to initialize weak-area drill. ${details}`)
        }
        setLoading(false)
      }
    })()
  }, [loadWeakAreaPool, refreshGlobalStats])

  return (
    <main className="app-shell">
      <ScreenHeader
        title="HamStudy Pro"
        subtitle={`${formatTierLabel(tier)} Weak Areas`}
        actions={
          <button type="button" className="ghost-btn" onClick={onBackToModes}>
            Back to Modes
          </button>
        }
        stats={
          <>
            <StatPill label="Drill Attempted" value={localStats.attempted} />
            <StatPill label="Drill Accuracy" value={`${accuracy}%`} />
            <StatPill label="Global Answers" value={globalStats?.totalAnswers ?? 0} />
            <StatPill label="Global Accuracy" value={`${globalStats?.accuracyPct ?? 0}%`} />
          </>
        }
      />

      <section className="panel mode-config-panel">
        <div className="mode-config-card">
          <span className="mode-config-label">Tier</span>
          <div className="exam-tier-buttons">
            <button type="button" className={`exam-tier-btn ${tier === 'technician' ? 'active' : ''}`} onClick={() => setTier('technician')}>
              Technician
            </button>
            <button type="button" className={`exam-tier-btn ${tier === 'general' ? 'active' : ''}`} onClick={() => setTier('general')}>
              General
            </button>
            <button type="button" className={`exam-tier-btn ${tier === 'extra' ? 'active' : ''}`} onClick={() => setTier('extra')}>
              Extra
            </button>
          </div>
        </div>
        <div className="mode-config-card">
          <span className="mode-config-label">{weakTopicCardTitle}</span>
          <div className="mode-config-copy">
            <p className="meta">Focus: {weakTopicSummary}</p>
            <p className="meta">{weakTopicSupportCopy}</p>
          </div>
        </div>
        <div className="mode-config-card">
          <span className="mode-config-label">Study Tools</span>
          <div className="custom-controls">
            <button type="button" className="ghost-btn" onClick={handleResetDrill} disabled={saving}>
              Reset Drill
            </button>
            <button type="button" className="ghost-btn" onClick={() => void loadWeakAreaPool()} disabled={loading || saving}>
              Refresh Weak Topics
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => currentQuestion && onAskAboutQuestion?.(currentQuestion)}
              disabled={loading || saving || !currentQuestion}
            >
              Ask About This Question
            </button>
          </div>
        </div>
      </section>

      {poolComplete ? (
        <section className="panel">
          <p className="mode-tagline">Drill complete — all {questions.length} questions answered.</p>
          <p className="meta">
            Session score: {localStats.correct} / {localStats.attempted} correct ({accuracy}%)
          </p>
          <div className="action-row">
            <button type="button" className="primary-button" onClick={handleResetDrill}>
              Restart (reshuffle)
            </button>
            <button type="button" className="ghost-btn" onClick={() => void loadWeakAreaPool()} disabled={loading}>
              Refresh Weak Topics
            </button>
          </div>
        </section>
      ) : null}

      <section className="panel question-panel">
        {loading ? <p>Loading weak-area questions...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {!isSrsBridgeAvailable ? <p className="meta">SRS updates unavailable in this run. Restart app to re-enable.</p> : null}

        {!loading && !error && hasQuestion && currentQuestion ? (
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
              <button type="button" className="primary-button" onClick={handleSubmitAnswer} disabled={selectedIndex === null || submitted || saving}>
                Submit Answer
              </button>
              <button type="button" onClick={handleNextQuestion} disabled={saving || questions.length === 0}>
                Next Question
              </button>
            </div>

            {submitted ? (
              <>
                <p className="feedback-text">
                  {selectedIndex === currentQuestion.correctIndex
                    ? 'Correct. You are improving in this weak area.'
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
        ) : null}

        {!loading && !error && !hasQuestion ? <p>No weak-area questions available yet.</p> : null}
      </section>
    </main>
  )
}
