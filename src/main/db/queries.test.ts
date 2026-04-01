// TASK: Integration-test the core DB query layer using an in-memory SQLite database.
// HOW CODE SOLVES: Each test suite creates a fresh in-memory DB via better-sqlite3,
//                  runs initSchema, then exercises the exported query functions against
//                  known seed data so assertions are fully deterministic.

import Database from 'better-sqlite3'
import {
  initSchema,
  getQuestionsCount,
  seedQuestions,
  getQuestionPool,
  getQuestionById,
  searchQuestions,
  saveUserAnswer,
  getProgressStats,
  recordSrsReview,
  getUserProgressionSummary,
  getWeakAreaQuestionPool,
  getCustomQuizQuestionPool,
  upsertUserSettings,
  getUserSettings,
  getProgressionTrend,
  backfillSrsCardsFromAnswerHistory,
  getDueSrsQueue,
  getAccuracyHeatmap,
} from './queries'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeDb() {
  const db = new Database(':memory:')
  initSchema(db)
  return db
}

/** Minimal question shape accepted by seedQuestions. */
const TECH_Q1 = {
  id: 'T1A01',
  examTier: 'technician' as const,
  subElement: 'T1',
  groupId: 'T1A',
  questionText: 'What is the FCC Part 97?',
  answers: ['Rules for amateur radio', 'Rules for CB radio', 'Broadcast licensing', 'Maritime rules'],
  correctIndex: 0,
  refs: '97.1',
}

const GEN_Q1 = {
  id: 'G1A01',
  examTier: 'general' as const,
  subElement: 'G1',
  groupId: 'G1A',
  questionText: 'What is a General class privilege?',
  answers: ['HF phone on 14.225 MHz', 'VHF only', 'No phone', 'AM broadcast'],
  correctIndex: 0,
  refs: '97.301',
}

const EXTRA_Q1 = {
  id: 'E1A01',
  examTier: 'extra' as const,
  subElement: 'E1',
  groupId: 'E1A',
  questionText: 'Extra class question text?',
  answers: ['Choice A', 'Choice B', 'Choice C', 'Choice D'],
  correctIndex: 2,
  refs: '97.303',
}

const ALL_QUESTIONS = [TECH_Q1, GEN_Q1, EXTRA_Q1]

/** Date far in the past — keeps streak calculations out of today's window. */
const OLD_DATE = '2024-01-15T10:00:00.000Z'

// ---------------------------------------------------------------------------
// initSchema
// ---------------------------------------------------------------------------

describe('initSchema', () => {
  it('creates all required tables without throwing', () => {
    const db = new Database(':memory:')
    expect(() => initSchema(db)).not.toThrow()
    db.close()
  })

  it('is idempotent — calling twice does not throw', () => {
    const db = new Database(':memory:')
    initSchema(db)
    expect(() => initSchema(db)).not.toThrow()
    db.close()
  })

  it('creates the questions table with expected columns', () => {
    const db = new Database(':memory:')
    initSchema(db)
    const cols = db
      .prepare('PRAGMA table_info(questions)')
      .all() as Array<{ name: string }>
    const names = cols.map((c) => c.name)
    expect(names).toContain('id')
    expect(names).toContain('exam_tier')
    expect(names).toContain('question_text')
    expect(names).toContain('answers')
    expect(names).toContain('correct_index')
    expect(names).toContain('starred')
    expect(names).toContain('flagged')
    db.close()
  })
})

// ---------------------------------------------------------------------------
// getQuestionsCount + seedQuestions
// ---------------------------------------------------------------------------

describe('getQuestionsCount', () => {
  it('returns 0 on a freshly initialized empty DB', () => {
    const db = makeDb()
    expect(getQuestionsCount(db)).toBe(0)
    db.close()
  })

  it('returns the correct count after seeding', () => {
    const db = makeDb()
    seedQuestions(db, ALL_QUESTIONS)
    expect(getQuestionsCount(db)).toBe(3)
    db.close()
  })
})

describe('seedQuestions', () => {
  it('inserts all provided questions', () => {
    const db = makeDb()
    seedQuestions(db, ALL_QUESTIONS)
    expect(getQuestionsCount(db)).toBe(3)
    db.close()
  })

  it('is idempotent — seeding twice does not duplicate rows', () => {
    const db = makeDb()
    seedQuestions(db, ALL_QUESTIONS)
    seedQuestions(db, ALL_QUESTIONS)
    expect(getQuestionsCount(db)).toBe(3)
    db.close()
  })

  it('serializes answers as JSON and can be retrieved as an array', () => {
    const db = makeDb()
    seedQuestions(db, [TECH_Q1])
    const q = getQuestionById(db, 'T1A01')
    expect(Array.isArray(q?.answers)).toBe(true)
    expect(q?.answers).toHaveLength(4)
    expect(q?.answers[0]).toBe('Rules for amateur radio')
    db.close()
  })
})

// ---------------------------------------------------------------------------
// getQuestionPool
// ---------------------------------------------------------------------------

describe('getQuestionPool', () => {
  it('returns only questions for the requested tier', () => {
    const db = makeDb()
    seedQuestions(db, ALL_QUESTIONS)
    const pool = getQuestionPool(db, 'technician')
    expect(pool).toHaveLength(1)
    expect(pool[0].id).toBe('T1A01')
    expect(pool[0].examTier).toBe('technician')
    db.close()
  })

  it('returns an empty array when no questions exist for a tier', () => {
    const db = makeDb()
    seedQuestions(db, [TECH_Q1]) // only technician seeded
    expect(getQuestionPool(db, 'general')).toHaveLength(0)
    db.close()
  })

  it('maps all shared Question fields correctly', () => {
    const db = makeDb()
    seedQuestions(db, [EXTRA_Q1])
    const [q] = getQuestionPool(db, 'extra')
    expect(q.id).toBe('E1A01')
    expect(q.correctIndex).toBe(2)
    expect(q.subElement).toBe('E1')
    expect(q.groupId).toBe('E1A')
    expect(q.starred).toBe(false)
    expect(q.flagged).toBe(false)
    db.close()
  })
})

// ---------------------------------------------------------------------------
// getQuestionById
// ---------------------------------------------------------------------------

describe('getQuestionById', () => {
  it('returns the correct question for a known ID', () => {
    const db = makeDb()
    seedQuestions(db, ALL_QUESTIONS)
    const q = getQuestionById(db, 'G1A01')
    expect(q).not.toBeNull()
    expect(q?.id).toBe('G1A01')
    expect(q?.examTier).toBe('general')
    db.close()
  })

  it('returns null for an unknown question ID', () => {
    const db = makeDb()
    seedQuestions(db, ALL_QUESTIONS)
    expect(getQuestionById(db, 'UNKNOWN99')).toBeNull()
    db.close()
  })
})

// ---------------------------------------------------------------------------
// searchQuestions
// ---------------------------------------------------------------------------

describe('searchQuestions', () => {
  it('finds questions by question text substring', () => {
    const db = makeDb()
    seedQuestions(db, ALL_QUESTIONS)
    const results = searchQuestions(db, { query: 'FCC Part 97' })
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('T1A01')
    db.close()
  })

  it('filters by tier when provided', () => {
    const db = makeDb()
    seedQuestions(db, ALL_QUESTIONS)
    // 'question' appears in all three question texts
    const all = searchQuestions(db, { query: 'question' })
    const techOnly = searchQuestions(db, { query: 'question', tier: 'technician' })
    expect(all.length).toBeGreaterThan(techOnly.length)
    expect(techOnly.every((q) => q.examTier === 'technician')).toBe(true)
    db.close()
  })

  it('returns an empty array when no questions match', () => {
    const db = makeDb()
    seedQuestions(db, ALL_QUESTIONS)
    const results = searchQuestions(db, { query: 'zzz_no_match_xyz' })
    expect(results).toHaveLength(0)
    db.close()
  })
})

// ---------------------------------------------------------------------------
// saveUserAnswer + getProgressStats
// ---------------------------------------------------------------------------

describe('saveUserAnswer', () => {
  it('returns a UserAnswer with correct shape', () => {
    const db = makeDb()
    seedQuestions(db, [TECH_Q1])
    const answer = saveUserAnswer(db, {
      questionId: 'T1A01',
      selectedIndex: 0,
      isCorrect: true,
      timeTakenMs: 3200,
      sessionId: 'sess-001',
      answeredAt: OLD_DATE,
    })
    expect(answer.questionId).toBe('T1A01')
    expect(answer.selectedIndex).toBe(0)
    expect(answer.isCorrect).toBe(true)
    expect(answer.timeTakenMs).toBe(3200)
    expect(typeof answer.id).toBe('number')
    db.close()
  })
})

describe('getProgressStats', () => {
  it('returns zeros on an empty answer history', () => {
    const db = makeDb()
    seedQuestions(db, ALL_QUESTIONS)
    const stats = getProgressStats(db)
    expect(stats.totalAnswers).toBe(0)
    expect(stats.correctAnswers).toBe(0)
    expect(stats.accuracyPct).toBe(0)
    db.close()
  })

  it('calculates 100% accuracy when every answer is correct', () => {
    const db = makeDb()
    seedQuestions(db, [TECH_Q1])
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 1000, sessionId: 's1', answeredAt: OLD_DATE })
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 900, sessionId: 's1', answeredAt: OLD_DATE })
    const stats = getProgressStats(db)
    expect(stats.totalAnswers).toBe(2)
    expect(stats.correctAnswers).toBe(2)
    expect(stats.accuracyPct).toBe(100)
    db.close()
  })

  it('calculates 50% accuracy for equal correct and wrong answers', () => {
    const db = makeDb()
    seedQuestions(db, [TECH_Q1])
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 1000, sessionId: 's1', answeredAt: OLD_DATE })
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 1, isCorrect: false, timeTakenMs: 1200, sessionId: 's1', answeredAt: OLD_DATE })
    const stats = getProgressStats(db)
    expect(stats.totalAnswers).toBe(2)
    expect(stats.correctAnswers).toBe(1)
    expect(stats.accuracyPct).toBe(50)
    db.close()
  })

  it('counts unique questions answered correctly', () => {
    const db = makeDb()
    seedQuestions(db, [TECH_Q1, GEN_Q1])
    // Same question answered twice — uniqueQuestionsAnswered should be 1
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 1000, sessionId: 's1', answeredAt: OLD_DATE })
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 800, sessionId: 's1', answeredAt: OLD_DATE })
    saveUserAnswer(db, { questionId: 'G1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 900, sessionId: 's1', answeredAt: OLD_DATE })
    const stats = getProgressStats(db)
    expect(stats.uniqueQuestionsAnswered).toBe(2)
    db.close()
  })
})

// ---------------------------------------------------------------------------
// recordSrsReview — SM-2 algorithm in the DB layer
// ---------------------------------------------------------------------------

describe('recordSrsReview', () => {
  it('first correct review: repetitions=1, interval=1, easeFactor=2.5', () => {
    const db = makeDb()
    seedQuestions(db, [TECH_Q1])
    const card = recordSrsReview(db, { questionId: 'T1A01', isCorrect: true, reviewedAt: OLD_DATE })
    expect(card.questionId).toBe('T1A01')
    expect(card.repetitions).toBe(1)
    expect(card.interval).toBe(1)
    expect(card.easeFactor).toBe(2.5) // correct: easeAdjustment = 0.0
    db.close()
  })

  it('first wrong review: repetitions=0, interval=1, easeFactor=2.18', () => {
    const db = makeDb()
    seedQuestions(db, [TECH_Q1])
    const card = recordSrsReview(db, { questionId: 'T1A01', isCorrect: false, reviewedAt: OLD_DATE })
    expect(card.repetitions).toBe(0)
    expect(card.interval).toBe(1)
    expect(card.easeFactor).toBe(2.18) // 2.5 + (-0.32) = 2.18
    db.close()
  })

  it('second correct review: repetitions=2, interval=6', () => {
    const db = makeDb()
    seedQuestions(db, [TECH_Q1])
    recordSrsReview(db, { questionId: 'T1A01', isCorrect: true, reviewedAt: OLD_DATE })
    const card = recordSrsReview(db, { questionId: 'T1A01', isCorrect: true, reviewedAt: OLD_DATE })
    expect(card.repetitions).toBe(2)
    expect(card.interval).toBe(6)
    db.close()
  })

  it('third correct review: interval = round(6 * easeFactor)', () => {
    const db = makeDb()
    seedQuestions(db, [TECH_Q1])
    recordSrsReview(db, { questionId: 'T1A01', isCorrect: true, reviewedAt: OLD_DATE })
    recordSrsReview(db, { questionId: 'T1A01', isCorrect: true, reviewedAt: OLD_DATE })
    const card = recordSrsReview(db, { questionId: 'T1A01', isCorrect: true, reviewedAt: OLD_DATE })
    expect(card.repetitions).toBe(3)
    expect(card.interval).toBe(15) // round(6 * 2.5) = 15
    db.close()
  })

  it('wrong after learned card resets repetitions and interval', () => {
    const db = makeDb()
    seedQuestions(db, [TECH_Q1])
    recordSrsReview(db, { questionId: 'T1A01', isCorrect: true, reviewedAt: OLD_DATE })
    recordSrsReview(db, { questionId: 'T1A01', isCorrect: true, reviewedAt: OLD_DATE })
    const card = recordSrsReview(db, { questionId: 'T1A01', isCorrect: false, reviewedAt: OLD_DATE })
    expect(card.repetitions).toBe(0)
    expect(card.interval).toBe(1)
    db.close()
  })

  it('nextReview is a valid ISO string anchored to reviewedAt + interval days', () => {
    const db = makeDb()
    seedQuestions(db, [TECH_Q1])
    const card = recordSrsReview(db, { questionId: 'T1A01', isCorrect: true, reviewedAt: '2025-03-01T00:00:00.000Z' })
    // interval=1 → nextReview should be 2025-03-02
    expect(card.nextReview.startsWith('2025-03-02')).toBe(true)
    db.close()
  })
})

// ---------------------------------------------------------------------------
// getUserProgressionSummary — XP, level, streak
// ---------------------------------------------------------------------------

describe('getUserProgressionSummary', () => {
  it('returns zero XP and Novice level on an empty DB', () => {
    const db = makeDb()
    seedQuestions(db, ALL_QUESTIONS)
    const summary = getUserProgressionSummary(db)
    expect(summary.totalXp).toBe(0)
    expect(summary.levelTitle).toBe('Novice')
    expect(summary.levelIndex).toBe(0)
    expect(summary.currentStreakDays).toBe(0)
    db.close()
  })

  it('accumulates baseXp as correct_answers * 10', () => {
    const db = makeDb()
    seedQuestions(db, [TECH_Q1])
    // 3 correct answers with old date (no streak contribution)
    for (let i = 0; i < 3; i++) {
      saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 1000, sessionId: 's1', answeredAt: OLD_DATE })
    }
    const summary = getUserProgressionSummary(db)
    // baseXp=30, participationXp=0, streakXp=0 (old date)
    expect(summary.totalXp).toBe(30)
    db.close()
  })

  it('accumulates participationXp as wrong_answers * 2', () => {
    const db = makeDb()
    seedQuestions(db, [TECH_Q1])
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 1, isCorrect: false, timeTakenMs: 1000, sessionId: 's1', answeredAt: OLD_DATE })
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 1, isCorrect: false, timeTakenMs: 1000, sessionId: 's1', answeredAt: OLD_DATE })
    const summary = getUserProgressionSummary(db)
    // baseXp=0, participationXp=2*2=4, streakXp=0
    expect(summary.totalXp).toBe(4)
    db.close()
  })

  it('reaches Technician level at 500 XP (50 correct answers, old date)', () => {
    const db = makeDb()
    seedQuestions(db, [TECH_Q1])
    for (let i = 0; i < 50; i++) {
      saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 800, sessionId: 's1', answeredAt: OLD_DATE })
    }
    const summary = getUserProgressionSummary(db)
    // baseXp=500, streakXp=0 → totalXp=500 → Technician
    expect(summary.totalXp).toBe(500)
    expect(summary.levelTitle).toBe('Technician')
    expect(summary.levelIndex).toBe(1)
    db.close()
  })

  it('includes streakXp when answers are answered today', () => {
    const db = makeDb()
    seedQuestions(db, [TECH_Q1])
    // Use current timestamp so the answer lands in today's learning window
    const todayIso = new Date().toISOString()
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 1000, sessionId: 's1', answeredAt: todayIso })
    const summary = getUserProgressionSummary(db)
    expect(summary.currentStreakDays).toBe(1)
    // streakXp = 1 * 25 = 25, baseXp = 10 → totalXp = 35
    expect(summary.totalXp).toBe(35)
    db.close()
  })

  it('xpToNextLevel is correct distance from current level threshold', () => {
    const db = makeDb()
    seedQuestions(db, [TECH_Q1])
    // 49 correct (old date) → totalXp=490, need 10 more for Technician (500)
    for (let i = 0; i < 49; i++) {
      saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 800, sessionId: 's1', answeredAt: OLD_DATE })
    }
    const summary = getUserProgressionSummary(db)
    expect(summary.totalXp).toBe(490)
    expect(summary.levelTitle).toBe('Novice')
    expect(summary.xpToNextLevel).toBe(10) // 500 - 490
    expect(summary.nextLevelTitle).toBe('Technician')
    db.close()
  })

  it('nextLevelTitle is null and xpToNextLevel is 0 at max level (Elmer)', () => {
    const db = makeDb()
    seedQuestions(db, [TECH_Q1])
    // XP_THRESHOLDS[5] = 5000; correct*10=5000 → 500 correct answers
    for (let i = 0; i < 500; i++) {
      saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 500, sessionId: 's1', answeredAt: OLD_DATE })
    }
    const summary = getUserProgressionSummary(db)
    expect(summary.levelTitle).toBe('Elmer')
    expect(summary.nextLevelTitle).toBeNull()
    expect(summary.xpToNextLevel).toBe(0)
    db.close()
  })
})

// ---------------------------------------------------------------------------
// Shared helpers for the new suites below
// ---------------------------------------------------------------------------

/** Returns an ISO timestamp N whole days before now. */
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()
}

/** Today's UTC date key, e.g. '2026-03-31'. */
const TODAY_KEY = new Date().toISOString().slice(0, 10)

// Extended seed: three technician questions across two sub-elements,
// plus one general question. Used by weak-area and custom-quiz tests.
const TECH_T1_Q1 = { id: 'T1A01', examTier: 'technician' as const, subElement: 'T1', groupId: 'T1A', questionText: 'T1 question one?', answers: ['A', 'B', 'C', 'D'], correctIndex: 0, refs: '97.1' }
const TECH_T1_Q2 = { id: 'T1A02', examTier: 'technician' as const, subElement: 'T1', groupId: 'T1A', questionText: 'T1 question two?', answers: ['A', 'B', 'C', 'D'], correctIndex: 1, refs: '97.1' }
const TECH_T2_Q1 = { id: 'T2A01', examTier: 'technician' as const, subElement: 'T2', groupId: 'T2A', questionText: 'T2 question one?', answers: ['A', 'B', 'C', 'D'], correctIndex: 0, refs: '97.2' }
const TECH_T3_Q1 = { id: 'T3A01', examTier: 'technician' as const, subElement: 'T3', groupId: 'T3A', questionText: 'T3 question one?', answers: ['A', 'B', 'C', 'D'], correctIndex: 0, refs: '97.3' }
const GEN_G1_Q1  = { id: 'G1A01', examTier: 'general'    as const, subElement: 'G1', groupId: 'G1A', questionText: 'G1 question one?', answers: ['A', 'B', 'C', 'D'], correctIndex: 0, refs: '97.301' }

const MULTI_QUESTIONS = [TECH_T1_Q1, TECH_T1_Q2, TECH_T2_Q1, TECH_T3_Q1, GEN_G1_Q1]

// ---------------------------------------------------------------------------
// getWeakAreaQuestionPool
// ---------------------------------------------------------------------------

describe('getWeakAreaQuestionPool', () => {
  it('returns technician questions when there is no answer history (full-tier fallback)', () => {
    // TASK: Verify the fallback path: the CTE returns 0 weak sub-elements,
    //       so the WHERE clause allows all sub-elements through.
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    const pool = getWeakAreaQuestionPool(db, { tier: 'technician' })
    const ids = pool.map((q) => q.id)
    expect(ids).toContain('T1A01')
    expect(ids).toContain('T2A01')
    expect(ids).toContain('T3A01')
    db.close()
  })

  it('does not include questions from other tiers', () => {
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    const pool = getWeakAreaQuestionPool(db, { tier: 'technician' })
    expect(pool.every((q) => q.examTier === 'technician')).toBe(true)
    db.close()
  })

  it('respects the limit parameter', () => {
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    const pool = getWeakAreaQuestionPool(db, { tier: 'technician', limit: 2 })
    expect(pool.length).toBeLessThanOrEqual(2)
    db.close()
  })

  it('targets the weakest sub-element after wrong answers accumulate there', () => {
    // TASK: After giving wrong answers exclusively to T2 questions, T2 should
    //       be identified as the weakest sub-element and those questions returned.
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    // Give 5 wrong answers to T2A01 (sub-element T2)
    for (let i = 0; i < 5; i++) {
      saveUserAnswer(db, { questionId: 'T2A01', selectedIndex: 1, isCorrect: false, timeTakenMs: 1000, sessionId: 's1', answeredAt: OLD_DATE })
    }
    // Give 5 correct answers to T1A01 (sub-element T1 — strong)
    for (let i = 0; i < 5; i++) {
      saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 1000, sessionId: 's1', answeredAt: OLD_DATE })
    }
    // With weakSubElements=1, should return only the weakest sub-element (T2)
    const pool = getWeakAreaQuestionPool(db, { tier: 'technician', weakSubElements: 1 })
    expect(pool.every((q) => q.subElement === 'T2')).toBe(true)
    expect(pool.some((q) => q.id === 'T2A01')).toBe(true)
    db.close()
  })

  it('expands to include multiple weak sub-elements when weakSubElements > 1', () => {
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    // Make T2 and T3 both weak (wrong answers), T1 strong
    for (let i = 0; i < 3; i++) {
      saveUserAnswer(db, { questionId: 'T2A01', selectedIndex: 1, isCorrect: false, timeTakenMs: 1000, sessionId: 's1', answeredAt: OLD_DATE })
      saveUserAnswer(db, { questionId: 'T3A01', selectedIndex: 1, isCorrect: false, timeTakenMs: 1000, sessionId: 's1', answeredAt: OLD_DATE })
      saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true,  timeTakenMs: 1000, sessionId: 's1', answeredAt: OLD_DATE })
    }
    const pool = getWeakAreaQuestionPool(db, { tier: 'technician', weakSubElements: 2 })
    const subElements = new Set(pool.map((q) => q.subElement))
    expect(subElements.has('T2')).toBe(true)
    expect(subElements.has('T3')).toBe(true)
    db.close()
  })
})

// ---------------------------------------------------------------------------
// getCustomQuizQuestionPool
// ---------------------------------------------------------------------------

describe('getCustomQuizQuestionPool', () => {
  it('returns questions only from the requested tier when no sub-elements specified', () => {
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    const pool = getCustomQuizQuestionPool(db, { tier: 'technician' })
    expect(pool.every((q) => q.examTier === 'technician')).toBe(true)
    db.close()
  })

  it('filters to the specified sub-element', () => {
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    const pool = getCustomQuizQuestionPool(db, { tier: 'technician', subElements: ['T1'] })
    expect(pool.length).toBeGreaterThan(0)
    expect(pool.every((q) => q.subElement === 'T1')).toBe(true)
    db.close()
  })

  it('returns questions from multiple sub-elements when several are specified', () => {
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    const pool = getCustomQuizQuestionPool(db, { tier: 'technician', subElements: ['T1', 'T2'] })
    const subElements = new Set(pool.map((q) => q.subElement))
    expect(subElements.has('T1')).toBe(true)
    expect(subElements.has('T2')).toBe(true)
    expect(subElements.has('T3')).toBe(false)
    db.close()
  })

  it('respects the limit parameter', () => {
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    const pool = getCustomQuizQuestionPool(db, { tier: 'technician', limit: 2 })
    expect(pool.length).toBeLessThanOrEqual(2)
    db.close()
  })

  it('returns no questions when the sub-element does not exist in the tier', () => {
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    const pool = getCustomQuizQuestionPool(db, { tier: 'technician', subElements: ['G1'] })
    expect(pool).toHaveLength(0)
    db.close()
  })

  it('returns an empty array when the tier has no questions seeded', () => {
    const db = makeDb()
    seedQuestions(db, [TECH_T1_Q1]) // only technician
    const pool = getCustomQuizQuestionPool(db, { tier: 'extra' })
    expect(pool).toHaveLength(0)
    db.close()
  })

  it('trims and deduplicates whitespace-padded sub-element entries', () => {
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    // ' T1 ' with spaces should resolve to 'T1'
    const pool = getCustomQuizQuestionPool(db, { tier: 'technician', subElements: [' T1 ', 'T1'] })
    expect(pool.every((q) => q.subElement === 'T1')).toBe(true)
    db.close()
  })
})

// ---------------------------------------------------------------------------
// upsertUserSettings + getUserSettings
// ---------------------------------------------------------------------------

describe('getUserSettings', () => {
  it('returns defaults when no settings row exists', () => {
    const db = makeDb()
    const settings = getUserSettings(db)
    expect(settings.theme).toBe('system')
    expect(settings.visualTheme).toBe('ocean-chart')
    expect(settings.dailyGoalMinutes).toBe(20)
    expect(settings.aiProvider).toBeNull()
    expect(settings.textSize).toBe('medium')
    expect(settings.voiceId).toBeNull()
    expect(settings.voiceRate).toBe(1)
    db.close()
  })
})

describe('upsertUserSettings', () => {
  it('persists and retrieves all fields correctly (round-trip)', () => {
    const db = makeDb()
    upsertUserSettings(db, {
      theme: 'dark',
      visualTheme: 'signal-lab',
      dailyGoalMinutes: 30,
      aiProvider: 'anthropic',
      textSize: 'large',
      voiceId: 'com.apple.voice.compact.en-US.Samantha',
      voiceRate: 1.25,
    })
    const s = getUserSettings(db)
    expect(s.theme).toBe('dark')
    expect(s.visualTheme).toBe('signal-lab')
    expect(s.dailyGoalMinutes).toBe(30)
    expect(s.aiProvider).toBe('anthropic')
    expect(s.textSize).toBe('large')
    expect(s.voiceId).toBe('com.apple.voice.compact.en-US.Samantha')
    expect(s.voiceRate).toBe(1.25)
    db.close()
  })

  it('overwrites the previous row on a second upsert (no duplicate rows)', () => {
    const db = makeDb()
    upsertUserSettings(db, { theme: 'dark',  visualTheme: 'signal-lab',  dailyGoalMinutes: 20, aiProvider: null, textSize: 'small',  voiceId: null, voiceRate: 1 })
    upsertUserSettings(db, { theme: 'light', visualTheme: 'field-manual', dailyGoalMinutes: 45, aiProvider: 'openai', textSize: 'large', voiceId: null, voiceRate: 1.5 })
    const s = getUserSettings(db)
    // Only the second write should be visible
    expect(s.theme).toBe('light')
    expect(s.visualTheme).toBe('field-manual')
    expect(s.dailyGoalMinutes).toBe(45)
    // Confirm there is still only one row
    const count = (db.prepare('SELECT COUNT(*) AS n FROM user_settings').get() as { n: number }).n
    expect(count).toBe(1)
    db.close()
  })

  it('stores null aiProvider and retrieves it as null', () => {
    const db = makeDb()
    upsertUserSettings(db, { theme: 'system', visualTheme: 'ocean-chart', dailyGoalMinutes: 20, aiProvider: null, textSize: 'medium', voiceId: null, voiceRate: 1 })
    expect(getUserSettings(db).aiProvider).toBeNull()
    db.close()
  })

  describe('dailyGoalMinutes sanitization', () => {
    it('clamps values below 5 to 5', () => {
      const db = makeDb()
      upsertUserSettings(db, { theme: 'system', visualTheme: 'ocean-chart', dailyGoalMinutes: 2, aiProvider: null, textSize: 'medium', voiceId: null, voiceRate: 1 })
      expect(getUserSettings(db).dailyGoalMinutes).toBe(5)
      db.close()
    })

    it('clamps values above 180 to 180', () => {
      const db = makeDb()
      upsertUserSettings(db, { theme: 'system', visualTheme: 'ocean-chart', dailyGoalMinutes: 999, aiProvider: null, textSize: 'medium', voiceId: null, voiceRate: 1 })
      expect(getUserSettings(db).dailyGoalMinutes).toBe(180)
      db.close()
    })

    it('rounds fractional values', () => {
      const db = makeDb()
      upsertUserSettings(db, { theme: 'system', visualTheme: 'ocean-chart', dailyGoalMinutes: 22.7, aiProvider: null, textSize: 'medium', voiceId: null, voiceRate: 1 })
      expect(getUserSettings(db).dailyGoalMinutes).toBe(23)
      db.close()
    })

    it('defaults to 20 for non-finite values', () => {
      const db = makeDb()
      upsertUserSettings(db, { theme: 'system', visualTheme: 'ocean-chart', dailyGoalMinutes: NaN, aiProvider: null, textSize: 'medium', voiceId: null, voiceRate: 1 })
      expect(getUserSettings(db).dailyGoalMinutes).toBe(20)
      db.close()
    })
  })

  describe('voiceRate sanitization', () => {
    it('clamps values below 0.5 to 0.5', () => {
      const db = makeDb()
      upsertUserSettings(db, { theme: 'system', visualTheme: 'ocean-chart', dailyGoalMinutes: 20, aiProvider: null, textSize: 'medium', voiceId: null, voiceRate: 0.1 })
      expect(getUserSettings(db).voiceRate).toBe(0.5)
      db.close()
    })

    it('clamps values above 2 to 2', () => {
      const db = makeDb()
      upsertUserSettings(db, { theme: 'system', visualTheme: 'ocean-chart', dailyGoalMinutes: 20, aiProvider: null, textSize: 'medium', voiceId: null, voiceRate: 5 })
      expect(getUserSettings(db).voiceRate).toBe(2)
      db.close()
    })

    it('defaults to 1 for non-finite values', () => {
      const db = makeDb()
      upsertUserSettings(db, { theme: 'system', visualTheme: 'ocean-chart', dailyGoalMinutes: 20, aiProvider: null, textSize: 'medium', voiceId: null, voiceRate: Infinity })
      expect(getUserSettings(db).voiceRate).toBe(1)
      db.close()
    })

    it('preserves valid mid-range values', () => {
      const db = makeDb()
      upsertUserSettings(db, { theme: 'system', visualTheme: 'ocean-chart', dailyGoalMinutes: 20, aiProvider: null, textSize: 'medium', voiceId: null, voiceRate: 1.5 })
      expect(getUserSettings(db).voiceRate).toBe(1.5)
      db.close()
    })
  })

  describe('visualTheme sanitization', () => {
    it.each(['signal-lab', 'field-manual', 'ocean-chart'] as const)(
      'preserves valid theme "%s"',
      (theme) => {
        const db = makeDb()
        upsertUserSettings(db, { theme: 'system', visualTheme: theme, dailyGoalMinutes: 20, aiProvider: null, textSize: 'medium', voiceId: null, voiceRate: 1 })
        expect(getUserSettings(db).visualTheme).toBe(theme)
        db.close()
      },
    )

    it('falls back to ocean-chart for an unknown theme string', () => {
      const db = makeDb()
      // Cast to bypass TS — we are deliberately testing the runtime sanitization fence
      upsertUserSettings(db, { theme: 'system', visualTheme: 'neon-glow' as 'ocean-chart', dailyGoalMinutes: 20, aiProvider: null, textSize: 'medium', voiceId: null, voiceRate: 1 })
      expect(getUserSettings(db).visualTheme).toBe('ocean-chart')
      db.close()
    })
  })
})

// ---------------------------------------------------------------------------
// getProgressionTrend
// ---------------------------------------------------------------------------

describe('getProgressionTrend', () => {
  // Use streakGraceHours=0 in all trend tests so "today" is always the plain UTC date,
  // making the window boundary deterministic regardless of time of day.
  const GRACE = { streakGraceHours: 0 }

  it('returns 14 points by default on an empty DB', () => {
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    const { points } = getProgressionTrend(db, GRACE)
    expect(points).toHaveLength(14)
    db.close()
  })

  it('all points are zero when there are no answers', () => {
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    const { points } = getProgressionTrend(db, GRACE)
    for (const p of points) {
      expect(p.answers).toBe(0)
      expect(p.dailyXp).toBe(0)
      expect(p.totalXp).toBe(0)
    }
    db.close()
  })

  it('respects the days filter (7 days)', () => {
    const db = makeDb()
    const { points } = getProgressionTrend(db, { ...GRACE, days: 7 })
    expect(points).toHaveLength(7)
    db.close()
  })

  it('clamps days to a minimum of 7', () => {
    const db = makeDb()
    // Requesting 3 days — should still return at least 7
    const { points } = getProgressionTrend(db, { ...GRACE, days: 3 })
    expect(points).toHaveLength(7)
    db.close()
  })

  it('clamps days to a maximum of 90', () => {
    const db = makeDb()
    const { points } = getProgressionTrend(db, { ...GRACE, days: 150 })
    expect(points).toHaveLength(90)
    db.close()
  })

  it('the last point always corresponds to today', () => {
    const db = makeDb()
    const { points } = getProgressionTrend(db, GRACE)
    expect(points[points.length - 1].date).toBe(TODAY_KEY)
    db.close()
  })

  it('answers today appear in the last (today) point', () => {
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 1000, sessionId: 's1', answeredAt: daysAgo(0) })
    const { points } = getProgressionTrend(db, GRACE)
    const today = points.find((p) => p.date === TODAY_KEY)!
    expect(today.answers).toBe(1)
    expect(today.correctAnswers).toBe(1)
    db.close()
  })

  it('answers yesterday appear in yesterday\'s point and not today\'s', () => {
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 1000, sessionId: 's1', answeredAt: daysAgo(1) })
    const { points } = getProgressionTrend(db, GRACE)
    const yesterday = points.find((p) => p.date === new Date(Date.now() - 86400000).toISOString().slice(0, 10))!
    const today = points.find((p) => p.date === TODAY_KEY)!
    expect(yesterday.answers).toBe(1)
    expect(today.answers).toBe(0)
    db.close()
  })

  it('dailyXp for a single correct answer today is 35 (10 base + 25 streak)', () => {
    // streakDays=1 for the first active day → streakXp=25; correctXp=10 → total 35
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 1000, sessionId: 's1', answeredAt: daysAgo(0) })
    const { points } = getProgressionTrend(db, GRACE)
    const today = points.find((p) => p.date === TODAY_KEY)!
    expect(today.dailyXp).toBe(35) // 10 (correct) + 25 (streak day 1)
    db.close()
  })

  it('cumulative totalXp accumulates across two consecutive active days', () => {
    // Yesterday: 1 correct → dailyXp=35 (streak=1), cumulativeXp=35
    // Today:     1 correct → dailyXp=60 (streak=2, 10+50), cumulativeXp=95
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 1000, sessionId: 's1', answeredAt: daysAgo(1) })
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 1000, sessionId: 's1', answeredAt: daysAgo(0) })
    const { points } = getProgressionTrend(db, GRACE)
    const yesterday = points.find((p) => p.date === new Date(Date.now() - 86400000).toISOString().slice(0, 10))!
    const today = points.find((p) => p.date === TODAY_KEY)!
    expect(yesterday.totalXp).toBe(35)
    expect(today.totalXp).toBe(95) // 35 + 60
    db.close()
  })

  it('streakDays resets to 0 on a gap day and restarts at 1', () => {
    // 2 days ago: active (streak=1), yesterday: gap (streak=0), today: active (streak=1)
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 1000, sessionId: 's1', answeredAt: daysAgo(2) })
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 1000, sessionId: 's1', answeredAt: daysAgo(0) })
    const { points } = getProgressionTrend(db, GRACE)
    const twoDaysAgo = points.find((p) => p.date === new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10))!
    const yesterday  = points.find((p) => p.date === new Date(Date.now() -     86400000).toISOString().slice(0, 10))!
    const today      = points.find((p) => p.date === TODAY_KEY)!
    expect(twoDaysAgo.streakDays).toBe(1)
    expect(yesterday.streakDays).toBe(0)
    expect(today.streakDays).toBe(1)
    db.close()
  })

  it('dailyChallengeCompleted is true only on days with 10 or more answers', () => {
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    // 10 answers today — triggers daily challenge
    for (let i = 0; i < 10; i++) {
      saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 500, sessionId: 's1', answeredAt: daysAgo(0) })
    }
    // 9 answers yesterday — does NOT trigger
    for (let i = 0; i < 9; i++) {
      saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 500, sessionId: 's1', answeredAt: daysAgo(1) })
    }
    const { points } = getProgressionTrend(db, GRACE)
    const today     = points.find((p) => p.date === TODAY_KEY)!
    const yesterday = points.find((p) => p.date === new Date(Date.now() - 86400000).toISOString().slice(0, 10))!
    expect(today.dailyChallengeCompleted).toBe(true)
    expect(yesterday.dailyChallengeCompleted).toBe(false)
    db.close()
  })

  it('tier filter excludes answers from other tiers', () => {
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    // Technician answer today
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 1000, sessionId: 's1', answeredAt: daysAgo(0) })
    // General answer today
    saveUserAnswer(db, { questionId: 'G1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 1000, sessionId: 's1', answeredAt: daysAgo(0) })
    // general-only trend should only see the 1 general answer
    const { points } = getProgressionTrend(db, { ...GRACE, tier: 'general' })
    const today = points.find((p) => p.date === TODAY_KEY)!
    expect(today.answers).toBe(1)
    expect(today.correctAnswers).toBe(1)
    db.close()
  })
})

// ---------------------------------------------------------------------------
// backfillSrsCardsFromAnswerHistory
// ---------------------------------------------------------------------------

describe('backfillSrsCardsFromAnswerHistory', () => {
  it('returns 0 when there are no answers', () => {
    const db = makeDb()
    seedQuestions(db, ALL_QUESTIONS)
    expect(backfillSrsCardsFromAnswerHistory(db)).toBe(0)
    db.close()
  })

  it('creates one SRS card per unique answered question and returns the count', () => {
    // 3 answers to T1A01 + 1 answer to G1A01 = 2 unique questions → 2 new cards
    const db = makeDb()
    seedQuestions(db, ALL_QUESTIONS)
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true,  timeTakenMs: 500, sessionId: 's1', answeredAt: OLD_DATE })
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true,  timeTakenMs: 500, sessionId: 's2', answeredAt: OLD_DATE })
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 1, isCorrect: false, timeTakenMs: 500, sessionId: 's3', answeredAt: OLD_DATE })
    saveUserAnswer(db, { questionId: 'G1A01', selectedIndex: 0, isCorrect: true,  timeTakenMs: 500, sessionId: 's1', answeredAt: OLD_DATE })
    expect(backfillSrsCardsFromAnswerHistory(db)).toBe(2)
    db.close()
  })

  it('returns 0 on a second run — INSERT OR IGNORE prevents duplicates', () => {
    const db = makeDb()
    seedQuestions(db, ALL_QUESTIONS)
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 500, sessionId: 's1', answeredAt: OLD_DATE })
    backfillSrsCardsFromAnswerHistory(db)
    expect(backfillSrsCardsFromAnswerHistory(db)).toBe(0)
    db.close()
  })

  it('does not create cards for questions that were never answered', () => {
    const db = makeDb()
    seedQuestions(db, ALL_QUESTIONS) // seeds T1A01, G1A01, E1A01
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 500, sessionId: 's1', answeredAt: OLD_DATE })
    backfillSrsCardsFromAnswerHistory(db)
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM srs_cards').get() as { count: number }
    expect(count).toBe(1) // only T1A01; G1A01 and E1A01 were never answered
    db.close()
  })

  it('initialises cards with interval=1, ease_factor=2.5, repetitions=0', () => {
    const db = makeDb()
    seedQuestions(db, ALL_QUESTIONS)
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 500, sessionId: 's1', answeredAt: OLD_DATE })
    backfillSrsCardsFromAnswerHistory(db)
    const card = db.prepare('SELECT interval, ease_factor, repetitions FROM srs_cards WHERE question_id = ?').get('T1A01') as {
      interval: number
      ease_factor: number
      repetitions: number
    }
    expect(card.interval).toBe(1)
    expect(card.ease_factor).toBe(2.5)
    expect(card.repetitions).toBe(0)
    db.close()
  })
})

// ---------------------------------------------------------------------------
// getDueSrsQueue
// ---------------------------------------------------------------------------

describe('getDueSrsQueue', () => {
  const PAST   = new Date(Date.now() - 2 * 86400000).toISOString() // 2 days ago → due
  const FUTURE = new Date(Date.now() + 2 * 86400000).toISOString() // 2 days ahead → not due

  function insertCard(db: ReturnType<typeof makeDb>, questionId: string, nextReview: string): void {
    db.prepare(
      'INSERT OR REPLACE INTO srs_cards (question_id, interval, ease_factor, next_review, repetitions) VALUES (?, 1, 2.5, ?, 0)',
    ).run(questionId, nextReview)
  }

  it('returns an empty array when no SRS cards exist', () => {
    const db = makeDb()
    seedQuestions(db, ALL_QUESTIONS)
    expect(getDueSrsQueue(db, { tier: 'technician' })).toHaveLength(0)
    db.close()
  })

  it('returns an empty array when all cards have a future next_review', () => {
    const db = makeDb()
    seedQuestions(db, ALL_QUESTIONS)
    insertCard(db, 'T1A01', FUTURE)
    expect(getDueSrsQueue(db, { tier: 'technician' })).toHaveLength(0)
    db.close()
  })

  it('returns a question whose next_review is in the past', () => {
    const db = makeDb()
    seedQuestions(db, ALL_QUESTIONS)
    insertCard(db, 'T1A01', PAST)
    const queue = getDueSrsQueue(db, { tier: 'technician' })
    expect(queue).toHaveLength(1)
    expect(queue[0].id).toBe('T1A01')
    db.close()
  })

  it('does not return a card whose next_review is in the future', () => {
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    insertCard(db, 'T1A01', PAST)   // due
    insertCard(db, 'T1A02', FUTURE) // not due — same tier
    const queue = getDueSrsQueue(db, { tier: 'technician' })
    expect(queue).toHaveLength(1)
    expect(queue[0].id).toBe('T1A01')
    db.close()
  })

  it('filters by exam tier — technician cards excluded from general queue', () => {
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    insertCard(db, 'T1A01', PAST) // technician
    insertCard(db, 'G1A01', PAST) // general
    const techQueue = getDueSrsQueue(db, { tier: 'technician' })
    const genQueue  = getDueSrsQueue(db, { tier: 'general' })
    expect(techQueue).toHaveLength(1)
    expect(techQueue[0].examTier).toBe('technician')
    expect(genQueue).toHaveLength(1)
    expect(genQueue[0].examTier).toBe('general')
    db.close()
  })

  it('respects the limit parameter', () => {
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    insertCard(db, 'T1A01', PAST)
    insertCard(db, 'T1A02', PAST)
    insertCard(db, 'T2A01', PAST)
    insertCard(db, 'T3A01', PAST)
    const queue = getDueSrsQueue(db, { tier: 'technician', limit: 2 })
    expect(queue).toHaveLength(2)
    db.close()
  })

  it('returns full question objects with id, examTier, and questionText', () => {
    const db = makeDb()
    seedQuestions(db, ALL_QUESTIONS)
    insertCard(db, 'T1A01', PAST)
    const [q] = getDueSrsQueue(db, { tier: 'technician' })
    expect(q.id).toBe('T1A01')
    expect(q.examTier).toBe('technician')
    expect(typeof q.questionText).toBe('string')
    expect(Array.isArray(q.answers)).toBe(true)
    db.close()
  })
})

// ---------------------------------------------------------------------------
// getAccuracyHeatmap
// ---------------------------------------------------------------------------

describe('getAccuracyHeatmap', () => {
  it('returns an empty cells array when the DB has no questions', () => {
    const db = makeDb()
    const { cells } = getAccuracyHeatmap(db, { tier: 'all', minAttempts: 0 })
    expect(cells).toHaveLength(0)
    db.close()
  })

  it('returns one cell per distinct group_id with minAttempts=0', () => {
    // MULTI_QUESTIONS has 4 distinct groups: T1A, T2A, T3A, G1A
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    const { cells } = getAccuracyHeatmap(db, { tier: 'all', minAttempts: 0 })
    expect(cells).toHaveLength(4)
    db.close()
  })

  it('computes accuracyPct as 75 for 3 correct out of 4 attempts', () => {
    const db = makeDb()
    seedQuestions(db, ALL_QUESTIONS)
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true,  timeTakenMs: 500, sessionId: 's1', answeredAt: OLD_DATE })
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true,  timeTakenMs: 500, sessionId: 's1', answeredAt: OLD_DATE })
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true,  timeTakenMs: 500, sessionId: 's1', answeredAt: OLD_DATE })
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 1, isCorrect: false, timeTakenMs: 500, sessionId: 's1', answeredAt: OLD_DATE })
    const { cells } = getAccuracyHeatmap(db, { tier: 'technician', minAttempts: 1 })
    const cell = cells.find((c) => c.groupId === 'T1A')!
    expect(cell.attempts).toBe(4)
    expect(cell.correctAnswers).toBe(3)
    expect(cell.accuracyPct).toBe(75)
    db.close()
  })

  it('reports 0% accuracyPct when all answers are wrong', () => {
    const db = makeDb()
    seedQuestions(db, ALL_QUESTIONS)
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 1, isCorrect: false, timeTakenMs: 500, sessionId: 's1', answeredAt: OLD_DATE })
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 1, isCorrect: false, timeTakenMs: 500, sessionId: 's1', answeredAt: OLD_DATE })
    const { cells } = getAccuracyHeatmap(db, { tier: 'technician', minAttempts: 1 })
    const cell = cells.find((c) => c.groupId === 'T1A')!
    expect(cell.accuracyPct).toBe(0)
    db.close()
  })

  it('reports attempts=0 and accuracyPct=0 for unanswered groups when minAttempts=0', () => {
    const db = makeDb()
    seedQuestions(db, ALL_QUESTIONS)
    const { cells } = getAccuracyHeatmap(db, { tier: 'all', minAttempts: 0 })
    for (const cell of cells) {
      expect(cell.attempts).toBe(0)
      expect(cell.accuracyPct).toBe(0)
    }
    db.close()
  })

  it('filters by tier — only returns cells for the requested tier', () => {
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    const { cells } = getAccuracyHeatmap(db, { tier: 'general', minAttempts: 0 })
    expect(cells.length).toBeGreaterThan(0)
    expect(cells.every((c) => c.examTier === 'general')).toBe(true)
    db.close()
  })

  it('minAttempts=1 excludes groups with no answers', () => {
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    // Only answer one question in the T1A group
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 500, sessionId: 's1', answeredAt: OLD_DATE })
    const { cells } = getAccuracyHeatmap(db, { tier: 'technician', minAttempts: 1 })
    expect(cells).toHaveLength(1) // only T1A was answered
    expect(cells[0].groupId).toBe('T1A')
    db.close()
  })

  it('respects the limit parameter', () => {
    const db = makeDb()
    seedQuestions(db, MULTI_QUESTIONS)
    const { cells } = getAccuracyHeatmap(db, { tier: 'all', minAttempts: 0, limit: 2 })
    expect(cells).toHaveLength(2)
    db.close()
  })

  it('cell shape has all required fields', () => {
    const db = makeDb()
    seedQuestions(db, ALL_QUESTIONS)
    saveUserAnswer(db, { questionId: 'T1A01', selectedIndex: 0, isCorrect: true, timeTakenMs: 500, sessionId: 's1', answeredAt: OLD_DATE })
    const { cells } = getAccuracyHeatmap(db, { tier: 'technician', minAttempts: 1 })
    const cell = cells[0]
    expect(cell).toHaveProperty('examTier')
    expect(cell).toHaveProperty('subElement')
    expect(cell).toHaveProperty('groupId')
    expect(cell).toHaveProperty('attempts')
    expect(cell).toHaveProperty('correctAnswers')
    expect(cell).toHaveProperty('accuracyPct')
    db.close()
  })
})
