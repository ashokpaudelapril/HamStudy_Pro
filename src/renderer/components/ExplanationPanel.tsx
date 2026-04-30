import { useState, useEffect, useCallback } from 'react'
import type { Question } from '@shared/types'
import { ipcBridge } from '@shared/ipcBridge'

type ExplanationPanelProps = {
  question: Question
  submitted: boolean
  selectedIndex?: number | null
  showWhenUnsubmitted?: boolean
  hasAiProvider?: boolean
}

type DistractorNote = {
  choiceLabel: string
  note: string
}

// TASK: Build per-wrong-answer distractor notes for the explanation panel.
// HOW CODE SOLVES: Uses authored why_wrong[index] text when available; falls back
//                  to a generic placeholder for questions not yet authored so the
//                  panel always renders without crashing.
function buildDistractorNotes(question: Question): DistractorNote[] {
  return question.answers
    .map((answer, index) => ({ answer, index }))
    .filter(({ index }) => index !== question.correctIndex)
    .map(({ answer, index }) => {
      const choiceLabel = String.fromCharCode(65 + index)
      const authoredNote = question.whyWrong?.[index]
      return {
        choiceLabel,
        note: authoredNote || `"${answer}" does not match the complete requirement in the prompt.`,
      }
    })
}

export function ExplanationPanel({
  question,
  submitted,
  selectedIndex = null,
  showWhenUnsubmitted = false,
  hasAiProvider = false,
}: ExplanationPanelProps) {
  // TASK: Load any previously saved custom mnemonic and track generation state.
  // HOW CODE SOLVES: useEffect fires when question changes so switching questions
  //                  always shows the correct persisted mnemonic (or null) for that ID.
  const [userMnemonic, setUserMnemonic] = useState<string | null>(null)
  const [generatingMnemonic, setGeneratingMnemonic] = useState(false)
  const [mnemonicError, setMnemonicError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    ipcBridge.getUserMnemonic(question.id).then((saved) => {
      if (!cancelled) setUserMnemonic(saved)
    }).catch(() => {/* bridge not ready yet — stay null */})
    return () => { cancelled = true }
  }, [question.id])

  useEffect(() => {
    setExpanded(false)
  }, [question.id, submitted])

  const handleGenerateMnemonic = useCallback(async () => {
    setGeneratingMnemonic(true)
    setMnemonicError(null)
    try {
      const result = await ipcBridge.generateMnemonic(question.id)
      setUserMnemonic(result)
    } catch (err) {
      setMnemonicError(err instanceof Error ? err.message : 'Generation failed.')
    } finally {
      setGeneratingMnemonic(false)
    }
  }, [question.id])

  if (!submitted && !showWhenUnsubmitted) {
    return null
  }

  const hasAuthoredExplanation = Boolean(question.explanation)
  const hasAuthoredMnemonic = Boolean(question.mnemonic)
  const hasHint = Boolean(question.hint)

  const correctLabel = String.fromCharCode(65 + question.correctIndex)
  const selectedLabel = selectedIndex !== null ? String.fromCharCode(65 + selectedIndex) : null
  const correctAnswerText = question.answers[question.correctIndex]
  const distractorNotes = buildDistractorNotes(question)

  const reviewStateLabel = submitted
    ? selectedIndex === question.correctIndex
      ? 'Correct'
      : 'Needs Review'
    : 'Browser Review'

  const whyCorrect = hasAuthoredExplanation
    ? question.explanation
    : `Choice ${correctLabel} is correct because it directly satisfies the requirement stated in the prompt. Focus on the key phrase in the question stem and match it to this answer: "${correctAnswerText}".`

  const correctionNudge =
    submitted && selectedLabel && selectedIndex !== question.correctIndex
      ? `You selected ${selectedLabel}. Compare its wording against choice ${correctLabel} and look for the exact technical qualifier that makes ${correctLabel} valid.`
      : 'Use the answer text and reference citation together to confirm why this is the most complete option.'

  const mnemonic = hasAuthoredMnemonic
    ? question.mnemonic
    : `Memory hook: connect ${question.subElement} to choice ${correctLabel} first, then eliminate answers that are only partially true.`

  // ISSUE: "not loaded" notice was placed inside the header via justify-content:space-between,
  //        squeezing it beside the title and making both elements cramped.
  // FIX APPLIED: Move the notice below the header as its own full-width row so title and
  //              notice each get their full width.
  return (
    <section className="panel diagnostic-log-panel" aria-label="Explanation panel">
      <header className="log-header explanation-header">
        <div className="explanation-header-copy">
          <span className="mode-eyebrow mono-data">Review</span>
          <strong>{selectedIndex === question.correctIndex ? 'Why this answer is correct' : 'Review this miss'}</strong>
        </div>
        <button type="button" className="ghost-btn" onClick={() => setExpanded((prev) => !prev)}>
          {expanded ? 'Hide Review' : 'Show Review'}
        </button>
      </header>

      <div className="log-data-stream explanation-summary-bar">
        <div className="data-row">
          <span className="data-key mono-data">Result</span>
          <span className={`data-value mono-data ${selectedIndex === question.correctIndex ? 'text-good' : 'text-warn'}`}>
            {reviewStateLabel}
          </span>
        </div>
        <div className="data-row">
          <span className="data-key mono-data">Correct</span>
          <span className="data-value mono-data">{correctLabel}</span>
        </div>
        {selectedLabel ? (
          <div className="data-row">
            <span className="data-key mono-data">Yours</span>
            <span className={`data-value mono-data ${selectedIndex === question.correctIndex ? 'text-good' : 'text-bad'}`}>
              {selectedLabel}
            </span>
          </div>
        ) : null}
      </div>

      {expanded ? (
        <>
          {!hasAuthoredExplanation || !hasAuthoredMnemonic || !hasHint ? (
            <div className="log-alert warn mono-data">
              &gt; FALLBACK_DATA_ACTIVE
            </div>
          ) : null}

          <div className="log-entries-container">
            <div className="log-entry-block">
              <div className="entry-head mono-data">&gt; WHY_IT_WORKS</div>
              <div className="entry-body">
                <p>{whyCorrect}</p>
                {hasHint ? <p className="meta mono-data">HINT: {question.hint}</p> : null}
              </div>
            </div>

            <div className="log-entry-block">
              <div className="entry-head mono-data">&gt; WRONG_CHOICES</div>
              <div className="entry-body">
                <div className="distractor-log-grid">
                  {distractorNotes.map((item) => (
                    <div key={`${question.id}-${item.choiceLabel}`} className="distractor-row">
                      <span className="distractor-id mono-data">[{item.choiceLabel}]</span>
                      <p className="distractor-text">{item.note}</p>
                    </div>
                  ))}
                </div>
                <p className="meta mono-data">ADVISORY: {correctionNudge}</p>
              </div>
            </div>

            <div className="log-entry-block">
              <div className="entry-head mono-data">&gt; MEMORY_HOOK</div>
              <div className="entry-body">
                {userMnemonic ? (
                  <p className="user-mnemonic-text mono-data">{userMnemonic}</p>
                ) : (
                  <p>{mnemonic}</p>
                )}
                {hasAiProvider && (
                  <div className="log-actions">
                    <button
                      className="console-button-sm"
                      onClick={handleGenerateMnemonic}
                      disabled={generatingMnemonic}
                    >
                      {generatingMnemonic
                        ? 'GENERATING...'
                        : userMnemonic
                          ? 'REGENERATE_CUSTOM_SIG'
                          : 'GENERATE_AI_MNEMONIC'}
                    </button>
                    {mnemonicError && <p className="log-error mono-data">ERR: {mnemonicError}</p>}
                  </div>
                )}
                {!userMnemonic && (
                  <p className="meta mono-data">RECALL: Tie the topic label to the key concept.</p>
                )}
              </div>
            </div>

            <div className="log-entry-block">
              <div className="entry-head mono-data">&gt; REFERENCE</div>
              <div className="entry-body">
                <p className="mono-data">{question.refs || 'N/A'}</p>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  )
}
