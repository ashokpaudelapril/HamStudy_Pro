import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { ipcBridge, type ProgressStats } from '@shared/ipcBridge'
import type { ExamTier, Question } from '@shared/types'
import { AnswerButton } from '../components/AnswerButton'
import { ScreenHeader } from '../components/ScreenHeader'
import { StatPill } from '../components/StatPill'
import { useSRS } from '../hooks/useSRS'

type SpeedRoundScreenProps = {
  onBackToModes: () => void
  onAskAboutQuestion?: (question: Question) => void
  onExplainDifferently?: (question: Question) => void
}

type RoundStats = {
  attempted: number
  correct: number
  timedOut: number
  totalTimeMs: number
}

const SECONDS_PER_QUESTION = 15

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

// TASK: Run a timed question sprint with auto-advance and persisted answers.
// HOW CODE SOLVES: Loads technician questions, starts a per-question countdown,
//                  auto-submits on timeout, and stores every attempt in progress history.
export function SpeedRoundScreen({
  onBackToModes,
  onAskAboutQuestion,
  onExplainDifferently,
}: SpeedRoundScreenProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tier, setTier] = useState<ExamTier>('technician')
  const [searchText, setSearchText] = useState('')
  const [questionIds, setQuestionIds] = useState<string[]>([])
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(SECONDS_PER_QUESTION)
  const [questionStartedAt, setQuestionStartedAt] = useState<number>(0)
  const [isSrsBridgeAvailable, setIsSrsBridgeAvailable] = useState(true)
  const [globalStats, setGlobalStats] = useState<ProgressStats | null>(null)
  const [roundStats, setRoundStats] = useState<RoundStats>({ attempted: 0, correct: 0, timedOut: 0, totalTimeMs: 0 })
  const [error, setError] = useState<string | null>(null)
  const [lastResolvedQuestion, setLastResolvedQuestion] = useState<Question | null>(null)
  const [lastResolvedSelectedIndex, setLastResolvedSelectedIndex] = useState<number | null>(null)
  const [lastResolvedTimedOut, setLastResolvedTimedOut] = useState(false)
  const [sessionId] = useState(() => `speed-${Date.now()}`)
  const [roundComplete, setRoundComplete] = useState(false)
  const { recordReview } = useSRS()

  const hasQuestion = Boolean(currentQuestion)

  function formatTierLabel(value: ExamTier): string {
    if (value === 'technician') return 'Technician'
    if (value === 'general') return 'General'
    return 'Extra'
  }

  // TASK: Reload aggregate app progress stats after each speed attempt.
  // HOW CODE SOLVES: Uses the shared progress IPC endpoint consumed by other modes.
  const refreshGlobalStats = useCallback(async (): Promise<void> => {
    const nextStats = await ipcBridge.getProgressStats()
    setGlobalStats(nextStats)
  }, [])

  // TASK: Load one question and reset timer/selection state for a new speed turn.
  // HOW CODE SOLVES: Uses get-by-id IPC and restarts countdown at `SECONDS_PER_QUESTION`.
  const loadQuestionById = useCallback(async (questionId: string): Promise<void> => {
    const question = await ipcBridge.getQuestionById(questionId)
    if (!question) {
      throw new Error(`Question not found for id ${questionId}.`)
    }

    setCurrentQuestion(question)
    setSelectedIndex(null)
    setSecondsLeft(SECONDS_PER_QUESTION)
    setQuestionStartedAt(Date.now())
  }, [])

  // TASK: Search the technician pool and begin round from first result.
  // HOW CODE SOLVES: Captures ordered result IDs and loads the initial question record.
  const runSearch = useCallback(async (query: string, activeTier: ExamTier = tier): Promise<void> => {
    setLoading(true)
    const rows = await ipcBridge.searchQuestions({ query, tier: activeTier, limit: 50 })

    // ISSUE: IDs were set in DB order, so the same question always appeared first.
    // FIX APPLIED: Shuffle IDs before storing so each round has a unique question order.
    const ids = shuffleArray(rows.map((row) => row.id))
    setQuestionIds(ids)
    setCurrentIndex(0)
    setRoundComplete(false)

    if (ids.length === 0) {
      setCurrentQuestion(null)
      setLoading(false)
      return
    }

    await loadQuestionById(ids[0])
    setLoading(false)
  }, [loadQuestionById, tier])

  // TASK: Advance to the next speed-round question without repeating.
  // HOW CODE SOLVES: Increments index linearly through the shuffled ID list; when
  //                  the last question is reached, sets roundComplete instead of wrapping.
  const moveToNextQuestion = useCallback((): void => {
    if (questionIds.length === 0) return

    if (currentIndex + 1 >= questionIds.length) {
      setCurrentQuestion(null)
      setRoundComplete(true)
      return
    }

    const nextIndex = currentIndex + 1
    const nextId = questionIds[nextIndex]

    setLoading(true)
    void loadQuestionById(nextId)
      .then(() => {
        setCurrentIndex(nextIndex)
      })
      .catch((err: unknown) => {
        const details = err instanceof Error ? err.message : String(err)
        setError(`Failed to load next speed question. ${details}`)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [currentIndex, loadQuestionById, questionIds])

  // TASK: Persist one speed-round answer and update round/global metrics.
  // HOW CODE SOLVES: Saves through `progress:save-answer`, updates local stats,
  //                  then advances to next question when write completes.
  const submitSpeedAnswer = useCallback(
    (selected: number, timedOut: boolean): void => {
      if (!currentQuestion || saving) return

      const elapsedMs = Math.max(0, Date.now() - questionStartedAt)
      const isCorrect = selected === currentQuestion.correctIndex

      setSaving(true)
      void ipcBridge
        .saveAnswer({
          questionId: currentQuestion.id,
          selectedIndex: selected,
          isCorrect,
          timeTakenMs: elapsedMs,
          sessionId,
        })
      .then(async () => {
          setLastResolvedQuestion(currentQuestion)
          setLastResolvedSelectedIndex(selected)
          setLastResolvedTimedOut(timedOut)
          setRoundStats((prev) => ({
            attempted: prev.attempted + 1,
            correct: prev.correct + (isCorrect ? 1 : 0),
            timedOut: prev.timedOut + (timedOut ? 1 : 0),
            totalTimeMs: prev.totalTimeMs + elapsedMs,
          }))

          // TASK: Update SRS schedule from speed-round outcomes using shared hook.
          // HOW CODE SOLVES: Records correctness into centralized SRS logic and
          //                  gracefully disables remote persistence on failures.
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
          moveToNextQuestion()
        })
        .catch((err: unknown) => {
          const details = err instanceof Error ? err.message : String(err)
          setError(`Failed to save speed-round answer. ${details}`)
        })
        .finally(() => {
          setSaving(false)
        })
    },
    [currentQuestion, isSrsBridgeAvailable, moveToNextQuestion, questionStartedAt, recordReview, refreshGlobalStats, saving, sessionId],
  )

  // TASK: Auto-decrement countdown and trigger timeout submit at zero.
  // HOW CODE SOLVES: Uses a 1-second interval while a question is active.
  useEffect(() => {
    if (!currentQuestion || loading || saving) return

    if (secondsLeft <= 0) {
      const fallbackWrong = (currentQuestion.correctIndex + 1) % 4
      const timeoutSubmit = setTimeout(() => {
        submitSpeedAnswer(fallbackWrong, true)
      }, 0)

      return () => {
        clearTimeout(timeoutSubmit)
      }
    }

    const timer = setTimeout(() => {
      setSecondsLeft((prev) => prev - 1)
    }, 1000)

    return () => {
      clearTimeout(timer)
    }
  }, [currentQuestion, loading, saving, secondsLeft, submitSpeedAnswer])

  // TASK: Bootstrap speed round with initial search and global progress snapshot.
  // HOW CODE SOLVES: Loads first question set and aggregate stats in parallel.
  const handleMount = useCallback((): void => {
    void (async () => {
      try {
        await Promise.all([runSearch(''), refreshGlobalStats()])
        setError(null)
      } catch (err: unknown) {
        const details = err instanceof Error ? err.message : String(err)
        setError(`Failed to initialize speed round. ${details}`)
        setLoading(false)
      }
    })()
  }, [refreshGlobalStats, runSearch])

  // TASK: Submit speed-round search form input.
  // HOW CODE SOLVES: Prevents form navigation and reuses IPC-backed search pipeline.
  function handleSearchSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void runSearch(searchText.trim()).catch((err: unknown) => {
      const details = err instanceof Error ? err.message : String(err)
      setError(`Failed to search speed questions. ${details}`)
      setLoading(false)
    })
  }

  useEffect(() => {
    handleMount()
  }, [handleMount])

  function handleTierChange(nextTier: ExamTier): void {
    setTier(nextTier)
    void runSearch(searchText.trim(), nextTier).catch((err: unknown) => {
      const details = err instanceof Error ? err.message : String(err)
      setError(`Failed to load ${formatTierLabel(nextTier)} speed questions. ${details}`)
      setLoading(false)
    })
  }

  const roundAccuracy = roundStats.attempted > 0 ? Number(((roundStats.correct / roundStats.attempted) * 100).toFixed(2)) : 0
  const avgSeconds = roundStats.attempted > 0 ? Number((roundStats.totalTimeMs / roundStats.attempted / 1000).toFixed(2)) : 0
  const timerTone = secondsLeft <= 4 ? 'danger' : secondsLeft <= 8 ? 'warn' : 'safe'

  return (
    <main className="app-shell">
      <ScreenHeader
        title="HamStudy Pro"
        subtitle={`${formatTierLabel(tier)} Speed Round`}
        actions={
          <button type="button" className="ghost-btn" onClick={onBackToModes}>
            Back to Modes
          </button>
        }
        stats={
          <>
            <StatPill label="Round Attempts" value={roundStats.attempted} />
            <StatPill label="Round Accuracy" value={`${roundAccuracy}%`} />
            <StatPill label="Timeouts" value={roundStats.timedOut} />
            <StatPill label="Avg Sec/Answer" value={avgSeconds} />
          </>
        }
      />

      <section className="panel mode-config-panel">
        <div className="mode-config-card">
          <span className="mode-config-label">Tier</span>
          <div className="exam-tier-buttons">
            <button type="button" className={`exam-tier-btn ${tier === 'technician' ? 'active' : ''}`} onClick={() => handleTierChange('technician')}>
              Technician
            </button>
            <button type="button" className={`exam-tier-btn ${tier === 'general' ? 'active' : ''}`} onClick={() => handleTierChange('general')}>
              General
            </button>
            <button type="button" className={`exam-tier-btn ${tier === 'extra' ? 'active' : ''}`} onClick={() => handleTierChange('extra')}>
              Extra
            </button>
          </div>
        </div>

        <form className="mode-search-form" onSubmit={handleSearchSubmit}>
          <span className="mode-config-label">Search</span>
          <div className="mode-search-row">
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search speed-round questions by question, ID, reference, or topic"
            />
            <button type="submit" disabled={loading || saving}>
              Search
            </button>
          </div>
        </form>

        <div className="stats-grid speed-global-stats">
          <StatPill label="All-time answers" value={globalStats?.totalAnswers ?? 0} />
          <StatPill label="All-time correct" value={globalStats?.correctAnswers ?? 0} />
          <StatPill label="All-time accuracy" value={`${globalStats?.accuracyPct ?? 0}%`} />
        </div>

        {lastResolvedQuestion ? (
          <div className="action-row">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => onAskAboutQuestion?.(lastResolvedQuestion)}
              disabled={saving}
            >
              Ask About This Question
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => onExplainDifferently?.(lastResolvedQuestion)}
              disabled={saving}
            >
              Explain Last Question Differently
            </button>
          </div>
        ) : null}
      </section>

      <section className="panel question-panel">
        {loading ? <p>Loading speed round...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {!isSrsBridgeAvailable ? <p className="meta">SRS updates unavailable in this run. Restart app to re-enable.</p> : null}

        {!loading && !error && hasQuestion && currentQuestion ? (
          <div key={currentQuestion.id} className="question-stage">
            <p className="meta">
              {currentQuestion.id} • Question {currentIndex + 1} of {questionIds.length}
            </p>
            <div className={`speed-timer ${timerTone}`} role="status" aria-live="polite">
              {secondsLeft}s remaining
            </div>
            <h2>{currentQuestion.questionText}</h2>
            <p className="meta">Reference: {currentQuestion.refs}</p>

            <div className="answers-grid">
              {currentQuestion.answers.map((answer, idx) => (
                <AnswerButton
                  key={`${idx}-${answer}`}
                  answer={answer}
                  index={idx}
                  selected={selectedIndex === idx}
                  showCorrect={false}
                  showWrong={false}
                  disabled={saving}
                  onSelect={() => {
                    setSelectedIndex(idx)
                    submitSpeedAnswer(idx, false)
                  }}
                />
              ))}
            </div>
          </div>
        ) : null}

        {lastResolvedQuestion ? (
          <div className="panel">
            <p className="meta">
              Last resolved question: {lastResolvedQuestion.id}
              {lastResolvedTimedOut ? ' • Timed out' : ''}
            </p>
            <p className="meta">
              {lastResolvedSelectedIndex === lastResolvedQuestion.correctIndex
                ? 'You answered the last speed-round question correctly.'
                : `You missed the last speed-round question. Correct answer: ${String.fromCharCode(
                    65 + lastResolvedQuestion.correctIndex,
                  )}.`}
            </p>
          </div>
        ) : null}

        {!loading && !error && roundComplete ? (
          <div className="panel">
            <p className="mode-tagline">Round complete — all {questionIds.length} questions answered.</p>
            <p className="meta">
              Score: {roundStats.correct} / {roundStats.attempted} correct · {roundStats.timedOut} timed out · avg {avgSeconds}s
            </p>
            <div className="action-row">
              <button
                type="button"
                className="primary-button"
                onClick={() => void runSearch(searchText.trim(), tier)}
                disabled={loading}
              >
                Play Again (reshuffle)
              </button>
            </div>
          </div>
        ) : null}

        {!loading && !error && !hasQuestion && !roundComplete ? <p>No speed-round questions found for this search.</p> : null}
      </section>
    </main>
  )
}
