import type { Question } from '@shared/types'
import { getFigureForQuestion } from '../lib/questionFigures'

type QuestionFigureProps = {
  question: Pick<Question, 'id'>
}

export function QuestionFigure({ question }: QuestionFigureProps) {
  const figure = getFigureForQuestion(question)

  if (!figure) {
    return null
  }

  return (
    <section className="question-figure-panel" aria-label={`${figure.title} diagram`}>
      <div className="question-figure-header">
        <span className="question-session-label">Associated Figure</span>
        <strong>{figure.title}</strong>
      </div>
      <div className="question-figure-frame">
        <img className="question-figure-image" src={figure.src} alt={figure.title} loading="lazy" />
      </div>
    </section>
  )
}
