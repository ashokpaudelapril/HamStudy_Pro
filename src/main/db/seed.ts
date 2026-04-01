import type Database from 'better-sqlite3'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ExamTier } from '../../shared/types'
import { initSchema, getQuestionsCount, seedQuestions } from './queries'

type HintRecord = {
  hint: string
  explanation: string
  mnemonic: string
  why_wrong?: string[]
}

type HintMap = Record<string, HintRecord>

type JsonPoolQuestion = {
  id: string
  correct: number
  refs: string
  question: string
  answers: string[]
}

// TASK: Parse the FCC question ID into a sub-element and group identifier.
// HOW CODE SOLVES: Uses the consistent ID structure (e.g., `T1A01`) where
//                   id[0]=tier letter, id[1]=sub-element digit, id[2]=group letter.
function parseIdToSubElementAndGroup(id: string): { subElement: string; groupId: string } {
  // Examples: T1A01 -> subElement=T1, groupId=T1A
  const tierLetter = id[0] as 'T' | 'G' | 'E'
  const subDigit = id[1]
  const groupLetter = id[2]
  return {
    subElement: `${tierLetter}${subDigit}`,
    groupId: `${tierLetter}${subDigit}${groupLetter}`,
  }
}

// TASK: Seed the SQLite DB from the offline FCC JSON pools (idempotent).
// HOW CODE SOLVES: Ensures schema exists, checks if the DB already has questions,
//                   then imports all JSON records using INSERT OR IGNORE to avoid duplicates.
export async function seedQuestionsIfNeeded(db: Database.Database): Promise<void> {
  initSchema(db)

  const existing = getQuestionsCount(db)
  if (existing > 0) return

  const technicianPath = join(process.cwd(), 'data', 'technician.json')
  const generalPath = join(process.cwd(), 'data', 'general.json')
  const extraPath = join(process.cwd(), 'data', 'extra.json')

  const [technicianRaw, generalRaw, extraRaw] = await Promise.all([
    readFile(technicianPath, 'utf8'),
    readFile(generalPath, 'utf8'),
    readFile(extraPath, 'utf8'),
  ])

  const technician = JSON.parse(technicianRaw) as JsonPoolQuestion[]
  const general = JSON.parse(generalRaw) as JsonPoolQuestion[]
  const extra = JSON.parse(extraRaw) as JsonPoolQuestion[]

  const all: Array<{
    id: string
    examTier: ExamTier
    subElement: string
    groupId: string
    questionText: string
    answers: string[]
    correctIndex: number
    refs: string
  }> = []

  for (const q of technician) {
    const { subElement, groupId } = parseIdToSubElementAndGroup(q.id)
    all.push({
      id: q.id,
      examTier: 'technician',
      subElement,
      groupId,
      questionText: q.question,
      answers: q.answers,
      correctIndex: q.correct,
      refs: q.refs,
    })
  }

  for (const q of general) {
    const { subElement, groupId } = parseIdToSubElementAndGroup(q.id)
    all.push({
      id: q.id,
      examTier: 'general',
      subElement,
      groupId,
      questionText: q.question,
      answers: q.answers,
      correctIndex: q.correct,
      refs: q.refs,
    })
  }

  for (const q of extra) {
    const { subElement, groupId } = parseIdToSubElementAndGroup(q.id)
    all.push({
      id: q.id,
      examTier: 'extra',
      subElement,
      groupId,
      questionText: q.question,
      answers: q.answers,
      correctIndex: q.correct,
      refs: q.refs,
    })
  }

  seedQuestions(db, all)
}

// TASK: Apply authored hint/explanation/mnemonic content from JSON files to the questions table.
// HOW CODE SOLVES: Runs on every startup (not just first-run) so edits to the hint JSON files
//                  take effect after an app restart. Only writes non-empty values, leaving DB
//                  columns untouched when a field is blank (allows partial authoring).
export async function applyHintsIfPresent(db: Database.Database): Promise<void> {
  const tiers: Array<{ file: string }> = [
    { file: 'technician' },
    { file: 'general' },
    { file: 'extra' },
  ]

  const updateStmt = db.prepare<{
    id: string
    hint: string
    explanation: string
    mnemonic: string
    why_wrong_cache: string | null
  }>(
    `UPDATE questions
        SET hint_cache        = CASE WHEN @hint        != '' THEN @hint        ELSE hint_cache        END,
            explanation_cache = CASE WHEN @explanation != '' THEN @explanation ELSE explanation_cache END,
            mnemonic          = CASE WHEN @mnemonic    != '' THEN @mnemonic    ELSE mnemonic          END,
            why_wrong_cache   = CASE WHEN @why_wrong_cache IS NOT NULL THEN @why_wrong_cache ELSE why_wrong_cache END
      WHERE id = @id`,
  )

  const applyAll = db.transaction((hintMap: HintMap) => {
    for (const [id, record] of Object.entries(hintMap)) {
      // TASK: Serialize why_wrong array to JSON for the TEXT column, skip if not provided.
      // HOW CODE SOLVES: Only writes why_wrong_cache when the field is present and has
      //                  at least one non-empty entry so partial authoring doesn't erase data.
      const hasWrongContent = Array.isArray(record.why_wrong) && record.why_wrong.some((s) => s)
      updateStmt.run({
        id,
        hint: record.hint ?? '',
        explanation: record.explanation ?? '',
        mnemonic: record.mnemonic ?? '',
        why_wrong_cache: hasWrongContent ? JSON.stringify(record.why_wrong) : null,
      })
    }
  })

  for (const { file } of tiers) {
    const hintPath = join(process.cwd(), 'data', 'hints', `${file}.json`)
    try {
      const raw = await readFile(hintPath, 'utf8')
      const hintMap = JSON.parse(raw) as HintMap
      applyAll(hintMap)
    } catch {
      // ISSUE: Hint file may not exist yet (e.g., in CI or early dev environments).
      // FIX APPLIED: Skip silently — missing hint files are not a fatal startup error.
    }
  }
}

