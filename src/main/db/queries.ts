import type Database from 'better-sqlite3'
import type {
  AccuracyHeatmapData,
  ChatMessage,
  DailyChallengeEvent,
  EarnedBadge,
  ExamTier,
  MasteryState,
  ProgressionLevelTitle,
  ProgressionTrendData,
  Question,
  QuestionBrowserDetail,
  QuestionBrowserRow,
  RecentAnswerActivity,
  SRSCard,
  Session,
  TierProgressStats,
  UserProgressionSummary,
  UserAnswer,
  UserSettings,
} from '../../shared/types'
import { BADGE_DEFINITIONS, XP_LEVEL_TITLES, XP_THRESHOLDS } from '../../shared/constants'

type Db = Database.Database

type DbQuestionSeed = {
  id: string
  examTier: ExamTier
  subElement: string
  groupId: string
  questionText: string
  answers: string[]
  correctIndex: number
  refs: string
}

type DbQuestionRow = {
  id: string
  exam_tier: ExamTier
  sub_element: string
  group_id: string
  question_text: string
  answers: string
  correct_index: number
  refs: string
  hint_cache: string | null
  explanation_cache: string | null
  mnemonic: string | null
  why_wrong_cache: string | null
  starred: number | null
  flagged: number | null
}

type DbQuestionBrowserRow = {
  id: string
  exam_tier: ExamTier
  sub_element: string
  group_id: string
  question_text: string
  refs: string
  starred: number | null
  flagged: number | null
  attempts: number
  correct_answers: number
}

export type QuestionSearchFilter = {
  query: string
  tier?: ExamTier
  limit?: number
}

export type WeakAreaPoolFilter = {
  tier: ExamTier
  limit?: number
  recentAnswers?: number
  weakSubElements?: number
}

export type CustomQuizPoolFilter = {
  tier: ExamTier
  subElements?: string[]
  limit?: number
}

export type QuestionBrowserFilter = {
  tier: ExamTier
  query?: string
  subElement?: string
  starredOnly?: boolean
  flaggedOnly?: boolean
  mastery?: MasteryState
  limit?: number
}

export type UpdateQuestionReviewStateInput = {
  questionId: string
  starred?: boolean
  flagged?: boolean
}

export type QuestionBrowserDetailFilter = {
  questionId: string
  recentLimit?: number
}

export type ProgressAnswerInput = {
  questionId: string
  selectedIndex: number
  isCorrect: boolean
  timeTakenMs: number
  sessionId: string
  answeredAt?: string
}

export type ProgressStats = {
  totalAnswers: number
  correctAnswers: number
  accuracyPct: number
  uniqueQuestionsAnswered: number
}

export type TierProgressStatsQuery = TierProgressStats[]

export type SessionHistoryFilter = {
  limit?: number
}

export type RecentAnswerActivityFilter = {
  limit?: number
}

export type DueSrsQueueFilter = {
  tier: ExamTier
  limit?: number
}

export type RecordSrsReviewInput = {
  questionId: string
  isCorrect: boolean
  reviewedAt?: string
}

export type ProgressionSummaryFilter = {
  streakGraceHours?: number
}

export type ProgressionTrendFilter = {
  days?: number
  streakGraceHours?: number
  tier?: 'all' | ExamTier
}

export type DailyChallengeEventFilter = {
  limit?: number
}

export type AccuracyHeatmapFilter = {
  tier?: 'all' | ExamTier
  minAttempts?: number
  limit?: number
}

export type UpsertSettingsInput = Pick<
  UserSettings,
  'theme' | 'visualTheme' | 'dailyGoalMinutes' | 'aiProvider' | 'textSize' | 'voiceId' | 'voiceRate'
>

export type ResetAppDataResult = {
  clearedAnswers: number
  clearedSessions: number
  clearedSrsCards: number
  resetQuestionReviewState: number
  clearedSettings: number
}

export type SaveChatMessageInput = {
  id: string
  role: ChatMessage['role']
  content: string
  provider: NonNullable<UserSettings['aiProvider']>
  questionId?: string
  timestamp?: string
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function deriveMasteryState(attempts: number, accuracyPct: number): Exclude<MasteryState, 'all'> {
  if (attempts === 0) return 'unseen'
  if (attempts >= 8 && accuracyPct >= 90) return 'mastered'
  if (attempts >= 3 && accuracyPct >= 70) return 'known'
  return 'learning'
}

// TASK: Normalize daily-goal minutes to a safe user-facing range.
// HOW CODE SOLVES: Clamps values to [5, 180] and falls back to default 20
//                  when payloads are missing, NaN, or invalid.
function sanitizeDailyGoalMinutes(value: number): number {
  if (!Number.isFinite(value)) {
    return 20
  }

  return Math.min(180, Math.max(5, Math.round(value)))
}

function sanitizeVisualTheme(value: unknown): UserSettings['visualTheme'] {
  if (value === 'signal-lab' || value === 'field-manual' || value === 'ocean-chart') {
    return value
  }

  return 'ocean-chart'
}

// TASK: Normalize voice playback rate to a safe range for speech synthesis.
// HOW CODE SOLVES: Clamps values to [0.5, 2] and defaults to 1.0 when invalid.
function sanitizeVoiceRate(value: number): number {
  if (!Number.isFinite(value)) {
    return 1
  }

  return Math.min(2, Math.max(0.5, Number(value.toFixed(2))))
}

// TASK: Ensure newer review-state columns exist on legacy DBs.
// HOW CODE SOLVES: Uses PRAGMA introspection + conditional ALTER statements
//                  so existing databases migrate without destructive resets.
function ensureQuestionReviewColumns(db: Db): void {
  const columnRows = db.prepare(`PRAGMA table_info(questions)`).all() as Array<{ name: string }>
  const columnNames = new Set(columnRows.map((row) => row.name))

  if (!columnNames.has('starred')) {
    db.exec(`ALTER TABLE questions ADD COLUMN starred INTEGER NOT NULL DEFAULT 0`)
  }

  if (!columnNames.has('flagged')) {
    db.exec(`ALTER TABLE questions ADD COLUMN flagged INTEGER NOT NULL DEFAULT 0`)
  }
}

// TASK: Ensure settings schema remains forward-compatible on existing DBs.
// HOW CODE SOLVES: Adds newer settings columns conditionally so users can
//                  adopt new preferences without destructive migrations.
function ensureUserSettingsColumns(db: Db): void {
  const columnRows = db.prepare(`PRAGMA table_info(user_settings)`).all() as Array<{ name: string }>
  const columnNames = new Set(columnRows.map((row) => row.name))

  if (!columnNames.has('visual_theme')) {
    db.exec(`ALTER TABLE user_settings ADD COLUMN visual_theme TEXT NOT NULL DEFAULT 'ocean-chart'`)
  }

  if (!columnNames.has('voice_id')) {
    db.exec(`ALTER TABLE user_settings ADD COLUMN voice_id TEXT`)
  }

  if (!columnNames.has('voice_rate')) {
    db.exec(`ALTER TABLE user_settings ADD COLUMN voice_rate REAL NOT NULL DEFAULT 1.0`)
  }
}

// TASK: Convert seed data to a DB parameter map.
// HOW CODE SOLVES: Keeps parameter names consistent with the SQL statement,
//                   and performs JSON serialization for `answers`.
function questionToDbRow(q: DbQuestionSeed): Record<string, unknown> {
  return {
    id: q.id,
    exam_tier: q.examTier,
    sub_element: q.subElement,
    group_id: q.groupId,
    question_text: q.questionText,
    answers: JSON.stringify(q.answers),
    correct_index: q.correctIndex,
    refs: q.refs,
    hint_cache: null,
    explanation_cache: null,
    mnemonic: null,
    why_wrong_cache: null,
  }
}

// TASK: Convert a DB row into the shared `Question` model.
// HOW CODE SOLVES: Performs a single normalized mapping and JSON parse so
//                   all question query functions return consistent shape.
function mapDbQuestionRow(row: DbQuestionRow): Question {
  return {
    id: row.id,
    examTier: row.exam_tier,
    subElement: row.sub_element,
    groupId: row.group_id,
    questionText: row.question_text,
    answers: JSON.parse(row.answers) as string[],
    correctIndex: row.correct_index,
    refs: row.refs,
    hint: row.hint_cache ?? undefined,
    explanation: row.explanation_cache ?? undefined,
    mnemonic: row.mnemonic ?? undefined,
    // TASK: Deserialize per-answer wrong-choice explanations from the DB TEXT column.
    // HOW CODE SOLVES: why_wrong_cache stores a JSON array; parse it back to string[]
    //                  so ExplanationPanel can index into it by answer position.
    whyWrong: row.why_wrong_cache ? (JSON.parse(row.why_wrong_cache) as string[]) : undefined,
    starred: Boolean(row.starred ?? 0),
    flagged: Boolean(row.flagged ?? 0),
  }
}

// TASK: Initialize SQLite schema used by the app.
// HOW CODE SOLVES: Centralizes CREATE TABLE statements to ensure consistent
//                   schema for both seeding and runtime query functions.
export function initSchema(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      exam_tier TEXT NOT NULL,
      sub_element TEXT NOT NULL,
      group_id TEXT NOT NULL,
      question_text TEXT NOT NULL,
      answers TEXT NOT NULL,
      correct_index INTEGER NOT NULL,
      refs TEXT NOT NULL,
      hint_cache TEXT,
      explanation_cache TEXT,
      mnemonic TEXT,
      why_wrong_cache TEXT,
      starred INTEGER NOT NULL DEFAULT 0,
      flagged INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_questions_exam_tier ON questions(exam_tier);
    CREATE INDEX IF NOT EXISTS idx_questions_sub_element ON questions(sub_element);
    CREATE INDEX IF NOT EXISTS idx_questions_group_id ON questions(group_id);

    CREATE TABLE IF NOT EXISTS user_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id TEXT NOT NULL,
      selected_index INTEGER NOT NULL,
      is_correct INTEGER NOT NULL,
      time_taken_ms INTEGER NOT NULL,
      answered_at TEXT NOT NULL,
      session_id TEXT NOT NULL,
      FOREIGN KEY(question_id) REFERENCES questions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_user_answers_question_id ON user_answers(question_id);
    CREATE INDEX IF NOT EXISTS idx_user_answers_answered_at ON user_answers(answered_at);
    CREATE INDEX IF NOT EXISTS idx_user_answers_session_id ON user_answers(session_id);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      mode TEXT NOT NULL,
      exam_tier TEXT NOT NULL,
      score INTEGER NOT NULL,
      total_questions INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);

    CREATE TABLE IF NOT EXISTS srs_cards (
      question_id TEXT PRIMARY KEY,
      interval INTEGER NOT NULL,
      ease_factor REAL NOT NULL,
      next_review TEXT NOT NULL,
      repetitions INTEGER NOT NULL,
      FOREIGN KEY(question_id) REFERENCES questions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_srs_cards_next_review ON srs_cards(next_review);

    CREATE TABLE IF NOT EXISTS user_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      theme TEXT NOT NULL,
      visual_theme TEXT NOT NULL DEFAULT 'ocean-chart',
      daily_goal_minutes INTEGER NOT NULL,
      ai_provider TEXT,
      text_size TEXT NOT NULL,
      voice_id TEXT,
      voice_rate REAL NOT NULL DEFAULT 1.0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_challenge_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      learning_day TEXT NOT NULL UNIQUE,
      completed_at TEXT NOT NULL,
      challenge_target INTEGER NOT NULL,
      bonus_xp INTEGER NOT NULL,
      answers_at_completion INTEGER NOT NULL,
      streak_days_at_completion INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_daily_challenge_events_completed_at
      ON daily_challenge_events(completed_at DESC);

    CREATE TABLE IF NOT EXISTS chat_history (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      provider TEXT NOT NULL,
      question_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(question_id) REFERENCES questions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_chat_history_created_at
      ON chat_history(created_at DESC);

    CREATE TABLE IF NOT EXISTS user_mnemonics (
      question_id TEXT PRIMARY KEY,
      mnemonic TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(question_id) REFERENCES questions(id)
    );
  `)

  ensureQuestionReviewColumns(db)
  ensureUserSettingsColumns(db)

  // TASK: Add why_wrong_cache column to existing DBs that predate this field.
  // HOW CODE SOLVES: ALTER TABLE ADD COLUMN is idempotent via try/catch — SQLite
  //                  throws if the column already exists, which we safely ignore.
  try {
    db.exec('ALTER TABLE questions ADD COLUMN why_wrong_cache TEXT')
  } catch {
    // Column already exists — no action needed.
  }
}

// TASK: Determine whether questions have been seeded already.
// HOW CODE SOLVES: Allows idempotent seeding by skipping INSERTs when
//                   the `questions` table is already populated.
export function getQuestionsCount(db: Db): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM questions').get() as { count: number }
  return row.count
}

// TASK: Insert or ignore question records from the FCC JSON pool.
// HOW CODE SOLVES: Uses `INSERT OR IGNORE` keyed by `id` to guarantee
//                   seeding is idempotent across app reinstall/rehydration.
export function seedQuestions(db: Db, questions: DbQuestionSeed[]): void {
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO questions (
      id, exam_tier, sub_element, group_id, question_text,
      answers, correct_index, refs, hint_cache, explanation_cache, mnemonic, why_wrong_cache
    ) VALUES (
      @id, @exam_tier, @sub_element, @group_id, @question_text,
      @answers, @correct_index, @refs, @hint_cache, @explanation_cache, @mnemonic, @why_wrong_cache
    );
  `)

  const transaction = db.transaction((rows: DbQuestionSeed[]) => {
    for (const q of rows) {
      insertStmt.run(questionToDbRow(q))
    }
  })

  transaction(questions)
}

// TASK: Fetch a pool of questions filtered by exam tier.
// HOW CODE SOLVES: Returns a typed `Question[]` for renderer consumption,
//                   converting the stored `answers` JSON string back to string[].
export function getQuestionPool(db: Db, tier: ExamTier): Question[] {
  const rows = db
    .prepare(
      `
      SELECT
        id,
        exam_tier,
        sub_element,
        group_id,
        question_text,
        answers,
        correct_index,
        refs,
        hint_cache,
        explanation_cache,
        mnemonic,
        why_wrong_cache,
        starred,
        flagged
      FROM questions
      WHERE exam_tier = ?
      ORDER BY id ASC
      `,
    )
    .all(tier) as DbQuestionRow[]

  return rows.map(mapDbQuestionRow)
}

// TASK: Fetch a single question by its stable FCC ID.
// HOW CODE SOLVES: Queries by primary key and maps to the shared type for
//                   renderer detail views and direct lookup workflows.
export function getQuestionById(db: Db, questionId: string): Question | null {
  const row = db
    .prepare(
      `
      SELECT
        id,
        exam_tier,
        sub_element,
        group_id,
        question_text,
        answers,
        correct_index,
        refs,
        hint_cache,
        explanation_cache,
        mnemonic,
        why_wrong_cache,
        starred,
        flagged
      FROM questions
      WHERE id = ?
      LIMIT 1
      `,
    )
    .get(questionId) as DbQuestionRow | undefined

  return row ? mapDbQuestionRow(row) : null
}

// TASK: Search the question bank by ID/text/reference fields.
// HOW CODE SOLVES: Uses parameterized LIKE filters with optional exam-tier
//                   scope and a bounded result limit for responsive UI queries.
export function searchQuestions(db: Db, filter: QuestionSearchFilter): Question[] {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200)
  const term = `%${filter.query.trim()}%`

  const baseSelect = `
    SELECT
      id,
      exam_tier,
      sub_element,
      group_id,
      question_text,
      answers,
      correct_index,
      refs,
      hint_cache,
      explanation_cache,
      mnemonic,
      starred,
      flagged
    FROM questions
  `

  const whereSearch = `
    (id LIKE @term OR question_text LIKE @term OR refs LIKE @term OR sub_element LIKE @term OR group_id LIKE @term)
  `

  const rows = filter.tier
    ? (db
        .prepare(
          `${baseSelect} WHERE exam_tier = @tier AND ${whereSearch} ORDER BY id ASC LIMIT @limit`,
        )
        .all({ term, tier: filter.tier, limit }) as DbQuestionRow[])
    : (db
        .prepare(`${baseSelect} WHERE ${whereSearch} ORDER BY id ASC LIMIT @limit`)
        .all({ term, limit }) as DbQuestionRow[])

  return rows.map(mapDbQuestionRow)
}

// TASK: Return a question pool biased toward weakest-performing sub-elements.
// HOW CODE SOLVES: Computes recent per-sub-element accuracy from `user_answers`
//                  joined with `questions`, prioritizes the lowest-accuracy groups,
//                  and falls back to a normal tier pool when history is insufficient.
export function getWeakAreaQuestionPool(db: Db, filter: WeakAreaPoolFilter): Question[] {
  const limit = Math.min(Math.max(filter.limit ?? 35, 1), 100)
  const recentAnswers = Math.min(Math.max(filter.recentAnswers ?? 200, 20), 2000)
  const weakSubElements = Math.min(Math.max(filter.weakSubElements ?? 4, 1), 12)

  const rows = db
    .prepare(
      `
      WITH recent AS (
        SELECT ua.is_correct, q.sub_element
        FROM user_answers ua
        JOIN questions q ON q.id = ua.question_id
        WHERE q.exam_tier = @tier
        ORDER BY ua.answered_at DESC
        LIMIT @recent_answers
      ),
      weak AS (
        SELECT
          sub_element,
          AVG(is_correct * 1.0) AS accuracy,
          COUNT(*) AS attempts
        FROM recent
        GROUP BY sub_element
        ORDER BY accuracy ASC, attempts DESC
        LIMIT @weak_sub_elements
      )
      SELECT
        q.id,
        q.exam_tier,
        q.sub_element,
        q.group_id,
        q.question_text,
        q.answers,
        q.correct_index,
        q.refs,
        q.hint_cache,
        q.explanation_cache,
        q.mnemonic,
        q.why_wrong_cache,
        q.starred,
        q.flagged
      FROM questions q
      WHERE q.exam_tier = @tier
        AND (
          (SELECT COUNT(*) FROM weak) = 0
          OR q.sub_element IN (SELECT sub_element FROM weak)
        )
      ORDER BY q.id ASC
      LIMIT @limit
      `,
    )
    .all({
      tier: filter.tier,
      recent_answers: recentAnswers,
      weak_sub_elements: weakSubElements,
      limit,
    }) as DbQuestionRow[]

  return rows.map(mapDbQuestionRow)
}

// TASK: Return a randomized custom quiz pool from selected filters.
// HOW CODE SOLVES: Applies required exam-tier filter, optional sub-element
//                  constraints, and bounded question count in one query.
export function getCustomQuizQuestionPool(db: Db, filter: CustomQuizPoolFilter): Question[] {
  const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100)
  const subElements = Array.from(
    new Set((filter.subElements ?? []).map((s) => s.trim()).filter((s) => s.length > 0)),
  ).slice(0, 30)

  const subElementClause =
    subElements.length > 0 ? ` AND sub_element IN (${subElements.map(() => '?').join(', ')})` : ''

  const sql = `
    SELECT
      id,
      exam_tier,
      sub_element,
      group_id,
      question_text,
      answers,
      correct_index,
      refs,
      hint_cache,
      explanation_cache,
      mnemonic,
      starred,
      flagged
    FROM questions
    WHERE exam_tier = ?${subElementClause}
    ORDER BY RANDOM()
    LIMIT ?
  `

  const params: Array<string | number> = [filter.tier, ...subElements, limit]
  const rows = db.prepare(sql).all(...params) as DbQuestionRow[]

  return rows.map(mapDbQuestionRow)
}

// TASK: Return filtered browser rows including review-state and mastery summary data.
// HOW CODE SOLVES: Joins per-question answer aggregates for attempts/accuracy,
//                  applies list filters, and derives mastery categories.
export function getQuestionBrowserRows(db: Db, filter: QuestionBrowserFilter): QuestionBrowserRow[] {
  const limit = Math.min(Math.max(filter.limit ?? 500, 1), 1200)
  const params: Record<string, string | number> = { tier: filter.tier, limit }

  const whereParts = ['q.exam_tier = @tier']

  const normalizedQuery = filter.query?.trim() ?? ''
  if (normalizedQuery.length > 0) {
    whereParts.push(
      '(q.id LIKE @term OR q.question_text LIKE @term OR q.refs LIKE @term OR q.sub_element LIKE @term OR q.group_id LIKE @term)',
    )
    params.term = `%${normalizedQuery}%`
  }

  if (filter.subElement && filter.subElement !== 'all') {
    whereParts.push('q.sub_element = @sub_element')
    params.sub_element = filter.subElement
  }

  if (filter.starredOnly) {
    whereParts.push('q.starred = 1')
  }

  if (filter.flaggedOnly) {
    whereParts.push('q.flagged = 1')
  }

  const rows = db
    .prepare(
      `
      SELECT
        q.id,
        q.exam_tier,
        q.sub_element,
        q.group_id,
        q.question_text,
        q.refs,
        q.starred,
        q.flagged,
        COALESCE(stats.attempts, 0) AS attempts,
        COALESCE(stats.correct_answers, 0) AS correct_answers
      FROM questions q
      LEFT JOIN (
        SELECT
          question_id,
          COUNT(*) AS attempts,
          SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct_answers
        FROM user_answers
        GROUP BY question_id
      ) stats ON stats.question_id = q.id
      WHERE ${whereParts.join(' AND ')}
      ORDER BY q.id ASC
      LIMIT @limit
      `,
    )
    .all(params) as DbQuestionBrowserRow[]

  const mapped = rows.map((row) => {
    const accuracyPct = row.attempts > 0 ? Number(((row.correct_answers / row.attempts) * 100).toFixed(2)) : 0
    const masteryState = deriveMasteryState(row.attempts, accuracyPct)

    return {
      id: row.id,
      examTier: row.exam_tier,
      subElement: row.sub_element,
      groupId: row.group_id,
      questionText: row.question_text,
      refs: row.refs,
      starred: Boolean(row.starred ?? 0),
      flagged: Boolean(row.flagged ?? 0),
      attempts: row.attempts,
      correctAnswers: row.correct_answers,
      accuracyPct,
      masteryState,
    }
  })

  const masteryFilter = filter.mastery ?? 'all'
  if (masteryFilter === 'all') {
    return mapped
  }

  return mapped.filter((row) => row.masteryState === masteryFilter)
}

// TASK: Persist starred/flagged review state for a specific question.
// HOW CODE SOLVES: Updates requested fields atomically and returns the refreshed question row.
export function updateQuestionReviewState(db: Db, input: UpdateQuestionReviewStateInput): Question {
  const starredValue = typeof input.starred === 'boolean' ? (input.starred ? 1 : 0) : null
  const flaggedValue = typeof input.flagged === 'boolean' ? (input.flagged ? 1 : 0) : null

  db.prepare(
    `
    UPDATE questions
    SET
      starred = COALESCE(@starred, starred),
      flagged = COALESCE(@flagged, flagged)
    WHERE id = @question_id
    `,
  ).run({
    starred: starredValue,
    flagged: flaggedValue,
    question_id: input.questionId,
  })

  const updated = getQuestionById(db, input.questionId)
  if (!updated) {
    throw new Error(`Question not found for id ${input.questionId}.`)
  }

  return updated
}

// TASK: Return rich browser detail payload with explanation/history/SRS status.
// HOW CODE SOLVES: Combines question metadata, recent answer events,
//                  aggregate history, and current SRS card into one read model.
export function getQuestionBrowserDetail(db: Db, filter: QuestionBrowserDetailFilter): QuestionBrowserDetail | null {
  const question = getQuestionById(db, filter.questionId)
  if (!question) {
    return null
  }

  const recentLimit = Math.min(Math.max(filter.recentLimit ?? 8, 1), 25)

  const recentAnswers = db
    .prepare(
      `
      SELECT id, question_id, selected_index, is_correct, time_taken_ms, answered_at, session_id
      FROM user_answers
      WHERE question_id = ?
      ORDER BY answered_at DESC
      LIMIT ?
      `,
    )
    .all(filter.questionId, recentLimit) as Array<{
    id: number
    question_id: string
    selected_index: number
    is_correct: number
    time_taken_ms: number
    answered_at: string
    session_id: string
  }>

  const historySummaryRow = db
    .prepare(
      `
      SELECT
        COUNT(*) AS attempts,
        COALESCE(SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct_answers,
        COALESCE(AVG(time_taken_ms), 0) AS avg_time_ms,
        MAX(answered_at) AS last_answered_at
      FROM user_answers
      WHERE question_id = ?
      `,
    )
    .get(filter.questionId) as {
    attempts: number
    correct_answers: number
    avg_time_ms: number
    last_answered_at: string | null
  }

  const srsRow = db
    .prepare(
      `
      SELECT question_id, interval, ease_factor, next_review, repetitions
      FROM srs_cards
      WHERE question_id = ?
      LIMIT 1
      `,
    )
    .get(filter.questionId) as
    | {
        question_id: string
        interval: number
        ease_factor: number
        next_review: string
        repetitions: number
      }
    | undefined

  const historyAccuracy =
    historySummaryRow.attempts > 0
      ? Number(((historySummaryRow.correct_answers / historySummaryRow.attempts) * 100).toFixed(2))
      : 0

  return {
    question,
    srsCard: srsRow
      ? {
          questionId: srsRow.question_id,
          interval: srsRow.interval,
          easeFactor: srsRow.ease_factor,
          nextReview: srsRow.next_review,
          repetitions: srsRow.repetitions,
        }
      : null,
    historySummary: {
      attempts: historySummaryRow.attempts,
      correctAnswers: historySummaryRow.correct_answers,
      accuracyPct: historyAccuracy,
      averageTimeMs: Number(historySummaryRow.avg_time_ms.toFixed(2)),
      lastAnsweredAt: historySummaryRow.last_answered_at,
    },
    recentAnswers: recentAnswers.map((row) => ({
      id: row.id,
      questionId: row.question_id,
      selectedIndex: row.selected_index,
      isCorrect: row.is_correct === 1,
      timeTakenMs: row.time_taken_ms,
      answeredAt: row.answered_at,
      sessionId: row.session_id,
    })),
  }
}

// TASK: Persist a user answer event for stats and history views.
// HOW CODE SOLVES: Inserts an immutable answer row with UTC timestamp and
//                   returns the saved record in shared type format.
export function saveUserAnswer(db: Db, input: ProgressAnswerInput): UserAnswer {
  const answeredAt = input.answeredAt ?? new Date().toISOString()
  const result = db
    .prepare(
      `
      INSERT INTO user_answers (
        question_id,
        selected_index,
        is_correct,
        time_taken_ms,
        answered_at,
        session_id
      ) VALUES (?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      input.questionId,
      input.selectedIndex,
      input.isCorrect ? 1 : 0,
      input.timeTakenMs,
      answeredAt,
      input.sessionId,
    )

  // Keep challenge-event persistence best-effort so progress saves never fail.
  try {
    recordDailyChallengeCompletionIfNeeded(db, answeredAt)
  } catch {
    // no-op
  }

  return {
    id: Number(result.lastInsertRowid),
    questionId: input.questionId,
    selectedIndex: input.selectedIndex,
    isCorrect: input.isCorrect,
    timeTakenMs: input.timeTakenMs,
    answeredAt,
    sessionId: input.sessionId,
  }
}

function recordDailyChallengeCompletionIfNeeded(db: Db, answeredAtIso: string): void {
  const dailyChallengeTarget = 10
  const dailyChallengeBonusXp = 50
  const streakGraceHours = 2
  const learningTimeModifier = `-${streakGraceHours} hours`
  const answeredAtDate = new Date(answeredAtIso)
  const normalizedAnsweredAt = Number.isNaN(answeredAtDate.getTime()) ? new Date().toISOString() : answeredAtDate.toISOString()
  const learningDay = toLearningDayKey(new Date(normalizedAnsweredAt), streakGraceHours)

  const existing = db
    .prepare(
      `
      SELECT id
      FROM daily_challenge_events
      WHERE learning_day = ?
      LIMIT 1
      `,
    )
    .get(learningDay) as { id: number } | undefined

  if (existing) {
    return
  }

  const dayCountRow = db
    .prepare(
      `
      SELECT COUNT(*) AS answers
      FROM user_answers
      WHERE date(datetime(answered_at, ?)) = ?
      `,
    )
    .get(learningTimeModifier, learningDay) as { answers: number }

  if (dayCountRow.answers < dailyChallengeTarget) {
    return
  }

  const activeDayRows = db
    .prepare(
      `
      SELECT DISTINCT date(datetime(answered_at, ?)) AS learning_day
      FROM user_answers
      WHERE datetime(answered_at) <= datetime(?)
      `,
    )
    .all(learningTimeModifier, normalizedAnsweredAt) as Array<{ learning_day: string }>

  const activeDays = new Set(activeDayRows.map((row) => row.learning_day))
  const streakDaysAtCompletion = computeCurrentStreak(activeDays, learningDay)

  db.prepare(
    `
    INSERT INTO daily_challenge_events (
      learning_day,
      completed_at,
      challenge_target,
      bonus_xp,
      answers_at_completion,
      streak_days_at_completion
    ) VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(
    learningDay,
    normalizedAnsweredAt,
    dailyChallengeTarget,
    dailyChallengeBonusXp,
    dayCountRow.answers,
    streakDaysAtCompletion,
  )
}

// TASK: Provide aggregate progress stats for dashboard widgets.
// HOW CODE SOLVES: Computes answer totals, correctness, and unique question
//                   coverage from persisted `user_answers` rows.
export function getProgressStats(db: Db): ProgressStats {
  const row = db
    .prepare(
      `
      SELECT
        COUNT(*) AS total_answers,
        COALESCE(SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct_answers,
        COUNT(DISTINCT question_id) AS unique_questions_answered
      FROM user_answers
      `,
    )
    .get() as {
    total_answers: number
    correct_answers: number
    unique_questions_answered: number
  }

  const accuracyPct = row.total_answers > 0 ? Number(((row.correct_answers / row.total_answers) * 100).toFixed(2)) : 0

  return {
    totalAnswers: row.total_answers,
    correctAnswers: row.correct_answers,
    accuracyPct,
    uniqueQuestionsAnswered: row.unique_questions_answered,
  }
}

// TASK: Provide per-tier aggregate stats for calibrated readiness scoring.
// HOW CODE SOLVES: Aggregates answers and coverage by exam tier using joins
//                  against full question pool counts for deterministic percentages.
export function getTierProgressStats(db: Db): TierProgressStatsQuery {
  const rows = db
    .prepare(
      `
      SELECT
        q.exam_tier,
        COUNT(ua.id) AS total_answers,
        COALESCE(SUM(CASE WHEN ua.is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct_answers,
        COUNT(DISTINCT ua.question_id) AS unique_questions_answered,
        COUNT(DISTINCT q.id) AS total_questions
      FROM questions q
      LEFT JOIN user_answers ua ON ua.question_id = q.id
      GROUP BY q.exam_tier
      ORDER BY q.exam_tier ASC
      `,
    )
    .all() as Array<{
    exam_tier: ExamTier
    total_answers: number
    correct_answers: number
    unique_questions_answered: number
    total_questions: number
  }>

  return rows.map((row) => {
    const accuracyPct = row.total_answers > 0 ? Number(((row.correct_answers / row.total_answers) * 100).toFixed(2)) : 0
    const coveragePct = row.total_questions > 0 ? Number(((row.unique_questions_answered / row.total_questions) * 100).toFixed(2)) : 0

    return {
      tier: row.exam_tier,
      totalAnswers: row.total_answers,
      correctAnswers: row.correct_answers,
      accuracyPct,
      uniqueQuestionsAnswered: row.unique_questions_answered,
      totalQuestions: row.total_questions,
      coveragePct,
    }
  })
}

function toLearningDayKey(date: Date, graceHours: number): string {
  const shifted = new Date(date.getTime() - graceHours * 60 * 60 * 1000)
  return shifted.toISOString().slice(0, 10)
}

function computeCurrentStreak(activeDays: Set<string>, todayKey: string): number {
  if (activeDays.size === 0) {
    return 0
  }

  let streak = 0
  let cursor = new Date(`${todayKey}T00:00:00.000Z`)

  while (true) {
    const cursorKey = cursor.toISOString().slice(0, 10)
    if (!activeDays.has(cursorKey)) {
      break
    }

    streak += 1
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000)
  }

  return streak
}

function computeLongestStreak(dayKeys: string[]): number {
  if (dayKeys.length === 0) {
    return 0
  }

  const sorted = [...dayKeys].sort((a, b) => a.localeCompare(b))
  let longest = 1
  let current = 1

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = new Date(`${sorted[i - 1]}T00:00:00.000Z`).getTime()
    const next = new Date(`${sorted[i]}T00:00:00.000Z`).getTime()
    const diffDays = Math.round((next - prev) / (24 * 60 * 60 * 1000))

    if (diffDays === 1) {
      current += 1
      if (current > longest) {
        longest = current
      }
    } else {
      current = 1
    }
  }

  return longest
}

function resolveLevelByXp(totalXp: number): { levelIndex: number; levelTitle: ProgressionLevelTitle } {
  let levelIndex = 0

  for (let i = 0; i < XP_THRESHOLDS.length; i += 1) {
    if (totalXp >= XP_THRESHOLDS[i]) {
      levelIndex = i
    }
  }

  return {
    levelIndex,
    levelTitle: XP_LEVEL_TITLES[levelIndex],
  }
}

// TASK: Compute user progression metrics (XP, level, streak) from persisted history.
// HOW CODE SOLVES: Aggregates correctness + activity days from `user_answers`,
//                  applies deterministic XP/level thresholds, and computes streaks
//                  using a grace-window day boundary.
export function getUserProgressionSummary(db: Db, filter?: ProgressionSummaryFilter): UserProgressionSummary {
  const dailyChallengeTarget = 10
  const dailyChallengeXpBonusValue = 50

  const streakGraceHours = Math.min(Math.max(filter?.streakGraceHours ?? 2, 0), 6)
  const learningTimeModifier = `-${streakGraceHours} hours`

  const statsRow = db
    .prepare(
      `
      SELECT
        COUNT(*) AS total_answers,
        COALESCE(SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct_answers
      FROM user_answers
      `,
    )
    .get() as { total_answers: number; correct_answers: number }

  const dayRows = db
    .prepare(
      `
      SELECT datetime(answered_at, ?) AS learning_time, is_correct
      FROM user_answers
      ORDER BY answered_at DESC
      `,
    )
    .all(learningTimeModifier) as Array<{ learning_time: string; is_correct: number }>

  const todayKey = toLearningDayKey(new Date(), streakGraceHours)
  const dayTotals = new Map<string, { answers: number; correct: number }>()

  for (const row of dayRows) {
    const dayKey = row.learning_time.slice(0, 10)
    const current = dayTotals.get(dayKey) ?? { answers: 0, correct: 0 }
    current.answers += 1
    current.correct += row.is_correct === 1 ? 1 : 0
    dayTotals.set(dayKey, current)
  }

  const activeDays = new Set(dayTotals.keys())
  const todayTotals = dayTotals.get(todayKey) ?? { answers: 0, correct: 0 }
  const currentStreakDays = computeCurrentStreak(activeDays, todayKey)
  const longestStreakDays = computeLongestStreak(Array.from(dayTotals.keys()))

  const dailyChallengeCompletedToday = todayTotals.answers >= dailyChallengeTarget
  const dailyChallengeRemaining = Math.max(0, dailyChallengeTarget - todayTotals.answers)
  const dailyChallengeXpBonus = dailyChallengeCompletedToday ? dailyChallengeXpBonusValue : 0

  const baseXp = statsRow.correct_answers * 10
  const participationXp = (statsRow.total_answers - statsRow.correct_answers) * 2
  const streakXp = currentStreakDays * 25
  const totalXp = baseXp + participationXp + streakXp + dailyChallengeXpBonus

  const { levelIndex, levelTitle } = resolveLevelByXp(totalXp)
  const nextThreshold = XP_THRESHOLDS[levelIndex + 1] ?? null

  return {
    totalXp,
    levelIndex,
    levelTitle,
    xpToNextLevel: nextThreshold === null ? 0 : Math.max(0, nextThreshold - totalXp),
    nextLevelTitle: XP_LEVEL_TITLES[levelIndex + 1] ?? null,
    currentStreakDays,
    longestStreakDays,
    todaysAnswers: todayTotals.answers,
    todaysCorrectAnswers: todayTotals.correct,
    todaysAccuracyPct: todayTotals.answers > 0 ? Number(((todayTotals.correct / todayTotals.answers) * 100).toFixed(2)) : 0,
    dailyChallengeTarget,
    dailyChallengeCompletedToday,
    dailyChallengeRemaining,
    dailyChallengeXpBonus,
  }
}

// TASK: Build daily progression trend points for analytics overlays.
// HOW CODE SOLVES: Aggregates day-level answer/correct totals, then computes
//                  deterministic daily XP, cumulative XP, level, and streak values.
export function getProgressionTrend(db: Db, filter?: ProgressionTrendFilter): ProgressionTrendData {
  const days = Math.min(Math.max(filter?.days ?? 14, 7), 90)
  const streakGraceHours = Math.min(Math.max(filter?.streakGraceHours ?? 2, 0), 6)
  const tier = filter?.tier ?? 'all'
  const learningTimeModifier = `-${streakGraceHours} hours`

  const rows =
    tier === 'all'
      ? (db
          .prepare(
            `
            SELECT datetime(answered_at, ?) AS learning_time, is_correct
            FROM user_answers
            ORDER BY answered_at ASC, id ASC
            `,
          )
          .all(learningTimeModifier) as Array<{ learning_time: string; is_correct: number }>)
      : (db
          .prepare(
            `
            SELECT datetime(ua.answered_at, ?) AS learning_time, ua.is_correct
            FROM user_answers ua
            JOIN questions q ON q.id = ua.question_id
            WHERE q.exam_tier = ?
            ORDER BY ua.answered_at ASC, ua.id ASC
            `,
          )
          .all(learningTimeModifier, tier) as Array<{ learning_time: string; is_correct: number }>)

  const byDay = new Map<string, { answers: number; correct: number }>()
  for (const row of rows) {
    const dayKey = row.learning_time.slice(0, 10)
    const current = byDay.get(dayKey) ?? { answers: 0, correct: 0 }
    current.answers += 1
    current.correct += row.is_correct === 1 ? 1 : 0
    byDay.set(dayKey, current)
  }

  const today = toLearningDayKey(new Date(), streakGraceHours)
  const endDate = new Date(`${today}T00:00:00.000Z`)
  const startDate = new Date(endDate.getTime() - (days - 1) * 24 * 60 * 60 * 1000)

  let cumulativeXp = 0
  let streakDays = 0
  let previousDayWasActive = false
  const points: ProgressionTrendData['points'] = []

  for (let i = 0; i < days; i += 1) {
    const cursor = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000)
    const dayKey = cursor.toISOString().slice(0, 10)
    const day = byDay.get(dayKey) ?? { answers: 0, correct: 0 }

    if (day.answers > 0) {
      streakDays = previousDayWasActive ? streakDays + 1 : 1
      previousDayWasActive = true
    } else {
      streakDays = 0
      previousDayWasActive = false
    }

    const dailyChallengeCompleted = day.answers >= 10
    const dailyXp = day.correct * 10 + (day.answers - day.correct) * 2 + (day.answers > 0 ? streakDays * 25 : 0) + (dailyChallengeCompleted ? 50 : 0)
    cumulativeXp += dailyXp

    const { levelIndex, levelTitle } = resolveLevelByXp(cumulativeXp)

    points.push({
      date: dayKey,
      totalXp: cumulativeXp,
      dailyXp,
      levelIndex,
      levelTitle,
      streakDays,
      answers: day.answers,
      correctAnswers: day.correct,
      dailyChallengeCompleted,
    })
  }

  return { points }
}

// TASK: Return persisted daily challenge completion events for audit/history views.
// HOW CODE SOLVES: Reads completion rows newest-first with a bounded limit.
export function getDailyChallengeEvents(db: Db, filter?: DailyChallengeEventFilter): DailyChallengeEvent[] {
  const limit = Math.min(Math.max(filter?.limit ?? 20, 1), 100)

  const rows = db
    .prepare(
      `
      SELECT
        id,
        learning_day,
        completed_at,
        challenge_target,
        bonus_xp,
        answers_at_completion,
        streak_days_at_completion
      FROM daily_challenge_events
      ORDER BY completed_at DESC, id DESC
      LIMIT ?
      `,
    )
    .all(limit) as Array<{
    id: number
    learning_day: string
    completed_at: string
    challenge_target: number
    bonus_xp: number
    answers_at_completion: number
    streak_days_at_completion: number
  }>

  return rows.map((row) => ({
    id: row.id,
    learningDay: row.learning_day,
    completedAt: row.completed_at,
    challengeTarget: row.challenge_target,
    bonusXp: row.bonus_xp,
    answersAtCompletion: row.answers_at_completion,
    streakDaysAtCompletion: row.streak_days_at_completion,
  }))
}

// TASK: Return grouped accuracy cells for analytics heatmap rendering.
// HOW CODE SOLVES: Aggregates attempts/correctness by tier/sub-element/group and
//                  returns bounded cells sorted by weakest accuracy first.
export function getAccuracyHeatmap(db: Db, filter?: AccuracyHeatmapFilter): AccuracyHeatmapData {
  const tier = filter?.tier ?? 'all'
  const minAttempts = Math.min(Math.max(filter?.minAttempts ?? 0, 0), 100)
  // ISSUE: lower clamp of 24 prevented callers (and tests) from requesting fewer than 24 cells
  // FIX APPLIED: allow any positive limit up to 480; default 240 when omitted
  const limit = Math.min(Math.max(filter?.limit ?? 240, 1), 480)

  const rows =
    tier === 'all'
      ? (db
          .prepare(
            `
            SELECT
              q.exam_tier,
              q.sub_element,
              q.group_id,
              COUNT(ua.id) AS attempts,
              COALESCE(SUM(CASE WHEN ua.is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct_answers
            FROM questions q
            LEFT JOIN user_answers ua ON ua.question_id = q.id
            GROUP BY q.exam_tier, q.sub_element, q.group_id
            HAVING COUNT(ua.id) >= ?
            ORDER BY
              CASE WHEN COUNT(ua.id) = 0 THEN 0 ELSE (CAST(SUM(CASE WHEN ua.is_correct = 1 THEN 1 ELSE 0 END) AS REAL) / COUNT(ua.id)) END ASC,
              COUNT(ua.id) DESC,
              q.group_id ASC
            LIMIT ?
            `,
          )
          .all(minAttempts, limit) as Array<{
          exam_tier: ExamTier
          sub_element: string
          group_id: string
          attempts: number
          correct_answers: number
        }>)
      : (db
          .prepare(
            `
            SELECT
              q.exam_tier,
              q.sub_element,
              q.group_id,
              COUNT(ua.id) AS attempts,
              COALESCE(SUM(CASE WHEN ua.is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct_answers
            FROM questions q
            LEFT JOIN user_answers ua ON ua.question_id = q.id
            WHERE q.exam_tier = ?
            GROUP BY q.exam_tier, q.sub_element, q.group_id
            HAVING COUNT(ua.id) >= ?
            ORDER BY
              CASE WHEN COUNT(ua.id) = 0 THEN 0 ELSE (CAST(SUM(CASE WHEN ua.is_correct = 1 THEN 1 ELSE 0 END) AS REAL) / COUNT(ua.id)) END ASC,
              COUNT(ua.id) DESC,
              q.group_id ASC
            LIMIT ?
            `,
          )
          .all(tier, minAttempts, limit) as Array<{
          exam_tier: ExamTier
          sub_element: string
          group_id: string
          attempts: number
          correct_answers: number
        }>)

  return {
    cells: rows.map((row) => ({
      examTier: row.exam_tier,
      subElement: row.sub_element,
      groupId: row.group_id,
      attempts: row.attempts,
      correctAnswers: row.correct_answers,
      accuracyPct: row.attempts > 0 ? Number(((row.correct_answers / row.attempts) * 100).toFixed(2)) : 0,
    })),
  }
}

// TASK: Retrieve recent session records for history and analytics.
// HOW CODE SOLVES: Reads sessions ordered by newest start timestamp and
//                   maps rows into the shared `Session` model.
export function getSessionHistory(db: Db, filter?: SessionHistoryFilter): Session[] {
  const limit = Math.min(Math.max(filter?.limit ?? 20, 1), 200)
  const rows = db
    .prepare(
      `
      SELECT id, started_at, ended_at, mode, exam_tier, score, total_questions
      FROM sessions
      ORDER BY started_at DESC
      LIMIT ?
      `,
    )
    .all(limit) as Array<{
    id: string
    started_at: string
    ended_at: string | null
    mode: Session['mode']
    exam_tier: ExamTier
    score: number
    total_questions: number
  }>

  return rows.map((r) => ({
    id: r.id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    mode: r.mode,
    examTier: r.exam_tier,
    score: r.score,
    totalQuestions: r.total_questions,
  }))
}

// TASK: Return the most recent answer events for dashboard activity feeds.
// HOW CODE SOLVES: Joins answer history with question tier/sub-element metadata,
//                  ordered newest first with bounded limit for lightweight UI loads.
export function getRecentAnswerActivity(db: Db, filter?: RecentAnswerActivityFilter): RecentAnswerActivity[] {
  const limit = Math.min(Math.max(filter?.limit ?? 12, 1), 500)

  const rows = db
    .prepare(
      `
      SELECT
        ua.id,
        ua.question_id,
        q.exam_tier,
        q.sub_element,
        ua.is_correct,
        ua.answered_at,
        ua.session_id
      FROM user_answers ua
      JOIN questions q ON q.id = ua.question_id
      ORDER BY ua.answered_at DESC, ua.id DESC
      LIMIT ?
      `,
    )
    .all(limit) as Array<{
    id: number
    question_id: string
    exam_tier: ExamTier
    sub_element: string
    is_correct: number
    answered_at: string
    session_id: string
  }>

  return rows.map((row) => ({
    id: row.id,
    questionId: row.question_id,
    examTier: row.exam_tier,
    subElement: row.sub_element,
    isCorrect: row.is_correct === 1,
    answeredAt: row.answered_at,
    sessionId: row.session_id,
  }))
}

// TASK: Bootstrap SRS cards for users who answered questions before SRS existed.
// HOW CODE SOLVES: Inserts default SRS rows for historical answers that do not
//                  yet have a card, making due-queue counts consistent with progress history.
export function backfillSrsCardsFromAnswerHistory(db: Db): number {
  const result = db
    .prepare(
      `
      INSERT OR IGNORE INTO srs_cards (question_id, interval, ease_factor, next_review, repetitions)
      SELECT DISTINCT
        ua.question_id,
        1,
        2.5,
        datetime('now'),
        0
      FROM user_answers ua
      JOIN questions q ON q.id = ua.question_id
      `,
    )
    .run()

  return result.changes
}

// TASK: Return SRS questions due for review by tier.
// HOW CODE SOLVES: Selects rows whose `next_review` is in the past and returns
//                  question payloads ordered by oldest due first.
export function getDueSrsQueue(db: Db, filter: DueSrsQueueFilter): Question[] {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 300)

  const rows = db
    .prepare(
      `
      SELECT
        q.id,
        q.exam_tier,
        q.sub_element,
        q.group_id,
        q.question_text,
        q.answers,
        q.correct_index,
        q.refs,
        q.hint_cache,
        q.explanation_cache,
        q.mnemonic,
        q.why_wrong_cache,
        q.starred,
        q.flagged
      FROM srs_cards s
      JOIN questions q ON q.id = s.question_id
      WHERE q.exam_tier = ?
        AND datetime(s.next_review) <= datetime('now')
      ORDER BY datetime(s.next_review) ASC, q.id ASC
      LIMIT ?
      `,
    )
    .all(filter.tier, limit) as DbQuestionRow[]

  return rows.map(mapDbQuestionRow)
}

// TASK: Apply SM-2 style SRS updates after each review event.
// HOW CODE SOLVES: Reads existing card state (or defaults), computes next
//                  interval/ease/repetition values, and upserts the result.
export function recordSrsReview(db: Db, input: RecordSrsReviewInput): SRSCard {
  const reviewedAt = input.reviewedAt ? new Date(input.reviewedAt) : new Date()
  const normalizedReviewedAt = Number.isNaN(reviewedAt.getTime()) ? new Date() : reviewedAt

  const existing = db
    .prepare(
      `
      SELECT interval, ease_factor, repetitions
      FROM srs_cards
      WHERE question_id = ?
      LIMIT 1
      `,
    )
    .get(input.questionId) as
    | {
        interval: number
        ease_factor: number
        repetitions: number
      }
    | undefined

  const priorInterval = existing?.interval ?? 1
  const priorEaseFactor = existing?.ease_factor ?? 2.5
  const priorRepetitions = existing?.repetitions ?? 0

  const quality = input.isCorrect ? 4 : 2
  const easeAdjustment = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
  const nextEaseFactor = Math.max(1.3, Number((priorEaseFactor + easeAdjustment).toFixed(2)))

  const nextRepetitions = input.isCorrect ? priorRepetitions + 1 : 0
  const nextInterval = input.isCorrect
    ? nextRepetitions === 1
      ? 1
      : nextRepetitions === 2
        ? 6
        : Math.max(1, Math.round(priorInterval * nextEaseFactor))
    : 1

  const nextReview = addDays(normalizedReviewedAt, nextInterval).toISOString()

  db.prepare(
    `
    INSERT INTO srs_cards (question_id, interval, ease_factor, next_review, repetitions)
    VALUES (@question_id, @interval, @ease_factor, @next_review, @repetitions)
    ON CONFLICT(question_id) DO UPDATE SET
      interval = excluded.interval,
      ease_factor = excluded.ease_factor,
      next_review = excluded.next_review,
      repetitions = excluded.repetitions
    `,
  ).run({
    question_id: input.questionId,
    interval: nextInterval,
    ease_factor: nextEaseFactor,
    next_review: nextReview,
    repetitions: nextRepetitions,
  })

  return {
    questionId: input.questionId,
    interval: nextInterval,
    easeFactor: nextEaseFactor,
    nextReview,
    repetitions: nextRepetitions,
  }
}

// TASK: Save user settings as a single-row profile document.
// HOW CODE SOLVES: Uses UPSERT on fixed row id `1`, preserving a simple
//                   read/write contract while keeping update timestamps.
export function upsertUserSettings(db: Db, input: UpsertSettingsInput): UserSettings {
  const updatedAt = new Date().toISOString()
  const normalizedDailyGoalMinutes = sanitizeDailyGoalMinutes(input.dailyGoalMinutes)
  const normalizedVisualTheme = sanitizeVisualTheme(input.visualTheme)
  const normalizedVoiceRate = sanitizeVoiceRate(input.voiceRate)

  db.prepare(
    `
    INSERT INTO user_settings (id, theme, visual_theme, daily_goal_minutes, ai_provider, text_size, voice_id, voice_rate, updated_at)
    VALUES (1, @theme, @visual_theme, @daily_goal_minutes, @ai_provider, @text_size, @voice_id, @voice_rate, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      theme = excluded.theme,
      visual_theme = excluded.visual_theme,
      daily_goal_minutes = excluded.daily_goal_minutes,
      ai_provider = excluded.ai_provider,
      text_size = excluded.text_size,
      voice_id = excluded.voice_id,
      voice_rate = excluded.voice_rate,
      updated_at = excluded.updated_at
    `,
  ).run({
    theme: input.theme,
    visual_theme: normalizedVisualTheme,
    daily_goal_minutes: normalizedDailyGoalMinutes,
    ai_provider: input.aiProvider,
    text_size: input.textSize,
    voice_id: input.voiceId,
    voice_rate: normalizedVoiceRate,
    updated_at: updatedAt,
  })

  return {
    theme: input.theme,
    visualTheme: normalizedVisualTheme,
    dailyGoalMinutes: normalizedDailyGoalMinutes,
    aiProvider: input.aiProvider,
    textSize: input.textSize,
    voiceId: input.voiceId,
    voiceRate: normalizedVoiceRate,
  }
}

// TASK: Load persisted user settings for renderer initialization.
// HOW CODE SOLVES: Reads the single settings row if present, otherwise
//                   returns deterministic defaults for first-run behavior.
export function getUserSettings(db: Db): UserSettings {
  const row = db
    .prepare(
      `
      SELECT theme, visual_theme, daily_goal_minutes, ai_provider, text_size
           , voice_id, voice_rate
      FROM user_settings
      WHERE id = 1
      `,
    )
    .get() as
    | {
        theme: UserSettings['theme']
        visual_theme: UserSettings['visualTheme']
        daily_goal_minutes: number
        ai_provider: UserSettings['aiProvider']
        text_size: UserSettings['textSize']
        voice_id: string | null
        voice_rate: number
      }
    | undefined

  if (!row) {
    return {
      theme: 'system',
      visualTheme: 'ocean-chart',
      dailyGoalMinutes: 20,
      aiProvider: null,
      textSize: 'medium',
      voiceId: null,
      voiceRate: 1,
    }
  }

  return {
    theme: row.theme,
    visualTheme: sanitizeVisualTheme(row.visual_theme),
    dailyGoalMinutes: sanitizeDailyGoalMinutes(row.daily_goal_minutes),
    aiProvider: row.ai_provider,
    textSize: row.text_size,
    voiceId: row.voice_id,
    voiceRate: sanitizeVoiceRate(row.voice_rate),
  }
}

// TASK: Persist a chat message for future conversational context.
// HOW CODE SOLVES: Stores normalized user/assistant messages in SQLite so
//                  future AI requests can reconstruct recent tutor history.
export function saveChatMessage(db: Db, input: SaveChatMessageInput): ChatMessage {
  const timestamp = input.timestamp ?? new Date().toISOString()

  db.prepare(
    `
    INSERT INTO chat_history (id, role, content, provider, question_id, created_at)
    VALUES (@id, @role, @content, @provider, @question_id, @created_at)
    `,
  ).run({
    id: input.id,
    role: input.role,
    content: input.content,
    provider: input.provider,
    question_id: input.questionId ?? null,
    created_at: timestamp,
  })

  return {
    id: input.id,
    role: input.role,
    content: input.content,
    timestamp,
  }
}

// TASK: Load the most recent chat history for provider-aware tutor context.
// HOW CODE SOLVES: Reads bounded message history ordered newest-first, then
//                  reverses it so callers receive chronological conversation flow.
export function getRecentChatMessages(
  db: Db,
  provider: NonNullable<UserSettings['aiProvider']>,
  limit = 12,
): ChatMessage[] {
  const normalizedLimit = Math.min(Math.max(Math.floor(limit), 1), 30)

  const rows = db
    .prepare(
      `
      SELECT id, role, content, created_at
      FROM chat_history
      WHERE provider = ?
      ORDER BY created_at DESC
      LIMIT ?
      `,
    )
    .all(provider, normalizedLimit) as Array<{
      id: string
      role: ChatMessage['role']
      content: string
      created_at: string
    }>

  return rows
    .reverse()
    .map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      timestamp: row.created_at,
    }))
}

// TASK: Reset all user-generated app state to first-run defaults.
// HOW CODE SOLVES: Clears progress/session/SRS/settings tables and resets
//                  per-question review flags in one transaction, while keeping
//                  immutable question-bank content untouched.
export function resetAppData(db: Db): ResetAppDataResult {
  const resetTransaction = db.transaction(() => {
    const clearedAnswers = db.prepare('DELETE FROM user_answers').run().changes
    const clearedSessions = db.prepare('DELETE FROM sessions').run().changes
    const clearedSrsCards = db.prepare('DELETE FROM srs_cards').run().changes
    db.prepare('DELETE FROM chat_history').run()
    const resetQuestionReviewState = db
      .prepare('UPDATE questions SET starred = 0, flagged = 0 WHERE starred != 0 OR flagged != 0')
      .run().changes
    const clearedSettings = db.prepare('DELETE FROM user_settings').run().changes

    return {
      clearedAnswers,
      clearedSessions,
      clearedSrsCards,
      resetQuestionReviewState,
      clearedSettings,
    }
  })

  return resetTransaction()
}

// TASK: Read back a user-generated custom mnemonic for a specific question.
// HOW CODE SOLVES: Single-row lookup by question_id primary key; returns null
//                  when no custom mnemonic has been generated for this question yet.
export function getUserMnemonic(db: Db, questionId: string): string | null {
  const row = db
    .prepare('SELECT mnemonic FROM user_mnemonics WHERE question_id = ?')
    .get(questionId) as { mnemonic: string } | undefined
  return row?.mnemonic ?? null
}

// TASK: Persist (or replace) a user-generated custom mnemonic for a question.
// HOW CODE SOLVES: UPSERT on the question_id primary key so calling this again
//                  after regeneration just replaces the old row — no duplicates.
export function upsertUserMnemonic(db: Db, questionId: string, mnemonic: string): void {
  db.prepare(
    `INSERT INTO user_mnemonics (question_id, mnemonic, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(question_id) DO UPDATE SET
       mnemonic = excluded.mnemonic,
       created_at = excluded.created_at`,
  ).run(questionId, mnemonic, new Date().toISOString())
}

// TASK: Derive which achievement badges the user has earned from existing persisted data.
// HOW CODE SOLVES: Queries aggregate stats, progression summary, session history, and challenge
//                  events to evaluate each badge condition, then returns all badges with
//                  unlockedAt set to the earliest relevant event date (or null if not yet earned).
export function getEarnedBadges(db: Db): EarnedBadge[] {
  const stats = getProgressStats(db)
  const summary = getUserProgressionSummary(db)
  const now = new Date().toISOString()

  const firstCorrectRow = db
    .prepare('SELECT answered_at FROM user_answers WHERE is_correct = 1 ORDER BY answered_at ASC LIMIT 1')
    .get() as { answered_at: string } | undefined

  const perfectExamRow = db
    .prepare(
      `SELECT started_at FROM sessions
       WHERE mode = 'exam' AND score = total_questions AND total_questions > 0
       ORDER BY started_at ASC LIMIT 1`,
    )
    .get() as { started_at: string } | undefined

  const firstChallengeRow = db
    .prepare('SELECT completed_at FROM daily_challenge_events ORDER BY completed_at ASC LIMIT 1')
    .get() as { completed_at: string } | undefined

  function earnedAt(condition: boolean, date?: string): string | null {
    if (!condition) return null
    return date ?? now
  }

  const conditionMap: Record<string, string | null> = {
    'first-correct': earnedAt(stats.correctAnswers >= 1, firstCorrectRow?.answered_at),
    'century-club': earnedAt(stats.correctAnswers >= 100),
    'quiz-master': earnedAt(stats.correctAnswers >= 500),
    'week-warrior': earnedAt(summary.longestStreakDays >= 7),
    'fortnight-faithful': earnedAt(summary.longestStreakDays >= 14),
    'monthly-master': earnedAt(summary.longestStreakDays >= 30),
    'perfect-exam': earnedAt(Boolean(perfectExamRow), perfectExamRow?.started_at),
    'xp-pioneer': earnedAt(summary.totalXp >= 1000),
    'challenge-champion': earnedAt(Boolean(firstChallengeRow), firstChallengeRow?.completed_at),
  }

  return BADGE_DEFINITIONS.map((def) => ({
    id: def.id,
    title: def.title,
    description: def.description,
    icon: def.icon,
    unlockedAt: conditionMap[def.id] ?? null,
  }))
}
