// TASK: Unit-test the SM-2 spaced repetition algorithm in computeNextSrsCard.
// HOW CODE SOLVES: Tests the exported pure function directly with fixed inputs,
//                  covering the full progression path (first→second→third correct),
//                  wrong-answer resets, ease-factor clamping, and date math.

// Mock the IPC bridge so importing useSRS.ts does not require a live Electron context.
vi.mock('@shared/ipcBridge', () => ({
  ipcBridge: {},
}))

import { computeNextSrsCard } from './useSRS'
import type { SRSCard } from '@shared/types'

// SM-2 easeAdjustment values used throughout:
//   correct (quality=4): 0.1 - 1*(0.08+0.02) = 0.0   → ease unchanged
//   wrong   (quality=2): 0.1 - 3*(0.08+0.06) = -0.32 → ease drops

const BASE_DATE = '2025-06-01T00:00:00.000Z'

function makeCard(overrides: Partial<SRSCard>): SRSCard {
  return {
    questionId: 'T1A01',
    interval: 1,
    easeFactor: 2.5,
    nextReview: BASE_DATE,
    repetitions: 0,
    ...overrides,
  }
}

describe('computeNextSrsCard', () => {
  describe('first correct answer (no prior card)', () => {
    it('uses SRS defaults when currentCard is null', () => {
      const result = computeNextSrsCard(null, { isCorrect: true, reviewedAt: BASE_DATE }, 'T1A01')
      expect(result.questionId).toBe('T1A01')
      expect(result.repetitions).toBe(1)
      expect(result.interval).toBe(1)
      expect(result.easeFactor).toBe(2.5) // correct: easeAdjustment = 0.0
      expect(result.nextReview).toBe('2025-06-02T00:00:00.000Z') // +1 day
    })

    it('uses SRS defaults when currentCard is undefined', () => {
      const result = computeNextSrsCard(undefined, { isCorrect: true, reviewedAt: BASE_DATE }, 'T1A01')
      expect(result.repetitions).toBe(1)
      expect(result.interval).toBe(1)
    })
  })

  describe('interval progression — three consecutive correct answers', () => {
    it('second correct answer sets interval to 6', () => {
      // Simulate the state after the first correct answer
      const afterFirst = makeCard({ interval: 1, easeFactor: 2.5, repetitions: 1 })
      const result = computeNextSrsCard(afterFirst, { isCorrect: true, reviewedAt: BASE_DATE }, 'T1A01')

      expect(result.repetitions).toBe(2)
      expect(result.interval).toBe(6)
      expect(result.easeFactor).toBe(2.5)
      expect(result.nextReview).toBe('2025-06-07T00:00:00.000Z') // +6 days
    })

    it('third correct answer multiplies prior interval by ease factor', () => {
      // Simulate the state after the second correct answer: interval=6, repetitions=2
      const afterSecond = makeCard({ interval: 6, easeFactor: 2.5, repetitions: 2 })
      const result = computeNextSrsCard(afterSecond, { isCorrect: true, reviewedAt: BASE_DATE }, 'T1A01')

      // nextInterval = max(1, round(6 * 2.5)) = 15
      expect(result.repetitions).toBe(3)
      expect(result.interval).toBe(15)
      expect(result.easeFactor).toBe(2.5)
      expect(result.nextReview).toBe('2025-06-16T00:00:00.000Z') // +15 days
    })

    it('fourth correct answer keeps compounding', () => {
      const afterThird = makeCard({ interval: 15, easeFactor: 2.5, repetitions: 3 })
      const result = computeNextSrsCard(afterThird, { isCorrect: true, reviewedAt: BASE_DATE }, 'T1A01')

      // nextInterval = max(1, round(15 * 2.5)) = 38
      expect(result.interval).toBe(38)
      expect(result.repetitions).toBe(4)
    })
  })

  describe('wrong answer behavior', () => {
    it('resets repetitions to 0 and interval to 1', () => {
      const learnedCard = makeCard({ interval: 15, easeFactor: 2.5, repetitions: 3 })
      const result = computeNextSrsCard(learnedCard, { isCorrect: false, reviewedAt: BASE_DATE }, 'T1A01')

      expect(result.repetitions).toBe(0)
      expect(result.interval).toBe(1)
      expect(result.nextReview).toBe('2025-06-02T00:00:00.000Z') // +1 day
    })

    it('reduces ease factor on wrong answer (quality=2, easeAdjustment=-0.32)', () => {
      const card = makeCard({ easeFactor: 2.5 })
      const result = computeNextSrsCard(card, { isCorrect: false, reviewedAt: BASE_DATE }, 'T1A01')

      // 2.5 + (-0.32) = 2.18
      expect(result.easeFactor).toBe(2.18)
    })

    it('clamps ease factor at minimum 1.3 after multiple wrong answers', () => {
      // easeFactor close to floor so one wrong answer would push it below 1.3
      const card = makeCard({ easeFactor: 1.4, repetitions: 5, interval: 10 })
      const result = computeNextSrsCard(card, { isCorrect: false, reviewedAt: BASE_DATE }, 'T1A01')

      // max(1.3, 1.4 - 0.32) = max(1.3, 1.08) = 1.3
      expect(result.easeFactor).toBe(1.3)
    })

    it('ease factor already at floor stays at 1.3', () => {
      const card = makeCard({ easeFactor: 1.3, repetitions: 2, interval: 3 })
      const result = computeNextSrsCard(card, { isCorrect: false, reviewedAt: BASE_DATE }, 'T1A01')

      expect(result.easeFactor).toBe(1.3)
    })
  })

  describe('interval floor', () => {
    it('interval is never less than 1 even with low ease factor and short prior interval', () => {
      const card = makeCard({ interval: 1, easeFactor: 1.3, repetitions: 2 })
      const result = computeNextSrsCard(card, { isCorrect: true, reviewedAt: BASE_DATE }, 'T1A01')

      // max(1, round(1 * 1.3)) = max(1, 1) = 1
      expect(result.interval).toBeGreaterThanOrEqual(1)
    })
  })

  describe('questionId is preserved', () => {
    it('attaches the passed questionId to the returned card', () => {
      const result = computeNextSrsCard(null, { isCorrect: true, reviewedAt: BASE_DATE }, 'E5B09')
      expect(result.questionId).toBe('E5B09')
    })
  })

  describe('reviewedAt date handling', () => {
    it('uses reviewedAt to anchor nextReview', () => {
      const result = computeNextSrsCard(null, { isCorrect: true, reviewedAt: '2025-12-25T12:00:00.000Z' }, 'T1A01')
      // interval=1 → +1 day from 2025-12-25 noon = 2025-12-26 noon
      expect(result.nextReview).toBe('2025-12-26T12:00:00.000Z')
    })

    it('falls back gracefully when reviewedAt is an invalid string', () => {
      // Should not throw; nextReview should be a valid ISO string close to now
      const before = Date.now()
      const result = computeNextSrsCard(null, { isCorrect: true, reviewedAt: 'not-a-date' }, 'T1A01')
      const after = Date.now()

      const reviewDate = new Date(result.nextReview).getTime()
      // nextReview should be ~1 day after now (within a 5-second window for test timing)
      expect(reviewDate).toBeGreaterThan(before + 23 * 60 * 60 * 1000)
      expect(reviewDate).toBeLessThan(after + 25 * 60 * 60 * 1000)
    })

    it('uses current time when reviewedAt is omitted', () => {
      const before = Date.now()
      const result = computeNextSrsCard(null, { isCorrect: true }, 'T1A01')
      const after = Date.now()

      const reviewDate = new Date(result.nextReview).getTime()
      expect(reviewDate).toBeGreaterThan(before + 23 * 60 * 60 * 1000)
      expect(reviewDate).toBeLessThan(after + 25 * 60 * 60 * 1000)
    })
  })

  describe('returned card shape', () => {
    it('always returns all five SRSCard fields', () => {
      const result = computeNextSrsCard(null, { isCorrect: true, reviewedAt: BASE_DATE }, 'T1A01')
      expect(result).toHaveProperty('questionId')
      expect(result).toHaveProperty('interval')
      expect(result).toHaveProperty('easeFactor')
      expect(result).toHaveProperty('nextReview')
      expect(result).toHaveProperty('repetitions')
    })

    it('nextReview is a valid ISO 8601 string', () => {
      const result = computeNextSrsCard(null, { isCorrect: true, reviewedAt: BASE_DATE }, 'T1A01')
      expect(() => new Date(result.nextReview)).not.toThrow()
      expect(new Date(result.nextReview).toISOString()).toBe(result.nextReview)
    })
  })
})
