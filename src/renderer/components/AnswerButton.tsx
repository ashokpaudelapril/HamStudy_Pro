import React from 'react'

type AnswerButtonProps = {
  answer: string
  index: number
  selected: boolean
  showCorrect: boolean
  showWrong: boolean
  disabled: boolean
  onSelect: React.MouseEventHandler<HTMLButtonElement>
}

export function AnswerButton({
  answer,
  index,
  selected,
  showCorrect,
  showWrong,
  disabled,
  onSelect,
}: AnswerButtonProps) {
  const choiceLabel = String.fromCharCode(65 + index)
  
  // Console state classes
  const stateClass = showCorrect 
    ? 'correct' 
    : showWrong 
      ? 'wrong' 
      : selected 
        ? 'selected' 
        : 'idle'

  return (
    <button
      type="button"
      className={`console-answer-btn ${stateClass}`}
      onClick={onSelect}
      disabled={disabled}
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
    >
      <div className="choice-indicator mono-data">[{choiceLabel}]</div>
      <div className="answer-content">
        <span className="answer-text">{answer}</span>
        {showCorrect && <span className="status-label good-text mono-data"> // VALID_TARGET</span>}
        {showWrong && <span className="status-label bad-text mono-data"> // ERR_MISMATCH</span>}
      </div>
    </button>
  )
}
