import { create } from 'zustand'
import { ipcBridge, type GetProgressionSummaryFilter } from '@shared/ipcBridge'
import type { ProgressionLevelTitle, UserProgressionSummary } from '@shared/types'

type ProgressionStoreState = {
  summary: UserProgressionSummary | null
  loading: boolean
  error: string | null
  refresh: (filter?: GetProgressionSummaryFilter) => Promise<UserProgressionSummary>
  clearError: () => void
}

const DEFAULT_FILTER: GetProgressionSummaryFilter = {
  streakGraceHours: 2,
}

type LevelDefinition = {
  title: ProgressionLevelTitle
  minXp: number
}

const LEVELS: LevelDefinition[] = [
  { title: 'Novice', minXp: 0 },
  { title: 'Technician', minXp: 250 },
  { title: 'General', minXp: 750 },
  { title: 'Advanced', minXp: 1500 },
  { title: 'Extra', minXp: 3000 },
  { title: 'Elmer', minXp: 5000 },
]

function resolveLevel(totalXp: number): {
  levelIndex: number
  levelTitle: ProgressionLevelTitle
  xpToNextLevel: number
  nextLevelTitle: ProgressionLevelTitle | null
} {
  let levelIndex = 0

  for (let index = 0; index < LEVELS.length; index += 1) {
    if (totalXp >= LEVELS[index].minXp) {
      levelIndex = index
    }
  }

  const levelTitle = LEVELS[levelIndex].title
  const nextLevel = LEVELS[levelIndex + 1] ?? null

  return {
    levelIndex,
    levelTitle,
    xpToNextLevel: nextLevel ? Math.max(0, nextLevel.minXp - totalXp) : 0,
    nextLevelTitle: nextLevel ? nextLevel.title : null,
  }
}

async function buildCompatibilityProgressionSummary(): Promise<UserProgressionSummary> {
  const stats = await ipcBridge.getProgressStats()
  const totalXp = stats.correctAnswers * 10 + (stats.totalAnswers - stats.correctAnswers) * 2
  const level = resolveLevel(totalXp)

  return {
    totalXp,
    levelIndex: level.levelIndex,
    levelTitle: level.levelTitle,
    xpToNextLevel: level.xpToNextLevel,
    nextLevelTitle: level.nextLevelTitle,
    currentStreakDays: 0,
    longestStreakDays: 0,
    todaysAnswers: 0,
    todaysCorrectAnswers: 0,
    todaysAccuracyPct: 0,
    dailyChallengeTarget: 10,
    dailyChallengeCompletedToday: false,
    dailyChallengeRemaining: 10,
    dailyChallengeXpBonus: 50,
  }
}

function isMissingProgressionSummaryBridgeError(err: unknown): boolean {
  const details = err instanceof Error ? err.message : String(err)
  return details.includes('Progression summary IPC bridge is not available')
}

// TASK: Provide a centralized progression state for XP/level/streak UI.
// HOW CODE SOLVES: Wraps progression-summary IPC reads in a small zustand store
//                  so screens can refresh and consume one consistent state shape.
export const useProgressionStore = create<ProgressionStoreState>((set) => ({
  summary: null,
  loading: false,
  error: null,
  refresh: async (filter = DEFAULT_FILTER) => {
    set({ loading: true, error: null })

    try {
      const summary = await ipcBridge.getProgressionSummary(filter)
      set({ summary, loading: false, error: null })
      return summary
    } catch (err: unknown) {
      if (isMissingProgressionSummaryBridgeError(err)) {
        const fallbackSummary = await buildCompatibilityProgressionSummary()
        set({ summary: fallbackSummary, loading: false, error: null })
        return fallbackSummary
      }

      const details = err instanceof Error ? err.message : String(err)
      set({ loading: false, error: `Failed to load progression summary. ${details}` })
      throw err
    }
  },
  clearError: () => set({ error: null }),
}))
