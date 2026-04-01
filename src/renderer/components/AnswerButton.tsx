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

  return (
    <button type="button" className={classes} data-state={state} onClick={onSelect} disabled={disabled}>
      <span className="choice-label">{String.fromCharCode(65 + index)}.</span>
      <span className="answer-text">{answer}</span>
    </button>
  )
}
