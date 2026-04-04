import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { SHORTCUTS } from '@shared/constants'
import { ipcBridge, type ProgressStats } from '@shared/ipcBridge'
import type { ExamTier, Question } from '@shared/types'
import { KeyboardShortcutsOverlay } from '../components/KeyboardShortcutsOverlay'
import { ExplanationPanel } from '../components/ExplanationPanel'
import { HintPanel } from '../components/HintPanel'
import { QuestionCard } from '../components/QuestionCard'
import { ScreenHeader } from '../components/ScreenHeader'
import { useSRS } from '../hooks/useSRS'
import { StatPill } from '../components/StatPill'

type QuestionScreenProps = {
  onBackToModes?: () => void
  onAskAboutQuestion?: (question: Question) => void
  onExplainDifferently?: (question: Question) => void
}

type SessionSummary = {
  attempted: number
  correct: number
  totalTimeMs: number
}

// TASK: Host the minimal DB-backed study flow for technician questions.
// HOW CODE SOLVES: Coordinates question search/detail reads, answer persistence,
//                  progress stats, and settings save/load through IPC bridge APIs.
export function QuestionScreen({ onBackToModes, onAskAboutQuestion, onExplainDifferently }: QuestionScreenProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tier, setTier] = useState<ExamTier>('technician')
  const [searchText, setSearchText] = useState('')
  const [appliedSearchText, setAppliedSearchText] = useState('')
  const [questionIds, setQuestionIds] = useState<string[]>([])
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [stats, setStats] = useState<ProgressStats | null>(null)
  const [dueTodayCount, setDueTodayCount] = useState<number>(0)
  const [isDueQueueMode, setIsDueQueueMode] = useState(false)
  const [isSrsBridgeAvailable, setIsSrsBridgeAvailable] = useState(true)
  const [questionStartedAt, setQuestionStartedAt] = useState<number>(0)
  const [sessionSummary, setSessionSummary] = useState<SessionSummary>({ attempted: 0, correct: 0, totalTimeMs: 0 })
  const [error, setError] = useState<string | null>(null)
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [authoringStatus, setAuthoringStatus] = useState<string | null>(null)
  const [reloadingAuthoredContent, setReloadingAuthoredContent] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [sessionId, setSessionId] = useState(() => `session-${Date.now()}`)
  const [hasAiProvider, setHasAiProvider] = useState(false)
  const { recordReview, resetLocalCards } = useSRS()

  const hasQuestion = Boolean(currentQuestion)
  const queueProgressPct = questionIds.length > 0 ? Math.round(((currentIndex + 1) / questionIds.length) * 100) : 0

  function formatTierLabel(value: ExamTier): string {
    if (value === 'technician') return 'Technician'
    if (value === 'general') return 'General'
    return 'Extra'
  }

  function getRandomStartIndex(length: number): number {
    if (length <= 1) {
      return 0
    }

    return Math.floor(Math.random() * length)
  }

  function shuffleQuestionIds(ids: string[]): string[] {
    const output = [...ids]

    for (let i = output.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[output[i], output[j]] = [output[j], output[i]]
    }

    return output
  }

  // TASK: Load aggregate progress stats for top-of-screen metrics.
  // HOW CODE SOLVES: Reads persisted answer aggregates through the progress IPC endpoint.
  const refreshStats = useCallback(async (): Promise<void> => {
    const nextStats = await ipcBridge.getProgressStats()
    setStats(nextStats)
  }, [])

  // TASK: Load count of currently due SRS cards for technician tier.
  // HOW CODE SOLVES: Uses due-queue endpoint and derives count from returned rows.
  const refreshDueTodayCount = useCallback(async (activeTier: ExamTier = tier): Promise<void> => {
    try {
      const dueRows = await ipcBridge.getDueSrsQueue({ tier: activeTier, limit: 300 })
      setDueTodayCount(dueRows.length)
      setIsSrsBridgeAvailable(true)
    } catch {
      setDueTodayCount(0)
      setIsSrsBridgeAvailable(false)
    }
  }, [tier])

  // TASK: Load one question by id and reset per-question interaction state.
  // HOW CODE SOLVES: Uses `questions:get-by-id`, then clears selected/submitted state.
  const loadQuestionById = useCallback(async (questionId: string): Promise<void> => {
    const question = await ipcBridge.getQuestionById(questionId)
    if (!question) {
      throw new Error(`Question not found for id ${questionId}.`)
    }

    setCurrentQuestion(question)
    setSelectedIndex(null)
    setSubmitted(false)
    setQuestionStartedAt(Date.now())
  }, [])

  // TASK: Execute question search and start from first result.
  // HOW CODE SOLVES: Stores ordered result IDs and loads details for initial question.
  const runSearch = useCallback(async (query: string, activeTier: ExamTier = tier): Promise<void> => {
    setLoading(true)
    setIsDueQueueMode(false)
    setAppliedSearchText(query)
    const rows = await ipcBridge.searchQuestions({
      query,
      tier: activeTier,
      limit: 50,
    })

    const ids = rows.map((q) => q.id)
    const shouldRandomizeOrder = query.length === 0
    const orderedIds = shouldRandomizeOrder ? shuffleQuestionIds(ids) : ids
    setQuestionIds(orderedIds)

    if (orderedIds.length === 0) {
      setCurrentIndex(0)
      setCurrentQuestion(null)
      setLoading(false)
      return
    }

    // Start each quiz pool at a random position when not searching by text,
    // so users do not repeatedly see the same opening question.
    const startIndex = shouldRandomizeOrder ? getRandomStartIndex(orderedIds.length) : 0
    setCurrentIndex(startIndex)
    await loadQuestionById(orderedIds[startIndex])
    setLoading(false)
  }, [loadQuestionById, tier])

  // TASK: Start a due-today SRS session for technician tier.
  // HOW CODE SOLVES: Pulls due IDs, swaps active pool, and opens first due card.
  const runDueQueue = useCallback(async (): Promise<void> => {
    if (!isSrsBridgeAvailable) {
      setError('Due queue is temporarily unavailable. Restart the app to load the latest preload bridge.')
      return
    }

    setLoading(true)
    const dueRows = await ipcBridge.getDueSrsQueue({ tier, limit: 100 })
    setDueTodayCount(dueRows.length)

    const ids = dueRows.map((q) => q.id)
    setQuestionIds(ids)
    setCurrentIndex(0)
    setIsDueQueueMode(true)

    if (ids.length === 0) {
      setCurrentQuestion(null)
      setLoading(false)
      return
    }

    await loadQuestionById(ids[0])
    setLoading(false)
  }, [isSrsBridgeAvailable, loadQuestionById, tier])

  // TASK: Bootstrap settings, first search, and progress stats on mount.
  // HOW CODE SOLVES: Loads initial question pool and progress metrics on mount.
  const handleMount = useCallback((): void => {
    void (async () => {
      try {
        const [,,, settings] = await Promise.all([runSearch(''), refreshStats(), refreshDueTodayCount(), ipcBridge.getSettings()] as const)
        setHasAiProvider(Boolean(settings?.aiProvider))
        setError(null)
      } catch (err: unknown) {
        const details = err instanceof Error ? err.message : String(err)
        setError(`Failed to initialize app data. ${details}`)
        setLoading(false)
      }
    })()
  }, [refreshDueTodayCount, refreshStats, runSearch])

  // TASK: Persist submitted answer and refresh progress metrics.
  // HOW CODE SOLVES: Computes correctness/time, writes answer record, then reloads stats.
  const handleSubmitAnswer = useCallback((): void => {
    if (!currentQuestion || selectedIndex === null) return

    const elapsedMs = Math.max(0, Date.now() - questionStartedAt)
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
          totalTimeMs: prev.totalTimeMs + elapsedMs,
        }))

        // TASK: Apply SRS update through shared hook for deterministic SM-2 handling.
        // HOW CODE SOLVES: Computes local next card state and attempts remote
        //                  persistence; if persistence fails, due-queue mode is disabled.
        const srsResult = await recordReview(
          {
            questionId: currentQuestion.id,
            isCorrect,
          },
          { persistRemotely: isSrsBridgeAvailable },
        )

        if (!srsResult.persisted && srsResult.reason === 'persist-failed') {
          setIsSrsBridgeAvailable(false)
          setDueTodayCount(0)
        }

        await Promise.all([refreshStats(), refreshDueTodayCount()])
      })
      .catch((err: unknown) => {
        const details = err instanceof Error ? err.message : String(err)
        setError(`Failed to save answer. ${details}`)
      })
      .finally(() => {
        setSaving(false)
      })
  }, [currentQuestion, isSrsBridgeAvailable, questionStartedAt, recordReview, refreshDueTodayCount, refreshStats, selectedIndex, sessionId])

  // TASK: Reset local quiz session counters while preserving persisted history.
  // HOW CODE SOLVES: Clears in-memory summary stats/selection state and rotates
  //                  the local session id used for subsequent answer events.
  function handleResetSession(): void {
    setSessionSummary({ attempted: 0, correct: 0, totalTimeMs: 0 })
    resetLocalCards()
    setSelectedIndex(null)
    setSubmitted(false)
    setSessionId(`session-${Date.now()}`)
    setQuestionStartedAt(Date.now())
    setError(null)
    void Promise.all([refreshStats(), refreshDueTodayCount()])
  }

  // TASK: Re-apply local JSON-authored hint content without restarting the app.
  // HOW CODE SOLVES: Invokes main-process reseed logic, then reloads the active question
  //                  so the renderer immediately reflects updated hint/explanation fields.
  const handleReloadAuthoredContent = useCallback((): void => {
    setReloadingAuthoredContent(true)
    setAuthoringStatus(null)
    setError(null)

    void ipcBridge
      .reloadAuthoredContent()
      .then(async () => {
        if (currentQuestion) {
          await loadQuestionById(currentQuestion.id)
        }
        setAuthoringStatus('Authored hint pack reloaded from local JSON. The current card has been refreshed.')
      })
      .catch((err: unknown) => {
        const details = err instanceof Error ? err.message : String(err)
        setError(`Failed to reload authored content. ${details}`)
      })
      .finally(() => {
        setReloadingAuthoredContent(false)
      })
  }, [currentQuestion, loadQuestionById])

  // TASK: Move to the next question in the current result set.
  // HOW CODE SOLVES: Uses wrap-around index math and `get-by-id` detail loading.
  const handleNextQuestion = useCallback((): void => {
    if (questionIds.length === 0) return
    const nextIndex = (currentIndex + 1) % questionIds.length
    const nextId = questionIds[nextIndex]

    setLoading(true)
    void loadQuestionById(nextId)
      .then(() => {
        setCurrentIndex(nextIndex)
      })
      .catch((err: unknown) => {
        const details = err instanceof Error ? err.message : String(err)
        setError(`Failed to load next question. ${details}`)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [currentIndex, loadQuestionById, questionIds])

  // TASK: Enter due-queue mode from control bar.
  // HOW CODE SOLVES: Starts due queue fetch and shows initialization errors.
  function handleStartDueQueue(): void {
    void runDueQueue().catch((err: unknown) => {
      const details = err instanceof Error ? err.message : String(err)
      setError(`Failed to load due queue. ${details}`)
      setLoading(false)
    })
  }

  // TASK: Leave due-queue mode and return to current search result pool.
  // HOW CODE SOLVES: Re-runs search using current search input to restore pool.
  function handleExitDueQueue(): void {
    void runSearch(searchText.trim()).catch((err: unknown) => {
      const details = err instanceof Error ? err.message : String(err)
      setError(`Failed to resume search pool. ${details}`)
      setLoading(false)
    })
  }

  // TASK: Trigger technician search from user input.
  // HOW CODE SOLVES: Prevents form navigation, runs search, and handles errors.
  function handleSearchSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void runSearch(searchText.trim()).catch((err: unknown) => {
      const details = err instanceof Error ? err.message : String(err)
      setError(`Failed to search questions. ${details}`)
      setLoading(false)
    })
  }

  // TASK: Trigger voice read-aloud shell for the current question and choices.
  // HOW CODE SOLVES: Builds a compact speech text payload and sends it through
  //                  compatibility-safe IPC bridge methods with user feedback.
  const handleSpeakQuestion = useCallback((): void => {
    if (!currentQuestion || voiceBusy) {
      return
    }

    const speechText = [
      `Question ${currentQuestion.id}.`,
      currentQuestion.questionText,
      ...currentQuestion.answers.map((answer, idx) => `Choice ${String.fromCharCode(65 + idx)}. ${answer}.`),
    ].join(' ')

    setVoiceBusy(true)
    setVoiceStatus(null)

    // TASK: Apply persisted voice settings when starting read-aloud playback.
    // HOW CODE SOLVES: Reads user settings on demand and forwards voice/rate
    //                  preferences with the speech payload.
    void ipcBridge
      .getSettings()
      .then((userSettings) =>
        ipcBridge.speakText({
          text: speechText,
          voiceId: userSettings.voiceId ?? undefined,
          rate: userSettings.voiceRate,
        }),
      )
      .then((result) => {
        if (result.ok) {
          setVoiceStatus('Read-aloud started.')
          return
        }

        if (result.reason === 'invalid-input') {
          setVoiceStatus('Read-aloud unavailable: no text to speak.')
          return
        }

        setVoiceStatus('Read-aloud shell is connected, but native speech is not wired in this build yet.')
      })
      .catch((err: unknown) => {
        const details = err instanceof Error ? err.message : String(err)
        setVoiceStatus(`Read-aloud request failed: ${details}`)
      })
      .finally(() => {
        setVoiceBusy(false)
      })
  }, [currentQuestion, voiceBusy])

  // TASK: Stop active voice read-aloud shell playback.
  // HOW CODE SOLVES: Calls stop endpoint and surfaces compatibility-safe feedback.
  function handleStopSpeaking(): void {
    if (voiceBusy) {
      return
    }

    setVoiceBusy(true)
    setVoiceStatus(null)

    void ipcBridge
      .stopSpeech()
      .then((result) => {
        if (result.ok) {
          setVoiceStatus('Read-aloud stopped.')
          return
        }

        if (result.reason === 'no-active-session') {
          setVoiceStatus('No active read-aloud session.')
          return
        }

        setVoiceStatus('Unable to stop read-aloud in this runtime.')
      })
      .catch((err: unknown) => {
        const details = err instanceof Error ? err.message : String(err)
        setVoiceStatus(`Stop request failed: ${details}`)
      })
      .finally(() => {
        setVoiceBusy(false)
      })
  }

  useEffect(() => {
    handleMount()
  }, [handleMount])

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) {
        return false
      }

      const tagName = target.tagName.toLowerCase()
      return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable
    }

    function handleKeyDown(event: KeyboardEvent): void {
      const key = event.key.toLowerCase()

      if (key === '?' || (event.shiftKey && key === '/')) {
        event.preventDefault()
        setShowShortcuts((prev) => !prev)
        return
      }

      if (showShortcuts) {
        if (key === 'escape') {
          setShowShortcuts(false)
        }
        return
      }

      if (isEditableTarget(event.target)) {
        return
      }

      if (key === 'escape') {
        onBackToModes?.()
        return
      }

      // TASK: Support keyboard-first read-aloud playback with Cmd/Ctrl + R.
      // HOW CODE SOLVES: Intercepts platform shortcut outside editable fields
      //                  and routes it through the same speech handler as UI controls.
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && key === 'r') {
        if (currentQuestion && !loading && !saving) {
          event.preventDefault()
          handleSpeakQuestion()
        }
        return
      }

      if (!currentQuestion || loading || saving) {
        return
      }

      if (!submitted) {
        if (key === 'a') setSelectedIndex(0)
        else if (key === 'b') setSelectedIndex(1)
        else if (key === 'c') setSelectedIndex(2)
        else if (key === 'd') setSelectedIndex(3)
        else if (key === 'enter' && selectedIndex !== null) {
          event.preventDefault()
          handleSubmitAnswer()
        }
      }

      if (key === 'n') {
        handleNextQuestion()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [currentQuestion, handleNextQuestion, handleSpeakQuestion, handleSubmitAnswer, loading, onBackToModes, saving, selectedIndex, showShortcuts, submitted])

  function handleTierChange(nextTier: ExamTier): void {
    setTier(nextTier)
    void Promise.all([runSearch(searchText.trim(), nextTier), refreshDueTodayCount(nextTier)])
      .then(() => {
        setError(null)
      })
      .catch((err: unknown) => {
        const details = err instanceof Error ? err.message : String(err)
        setError(`Failed to load ${formatTierLabel(nextTier)} questions. ${details}`)
        setLoading(false)
      })
  }

  const sessionAccuracy = sessionSummary.attempted > 0 ? Number(((sessionSummary.correct / sessionSummary.attempted) * 100).toFixed(2)) : 0
  const averageSeconds =
    sessionSummary.attempted > 0 ? Number((sessionSummary.totalTimeMs / sessionSummary.attempted / 1000).toFixed(2)) : 0
  const currentQuestionHasAuthoredPack = Boolean(
    currentQuestion?.hint?.trim() && currentQuestion?.explanation?.trim() && currentQuestion?.mnemonic?.trim(),
  )

  return (
    <main className="app-shell">
      <ScreenHeader
        title="HamStudy Pro"
        subtitle={isDueQueueMode ? `${formatTierLabel(tier)} Due Today` : `${formatTierLabel(tier)} Quick Practice`}
        actions={
          onBackToModes ? (
            <button type="button" className="ghost-btn" onClick={onBackToModes}>
              Back to Modes
            </button>
          ) : null
        }
        stats={
          <>
          <StatPill label="All-time answers" value={stats?.totalAnswers ?? 0} icon="📊" />
          <StatPill label="All-time correct" value={stats?.correctAnswers ?? 0} icon="✅" />
          <StatPill label="All-time accuracy" value={`${stats?.accuracyPct ?? 0}%`} icon="🎯" />
          <StatPill label="SRS due today" value={dueTodayCount} icon="⏳" />
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
              placeholder="Search by question, ID, reference, or topic"
            />
            <button type="submit" disabled={loading || saving}>
              Search
            </button>
          </div>
        </form>

        <div className="mode-config-card">
          <span className="mode-config-label">Study Tools</span>
          <div className="session-controls-row">
            <button type="button" className="ghost-btn" onClick={handleResetSession} disabled={saving}>
              Reset Session
            </button>

            <button
              type="button"
              className="ghost-btn"
              onClick={handleSpeakQuestion}
              disabled={saving || loading || !currentQuestion || voiceBusy}
            >
              Read Aloud
            </button>

            <button
              type="button"
              className="ghost-btn"
              onClick={() => currentQuestion && onAskAboutQuestion?.(currentQuestion)}
              disabled={saving || loading || !currentQuestion}
            >
              Ask About This Question
            </button>

            <button type="button" className="ghost-btn" onClick={handleStopSpeaking} disabled={saving || voiceBusy}>
              Stop Voice
            </button>

            <button
              type="button"
              className="ghost-btn"
              onClick={handleStartDueQueue}
              disabled={loading || saving || !isSrsBridgeAvailable}
            >
              Study Due Today
            </button>

            {isDueQueueMode ? (
              <button type="button" className="ghost-btn" onClick={handleExitDueQueue} disabled={loading || saving}>
                Exit Due Queue
              </button>
            ) : null}

            <button
              type="button"
              className="ghost-btn"
              onClick={handleReloadAuthoredContent}
              disabled={loading || saving || reloadingAuthoredContent}
            >
              {reloadingAuthoredContent ? 'Reloading Authored Hints…' : 'Reload Authored Hints'}
            </button>
          </div>
        </div>
        {voiceStatus ? <p className="meta">Voice: {voiceStatus}</p> : null}
        {authoringStatus ? <p className="meta validation-status-text">{authoringStatus}</p> : null}
        <p className="meta">Keyboard tip: A/B/C/D select answers, Enter submits, Cmd/Ctrl+R reads aloud, N goes next, and ? opens shortcuts.</p>
      </section>

      <section className="panel question-session-overview">
        <div className="question-session-overview-row">
          <div className="question-session-card">
            <span className="question-session-label">Mode</span>
            <strong>{isDueQueueMode ? 'Due Queue' : 'Quick Practice'}</strong>
            <p>
              {isDueQueueMode
                ? 'Focus only on cards the spaced-repetition system says need attention today.'
                : 'Practice from the selected tier with search support and randomized default order.'}
            </p>
          </div>
          <div className="question-session-card">
            <span className="question-session-label">Active queue</span>
            <strong>{questionIds.length}</strong>
            <p>{questionIds.length === 1 ? '1 question loaded' : 'Questions loaded in this session pool'}</p>
          </div>
          <div className="question-session-card">
            <span className="question-session-label">Search filter</span>
            <strong>{appliedSearchText.length > 0 ? appliedSearchText : 'None'}</strong>
            <p>{formatTierLabel(tier)} tier</p>
          </div>
        </div>
        {hasQuestion ? (
          <div className="question-session-progress" aria-label="Question session progress">
            <div className="question-session-progress-copy">
              <strong>
                Question {currentIndex + 1} of {questionIds.length}
              </strong>
              <span>{queueProgressPct}% through active queue</span>
            </div>
            <div
              className="question-session-progress-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={queueProgressPct}
            >
              <span style={{ width: `${queueProgressPct}%` }} />
            </div>
          </div>
        ) : (
          <p className="meta">Run a search or reset filters to build a fresh question queue.</p>
        )}
        {hasQuestion && currentQuestion ? (
          <p className="meta validation-status-text">
            Current card authoring status: {currentQuestionHasAuthoredPack ? 'Authored hint pack loaded.' : 'Using fallback guidance for at least one panel field.'}
          </p>
        ) : null}
      </section>

      <section className="panel quiz-summary-panel">
        <h2>Session Summary</h2>
        <p className="meta">Reset Session clears only this session summary. All-time stats stay persisted.</p>
        {!isSrsBridgeAvailable ? (
          <p className="meta">SRS bridge unavailable in this run. Restart app to enable due-queue features.</p>
        ) : null}
        <div className="summary-grid">
          <p>Attempted: {sessionSummary.attempted}</p>
          <p>Correct: {sessionSummary.correct}</p>
          <p>Accuracy: {sessionAccuracy}%</p>
          <p>Avg sec/answer: {averageSeconds}</p>
        </div>
      </section>

      <section className="panel question-panel">
        {loading ? <p>Loading questions...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        {!loading && !error && hasQuestion && currentQuestion ? (
          <div key={currentQuestion.id} className="question-stage">
            <QuestionCard
              question={currentQuestion}
              currentIndex={currentIndex}
              total={questionIds.length}
              selectedIndex={selectedIndex}
              submitted={submitted}
              saving={saving}
              onSelectAnswer={setSelectedIndex}
            />

            <div className="action-row">
              <button type="button" className="primary-button" onClick={handleSubmitAnswer} disabled={selectedIndex === null || submitted || saving}>
                Submit Answer
              </button>
              <button type="button" onClick={handleNextQuestion} disabled={saving || questionIds.length === 0}>
                Next Question
              </button>
            </div>

            <HintPanel key={currentQuestion.id} question={currentQuestion} />

            {submitted ? (
              <>
                <p className="feedback-text">
                  {selectedIndex === currentQuestion.correctIndex
                    ? 'Correct. Great job.'
                    : `Incorrect. Correct answer: ${String.fromCharCode(65 + currentQuestion.correctIndex)}.`}
                </p>
                <div className="action-row">
                  <button type="button" className="ghost-btn" onClick={() => onExplainDifferently?.(currentQuestion)} disabled={saving}>
                    Explain It Differently
                  </button>
                </div>
              </>
            ) : null}

            <ExplanationPanel question={currentQuestion} submitted={submitted} selectedIndex={selectedIndex} hasAiProvider={hasAiProvider} />
          </div>
        ) : null}

        {!loading && !error && !hasQuestion ? (
          <section className="flashcard-empty-state">
            <h2>No questions match this search</h2>
            <p>
              Try a broader query, switch tiers, or clear the current search to rebuild the practice queue.
            </p>
            <div className="action-row">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  setSearchText('')
                  void runSearch('').catch((err: unknown) => {
                    const details = err instanceof Error ? err.message : String(err)
                    setError(`Failed to reload questions. ${details}`)
                    setLoading(false)
                  })
                }}
              >
                Reset Search
              </button>
            </div>
          </section>
        ) : null}
      </section>

      {showShortcuts ? (
        <KeyboardShortcutsOverlay
          title="Quiz Shortcuts"
          shortcuts={SHORTCUTS.quiz}
          onClose={() => setShowShortcuts(false)}
        />
      ) : null}
    </main>
  )
}
