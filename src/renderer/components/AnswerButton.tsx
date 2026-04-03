import type { MouseEventHandler } from 'react'

type AnswerButtonProps = {
  answer: string
  index: number
  selected: boolean
  showCorrect: boolean
  showWrong: boolean
  disabled: boolean
  onSelect: MouseEventHandler<HTMLButtonElement>
}

// TASK: Render a single answer option with selection/correctness states.
// HOW CODE SOLVES: Computes the answer button CSS classes from props and emits
//                  a stable A/B/C/D label while delegating click behavior.
//                  Includes full ARIA support: role="radio", aria-checked, aria-label.
export function AnswerButton({
  answer,
  index,
  selected,
  showCorrect,
  showWrong,
  disabled,
  onSelect,
}: AnswerButtonProps) {
  const classes = `answer-btn ${selected ? 'selected' : ''} ${showCorrect ? 'correct' : ''} ${showWrong ? 'wrong' : ''}`
  const state = showCorrect ? 'correct' : showWrong ? 'wrong' : selected ? 'selected' : 'idle'
  const choiceLabel = String.fromCharCode(65 + index)
  const ariaLabel = `Answer choice ${choiceLabel}: ${answer}`
  const showAnswerStatus = showCorrect || showWrong

  return (
    <button
      type="button"
      className={classes}
      data-state={state}
      onClick={onSelect}
      disabled={disabled}
      role="radio"
      aria-checked={selected}
      aria-label={ariaLabel}
      tabIndex={selected ? 0 : -1}
    >
      <span className="choice-label" aria-hidden="true">{choiceLabel}.</span>
      <span className="answer-copy">
        <span className="answer-text">{answer}</span>
        {showAnswerStatus ? (
          <span className="answer-status-row" aria-live="polite">
            {showCorrect ? <span className="answer-status-badge answer-status-badge--correct">Correct answer</span> : null}
            {showWrong ? <span className="answer-status-badge answer-status-badge--wrong">Your choice</span> : null}
          </span>
        ) : null}
      </span>
    </button>
  )
}
