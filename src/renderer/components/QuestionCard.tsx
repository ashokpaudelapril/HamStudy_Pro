import type { Question } from '@shared/types'
import { AnswerButton } from './AnswerButton'
import { QuestionFigure } from './QuestionFigure'

type QuestionCardProps = {
  question: Question
  currentIndex: number
  total: number
  selectedIndex: number | null
  submitted: boolean
  saving: boolean
  onSelectAnswer: (index: number) => void
}

export function QuestionCard({
  question,
  selectedIndex,
  submitted,
  saving,
  onSelectAnswer,
}: QuestionCardProps) {
  return (
    <div className="console-question-container">
      <div className="console-question-body">
        <h2 className="question-text">{question.questionText}</h2>
      </div>

      <QuestionFigure question={question} />

      <div className="console-answers-stack" role="radiogroup">
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
    </div>
  )
}
