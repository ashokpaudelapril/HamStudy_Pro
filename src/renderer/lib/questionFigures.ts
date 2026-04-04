import type { Question } from '@shared/types'

import figureT1 from '../../../data/images/Technician/Figure T-1.png'
import figureT2 from '../../../data/images/Technician/Figure T-2.png'
import figureT3 from '../../../data/images/Technician/Figure T-3.png'
import figureG71 from '../../../data/images/General/Figure G7-1.png'
import figureE51 from '../../../data/images/Extra/Figure E5-1.png'
import figureE61 from '../../../data/images/Extra/Figure E6-1.png'
import figureE62 from '../../../data/images/Extra/Figure E6-2.png'
import figureE63 from '../../../data/images/Extra/Figure E6-3.png'
import figureE71 from '../../../data/images/Extra/Figure E7-1.png'
import figureE72 from '../../../data/images/Extra/Figure E7-2.png'
import figureE73 from '../../../data/images/Extra/Figure E7-3.png'
import figureE91 from '../../../data/images/Extra/Figure E9-1.png'
import figureE92 from '../../../data/images/Extra/Figure E9-2.png'
import figureE93 from '../../../data/images/Extra/Figure E9-3.png'

type FigureMatch = {
  title: string
  src: string
}

const FIGURE_MATCHERS: Array<{ test: (questionId: string) => boolean; figure: FigureMatch }> = [
  { test: (id) => ['T6C02', 'T6C03', 'T6C04', 'T6C05', 'T6D10'].includes(id), figure: { title: 'Figure T-1', src: figureT1 } },
  { test: (id) => ['T6A12', 'T6C06', 'T6C07', 'T6C08', 'T6C09'].includes(id), figure: { title: 'Figure T-2', src: figureT2 } },
  { test: (id) => ['T6C10', 'T6C11'].includes(id), figure: { title: 'Figure T-3', src: figureT3 } },
  { test: (id) => /^G7A(09|10|11|12|13)$/.test(id), figure: { title: 'Figure G7-1', src: figureG71 } },
  { test: (id) => /^E5C(10|11|12)$/.test(id), figure: { title: 'Figure E5-1', src: figureE51 } },
  { test: (id) => /^E6A(10|11)$/.test(id), figure: { title: 'Figure E6-1', src: figureE61 } },
  { test: (id) => id === 'E6B10', figure: { title: 'Figure E6-2', src: figureE62 } },
  { test: (id) => /^E6C(08|10|11)$/.test(id), figure: { title: 'Figure E6-3', src: figureE63 } },
  { test: (id) => /^E7B(10|11|12)$/.test(id), figure: { title: 'Figure E7-1', src: figureE71 } },
  { test: (id) => /^E7D(06|07|08)$/.test(id), figure: { title: 'Figure E7-2', src: figureE72 } },
  { test: (id) => /^E7G(07|09|10|11)$/.test(id), figure: { title: 'Figure E7-3', src: figureE73 } },
  { test: (id) => /^E9B(01|02|03)$/.test(id), figure: { title: 'Figure E9-1', src: figureE91 } },
  { test: (id) => /^E9B(04|05|06)$/.test(id), figure: { title: 'Figure E9-2', src: figureE92 } },
  { test: (id) => /^E9G(06|07)$/.test(id), figure: { title: 'Figure E9-3', src: figureE93 } },
]

export function getFigureForQuestion(question: Pick<Question, 'id'>): FigureMatch | null {
  const match = FIGURE_MATCHERS.find((entry) => entry.test(question.id))
  return match?.figure ?? null
}
