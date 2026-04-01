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

  useEffect(() => {
    let cancelled = false
    ipcBridge.getUserMnemonic(question.id).then((saved) => {
      if (!cancelled) setUserMnemonic(saved)
    }).catch(() => {/* bridge not ready yet — stay null */})
    return () => { cancelled = true }
  }, [question.id])

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
    <section className="panel explanation-panel" aria-label="Explanation panel">
      <header className="explanation-header">
        <p className="mode-eyebrow">Review Support</p>
        <h3>Explanation Panel</h3>
      </header>
      {!hasAuthoredExplanation || !hasAuthoredMnemonic || !hasHint ? (
        <p className="explanation-fallback-notice">
          Detailed explanation pack not loaded for this question — showing offline fallback guidance.
        </p>
      ) : null}

      <div className="explanation-status-row">
        <div className="explanation-status-pill">
          <span className="explanation-status-label">State</span>
          <strong>{reviewStateLabel}</strong>
        </div>
        <div className="explanation-status-pill">
          <span className="explanation-status-label">Correct Choice</span>
          <strong>
            {correctLabel}. {correctAnswerText}
          </strong>
        </div>
        {selectedLabel ? (
          <div className="explanation-status-pill">
            <span className="explanation-status-label">Your Choice</span>
            <strong>
              {selectedLabel}. {question.answers[selectedIndex ?? question.correctIndex]}
            </strong>
          </div>
        ) : null}
      </div>

      <div className="explanation-panel-grid">
        <article className="explanation-item">
          <h4>Why Correct</h4>
          <p>{whyCorrect}</p>
          {hasHint ? <p className="meta">Hint already on file: {question.hint}</p> : null}
        </article>

        <article className="explanation-item">
          <h4>Why Other Choices Miss</h4>
          <div className="distractor-note-grid">
            {distractorNotes.map((item) => (
              <div key={`${question.id}-${item.choiceLabel}`} className="distractor-note-card">
                <strong>{item.choiceLabel}</strong>
                <p>{item.note}</p>
              </div>
            ))}
          </div>
          <p className="meta">{correctionNudge}</p>
        </article>

        <article className="explanation-item">
          <h4>Mnemonic and Recall</h4>
          {userMnemonic ? (
            <p className="user-mnemonic">{userMnemonic}</p>
          ) : (
            <p>{mnemonic}</p>
          )}
          {hasAiProvider && (
            <div className="mnemonic-actions">
              <button
                className="mnemonic-generate-btn"
                onClick={handleGenerateMnemonic}
                disabled={generatingMnemonic}
              >
                {generatingMnemonic
                  ? 'Generating…'
                  : userMnemonic
                    ? 'Regenerate custom mnemonic'
                    : 'Generate custom mnemonic'}
              </button>
              {mnemonicError && <p className="mnemonic-error">{mnemonicError}</p>}
            </div>
          )}
          {!userMnemonic && (
            <p className="meta">Tie the sub-element label to the concept first, then recall the exact answer wording.</p>
          )}
        </article>

        <article className="explanation-item">
          <h4>Reference Path</h4>
          <p>{question.refs || 'No citation listed for this item.'}</p>
          <p className="meta">Best review habit: say the rule or concept source out loud before moving to the next question.</p>
        </article>
      </div>
    </section>
  )
}
