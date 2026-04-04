import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { ipcBridge } from '@shared/ipcBridge'
import type { ExamTier, MasteryState, Question, QuestionBrowserDetail, QuestionBrowserRow } from '@shared/types'
import { ExplanationPanel } from '../components/ExplanationPanel'
import { QuestionFigure } from '../components/QuestionFigure'
import { ScreenHeader } from '../components/ScreenHeader'
import { StatPill } from '../components/StatPill'

type QuestionBrowserScreenProps = {
  onBackToModes: () => void
  onAskAboutQuestion?: (question: Question) => void
  onExplainDifferently?: (question: Question) => void
}

// TASK: Provide a read-focused browser shell for searching and inspecting the question bank.
// HOW CODE SOLVES: Uses tier/query/sub-element filters for list results and
//                  loads a full question detail panel via `questions:get-by-id`.
export function QuestionBrowserScreen({ onBackToModes, onAskAboutQuestion, onExplainDifferently }: QuestionBrowserScreenProps) {
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [enhancedBrowserAvailable, setEnhancedBrowserAvailable] = useState(true)
  const [tier, setTier] = useState<ExamTier>('technician')
  const [searchText, setSearchText] = useState('')
  const [activeSubElement, setActiveSubElement] = useState<string>('all')
  const [masteryFilter, setMasteryFilter] = useState<MasteryState>('all')
  const [starredOnly, setStarredOnly] = useState(false)
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [questionRows, setQuestionRows] = useState<QuestionBrowserRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<QuestionBrowserDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasAiProvider, setHasAiProvider] = useState(false)

  // TASK: Check whether an AI provider key is set so the mnemonic button is shown.
  // HOW CODE SOLVES: Reads settings once on mount; ExplanationPanel uses the flag to
  //                  conditionally render the "Generate custom mnemonic" button.
  useEffect(() => {
    void ipcBridge.getSettings().then((s) => setHasAiProvider(Boolean(s.aiProvider))).catch(() => {})
  }, [])

  const availableSubElements = useMemo(() => {
    const set = new Set(questionRows.map((q) => q.subElement))
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [questionRows])

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (searchText.trim().length > 0) count += 1
    if (activeSubElement !== 'all') count += 1
    if (masteryFilter !== 'all') count += 1
    if (starredOnly) count += 1
    if (flaggedOnly) count += 1
    return count
  }, [activeSubElement, flaggedOnly, masteryFilter, searchText, starredOnly])

  function mapLegacyQuestionRow(question: Question): QuestionBrowserRow {
    return {
      id: question.id,
      examTier: question.examTier,
      subElement: question.subElement,
      groupId: question.groupId,
      questionText: question.questionText,
      refs: question.refs,
      starred: question.starred ?? false,
      flagged: question.flagged ?? false,
      attempts: 0,
      correctAnswers: 0,
      accuracyPct: 0,
      masteryState: 'unseen',
    }
  }

  function buildFallbackDetail(question: Question): QuestionBrowserDetail {
    return {
      question,
      srsCard: null,
      historySummary: {
        attempts: 0,
        correctAnswers: 0,
        accuracyPct: 0,
        averageTimeMs: 0,
        lastAnsweredAt: null,
      },
      recentAnswers: [],
    }
  }

  function formatTimestamp(value: string | null): string {
    if (!value) {
      return 'Not answered yet'
    }

    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
      return value
    }

    return parsed.toLocaleString()
  }

  // TASK: Reset browser filters back to the default broad browsing state.
  // HOW CODE SOLVES: Clears query, sub-element, mastery, and starred/flagged toggles
  // so the next reload returns to the full selected-tier question list.
  function handleClearFilters(): void {
    setSearchText('')
    setActiveSubElement('all')
    setMasteryFilter('all')
    setStarredOnly(false)
    setFlaggedOnly(false)
  }

  // TASK: Load detail record when selected id changes.
  // HOW CODE SOLVES: Uses primary-key lookup for consistent detail rendering.
  const loadQuestionDetail = useCallback(async (questionId: string): Promise<void> => {
    setDetailLoading(true)
    try {
      if (enhancedBrowserAvailable) {
        const detail = await ipcBridge.getQuestionBrowserDetail({ questionId, recentLimit: 8 })
        if (detail) {
          setSelectedDetail(detail)
          setSelectedQuestion(detail.question)
          return
        }
      }

      const question = await ipcBridge.getQuestionById(questionId)
      if (!question) {
        throw new Error(`Question not found for id ${questionId}.`)
      }
      setSelectedQuestion(question)
      setSelectedDetail(buildFallbackDetail(question))
    } catch (err: unknown) {
      const details = err instanceof Error ? err.message : String(err)
      const isBridgeAvailabilityIssue = details.includes('IPC bridge is not available')

      if (isBridgeAvailabilityIssue) {
        const question = await ipcBridge.getQuestionById(questionId)
        if (!question) {
          throw err
        }

        setEnhancedBrowserAvailable(false)
        setSelectedQuestion(question)
        setSelectedDetail(buildFallbackDetail(question))
        setError('Running in compatibility mode. Restart app to load browser explanation/history/SRS detail support.')
        return
      }

      throw err
    } finally {
      setDetailLoading(false)
    }
  }, [enhancedBrowserAvailable])

  // TASK: Load browser result list from existing question APIs.
  // HOW CODE SOLVES: Uses search endpoint for query-backed filtering and pool endpoint for no-query browsing.
  const loadList = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)

    let rows: QuestionBrowserRow[]

    try {
      rows = await ipcBridge.getQuestionBrowserRows({
        tier,
        query: searchText.trim(),
        subElement: activeSubElement,
        starredOnly,
        flaggedOnly,
        mastery: masteryFilter,
        limit: 500,
      })
      setEnhancedBrowserAvailable(true)
    } catch (err: unknown) {
      const details = err instanceof Error ? err.message : String(err)
      const isBridgeAvailabilityIssue = details.includes('IPC bridge is not available')
      if (!isBridgeAvailabilityIssue) {
        throw err
      }

      const normalizedQuery = searchText.trim()
      const legacyRows = normalizedQuery.length > 0
        ? await ipcBridge.searchQuestions({ query: normalizedQuery, tier, limit: 500 })
        : await ipcBridge.getQuestionPool({ tier })

      const mapped = legacyRows.map(mapLegacyQuestionRow)
      rows = activeSubElement === 'all' ? mapped : mapped.filter((row) => row.subElement === activeSubElement)

      setEnhancedBrowserAvailable(false)
      setStarredOnly(false)
      setFlaggedOnly(false)
      setMasteryFilter('all')
      setError('Running in compatibility mode. Restart app to enable starred/flagged persistence and mastery filters.')
    }

    setQuestionRows(rows)

    if (rows.length === 0) {
      setSelectedId(null)
      setSelectedQuestion(null)
      setSelectedDetail(null)
      setLoading(false)
      return
    }

    const firstId = rows[0].id
    setSelectedId(firstId)
    await loadQuestionDetail(firstId)
    setLoading(false)
  }, [activeSubElement, flaggedOnly, loadQuestionDetail, masteryFilter, searchText, starredOnly, tier])

  // TASK: Select a row from list and load its detail panel.
  // HOW CODE SOLVES: Keeps row selection and detail fetch in sync.
  function handleSelectRow(questionId: string): void {
    setSelectedId(questionId)
    void loadQuestionDetail(questionId).catch((err: unknown) => {
      const details = err instanceof Error ? err.message : String(err)
      setError(`Failed to load question detail. ${details}`)
      setDetailLoading(false)
    })
  }

  // TASK: Apply top filter form and reload list.
  // HOW CODE SOLVES: Prevents navigation and reuses list loader.
  function handleFilterSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void loadList().catch((err: unknown) => {
      const details = err instanceof Error ? err.message : String(err)
      setError(`Failed to load browser results. ${details}`)
      setLoading(false)
    })
  }

  useEffect(() => {
    const kickoff = setTimeout(() => {
      void loadList().catch((err: unknown) => {
        const details = err instanceof Error ? err.message : String(err)
        setError(`Failed to initialize question browser. ${details}`)
        setLoading(false)
      })
    }, 0)

    return () => {
      clearTimeout(kickoff)
    }
  }, [loadList])

  // TASK: Persist star/flag state changes from detail panel actions.
  // HOW CODE SOLVES: Updates DB-backed review flags and mirrors updates in list/detail state.
  function handleUpdateReviewState(input: { starred?: boolean; flagged?: boolean }): void {
    if (!selectedQuestion) return

    setDetailLoading(true)
    void ipcBridge
      .updateQuestionReviewState({ questionId: selectedQuestion.id, ...input })
      .then((updated) => {
        setSelectedQuestion(updated)
        setSelectedDetail((prev) => (prev ? { ...prev, question: updated } : prev))
        setQuestionRows((prev) =>
          prev.map((row) =>
            row.id === updated.id
              ? {
                  ...row,
                  starred: updated.starred ?? false,
                  flagged: updated.flagged ?? false,
                }
              : row,
          ),
        )
      })
      .catch((err: unknown) => {
        const details = err instanceof Error ? err.message : String(err)
        setError(`Failed to update review state. ${details}`)
      })
      .finally(() => {
        setDetailLoading(false)
      })
  }

  return (
    <main className="app-shell">
      <ScreenHeader
        title="HamStudy Pro"
        subtitle="Question Browser"
        actions={
          <button type="button" className="ghost-btn" onClick={onBackToModes}>
            Back to Modes
          </button>
        }
        stats={
          <>
            <StatPill label="Tier" value={tier} icon="📚" />
            <StatPill label="Results" value={questionRows.length} icon="🗂️" />
            <StatPill label="Topics" value={availableSubElements.length} icon="🧩" />
          </>
        }
      />

      <section className="panel mode-config-panel">
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

        <form className="mode-search-form" onSubmit={handleFilterSubmit}>
          <span className="mode-config-label">Search</span>
          <div className="mode-search-row">
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search by ID, question text, reference, topic, or group"
            />
            <button type="submit" disabled={loading}>
              Apply Filters
            </button>
            <button type="button" className="ghost-btn" onClick={handleClearFilters} disabled={loading || activeFilterCount === 0}>
              Clear Filters
            </button>
          </div>
        </form>

        <div className="mode-config-card">
          <span className="mode-config-label">Filters</span>
          <div className="custom-controls">
            <label>
              Topic
              <select value={activeSubElement} onChange={(e) => setActiveSubElement(e.target.value)} disabled={loading}>
                <option value="all">All topics</option>
                {availableSubElements.map((subElement) => (
                  <option key={subElement} value={subElement}>
                    {subElement}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Progress
              <select
                value={masteryFilter}
                onChange={(e) => setMasteryFilter(e.target.value as MasteryState)}
                disabled={loading || !enhancedBrowserAvailable}
              >
                <option value="all">Any progress</option>
                <option value="unseen">Unseen</option>
                <option value="learning">Learning</option>
                <option value="known">Known</option>
                <option value="mastered">Mastered</option>
              </select>
            </label>

            <label className="browser-toggle">
              <input
                type="checkbox"
                checked={starredOnly}
                onChange={(e) => setStarredOnly(e.target.checked)}
                disabled={loading || !enhancedBrowserAvailable}
              />
              Starred
            </label>

            <label className="browser-toggle">
              <input
                type="checkbox"
                checked={flaggedOnly}
                onChange={(e) => setFlaggedOnly(e.target.checked)}
                disabled={loading || !enhancedBrowserAvailable}
              />
              Flagged
            </label>
          </div>
        </div>
      </section>

      <section className="panel browser-panel">
        <aside className="browser-list" aria-label="Question results list">
          <div className="browser-list-header">
            <div>
              <strong>Results</strong>
              <p className="meta">
                {questionRows.length} question{questionRows.length === 1 ? '' : 's'} in {tier}
                {activeFilterCount > 0 ? ` • ${activeFilterCount} active filter${activeFilterCount === 1 ? '' : 's'}` : ''}
              </p>
            </div>
          </div>

          {loading ? <p>Loading browser results...</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
          {!enhancedBrowserAvailable ? (
            <div className="browser-compat-note">
              <strong>Compatibility mode</strong>
              <p>Starred, flagged, mastery, and deeper browser metadata are partially limited until the latest bridge is loaded.</p>
            </div>
          ) : null}

          {!loading && !error && questionRows.length === 0 ? (
            <div className="browser-empty-state">
              <h2>No questions match these filters</h2>
              <p>Try clearing the search text or broadening the mastery and review-state filters.</p>
            </div>
          ) : null}

          {!loading && !error
            ? questionRows.map((row) => {
                const active = selectedId === row.id
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={`browser-row${active ? ' active' : ''}`}
                    onClick={() => handleSelectRow(row.id)}
                  >
                    <span className="browser-row-id">{row.id}</span>
                    <span className="browser-row-text">{row.questionText}</span>
                    <span className="browser-row-meta">
                      {row.subElement} • {row.groupId} • {row.masteryState} • {row.accuracyPct}%
                    </span>
                  </button>
                )
              })
            : null}
        </aside>

        <article className="browser-detail">
          {detailLoading ? <p>Loading question detail...</p> : null}
          {!detailLoading && selectedQuestion ? (
            <div key={selectedQuestion.id} className="question-stage">
              <p className="meta">
                {selectedQuestion.id} • {selectedQuestion.subElement} • {selectedQuestion.groupId}
              </p>

              <div className="action-row">
                <button
                  type="button"
                  className={`ghost-btn ${selectedQuestion.starred ? 'active-flag' : ''}`}
                  onClick={() => handleUpdateReviewState({ starred: !selectedQuestion.starred })}
                  disabled={detailLoading}
                >
                  {selectedQuestion.starred ? 'Unstar' : 'Star'}
                </button>
                <button
                  type="button"
                  className={`ghost-btn ${selectedQuestion.flagged ? 'active-flag' : ''}`}
                  onClick={() => handleUpdateReviewState({ flagged: !selectedQuestion.flagged })}
                  disabled={detailLoading}
                >
                  {selectedQuestion.flagged ? 'Unflag' : 'Flag'}
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => onAskAboutQuestion?.(selectedQuestion)}
                  disabled={detailLoading}
                >
                  Ask About This Question
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => onExplainDifferently?.(selectedQuestion)}
                  disabled={detailLoading}
                >
                  Explain It Differently
                </button>
              </div>

              <h2>{selectedQuestion.questionText}</h2>
              <QuestionFigure question={selectedQuestion} />

              <div className="answers-grid">
                {selectedQuestion.answers.map((answer, idx) => {
                  const isCorrect = idx === selectedQuestion.correctIndex
                  return (
                    <div key={`${selectedQuestion.id}-${idx}`} className={`browser-answer${isCorrect ? ' correct' : ''}`}>
                      <span className="choice-label">{String.fromCharCode(65 + idx)}.</span>
                      <span>{answer}</span>
                    </div>
                  )
                })}
              </div>

              {selectedQuestion.hint ? <p className="meta">Hint: {selectedQuestion.hint}</p> : null}
              {selectedQuestion.mnemonic ? <p className="meta">Mnemonic: {selectedQuestion.mnemonic}</p> : null}
              {selectedQuestion.explanation ? <p className="meta">Explanation: {selectedQuestion.explanation}</p> : null}

              <ExplanationPanel question={selectedQuestion} submitted={true} showWhenUnsubmitted hasAiProvider={hasAiProvider} />

              <p className="meta">Reference: {selectedQuestion.refs}</p>

              {selectedDetail ? (
                <div className="browser-detail-sections">
                  <div className="stats-grid">
                    <StatPill label="Attempts" value={selectedDetail.historySummary.attempts} />
                    <StatPill label="Accuracy" value={`${selectedDetail.historySummary.accuracyPct}%`} />
                    <StatPill label="Avg Time" value={`${Math.round(selectedDetail.historySummary.averageTimeMs)} ms`} />
                    <StatPill label="Last Answered" value={formatTimestamp(selectedDetail.historySummary.lastAnsweredAt)} />
                  </div>

                  <div className="stats-grid">
                    <StatPill label="SRS Repetitions" value={selectedDetail.srsCard?.repetitions ?? 0} />
                    <StatPill label="SRS Interval" value={selectedDetail.srsCard ? `${selectedDetail.srsCard.interval} d` : 'Not started'} />
                    <StatPill
                      label="SRS Ease"
                      value={selectedDetail.srsCard ? selectedDetail.srsCard.easeFactor.toFixed(2) : 'Not started'}
                    />
                    <StatPill
                      label="Next Review"
                      value={selectedDetail.srsCard ? formatTimestamp(selectedDetail.srsCard.nextReview) : 'Not scheduled'}
                    />
                  </div>

                  <div>
                    <p className="meta">Recent Answers</p>
                    {selectedDetail.recentAnswers.length === 0 ? (
                      <p className="meta">No answer history for this question yet.</p>
                    ) : (
                      <ul className="browser-history-list">
                        {selectedDetail.recentAnswers.map((answer) => (
                          <li key={answer.id} className="browser-history-item">
                            {formatTimestamp(answer.answeredAt)} • Choice {String.fromCharCode(65 + answer.selectedIndex)} •{' '}
                            {answer.isCorrect ? 'Correct' : 'Incorrect'} • {answer.timeTakenMs} ms
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {!detailLoading && !selectedQuestion ? (
            <div className="browser-empty-state">
              <h2>Select a question to inspect details</h2>
              <p>The right panel will show the question text, answers, history, SRS state, and explanation support.</p>
            </div>
          ) : null}
        </article>
      </section>
    </main>
  )
}
