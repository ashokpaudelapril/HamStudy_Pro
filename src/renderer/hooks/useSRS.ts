import { useCallback, useRef, useState } from 'react'
import { ipcBridge } from '@shared/ipcBridge'
import type { SRSCard } from '@shared/types'

export type RecordReviewInput = {
  questionId: string
  isCorrect: boolean
  reviewedAt?: string
}

export type RecordReviewResult = {
  card: SRSCard
  persisted: boolean
  reason: 'persisted' | 'bridge-disabled' | 'persist-failed'
}

const SRS_DEFAULTS = {
  interval: 1,
  easeFactor: 2.5,
  repetitions: 0,
} as const

// TASK: Add whole-day intervals while preserving ISO timestamp output.
// HOW CODE SOLVES: Applies date-day increments and returns UTC ISO string
//                  aligned with current SQLite storage conventions.
function addDays(date: Date, days: number): string {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next.toISOString()
}

// TASK: Compute the next SM-2 card state after a review event.
// HOW CODE SOLVES: Mirrors backend interval/ease/repetition transitions so
//                  renderer-side behavior stays deterministic and consistent.
export function computeNextSrsCard(
  currentCard: SRSCard | null | undefined,
  input: Pick<RecordReviewInput, 'isCorrect' | 'reviewedAt'>,
  questionId: string,
): SRSCard {
  const reviewedAt = input.reviewedAt ? new Date(input.reviewedAt) : new Date()
  const normalizedReviewedAt = Number.isNaN(reviewedAt.getTime()) ? new Date() : reviewedAt

  const priorInterval = currentCard?.interval ?? SRS_DEFAULTS.interval
  const priorEaseFactor = currentCard?.easeFactor ?? SRS_DEFAULTS.easeFactor
  const priorRepetitions = currentCard?.repetitions ?? SRS_DEFAULTS.repetitions

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

  return {
    questionId,
    interval: nextInterval,
    easeFactor: nextEaseFactor,
    nextReview: addDays(normalizedReviewedAt, nextInterval),
    repetitions: nextRepetitions,
  }
}

// TASK: Manage renderer-side SRS transitions and remote persistence sync.
// HOW CODE SOLVES: Keeps local card state for deterministic updates and
//                  attempts IPC persistence, returning fallback status when unavailable.
export function useSRS() {
  const cardsRef = useRef<Record<string, SRSCard>>({})
  const [cardsByQuestionId, setCardsByQuestionId] = useState<Record<string, SRSCard>>({})

  // TASK: Store one local SRS card and keep ref/state synchronized.
  // HOW CODE SOLVES: Writes to a mutable ref for up-to-date calculations and
  //                  mirrors the same map into React state for observers.
  const setLocalCard = useCallback((questionId: string, card: SRSCard): void => {
    cardsRef.current = {
      ...cardsRef.current,
      [questionId]: card,
    }
    setCardsByQuestionId(cardsRef.current)
  }, [])

  // TASK: Clear in-memory SRS card cache.
  // HOW CODE SOLVES: Resets both state and backing ref to keep sources aligned.
  const resetLocalCards = useCallback((): void => {
    cardsRef.current = {}
    setCardsByQuestionId({})
  }, [])

  // TASK: Record one review and sync with main-process persistence when available.
  // HOW CODE SOLVES: Computes local next card immediately, then overwrites with
  //                  persisted card on success; otherwise keeps local fallback.
  const recordReview = useCallback(
    async (
      input: RecordReviewInput,
      options?: { persistRemotely?: boolean },
    ): Promise<RecordReviewResult> => {
      const currentCard = cardsRef.current[input.questionId]
      const localNext = computeNextSrsCard(currentCard, input, input.questionId)
      setLocalCard(input.questionId, localNext)

      if (options?.persistRemotely === false) {
        return {
          card: localNext,
          persisted: false,
          reason: 'bridge-disabled',
        }
      }

      try {
        const persistedCard = await ipcBridge.recordSrsReview({
          questionId: input.questionId,
          isCorrect: input.isCorrect,
          reviewedAt: input.reviewedAt,
        })
        setLocalCard(input.questionId, persistedCard)

        return {
          card: persistedCard,
          persisted: true,
          reason: 'persisted',
        }
      } catch {
        return {
          card: localNext,
          persisted: false,
          reason: 'persist-failed',
        }
      }
    },
    [setLocalCard],
  )

  return {
    cardsByQuestionId,
    recordReview,
    resetLocalCards,
  }
}
