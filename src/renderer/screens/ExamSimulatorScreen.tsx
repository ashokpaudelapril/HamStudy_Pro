import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ipcBridge } from '@shared/ipcBridge'
import type { ExamTier, Question } from '@shared/types'
import { QuestionCard } from '../components/QuestionCard'
import { ScreenHeader } from '../components/ScreenHeader'
import { StatPill } from '../components/StatPill'

type ExamSimulatorScreenProps = {
  onBackToModes: () => void
  onAskAboutQuestion?: (question: Question) => void
  onExplainDifferently?: (question: Question) => void
}

type ExamPhase = 'config' | 'running' | 'finished'

type ExamAnswerRecord = {
  questionId: string
  subElement: string
  isCorrect: boolean
  selectedIndex: number
  correctIndex: number
  timeTakenMs: number
}

type SubElementBreakdown = {
  subElement: string
  total: number
  correct: number
  accuracyPct: number
}

type ReviewTab = 'all' | 'flagged' | 'unanswered'

function getExamConfig(tier: ExamTier): { questionCount: number; durationSeconds: number } {
  if (tier === 'extra') {
    return { questionCount: 50, durationSeconds: 37 * 60 }
  }
  return { questionCount: 35, durationSeconds: 26 * 60 }
}

function formatTierLabel(value: ExamTier): string {
  if (value === 'technician') return 'Technician'
  if (value === 'general') return 'General'
  return 'Extra'
}

function formatCountdown(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds)
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function getTimerClass(remainingSeconds: number, totalSeconds: number): string {
  const ratio = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0
  if (ratio <= 0.15) return 'danger'
  if (ratio <= 0.45) return 'warn'
  return 'safe'
}

function shuffleArray<T>(values: T[]): T[] {
  const clone = [...values]
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = clone[i]
    clone[i] = clone[j]
    clone[j] = temp
  }
  return clone
}

// TASK: Find the next candidate index to jump to from review controls.
// HOW CODE SOLVES: Scans forward from the current index, wraps once to the
//                  beginning, and returns -1 when no candidates exist.
function getNextMatchingIndex(current: number, candidates: number[]): number {
  if (candidates.length === 0) {
    return -1
  }

  const sorted = [...candidates].sort((a, b) => a - b)
  const nextForward = sorted.find((idx) => idx > current)
  if (typeof nextForward === 'number') {
    return nextForward
  }

  return sorted[0] ?? -1
}

// TASK: Keep exam integrity during the timed run while allowing AI help after submission.
// HOW CODE SOLVES: Restricts Tutor Chat actions to the finished review state so
//                  users can study missed questions without weakening the live simulator.
export function ExamSimulatorScreen({
  onBackToModes,
  onAskAboutQuestion,
  onExplainDifferently,
}: ExamSimulatorScreenProps) {
  const finalizingRef = useRef(false)
  const [phase, setPhase] = useState<ExamPhase>('config')
  const [tier, setTier] = useState<ExamTier>('technician')
  const [reviewTab, setReviewTab] = useState<ReviewTab>('all')

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null)
  const [voiceBusy, setVoiceBusy] = useState(false)

  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [questionStartedAt, setQuestionStartedAt] = useState<number>(0)

  const [examStartedAt, setExamStartedAt] = useState<number | null>(null)
  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const [selectedAnswersByQuestionId, setSelectedAnswersByQuestionId] = useState<Record<string, number>>({})
  const [timeTakenMsByQuestionId, setTimeTakenMsByQuestionId] = useState<Record<string, number>>({})
  const [flaggedQuestionIds, setFlaggedQuestionIds] = useState<string[]>([])
  const [sessionId, setSessionId] = useState<string>(() => `exam-${Date.now()}`)

  const examConfig = useMemo(() => getExamConfig(tier), [tier])
  const currentQuestion = questions[currentIndex] ?? null
  const selectedIndex = currentQuestion ? (selectedAnswersByQuestionId[currentQuestion.id] ?? null) : null
  const answerRecordsByQuestionId = useMemo(() => {
    const byId: Record<string, ExamAnswerRecord> = {}

    questions.forEach((question) => {
      const selected = selectedAnswersByQuestionId[question.id]
      if (typeof selected !== 'number') {
        return
      }

      byId[question.id] = {
        questionId: question.id,
        subElement: question.subElement,
        isCorrect: selected === question.correctIndex,
        selectedIndex: selected,
        correctIndex: question.correctIndex,
        timeTakenMs: timeTakenMsByQuestionId[question.id] ?? 0,
      }
    })

    return byId
  }, [questions, selectedAnswersByQuestionId, timeTakenMsByQuestionId])
  const answerRecords = useMemo(() => Object.values(answerRecordsByQuestionId), [answerRecordsByQuestionId])
  const unansweredQuestionIds = useMemo(
    () => questions.filter((question) => !answerRecordsByQuestionId[question.id]).map((question) => question.id),
    [answerRecordsByQuestionId, questions],
  )
  const unansweredCount = unansweredQuestionIds.length
  const flaggedCount = flaggedQuestionIds.length
  const flaggedAnsweredCount = flaggedQuestionIds.filter((id) => Boolean(answerRecordsByQuestionId[id])).length
  const flaggedUnansweredCount = flaggedCount - flaggedAnsweredCount
  const flaggedCorrectCount = flaggedQuestionIds.filter((id) => answerRecordsByQuestionId[id]?.isCorrect).length
  const flaggedIndexes = useMemo(
    () => flaggedQuestionIds.map((id) => questions.findIndex((question) => question.id === id)).filter((idx) => idx >= 0),
    [flaggedQuestionIds, questions],
  )
  const unansweredIndexes = useMemo(
    () => unansweredQuestionIds.map((id) => questions.findIndex((question) => question.id === id)).filter((idx) => idx >= 0),
    [questions, unansweredQuestionIds],
  )

  const reviewQuestionIndexes = useMemo(() => {
    if (reviewTab === 'flagged') {
      return flaggedIndexes
    }
    if (reviewTab === 'unanswered') {
      return unansweredIndexes
    }

    return questions.map((_, idx) => idx)
  }, [flaggedIndexes, questions, reviewTab, unansweredIndexes])

  const answeredCount = answerRecords.length
  const correctCount = answerRecords.filter((record) => record.isCorrect).length
  const scorePct = questions.length > 0 ? Number(((correctCount / questions.length) * 100).toFixed(2)) : 0
  const attemptedPct = questions.length > 0 ? Number(((answeredCount / questions.length) * 100).toFixed(2)) : 0
  const passed = scorePct >= 74

  const breakdown = useMemo<SubElementBreakdown[]>(() => {
    const byQuestionId = new Map(answerRecords.map((record) => [record.questionId, record]))
    const bySubElement = new Map<string, { total: number; correct: number }>()

    questions.forEach((question) => {
      const summary = bySubElement.get(question.subElement) ?? { total: 0, correct: 0 }
      summary.total += 1

      const record = byQuestionId.get(question.id)
      if (record?.isCorrect) {
        summary.correct += 1
      }

      bySubElement.set(question.subElement, summary)
    })

    return Array.from(bySubElement.entries())
      .map(([subElement, item]) => ({
        subElement,
        total: item.total,
        correct: item.correct,
        accuracyPct: item.total > 0 ? Number(((item.correct / item.total) * 100).toFixed(2)) : 0,
      }))
      .sort((a, b) => a.subElement.localeCompare(b.subElement))
  }, [answerRecords, questions])

  const finishExam = useCallback((): void => {
    setPhase('finished')
    setExamStartedAt(null)
    setQuestionStartedAt(0)
  }, [])

  function handleStartExam(): void {
    setLoading(true)
    setError(null)

    void ipcBridge
      .getQuestionPool({ tier })
      .then((pool) => {
        if (pool.length === 0) {
          throw new Error(`No questions found for ${tier} tier.`)
        }

        const shuffled = shuffleArray(pool)
        const selectedQuestions = shuffled.slice(0, examConfig.questionCount)

        if (selectedQuestions.length < examConfig.questionCount) {
          throw new Error('Not enough questions available to start this exam tier.')
        }

        setQuestions(selectedQuestions)
        setCurrentIndex(0)
        setSelectedAnswersByQuestionId({})
        setTimeTakenMsByQuestionId({})
        setFlaggedQuestionIds([])
        setReviewTab('all')

        const startedAt = Date.now()
        setExamStartedAt(startedAt)
        setQuestionStartedAt(startedAt)
        setRemainingSeconds(examConfig.durationSeconds)
        setSessionId(`exam-${startedAt}`)
        setPhase('running')
      })
      .catch((err: unknown) => {
        const details = err instanceof Error ? err.message : String(err)
        setError(`Failed to start exam simulator. ${details}`)
      })
      .finally(() => {
        setLoading(false)
      })
  }

  // TASK: Persist elapsed dwell time for the currently displayed question.
  // HOW CODE SOLVES: Adds the elapsed milliseconds since last question entry
  //                  into a per-question accumulator before navigation/finalize.
  function checkpointCurrentQuestionTime(nowMs: number): void {
    if (!currentQuestion || questionStartedAt <= 0) {
      return
    }

    const elapsedMs = Math.max(0, nowMs - questionStartedAt)
    if (elapsedMs <= 0) {
      return
    }

    setTimeTakenMsByQuestionId((prev) => ({
      ...prev,
      [currentQuestion.id]: (prev[currentQuestion.id] ?? 0) + elapsedMs,
    }))
  }

  // TASK: Move forward to the next exam question without revealing correctness.
  // HOW CODE SOLVES: Saves dwell time for the current question, advances index,
  //                  and preserves the selected answer for each question in local state.
  function handleNextQuestion(): void {
    const nextIndex = currentIndex + 1
    if (nextIndex >= questions.length) {
      return
    }

    const nowMs = Date.now()
    checkpointCurrentQuestionTime(nowMs)
    setCurrentIndex(nextIndex)
    setQuestionStartedAt(nowMs)
  }

  // TASK: Jump directly to a question from the review list while preserving
  //       per-question selected answers.
  // HOW CODE SOLVES: Stores time spent on the current question before changing
  //                  index and keeps selection state in selectedAnswersByQuestionId.
  function jumpToQuestion(nextIndex: number): void {
    const nextQuestion = questions[nextIndex]
    if (!nextQuestion) {
      return
    }

    const nowMs = Date.now()
    checkpointCurrentQuestionTime(nowMs)
    setCurrentIndex(nextIndex)
    setQuestionStartedAt(nowMs)
  }

  // TASK: Flag/unflag questions during the timed exam.
  // HOW CODE SOLVES: Tracks question IDs in exam-local state and toggles the
  //                  currently viewed question on button press.
  function handleToggleFlagCurrentQuestion(): void {
    if (!currentQuestion) {
      return
    }

    setFlaggedQuestionIds((prev) => {
      if (prev.includes(currentQuestion.id)) {
        return prev.filter((id) => id !== currentQuestion.id)
      }

      return [...prev, currentQuestion.id]
    })
  }

  // TASK: Let the user quickly cycle to unanswered or flagged questions before
  //       final submission.
  // HOW CODE SOLVES: Computes the next matching index with wrap-around and
  //                  reuses jumpToQuestion to restore view state.
  function handleJumpToNextReviewTarget(target: 'flagged' | 'unanswered'): void {
    const candidates = target === 'flagged' ? flaggedIndexes : unansweredIndexes
    const nextIndex = getNextMatchingIndex(currentIndex, candidates)
    if (nextIndex >= 0) {
      jumpToQuestion(nextIndex)
    }
  }

  function handleEndExamNow(): void {
    checkpointCurrentQuestionTime(Date.now())
    finishExam()
  }

  // TASK: Guard mode-exit actions so users do not accidentally lose exam context.
  // HOW CODE SOLVES: Adds explicit confirmations for running and finished
  //                  phases before returning to mode selection.
  function handleBackToModes(): void {
    if (phase === 'running') {
      const shouldExit = window.confirm(
        `Exit exam in progress? You have answered ${answeredCount} of ${questions.length} question${questions.length === 1 ? '' : 's'}.`,
      )
      if (!shouldExit) {
        return
      }
    }

    if (phase === 'finished') {
      const shouldExit = window.confirm('Exit Full Exam Simulator and go back to mode selection?')
      if (!shouldExit) {
        return
      }
    }

    onBackToModes()
  }

  function handleStartAnotherExam(): void {
    setPhase('config')
    setQuestions([])
    setCurrentIndex(0)
    setSelectedAnswersByQuestionId({})
    setTimeTakenMsByQuestionId({})
    setFlaggedQuestionIds([])
    setReviewTab('all')
    setExamStartedAt(null)
    setQuestionStartedAt(0)
    setRemainingSeconds(0)
    setError(null)
  }

  const handleFinalizeExamSubmission = useCallback(
    (options?: { skipUnansweredConfirm?: boolean }): void => {
      if (saving || finalizingRef.current) {
        return
      }

      if (!options?.skipUnansweredConfirm && unansweredCount > 0) {
        const shouldSubmit = window.confirm(
          `You still have ${unansweredCount} unanswered question${unansweredCount === 1 ? '' : 's'}. Submit anyway?`,
        )
        if (!shouldSubmit) {
          return
        }
      }

      finalizingRef.current = true

      const nowMs = Date.now()
      const mergedTimeByQuestionId = { ...timeTakenMsByQuestionId }
      if (currentQuestion && questionStartedAt > 0) {
        const elapsedMs = Math.max(0, nowMs - questionStartedAt)
        mergedTimeByQuestionId[currentQuestion.id] = (mergedTimeByQuestionId[currentQuestion.id] ?? 0) + elapsedMs
      }

      setSaving(true)
      setError(null)
      setTimeTakenMsByQuestionId(mergedTimeByQuestionId)

      const payloads = questions
        .map((question) => {
          const selected = selectedAnswersByQuestionId[question.id]
          if (typeof selected !== 'number') {
            return null
          }

          return {
            questionId: question.id,
            selectedIndex: selected,
            isCorrect: selected === question.correctIndex,
            timeTakenMs: mergedTimeByQuestionId[question.id] ?? 0,
            sessionId,
          }
        })
        .filter((value): value is NonNullable<typeof value> => Boolean(value))

      void Promise.all(payloads.map((input) => ipcBridge.saveAnswer(input)))
        .then(() => {
          finishExam()
        })
        .catch((err: unknown) => {
          const details = err instanceof Error ? err.message : String(err)
          setError(`Failed to submit exam answers. ${details}`)
        })
        .finally(() => {
          finalizingRef.current = false
          setSaving(false)
        })
    },
    [currentQuestion, finishExam, questionStartedAt, questions, saving, selectedAnswersByQuestionId, sessionId, timeTakenMsByQuestionId, unansweredCount],
  )

  const handleSpeak = useCallback(() => {
    if (!currentQuestion || voiceBusy) {
      return
    }

    const textToSpeak = [
      `Question ${currentQuestion.id}.`,
      currentQuestion.questionText,
      ...currentQuestion.answers.map((answer, idx) => `Choice ${String.fromCharCode(65 + idx)}. ${answer}.`),
    ].join(' ')

    setVoiceBusy(true)
    setVoiceStatus(null)

    void ipcBridge
      .getSettings()
      .then((userSettings) =>
        ipcBridge.speakText({
          text: textToSpeak,
          voiceId: userSettings.voiceId ?? undefined,
          rate: userSettings.voiceRate,
        }),
      )
      .then((result) => {
        if (result.ok) {
          setVoiceStatus('Read-aloud started.')
        } else {
          setVoiceStatus(`Read-aloud failed: ${result.reason ?? 'unknown'}`)
        }
      })
      .catch((err: unknown) => {
        const details = err instanceof Error ? err.message : String(err)
        setVoiceStatus(`Read-aloud request failed: ${details}`)
      })
      .finally(() => {
        setVoiceBusy(false)
      })
  }, [currentQuestion, voiceBusy])

  useEffect(() => {
    if (phase !== 'running' || !examStartedAt) {
      return
    }

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - examStartedAt) / 1000)
      const nextRemaining = Math.max(0, examConfig.durationSeconds - elapsed)
      setRemainingSeconds(nextRemaining)

      if (nextRemaining <= 0) {
        handleFinalizeExamSubmission({ skipUnansweredConfirm: true })
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [examConfig.durationSeconds, examStartedAt, handleFinalizeExamSubmission, phase])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'r') {
        event.preventDefault()
        handleSpeak()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleSpeak])

  return (
    <main className="app-shell">
      <ScreenHeader
        title="HamStudy Pro"
        subtitle="Full Exam Simulator"
        actions={
          <button
            type="button"
            className="ghost-btn"
            onClick={handleBackToModes}
          >
            Back to Modes
          </button>
        }
        stats={
          <>
            <StatPill label="Tier" value={formatTierLabel(tier)} icon="📚" />
            <StatPill label="Questions" value={examConfig.questionCount} icon="🧾" />
            <StatPill label="Timer" value={formatCountdown(remainingSeconds || examConfig.durationSeconds)} icon="⏱️" />
            <StatPill label="Score" value={phase === 'finished' ? `${scorePct}%` : 'Pending'} icon="🎯" />
          </>
        }
      />

      {phase === 'config' ? (
        <section className="panel mode-config-panel exam-config-panel">
          <div className="mode-config-card">
            <span className="mode-config-label">Overview</span>
            <div className="mode-config-copy">
              <p className="meta">Pick a license tier to start a timed exam simulation.</p>
            </div>
          </div>

          <div className="mode-config-card">
            <span className="mode-config-label">Tier</span>
            <div className="exam-tier-buttons">
              <button
                type="button"
                className={`exam-tier-btn${tier === 'technician' ? ' active' : ''}`}
                onClick={() => setTier('technician')}
                disabled={loading}
              >
                Technician
              </button>
              <button
                type="button"
                className={`exam-tier-btn${tier === 'general' ? ' active' : ''}`}
                onClick={() => setTier('general')}
                disabled={loading}
              >
                General
              </button>
              <button
                type="button"
                className={`exam-tier-btn${tier === 'extra' ? ' active' : ''}`}
                onClick={() => setTier('extra')}
                disabled={loading}
              >
                Extra
              </button>
            </div>
          </div>

          <div className="mode-config-card">
            <span className="mode-config-label">Exam Setup</span>
            <div className="question-session-overview-row">
              <div className="question-session-card">
                <span className="question-session-label">Question Count</span>
                <strong>{examConfig.questionCount}</strong>
                <p>Standard FCC-style practice length for this tier.</p>
              </div>
              <div className="question-session-card">
                <span className="question-session-label">Time Limit</span>
                <strong>{formatCountdown(examConfig.durationSeconds)}</strong>
                <p>Countdown starts as soon as the exam begins.</p>
              </div>
              <div className="question-session-card">
                <span className="question-session-label">Passing Score</span>
                <strong>74%</strong>
                <p>Matches the usual amateur exam passing threshold.</p>
              </div>
              <div className="question-session-card">
                <span className="question-session-label">Scoring</span>
                <strong>Unanswered Missed</strong>
                <p>Any question left blank counts as incorrect.</p>
              </div>
            </div>
          </div>

          <div className="action-row">
            <button type="button" className="primary-button" onClick={handleStartExam} disabled={loading}>
              {loading ? 'Starting...' : 'Start Timed Exam'}
            </button>
          </div>

          {error ? <p className="error-text">{error}</p> : null}
        </section>
      ) : null}

      {phase === 'running' ? (
        <section className="panel question-panel">
          <div className="panel exam-meta-panel">
            <p className="meta">
              {currentQuestion ? `${currentQuestion.subElement} • ${currentQuestion.groupId}` : 'No active question'}
            </p>
            <p className={`speed-timer ${getTimerClass(remainingSeconds, examConfig.durationSeconds)}`}>
              Time Left: {formatCountdown(remainingSeconds)}
            </p>
          </div>

          <div className="question-session-overview">
            <div className="question-session-overview-row">
              <div className="question-session-card">
                <span className="question-session-label">Answered</span>
                <strong>{answeredCount}/{questions.length}</strong>
                <p>Questions with a selected answer so far.</p>
              </div>
              <div className="question-session-card">
                <span className="question-session-label">Flagged</span>
                <strong>{flaggedCount}</strong>
                <p>Questions marked for review before submission.</p>
              </div>
              <div className="question-session-card">
                <span className="question-session-label">Unanswered</span>
                <strong>{unansweredCount}</strong>
                <p>Any unanswered item will count as incorrect.</p>
              </div>
              <div className="question-session-card">
                <span className="question-session-label">Attempted</span>
                <strong>{attemptedPct}%</strong>
                <p>Coverage of the current exam so far.</p>
              </div>
            </div>
          </div>

          <p className="meta">
            Elmer is disabled during the timed exam so this mode stays true to a real FCC-style practice test.
          </p>

          {error ? <p className="error-text">{error}</p> : null}
          {voiceStatus ? <p className="meta">Voice: {voiceStatus}</p> : null}

          {currentQuestion ? (
            <div key={currentQuestion.id} className="question-stage">
              <div className="exam-question-toolbar">
                <p className="meta">Question {currentIndex + 1} of {questions.length}</p>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={handleToggleFlagCurrentQuestion}
                  disabled={saving}
                >
                  {flaggedQuestionIds.includes(currentQuestion.id) ? 'Unflag Question' : 'Flag Question'}
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={handleSpeak}
                  disabled={saving || loading || !currentQuestion || voiceBusy}
                >
                  Read Aloud
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => ipcBridge.stopSpeech()}
                  disabled={saving || !voiceBusy}
                >
                  Stop Voice
                </button>
              </div>

              <QuestionCard
                question={currentQuestion}
                currentIndex={currentIndex}
                total={questions.length}
                selectedIndex={selectedIndex}
                submitted={false}
                saving={saving}
                onSelectAnswer={(index) => {
                  setSelectedAnswersByQuestionId((prev) => ({
                    ...prev,
                    [currentQuestion.id]: index,
                  }))
                }}
              />

              <div className="action-row">
                <button type="button" className="ghost-btn" onClick={() => jumpToQuestion(currentIndex - 1)} disabled={currentIndex <= 0 || saving}>
                  Previous
                </button>

                <button type="button" onClick={handleNextQuestion} disabled={currentIndex + 1 >= questions.length || saving}>
                  Next Question
                </button>

                <button type="button" className="ghost-btn" onClick={handleEndExamNow} disabled={saving}>
                  End Exam Now
                </button>
              </div>

              <div className="panel exam-review-panel">
                <div className="exam-review-header">
                  <p className="meta">Review Queue</p>
                  <div className="action-row">
                    <button
                      type="button"
                      className={`ghost-btn review-tab-btn${reviewTab === 'all' ? ' active' : ''}`}
                      onClick={() => setReviewTab('all')}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className={`ghost-btn review-tab-btn${reviewTab === 'flagged' ? ' active' : ''}`}
                      onClick={() => setReviewTab('flagged')}
                    >
                      Flagged
                    </button>
                    <button
                      type="button"
                      className={`ghost-btn review-tab-btn${reviewTab === 'unanswered' ? ' active' : ''}`}
                      onClick={() => setReviewTab('unanswered')}
                    >
                      Unanswered
                    </button>
                  </div>
                </div>

                <div className="action-row">
                  <button type="button" className="ghost-btn" onClick={() => handleJumpToNextReviewTarget('flagged')} disabled={flaggedCount === 0}>
                    Jump to Next Flagged
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => handleJumpToNextReviewTarget('unanswered')}
                    disabled={unansweredCount === 0}
                  >
                    Jump to Next Unanswered
                  </button>
                </div>

                {reviewQuestionIndexes.length > 0 ? (
                  <div className="exam-review-grid">
                    {reviewQuestionIndexes.map((idx) => {
                      const question = questions[idx]
                      const answerRecord = answerRecordsByQuestionId[question.id]
                      const isFlagged = flaggedQuestionIds.includes(question.id)
                      const isUnanswered = !answerRecord
                      const statusLabel = isUnanswered ? 'Unanswered' : 'Answered'

                      return (
                        <button
                          key={question.id}
                          type="button"
                          className={`review-chip${currentIndex === idx ? ' active' : ''}${isFlagged ? ' flagged' : ''}${isUnanswered ? ' unanswered' : ''}`}
                          onClick={() => jumpToQuestion(idx)}
                        >
                          <span>{idx + 1}</span>
                          <span>{statusLabel}</span>
                          {isFlagged ? <span>Flagged</span> : null}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="meta">No questions in this review filter.</p>
                )}

                <div className="action-row">
                  <button type="button" className="primary-button" onClick={() => handleFinalizeExamSubmission()} disabled={saving}>
                    Finalize Exam Submission
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p>No active exam question.</p>
          )}
        </section>
      ) : null}

      {phase === 'finished' ? (
        <section className="panel exam-scorecard">
          <h2>{passed ? 'Pass' : 'Not Yet Passing'}</h2>
          <p className="meta">
            Final score: {scorePct}% ({correctCount}/{questions.length} correct)
          </p>

          <div className="summary-grid">
            <p>Tier: {tier}</p>
            <p>Answered: {answeredCount}</p>
            <p>Unanswered: {unansweredCount}</p>
            <p>Correct: {correctCount}</p>
            <p>Flagged: {flaggedCount}</p>
            <p>Flagged Correct: {flaggedCorrectCount}</p>
            <p>Flagged Unanswered: {flaggedUnansweredCount}</p>
            <p>Pass Threshold: 74%</p>
          </div>

          <div>
            <p className="meta">Per Sub-Element Baseline Breakdown</p>
            <div className="exam-breakdown-grid">
              {breakdown.map((item) => (
                <p key={item.subElement}>
                  {item.subElement}: {item.correct}/{item.total} ({item.accuracyPct}%)
                </p>
              ))}
            </div>
          </div>

          <div className="panel exam-review-panel">
            <div className="exam-review-header">
              <div>
                <p className="meta">Post-Exam Review</p>
                <p className="meta">
                  Review completed questions here. Elmer is available now because the timed simulation has already ended.
                </p>
              </div>
              <div className="action-row">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => currentQuestion && onAskAboutQuestion?.(currentQuestion)}
                  disabled={!currentQuestion}
                >
                  Ask About This Question
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => currentQuestion && onExplainDifferently?.(currentQuestion)}
                  disabled={!currentQuestion}
                >
                  Explain It Differently
                </button>
              </div>
            </div>

            {currentQuestion ? (
              <div key={currentQuestion.id} className="question-stage">
                <QuestionCard
                  question={currentQuestion}
                  currentIndex={currentIndex}
                  total={questions.length}
                  selectedIndex={selectedAnswersByQuestionId[currentQuestion.id] ?? null}
                  submitted={true}
                  saving={false}
                  onSelectAnswer={() => {}}
                />

                <p className="feedback-text">
                  {answerRecordsByQuestionId[currentQuestion.id]?.isCorrect
                    ? 'You answered this question correctly on the exam.'
                    : `You missed this question on the exam. Correct answer: ${String.fromCharCode(65 + currentQuestion.correctIndex)}.`}
                </p>

                <div className="action-row">
                  <button type="button" className="ghost-btn" onClick={() => jumpToQuestion(Math.max(0, currentIndex - 1))} disabled={currentIndex <= 0}>
                    Previous Review Question
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => jumpToQuestion(Math.min(questions.length - 1, currentIndex + 1))}
                    disabled={currentIndex >= questions.length - 1}
                  >
                    Next Review Question
                  </button>
                </div>
              </div>
            ) : (
              <p className="meta">No completed exam question selected for review.</p>
            )}

            <div className="exam-review-grid">
              {questions.map((question, idx) => {
                const answerRecord = answerRecordsByQuestionId[question.id]
                const isFlagged = flaggedQuestionIds.includes(question.id)
                const isUnanswered = !answerRecord
                const statusLabel = isUnanswered ? 'Unanswered' : answerRecord.isCorrect ? 'Correct' : 'Missed'

                return (
                  <button
                    key={question.id}
                    type="button"
                    className={`review-chip${currentIndex === idx ? ' active' : ''}${isFlagged ? ' flagged' : ''}${isUnanswered ? ' unanswered' : ''}`}
                    onClick={() => setCurrentIndex(idx)}
                  >
                    <span>{idx + 1}</span>
                    <span>{statusLabel}</span>
                    {isFlagged ? <span>Flagged</span> : null}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="action-row">
            <button type="button" className="primary-button" onClick={handleStartAnotherExam}>
              Start Another Exam
            </button>
            <button type="button" className="ghost-btn" onClick={handleBackToModes}>
              Back to Modes
            </button>
          </div>
        </section>
      ) : null}
    </main>
  )
}
