import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { ipcBridge, type ProgressStats } from '@shared/ipcBridge'
import type { ExamTier, Question } from '@shared/types'
import { HintPanel } from '../components/HintPanel'
import { StatPill } from '../components/StatPill'
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
  const [stats, setStats] = useState<ProgressStats | null>(null)
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

  // TASK: Load aggregate progress stats for flashcard header metrics.
  // HOW CODE SOLVES: Reads persisted progress from the same shared IPC endpoint used by quiz mode.
  const refreshStats = useCallback(async (): Promise<void> => {
    const nextStats = await ipcBridge.getProgressStats()
    setStats(nextStats)
  }, [])

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
  // HOW CODE SOLVES: Switches cards from the in-memory deck instantly without another IPC fetch.
  const showQuestion = useCallback((question: Question): void => {
    setCurrentQuestion(question)
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

      showQuestion(orderedQuestions[0])

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

        await refreshStats()
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

    setCurrentIndex(nextIndex)
    showQuestion(nextQuestion)
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
          refreshStats(),
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
  }, [refreshStats, runSearch])

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
      <header className="top-bar">
        <div>
          <h1>HamStudy Pro</h1>
          <p className="subtitle">{formatTierLabel(tier)} flashcard mode</p>
        </div>
        <button type="button" className="ghost-btn" onClick={onBackToModes}>
          Back to Modes
        </button>
        <div className="stats-grid">
          <StatPill label="All-time answers" value={stats?.totalAnswers ?? 0} />
          <StatPill label="All-time correct" value={stats?.correctAnswers ?? 0} />
          <StatPill label="All-time accuracy" value={`${stats?.accuracyPct ?? 0}%`} />
        </div>
      </header>

      <section className="panel">
        <form className="search-row" onSubmit={handleSearchSubmit}>
          <label>
            Tier
            <select value={tier} onChange={(e) => handleTierChange(e.target.value as ExamTier)}>
              <option value="technician">technician</option>
              <option value="general">general</option>
              <option value="extra">extra</option>
            </select>
          </label>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search flashcards by question text, id, refs, or sub-element"
          />
          <button type="submit" disabled={loading || saving}>
            Search
          </button>
        </form>
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
            Clear Sub-Elements
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
        <p className="meta">
          {selectedSubElements.length > 0
            ? `Custom deck filter: ${selectedSubElements.join(', ')}`
            : 'No sub-element filter selected: deck includes the full tier pool.'}
        </p>
        <div className="action-row">
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
      </section>

      <section className="panel question-panel">
        {isInitialLoad ? <p>Loading flashcards...</p> : null}
        {isRefreshingDeck ? <p className="meta">Refreshing flashcards...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {!isSrsBridgeAvailable ? <p className="meta">SRS updates unavailable in this run. Restart app to re-enable.</p> : null}

        {!error && hasQuestion && currentQuestion ? (
          <>
            <p className="meta">
              {currentQuestion.id} • Card {currentIndex + 1} of {deckQuestions.length}
            </p>

            <article className="flashcard-card">
              <h2>{currentQuestion.questionText}</h2>

              {revealed ? (
                <div className="flashcard-reveal">
                  <p className="meta">Correct answer</p>
                  <p>
                    <strong>{String.fromCharCode(65 + currentQuestion.correctIndex)}.</strong>{' '}
                    {currentQuestion.answers[currentQuestion.correctIndex]}
                  </p>
                  <p className="meta">Reference: {currentQuestion.refs || 'No citation listed for this flashcard.'}</p>
                </div>
              ) : (
                <p className="meta">
                  Tap reveal when you are ready to check your answer. The FCC reference will appear with the revealed card.
                </p>
              )}
            </article>

            <HintPanel key={currentQuestion.id} question={currentQuestion} title="Flashcard Hint" />

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

        {!loading && !error && !hasQuestion ? <p>No flashcards found for this search.</p> : null}
      </section>
    </main>
  )
}
