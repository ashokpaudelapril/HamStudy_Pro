import { useMemo, useState } from 'react'
import type { Question } from '@shared/types'

type HintPanelProps = {
  question: Question
  title?: string
}

function buildFallbackHint(question: Question): string {
  const normalizedSubElement = question.subElement.toUpperCase()

  if (normalizedSubElement.startsWith('T1') || normalizedSubElement.startsWith('G1') || normalizedSubElement.startsWith('E1')) {
    return 'Focus on FCC service purpose and station-identification timing; eliminate answers that overstate permissions.'
  }

  if (normalizedSubElement.startsWith('T5') || normalizedSubElement.startsWith('G5') || normalizedSubElement.startsWith('E5')) {
    return 'Write the formula first, then check units. Most misses come from mixing watts, volts, and amps.'
  }

  if (normalizedSubElement.startsWith('T7') || normalizedSubElement.startsWith('G7') || normalizedSubElement.startsWith('E7')) {
    return 'Identify component function first, then choose the answer that matches signal path behavior.'
  }

  return 'Look for keywords in the stem that define scope, then eliminate choices that are only partially true.'
}

function buildHintStages(question: Question): string[] {
  const fallbackHint = buildFallbackHint(question)
  const authoredHint = question.hint?.trim()
  const referenceText = question.refs?.trim() || 'the cited concept source'

  return [
    `Start broad: anchor this question to ${question.subElement} and decide whether it is testing a rule, operating practice, math relationship, or equipment concept.`,
    authoredHint && authoredHint.length > 0 ? authoredHint : fallbackHint,
    `Final nudge: reread the stem and compare each answer against ${referenceText}. The best option will be the one that fully matches the question, not the one that is only partly true.`,
  ]
}

export function HintPanel({ question, title = 'Hint Panel' }: HintPanelProps) {
  const [hintLevel, setHintLevel] = useState(0)

  const hintStages = useMemo(() => buildHintStages(question), [question])
  const hasAuthoredHint = Boolean(question.hint && question.hint.trim().length > 0)

  return (
    <section className="panel hint-panel" aria-label="Hint panel">
      <header className="hint-panel-header">
        <div>
          <p className="mode-eyebrow">Study Hint</p>
          <h3>{title}</h3>
        </div>
        <div className="action-row">
          {hintLevel > 0 ? (
            <button type="button" className="ghost-btn" onClick={() => setHintLevel(0)}>
              Hide Hints
            </button>
          ) : null}
          <button
            type="button"
            className="ghost-btn"
            onClick={() => setHintLevel((prev) => Math.min(prev + 1, hintStages.length))}
          >
            {hintLevel === 0 ? 'Reveal Hint' : hintLevel < hintStages.length ? 'Need More Help' : 'Hints Maxed'}
          </button>
        </div>
      </header>

      {hintLevel === 0 ? (
        <p className="meta">Hints stay hidden by default so your first pass remains a real attempt. Reveal one stage at a time when you want more guidance.</p>
      ) : (
        <div className="hint-stage-list">
          {hintStages.slice(0, hintLevel).map((hintText, index) => (
            <article key={`${question.id}-hint-${index + 1}`} className="hint-stage-card">
              <p className="mode-eyebrow">Hint {index + 1}</p>
              <p>{hintText}</p>
            </article>
          ))}
          {!hasAuthoredHint ? (
            <p className="meta">Showing staged offline fallback hints because this question has no authored hint field yet.</p>
          ) : null}
        </div>
      )}
    </section>
  )
}
