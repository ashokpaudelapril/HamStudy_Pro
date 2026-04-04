import type { Question } from '@shared/types'
import { AnswerButton } from './AnswerButton'

type QuestionCardProps = {
  question: Question
  currentIndex: number
  total: number
  selectedIndex: number | null
  submitted: boolean
  saving: boolean
  onSelectAnswer: (index: number) => void
}

// TASK: Render question metadata, question text, and answer options.
// HOW CODE SOLVES: Accepts full question/session state via props and maps each
//                  answer to a reusable `AnswerButton` with correctness styling.
//                  Uses semantic HTML (fieldset/legend) and ARIA (radiogroup) for a11y.
export function QuestionCard({
  question,
  currentIndex,
  total,
  selectedIndex,
  submitted,
  saving,
  onSelectAnswer,
}: QuestionCardProps) {
  const refId = `ref-${question.id}`
  const promptId = `prompt-${question.id}`

  return (
    <>
      <p className="meta">
        {question.id} • Question {currentIndex + 1} of {total}
      </p>
      <h2 id={promptId}>{question.questionText}</h2>
      <p className="meta" id={refId}>Reference: {question.refs}</p>

      <fieldset className="answers-grid" disabled={submitted || saving}>
        <legend className="sr-only">Select the correct answer</legend>
        <div
          className="answers-grid"
          role="radiogroup"
          aria-labelledby={promptId}
          aria-describedby={refId}
        >
          {question.answers.map((answer, idx) => {
            const isSelected = selectedIndex === idx
            const isCorrectAnswer = idx === question.correctIndex
            const showCorrect = submitted && isCorrectAnswer
            const showWrong = submitted && isSelected && !isCorrectAnswer

            return (
              <AnswerButton
                key={`${idx}-${answer}`}
                answer={answer}
                index={idx}
                selected={isSelected}
                showCorrect={showCorrect}
                showWrong={showWrong}
                disabled={submitted || saving}
                onSelect={() => onSelectAnswer(idx)}
              />
            )
          })}
        </div>
      </fieldset>
    </>
  )
}
