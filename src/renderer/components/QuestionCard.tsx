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
export function QuestionCard({
  question,
  currentIndex,
  total,
  selectedIndex,
  submitted,
  saving,
  onSelectAnswer,
}: QuestionCardProps) {
  return (
    <>
      <p className="meta">
        {question.id} • Result {currentIndex + 1} of {total}
      </p>
      <h2>{question.questionText}</h2>
      <p className="meta">Reference: {question.refs}</p>

      <div className="answers-grid">
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
    </>
  )
}
