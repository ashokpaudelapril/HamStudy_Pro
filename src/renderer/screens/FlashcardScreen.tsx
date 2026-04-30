import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { ipcBridge } from '@shared/ipcBridge'
import type { ExamTier, Question } from '@shared/types'
import { HintPanel } from '../components/HintPanel'
import { ModeBar } from '../components/ModeBar'
import { QuestionFigure } from '../components/QuestionFigure'
import { SectionTabs } from '../components/SectionTabs'
import { useSRS } from '../hooks/useSRS'

type FlashcardScreenProps = {
  onBackToModes: () => void
  onAskAboutQuestion?: (question: Question) => void
  onExplainDifferently?: (question: Question) => void
}

// TASK: Provide a first-pass flashcard mode using the local technician pool.
// HOW CODE SOLVES: Supports search, reveal/hide behavior, next-card navigation,
//                  and progress event persistence (`progress:save-answer`) for stats.
export function FlashcardScreen({ onBackToModes, onAskAboutQuestion, onExplainDifferently }: FlashcardScreenProps) {
  const TABS = [
    { id: 'setup', label: 'Setup' },
    { id: 'practice', label: 'Practice Workspace' },
  ] as const
  const PRACTICE_TABS = [
    { id: 'card', label: 'Card' },
    { id: 'tools', label: 'Tools' },
  ] as const
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]['id']>('setup')
  const [practiceTab, setPracticeTab] = useState<(typeof PRACTICE_TABS)[number]['id']>('card')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tier, setTier] = useState<ExamTier>('technician')
  const [searchText, setSearchText] = useState('')
  const [appliedSearchText, setAppliedSearchText] = useState('')
  const [availableSubElements, setAvailableSubElements] = useState<string[]>([])
  const [selectedSubElements, setSelectedSubElements] = useState<string[]>([])
  const [randomizeDeck, setRandomizeDeck] = useState(true)
  const [deckQuestions, setDeckQuestions] = useState<Question[]>([])
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [isSrsBridgeAvailable, setIsSrsBridgeAvailable] = useState(true)
  const [questionStartedAt, setQuestionStartedAt] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [sessionId] = useState(() => `flashcard-${Date.now()}`)
  const hasInitializedRef = useRef(false)
  const poolCacheRef = useRef<Partial<Record<ExamTier, Question[]>>>({})
  const { recordReview } = useSRS()

  const hasQuestion = Boolean(currentQuestion)
  const isInitialLoad = loading && !hasQuestion
  const isRefreshingDeck = loading && hasQuestion
  const progressPct = deckQuestions.length > 0 ? Math.round(((currentIndex + 1) / deckQuestions.length) * 100) : 0
  const deckFocusSummary = selectedSubElements.length > 0 ? selectedSubElements.join(', ') : 'All topics'
  const searchSummary = appliedSearchText.length > 0 ? appliedSearchText : 'None'

  function getChoiceNote(question: Question, index: number): string {
    if (index === question.correctIndex) {
      return question.explanation?.trim() || 'This choice is correct because it fully matches the requirement stated in the prompt.'
    }

    return (
      question.whyWrong?.[index]?.trim() ||
      `"${question.answers[index]}" does not match the complete requirement in the prompt.`
    )
  }

  function formatTierLabel(value: ExamTier): string {
    if (value === 'technician') return 'Technician'
    if (value === 'general') return 'General'
    return 'Extra'
  }

  // TASK: Keep flashcard order customizable without losing a quick random-study path.
  // HOW CODE SOLVES: Shuffles IDs only when randomization is enabled, letting
  //                  the same builder controls support both sequential and mixed decks.
  function shuffleQuestionIds(ids: string[]): string[] {
    const output = [...ids]

    for (let i = output.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[output[i], output[j]] = [output[j], output[i]]
    }

    return output
  }

  function matchesSearch(question: Question, query: string): boolean {
    const normalized = query.trim().toLowerCase()
    if (normalized.length === 0) {
      return true
    }

    return [
      question.id,
      question.questionText,
      question.refs,
      question.subElement,
      question.groupId,
    ].some((value) => value.toLowerCase().includes(normalized))
  }

  const getTierPool = useCallback(async (activeTier: ExamTier): Promise<Question[]> => {
    const cachedPool = poolCacheRef.current[activeTier]
    if (cachedPool) {
      return cachedPool
    }

    const nextPool = await ipcBridge.getQuestionPool({ tier: activeTier })
    poolCacheRef.current[activeTier] = nextPool
    return nextPool
  }, [])

  // TASK: Promote a flashcard into the active viewing state.
  // HOW CODE SOLVES: Reloads the selected card by stable ID so authored hint/explanation
  //                  edits from the DB are reflected even if the deck pool was cached earlier.
  const showQuestion = useCallback(async (question: Question): Promise<void> => {
    const latestQuestion = await ipcBridge.getQuestionById(question.id)
    setCurrentQuestion(latestQuestion ?? question)
    setRevealed(false)
    setQuestionStartedAt(Date.now())
  }, [])

  // TASK: Search and customize flashcard decks from the full selected tier pool.
  // HOW CODE SOLVES: Loads the full question pool, derives available sub-elements,
  //                  applies query + chip filters, and optionally randomizes the deck order.
  const runSearch = useCallback(
    async (
      query: string,
      activeTier: ExamTier = tier,
      options?: {
        subElements?: string[]
        randomize?: boolean
      },
    ): Promise<void> => {
      const cachedPool = poolCacheRef.current[activeTier]
      const shouldShowLoadingState = !cachedPool

      if (shouldShowLoadingState) {
        setLoading(true)
      }

      const pool = await getTierPool(activeTier)
      const uniqueSubElements = Array.from(new Set(pool.map((row) => row.subElement))).sort((a, b) => a.localeCompare(b))
      setAvailableSubElements(uniqueSubElements)

      const activeSubElements = options?.subElements ?? selectedSubElements
      const shouldRandomize = options?.randomize ?? randomizeDeck

      const filteredPool = pool.filter((question) => {
        const matchesSubElement =
          activeSubElements.length === 0 || activeSubElements.includes(question.subElement)
        return matchesSubElement && matchesSearch(question, query)
      })

      const orderedQuestions = shouldRandomize
        ? shuffleQuestionIds(filteredPool.map((row) => row.id)).map((id) => {
            const match = filteredPool.find((row) => row.id === id)
            if (!match) {
              throw new Error(`Question not found in filtered flashcard deck for id ${id}.`)
            }
            return match
          })
        : filteredPool

      setDeckQuestions(orderedQuestions)
      setCurrentIndex(0)

      if (orderedQuestions.length === 0) {
        setCurrentQuestion(null)
        if (shouldShowLoadingState) {
          setLoading(false)
        }
        return
      }

      await showQuestion(orderedQuestions[0])

      if (shouldShowLoadingState) {
        setLoading(false)
      }
    },
    [getTierPool, randomizeDeck, selectedSubElements, showQuestion, tier],
  )

  function refreshDeckWithOptions(next: {
    query?: string
    tier?: ExamTier
    subElements?: string[]
    randomize?: boolean
  }): void {
    void runSearch(next.query ?? appliedSearchText, next.tier ?? tier, {
      subElements: next.subElements ?? selectedSubElements,
      randomize: next.randomize ?? randomizeDeck,
    }).catch((err: unknown) => {
      const details = err instanceof Error ? err.message : String(err)
      setError(`Failed to refresh flashcard deck. ${details}`)
      setLoading(false)
    })
  }

  // TASK: Let users focus flashcards on chosen sub-elements without opening a different mode.
  // HOW CODE SOLVES: Reuses chip-style toggles similar to Custom Quiz so flashcards
  //                  can be narrowed to one or more sub-elements on demand.
  function handleToggleSubElement(subElement: string): void {
    setSelectedSubElements((prev) => {
      const nextSelected = prev.includes(subElement)
        ? prev.filter((value) => value !== subElement)
        : [...prev, subElement]

      refreshDeckWithOptions({ subElements: nextSelected })
      return nextSelected
    })
  }

  // TASK: Persist flashcard outcome as progress event.
  // HOW CODE SOLVES: Reuses `save-answer` IPC with correctness mapping to keep unified analytics.
  function saveFlashcardOutcome(knewIt: boolean): void {
    if (!currentQuestion) return

    const elapsedMs = Math.max(0, Date.now() - questionStartedAt)
    const selectedIndex = knewIt ? currentQuestion.correctIndex : (currentQuestion.correctIndex + 1) % 4

    setSaving(true)
    void ipcBridge
      .saveAnswer({
        questionId: currentQuestion.id,
        selectedIndex,
        isCorrect: knewIt,
        timeTakenMs: elapsedMs,
        sessionId,
      })
      .then(async () => {
        // TASK: Apply SRS updates from flashcard outcomes through shared hook.
        // HOW CODE SOLVES: Sends correctness signal to SRS persistence path and
        //                  disables bridge-dependent features if persistence fails.
        const srsResult = await recordReview(
          {
            questionId: currentQuestion.id,
            isCorrect: knewIt,
          },
          { persistRemotely: isSrsBridgeAvailable },
        )

        if (!srsResult.persisted && srsResult.reason === 'persist-failed') {
          setIsSrsBridgeAvailable(false)
        }

      })
      .catch((err: unknown) => {
        const details = err instanceof Error ? err.message : String(err)
        setError(`Failed to save flashcard result. ${details}`)
      })
      .finally(() => {
        setSaving(false)
      })
  }

  // TASK: Move to next flashcard in current result list.
  // HOW CODE SOLVES: Advances index with wrap-around and loads card by id.
  function handleNextCard(): void {
    if (deckQuestions.length === 0) return
    const nextIndex = (currentIndex + 1) % deckQuestions.length
    const nextQuestion = deckQuestions[nextIndex]

    setLoading(true)
    void showQuestion(nextQuestion)
      .then(() => {
        setCurrentIndex(nextIndex)
      })
      .catch((err: unknown) => {
        const details = err instanceof Error ? err.message : String(err)
        setError(`Failed to load next flashcard. ${details}`)
      })
      .finally(() => {
        setLoading(false)
      })
  }

  // TASK: Submit flashcard search input.
  // HOW CODE SOLVES: Prevents full-page form submit and runs IPC-backed search.
  function handleSearchSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const nextQuery = searchText.trim()
    setAppliedSearchText(nextQuery)
    refreshDeckWithOptions({ query: nextQuery })
  }

  const handleSpeak = useCallback(() => {
    if (!currentQuestion || voiceBusy) {
      return
    }

    const textToSpeak = [
      `Question ${currentQuestion.id}.`,
      currentQuestion.questionText,
      ...(revealed
        ? [
            `Correct answer: ${String.fromCharCode(65 + currentQuestion.correctIndex)}. ${
              currentQuestion.answers[currentQuestion.correctIndex]
            }`,
          ]
        : []),
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
  }, [currentQuestion, voiceBusy, revealed])

  useEffect(() => {
    if (hasInitializedRef.current) {
      return
    }

    hasInitializedRef.current = true

    void (async () => {
      try {
        await Promise.all([
          runSearch('', 'technician', {
            subElements: [],
            randomize: true,
          }),
        ])
        setError(null)
      } catch (err: unknown) {
        const details = err instanceof Error ? err.message : String(err)
        setError(`Failed to initialize flashcard mode. ${details}`)
        setLoading(false)
      }
    })()
  }, [runSearch])

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

  function handleTierChange(nextTier: ExamTier): void {
    setTier(nextTier)
    setSelectedSubElements([])
    setError(null)
    refreshDeckWithOptions({
      tier: nextTier,
      subElements: [],
    })
  }

  return (
    <main className="app-shell">
      <ModeBar title={`${formatTierLabel(tier)} Flashcards`} onBack={onBackToModes} />

      <SectionTabs items={[...TABS]} activeId={activeTab} onChange={(id) => setActiveTab(id as any)} />

      {activeTab === 'setup' ? (
        <div className="app-shell-scroll">
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
              placeholder="Search flashcards by question, ID, reference, or topic"
            />
            <button type="submit" disabled={loading || saving}>
              Search
            </button>
          </div>
        </form>

        <div className="mode-config-card">
          <span className="mode-config-label">Study Tools</span>
          <div className="custom-controls">
            <label className="browser-toggle">
              <input
                type="checkbox"
                checked={randomizeDeck}
                onChange={(event) => {
                  const nextRandomize = event.target.checked
                  setRandomizeDeck(nextRandomize)
                  refreshDeckWithOptions({ randomize: nextRandomize })
                }}
                disabled={loading}
              />
              Randomize deck order
            </label>

            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                setSelectedSubElements([])
                refreshDeckWithOptions({ subElements: [] })
              }}
              disabled={loading}
            >
              Clear Topics
            </button>

            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                const nextSelected = [...availableSubElements]
                setSelectedSubElements(nextSelected)
                refreshDeckWithOptions({ subElements: nextSelected })
              }}
              disabled={loading || availableSubElements.length === 0}
            >
              Select All
            </button>
          </div>
        </div>

        <div className="mode-config-card flashcard-topics-card">
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
                ? `Deck filter: ${selectedSubElements.join(', ')}`
                : 'No topic filter selected: deck includes the full tier pool.'}
            </p>
          </div>
        </div>
      </section>
      </div>
      ) : null}

      {activeTab === 'practice' ? (
        <div className="app-shell-fixed">
      <section className="flashcard-utility-strip">
        <div className="flashcard-utility-summary mono-data">
          <span>{formatTierLabel(tier)}</span>
          <span>{randomizeDeck ? 'Randomized' : 'Sequential'}</span>
          <span>{deckFocusSummary}</span>
          <span>Search {searchSummary}</span>
          {hasQuestion ? <span>Card {currentIndex + 1}/{deckQuestions.length}</span> : null}
        </div>
        {hasQuestion ? (
          <div className="flashcard-progress-inline" aria-label="Flashcard session progress">
            <span>{progressPct}%</span>
            <div
              className="question-session-progress-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPct}
            >
              <span style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        ) : null}
        <SectionTabs items={[...PRACTICE_TABS]} activeId={practiceTab} onChange={(id) => setPracticeTab(id as 'card' | 'tools')} />
      </section>

      <section className="panel scroll-pane question-panel" style={{ flex: 1 }}>
        {isInitialLoad ? <p>Loading flashcards...</p> : null}
        {isRefreshingDeck ? <p className="meta">Refreshing flashcards...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {!isSrsBridgeAvailable ? <p className="meta">SRS updates unavailable in this run. Restart app to re-enable.</p> : null}

        {!error && hasQuestion && currentQuestion && practiceTab === 'card' ? (
          <>
            <p className="meta">
              {currentQuestion.id} • Card {currentIndex + 1} of {deckQuestions.length}
            </p>

            <article className="flashcard-card">
              <h2>{currentQuestion.questionText}</h2>
              <QuestionFigure question={currentQuestion} />

              {revealed ? (
                <div className="flashcard-reveal">
                  <p className="meta">Correct answer</p>
                  <p>
                    <strong>{String.fromCharCode(65 + currentQuestion.correctIndex)}.</strong>{' '}
                    {currentQuestion.answers[currentQuestion.correctIndex]}
                  </p>
                  {currentQuestion.refs ? <p className="meta">Reference: {currentQuestion.refs}</p> : null}
                </div>
              ) : (
                <p className="meta">
                  Review all choices first, then tap reveal when you are ready to check the correct answer. The FCC reference will appear with the revealed card.
                </p>
              )}

              <div className="flashcard-option-list" aria-label="All answer choices">
                {currentQuestion.answers.map((answer, index) => {
                  const isCorrect = index === currentQuestion.correctIndex
                  return (
                    <div
                      key={`${currentQuestion.id}-flashcard-choice-${index}`}
                      className={`flashcard-option-row${revealed && isCorrect ? ' is-correct' : ''}`}
                    >
                      <strong>{String.fromCharCode(65 + index)}.</strong>
                      <div className="flashcard-option-copy">
                        <span>{answer}</span>
                      </div>
                      {revealed && isCorrect ? <em>Correct answer</em> : null}
                    </div>
                  )
                })}
              </div>
            </article>

            <div className="action-row">
              {!revealed ? (
                <button type="button" className="primary-button" onClick={() => setRevealed(true)} disabled={saving}>
                  Reveal Answer
                </button>
              ) : (
                <>
                  <button type="button" className="primary-button" onClick={() => saveFlashcardOutcome(true)} disabled={saving}>
                    I Knew It
                  </button>
                  <button type="button" className="primary-button" onClick={() => saveFlashcardOutcome(false)} disabled={saving}>
                    Need Review
                  </button>
                </>
              )}

              <button type="button" onClick={handleNextCard} disabled={saving || deckQuestions.length === 0}>
                Next Card
              </button>
            </div>
          </>
        ) : null}

        {!error && hasQuestion && currentQuestion && practiceTab === 'tools' ? (
          <section className="flashcard-tools-panel">
            <div className="flashcard-tools-actions">
              <button
                type="button"
                className="ghost-btn"
                onClick={handleSpeak}
                disabled={saving || loading || !currentQuestion || voiceBusy}
              >
                Read Aloud
              </button>
              <button type="button" className="ghost-btn" onClick={() => ipcBridge.stopSpeech()} disabled={saving || !voiceBusy}>
                Stop Voice
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => currentQuestion && onAskAboutQuestion?.(currentQuestion)}
                disabled={saving || loading || !currentQuestion}
              >
                Ask About This Question
              </button>
              {revealed ? (
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => currentQuestion && onExplainDifferently?.(currentQuestion)}
                  disabled={saving || loading || !currentQuestion}
                >
                  Explain It Differently
                </button>
              ) : null}
            </div>
            {voiceStatus ? <p className="meta">Voice: {voiceStatus}</p> : null}
            <p className="meta">Tip: use Cmd/Ctrl + R to read the current flashcard aloud.</p>
            {revealed ? (
              <section className="flashcard-review-panel">

                <div className="flashcard-option-list flashcard-option-list-review" aria-label="Flashcard answer analysis">
                  {currentQuestion.answers.map((answer, index) => {
                    const isCorrect = index === currentQuestion.correctIndex
                    return (
                      <div
                        key={`${currentQuestion.id}-flashcard-review-choice-${index}`}
                        className={`flashcard-option-row${isCorrect ? ' is-correct' : ''}`}
                      >
                        <strong>{String.fromCharCode(65 + index)}.</strong>
                        <div className="flashcard-option-copy">
                          <span>{answer}</span>
                          <p>{getChoiceNote(currentQuestion, index)}</p>
                        </div>
                        <em>{isCorrect ? 'Correct answer' : 'Other option'}</em>
                      </div>
                    )
                  })}
                </div>
              </section>
            ) : null}
            <HintPanel key={currentQuestion.id} question={currentQuestion} title="Flashcard Help" />
          </section>
        ) : null}

        {!loading && !error && !hasQuestion ? (
          <section className="flashcard-empty-state">
            <h2>No flashcards match this deck setup</h2>
            <p>
              Try clearing the search, removing some topic filters, or switching to a different tier to rebuild the deck.
            </p>
            <div className="action-row">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  setSearchText('')
                  setAppliedSearchText('')
                  setSelectedSubElements([])
                  refreshDeckWithOptions({ query: '', subElements: [] })
                }}
              >
                Reset Deck Filters
              </button>
            </div>
          </section>
        ) : null}
      </section>
      </div>
      ) : null}
    </main>
  )
}
