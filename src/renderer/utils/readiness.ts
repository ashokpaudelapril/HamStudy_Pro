import type { ExamTier, TierProgressStats } from '@shared/types'

type TierReadinessProfile = {
  accuracyWeight: number
  coverageWeight: number
  dueWeight: number
  streakWeight: number
}

export type TierReadinessSummary = {
  tier: ExamTier
  score: number
  confidencePct: number
  accuracyComponent: number
  coverageComponent: number
  duePenalty: number
  streakBonus: number
}

const BASELINE_SCORE = 35

const PROFILES: Record<ExamTier, TierReadinessProfile> = {
  technician: {
    accuracyWeight: 0.62,
    coverageWeight: 0.26,
    dueWeight: 0.42,
    streakWeight: 1.1,
  },
  general: {
    accuracyWeight: 0.68,
    coverageWeight: 0.24,
    dueWeight: 0.56,
    streakWeight: 1.25,
  },
  extra: {
    accuracyWeight: 0.74,
    coverageWeight: 0.22,
    dueWeight: 0.72,
    streakWeight: 1.4,
  },
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function calculateTierReadiness(
  tierStats: TierProgressStats,
  dueCount: number,
  streakDays: number,
): TierReadinessSummary {
  const profile = PROFILES[tierStats.tier]

  const accuracyComponent = tierStats.accuracyPct * profile.accuracyWeight
  const coverageComponent = tierStats.coveragePct * profile.coverageWeight
  const duePenalty = Math.min(28, dueCount * profile.dueWeight)
  const streakBonus = Math.min(10, streakDays * profile.streakWeight)

  const rawScore = clamp(accuracyComponent + coverageComponent - duePenalty + streakBonus, 0, 100)

  // Damp scores for very small answer samples to reduce noisy early volatility.
  const confidence = clamp(tierStats.totalAnswers / 40, 0, 1)
  const score = clamp(rawScore * confidence + BASELINE_SCORE * (1 - confidence), 0, 100)

  return {
    tier: tierStats.tier,
    score: Number(score.toFixed(2)),
    confidencePct: Number((confidence * 100).toFixed(2)),
    accuracyComponent: Number(accuracyComponent.toFixed(2)),
    coverageComponent: Number(coverageComponent.toFixed(2)),
    duePenalty: Number(duePenalty.toFixed(2)),
    streakBonus: Number(streakBonus.toFixed(2)),
  }
}

export function calculateOverallReadiness(tiers: TierReadinessSummary[], tierStats: TierProgressStats[]): number {
  if (tiers.length === 0 || tierStats.length === 0) {
    return 0
  }

  const totalQuestionCount = tierStats.reduce((sum, row) => sum + row.totalQuestions, 0)
  if (totalQuestionCount === 0) {
    return 0
  }

  const byTier = new Map(tiers.map((row) => [row.tier, row]))

  let weighted = 0
  for (const row of tierStats) {
    const summary = byTier.get(row.tier)
    if (!summary) {
      continue
    }

    weighted += summary.score * (row.totalQuestions / totalQuestionCount)
  }

  return Number(clamp(weighted, 0, 100).toFixed(2))
}
