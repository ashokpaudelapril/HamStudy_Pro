import { useCallback, useEffect, useState } from 'react'
import { SHORTCUTS } from '@shared/constants'
import { ipcBridge } from '@shared/ipcBridge'
import type { ExamTier, Question } from '@shared/types'
import { KeyboardShortcutsOverlay } from '../components/KeyboardShortcutsOverlay'
import { ExplanationPanel } from '../components/ExplanationPanel'
import { HintPanel } from '../components/HintPanel'
import { QuestionCard } from '../components/QuestionCard'
import { SectionTabs } from '../components/SectionTabs'
import { useSRS } from '../hooks/useSRS'
import { Search } from 'lucide-react'

type QuestionScreenProps = {
  activeTier?: ExamTier
  onBackToModes?: () => void
  onAskAboutQuestion?: (question: Question) => void
  onExplainDifferently?: (question: Question) => void
}

type SessionSummary = {
  attempted: number
  correct: number
  totalTimeMs: number
}

export function QuestionScreen({ activeTier = 'technician', onBackToModes, onAskAboutQuestion, onExplainDifferently }: QuestionScreenProps) {
  const REVIEW_TABS = [
    { id: 'hints', label: 'Hints' },
    { id: 'review', label: 'Review' },
  ] as const
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tier, setTier] = useState<ExamTier>(activeTier)
  const [searchText, setSearchText] = useState('')
  const [questionIds, setQuestionIds] = useState<string[]>([])
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [dueTodayCount, setDueTodayCount] = useState<number>(0)
  const [isSrsBridgeAvailable, setIsSrsBridgeAvailable] = useState(true)
  const [questionStartedAt, setQuestionStartedAt] = useState<number>(0)
  const [sessionSummary, setSessionSummary] = useState<SessionSummary>({ attempted: 0, correct: 0, totalTimeMs: 0 })
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [sessionId] = useState(() => `session-${Date.now()}`)
  const [hasAiProvider, setHasAiProvider] = useState(false)
  const [reviewTab, setReviewTab] = useState<(typeof REVIEW_TABS)[number]['id']>('hints')
  const { recordReview } = useSRS()

  const hasQuestion = Boolean(currentQuestion)
  const queueProgressPct = questionIds.length > 0 ? Math.round(((currentIndex + 1) / questionIds.length) * 100) : 0

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

  const loadQuestionById = useCallback(async (questionId: string): Promise<void> => {
    const question = await ipcBridge.getQuestionById(questionId)
    if (!question) throw new Error(`Question not found: ${questionId}`)
    setCurrentQuestion(question)
    setSelectedIndex(null)
    setSubmitted(false)
    setReviewTab('hints')
    setQuestionStartedAt(Date.now())
  }, [])

  const runSearch = useCallback(async (query: string, activeTier: ExamTier = tier): Promise<void> => {
    setLoading(true)
    setTier(activeTier)
    const rows = await ipcBridge.searchQuestions({ query, tier: activeTier, limit: 100 })
    const ids = rows.map((q) => q.id)
    const shouldRandomizeOrder = query.length === 0
    const orderedIds = shouldRandomizeOrder ? [...ids].sort(() => Math.random() - 0.5) : ids
    setQuestionIds(orderedIds)

    if (orderedIds.length === 0) {
      setCurrentQuestion(null)
      setLoading(false)
      return
    }

    const startIdx = shouldRandomizeOrder ? Math.floor(Math.random() * orderedIds.length) : 0
    setCurrentIndex(startIdx)
    await loadQuestionById(orderedIds[startIdx])
    setLoading(false)
  }, [loadQuestionById, tier])

  useEffect(() => {
    void (async () => {
      try {
        const [,, settings] = await Promise.all([runSearch(''), refreshDueTodayCount(), ipcBridge.getSettings()])
        setHasAiProvider(Boolean(settings?.aiProvider))
      } catch (err) {
        console.error(err)
      }
    })()
  }, [])

  const handleSubmitAnswer = useCallback((): void => {
    if (!currentQuestion || selectedIndex === null) return
    const elapsedMs = Math.max(0, Date.now() - questionStartedAt)
    const isCorrect = selectedIndex === currentQuestion.correctIndex
    setSaving(true)
    void ipcBridge.saveAnswer({ questionId: currentQuestion.id, selectedIndex, isCorrect, timeTakenMs: elapsedMs, sessionId })
      .then(async () => {
        setSubmitted(true)
        setSessionSummary(prev => ({ 
          attempted: prev.attempted + 1, 
          correct: prev.correct + (isCorrect ? 1 : 0), 
          totalTimeMs: prev.totalTimeMs + elapsedMs 
        }))
        await recordReview({ questionId: currentQuestion.id, isCorrect }, { persistRemotely: isSrsBridgeAvailable })
        await refreshDueTodayCount()
      })
      .finally(() => setSaving(false))
  }, [currentQuestion, isSrsBridgeAvailable, questionStartedAt, recordReview, refreshDueTodayCount, selectedIndex, sessionId])

  const handleNextQuestion = useCallback((): void => {
    if (questionIds.length === 0) return
    const nextIndex = (currentIndex + 1) % questionIds.length
    setLoading(true)
    loadQuestionById(questionIds[nextIndex])
      .then(() => setCurrentIndex(nextIndex))
      .finally(() => setLoading(false))
  }, [currentIndex, loadQuestionById, questionIds])

  const sessionAccuracy = sessionSummary.attempted > 0 ? ((sessionSummary.correct / sessionSummary.attempted) * 100).toFixed(1) : '0'

  return (
    <div className="practice-page fixed-layout">
      <header className="practice-toolbar">
        <div className="practice-toolbar-left">
          {onBackToModes ? (
            <button type="button" className="console-button secondary compact-back-btn" onClick={onBackToModes}>
              Back
            </button>
          ) : null}
          <form onSubmit={(e) => { e.preventDefault(); runSearch(searchText); }} className="practice-toolbar-search">
            <Search size={14} />
            <input
              className="mono-data"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Search question ID or keyword"
            />
          </form>
        </div>

        <div className="practice-toolbar-meta mono-data">
          <span>{tier.toUpperCase()}</span>
          <span>{currentIndex + 1}/{questionIds.length || 0}</span>
          <span>{sessionAccuracy}% session</span>
          <span>{dueTodayCount} due</span>
        </div>

        <div className="tier-selector-compact">
          <button className={tier === 'technician' ? 'active' : ''} onClick={() => runSearch('', 'technician')}>TECH</button>
          <button className={tier === 'general' ? 'active' : ''} onClick={() => runSearch('', 'general')}>GEN</button>
          <button className={tier === 'extra' ? 'active' : ''} onClick={() => runSearch('', 'extra')}>EXTRA</button>
        </div>
      </header>

      <main className="practice-stage">
        {loading ? (
          <div className="loading-overlay mono-data">INITIALIZING_CONTENT...</div>
        ) : hasQuestion && currentQuestion ? (
          <>
            <section className="practice-question-shell">
              <div className="practice-question-topline">
                <span className="id-tag mono-data">{currentQuestion.id}</span>
                <span className="subelement-tag mono-data">{currentQuestion.subElement}</span>
                <span className="question-position-chip mono-data">{currentIndex + 1}/{questionIds.length}</span>
                <div className="progress-mini-bar">
                  <div className="meter-fill" style={{ width: `${queueProgressPct}%` }} />
                </div>
              </div>

              <div className="practice-question-content">
                <QuestionCard
                  question={currentQuestion}
                  currentIndex={currentIndex}
                  total={questionIds.length}
                  selectedIndex={selectedIndex}
                  submitted={submitted}
                  saving={saving}
                  onSelectAnswer={setSelectedIndex}
                />
              </div>
            </section>

            <aside className="practice-support-strip">
              <div className="practice-support-metrics mono-data">
                <span>Answered {sessionSummary.attempted}</span>
                <span>Correct {sessionSummary.correct}</span>
                <span>Avg {(sessionSummary.totalTimeMs / Math.max(1, sessionSummary.attempted) / 1000).toFixed(1)}s</span>
              </div>

              {submitted ? (
                <div className={`status-banner ${selectedIndex === currentQuestion.correctIndex ? 'good' : 'bad'}`}>
                  {selectedIndex === currentQuestion.correctIndex ? 'Correct answer locked in.' : 'Missed. Review and move on.'}
                </div>
              ) : (
                <p className="practice-support-note">Pick the best answer, submit once, then review only if you need it.</p>
              )}

              <div className="practice-support-actions">
                <button
                  className="console-button"
                  onClick={() => currentQuestion && onAskAboutQuestion?.(currentQuestion)}
                  disabled={!currentQuestion}
                >
                  Ask Tutor
                </button>
                <button
                  className="console-button secondary"
                  onClick={() => currentQuestion && onExplainDifferently?.(currentQuestion)}
                  disabled={!currentQuestion || !submitted}
                >
                  New Angle
                </button>
              </div>
            </aside>
          </>
        ) : (
          <div className="empty-state mono-data">NO_QUESTIONS_FOUND_IN_POOL</div>
        )}
      </main>

      {hasQuestion && currentQuestion && !loading ? (
        <section className="practice-review-panel">
          <div className="practice-review-header">
            <SectionTabs items={[...REVIEW_TABS]} activeId={reviewTab} onChange={(id) => setReviewTab(id as 'hints' | 'review')} />
          </div>

          <div className="practice-review-content">
            {reviewTab === 'hints' ? (
              <HintPanel question={currentQuestion} />
            ) : (
              <ExplanationPanel
                question={currentQuestion}
                submitted={submitted}
                selectedIndex={selectedIndex}
                hasAiProvider={hasAiProvider}
              />
            )}
          </div>
        </section>
      ) : null}

      <footer className="practice-footer">
        <button
          className="console-button primary"
          onClick={handleSubmitAnswer}
          disabled={selectedIndex === null || submitted || saving}
        >
          Submit
        </button>
        <button
          className="console-button secondary"
          onClick={handleNextQuestion}
          disabled={saving || questionIds.length === 0}
        >
          Next
        </button>
      </footer>

      {showShortcuts && (
        <KeyboardShortcutsOverlay
          title="CONSOLE_COMMANDS"
          shortcuts={SHORTCUTS.quiz}
          onClose={() => setShowShortcuts(false)}
        />
      )}
    </div>
  )
}
