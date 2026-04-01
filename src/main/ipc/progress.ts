import { ipcMain } from 'electron'
import type {
  AccuracyHeatmapData,
  DailyChallengeEvent,
  EarnedBadge,
  ExamTier,
  ProgressionTrendData,
  Question,
  RecentAnswerActivity,
  SRSCard,
  Session,
  TierProgressStats,
  UserAnswer,
  UserProgressionSummary,
} from '../../shared/types'
import { getDb } from '../db/database'
import {
  getAccuracyHeatmap,
  getDailyChallengeEvents,
  getDueSrsQueue,
  getEarnedBadges,
  getProgressStats,
  getTierProgressStats,
  getProgressionTrend,
  getRecentAnswerActivity,
  getSessionHistory,
  getUserProgressionSummary,
  recordSrsReview,
  saveUserAnswer,
  type ProgressAnswerInput,
  type AccuracyHeatmapFilter,
  type DailyChallengeEventFilter,
  type ProgressionSummaryFilter,
  type ProgressionTrendFilter,
  type ProgressStats,
  type RecentAnswerActivityFilter,
  type RecordSrsReviewInput,
} from '../db/queries'

type SessionHistoryFilter = {
  limit?: number
}

type DueSrsQueueFilter = {
  tier: ExamTier
  limit?: number
}

// TASK: Register IPC handlers for progress persistence and analytics reads.
// HOW CODE SOLVES: Exposes a narrow set of progress endpoints while keeping
//                   all DB writes and aggregation logic in the main process.
export function registerProgressIpcHandlers(): void {
  ipcMain.handle('progress:save-answer', handleSaveAnswer)
  ipcMain.handle('progress:get-stats', handleGetStats)
  ipcMain.handle('progress:get-tier-stats', handleGetTierStats)
  ipcMain.handle('progress:get-session-history', handleGetSessionHistory)
  ipcMain.handle('progress:get-recent-answer-activity', handleGetRecentAnswerActivity)
  ipcMain.handle('progress:get-daily-challenge-events', handleGetDailyChallengeEvents)
  ipcMain.handle('progress:get-accuracy-heatmap', handleGetAccuracyHeatmap)
  ipcMain.handle('progress:get-progression-summary', handleGetProgressionSummary)
  ipcMain.handle('progress:get-progression-trend', handleGetProgressionTrend)
  ipcMain.handle('progress:get-due-srs-queue', handleGetDueSrsQueue)
  ipcMain.handle('progress:record-srs-review', handleRecordSrsReview)
  ipcMain.handle('progress:get-earned-badges', handleGetEarnedBadges)
}

// TASK: IPC handler for `progress:save-answer`.
// HOW CODE SOLVES: Persists a single answer event with normalized timestamps,
//                   then returns the inserted row as a typed payload.
async function handleSaveAnswer(_evt: unknown, payload: ProgressAnswerInput): Promise<UserAnswer> {
  try {
    const db = getDb()
    return saveUserAnswer(db, payload)
  } catch {
    throw new Error('Failed to save answer progress.')
  }
}

// TASK: IPC handler for `progress:get-stats`.
// HOW CODE SOLVES: Returns aggregate correctness and coverage metrics for
//                   dashboard/readiness widgets.
async function handleGetStats(): Promise<ProgressStats> {
  try {
    const db = getDb()
    return getProgressStats(db)
  } catch {
    throw new Error('Failed to load progress stats.')
  }
}

// TASK: IPC handler for `progress:get-tier-stats`.
// HOW CODE SOLVES: Returns persisted per-tier accuracy/coverage aggregates.
async function handleGetTierStats(): Promise<TierProgressStats[]> {
  try {
    const db = getDb()
    return getTierProgressStats(db)
  } catch {
    throw new Error('Failed to load tier progress stats.')
  }
}

// TASK: IPC handler for `progress:get-session-history`.
// HOW CODE SOLVES: Fetches recent session records with an optional limit,
//                   supporting future history and analytics screens.
async function handleGetSessionHistory(_evt: unknown, payload?: SessionHistoryFilter): Promise<Session[]> {
  try {
    const db = getDb()
    return getSessionHistory(db, { limit: payload?.limit })
  } catch {
    throw new Error('Failed to load session history.')
  }
}

// TASK: IPC handler for `progress:get-recent-answer-activity`.
// HOW CODE SOLVES: Returns latest answer events joined with question metadata
//                  for dashboard activity rendering.
async function handleGetRecentAnswerActivity(
  _evt: unknown,
  payload?: RecentAnswerActivityFilter,
): Promise<RecentAnswerActivity[]> {
  try {
    const db = getDb()
    return getRecentAnswerActivity(db, { limit: payload?.limit })
  } catch {
    throw new Error('Failed to load recent answer activity.')
  }
}

// TASK: IPC handler for `progress:get-daily-challenge-events`.
// HOW CODE SOLVES: Returns persisted challenge completion events for audit/history surfaces.
async function handleGetDailyChallengeEvents(
  _evt: unknown,
  payload?: DailyChallengeEventFilter,
): Promise<DailyChallengeEvent[]> {
  try {
    const db = getDb()
    return getDailyChallengeEvents(db, { limit: payload?.limit })
  } catch {
    throw new Error('Failed to load daily challenge events.')
  }
}

// TASK: IPC handler for `progress:get-accuracy-heatmap`.
// HOW CODE SOLVES: Returns grouped accuracy cells for analytics heatmap rendering.
async function handleGetAccuracyHeatmap(_evt: unknown, payload?: AccuracyHeatmapFilter): Promise<AccuracyHeatmapData> {
  try {
    const db = getDb()
    return getAccuracyHeatmap(db, payload)
  } catch {
    throw new Error('Failed to load accuracy heatmap.')
  }
}

// TASK: IPC handler for `progress:get-progression-summary`.
// HOW CODE SOLVES: Returns XP, level, and streak metrics derived from
//                  persisted answer history using deterministic rules.
async function handleGetProgressionSummary(
  _evt: unknown,
  payload?: ProgressionSummaryFilter,
): Promise<UserProgressionSummary> {
  try {
    const db = getDb()
    return getUserProgressionSummary(db, payload)
  } catch {
    throw new Error('Failed to load user progression summary.')
  }
}

// TASK: IPC handler for `progress:get-progression-trend`.
// HOW CODE SOLVES: Returns day-by-day XP/level/streak points used by analytics overlays.
async function handleGetProgressionTrend(_evt: unknown, payload?: ProgressionTrendFilter): Promise<ProgressionTrendData> {
  try {
    const db = getDb()
    return getProgressionTrend(db, payload)
  } catch {
    throw new Error('Failed to load progression trend.')
  }
}

// TASK: IPC handler for `progress:get-due-srs-queue`.
// HOW CODE SOLVES: Returns due SRS questions for the selected tier.
async function handleGetDueSrsQueue(_evt: unknown, payload: DueSrsQueueFilter): Promise<Question[]> {
  try {
    const db = getDb()
    return getDueSrsQueue(db, payload)
  } catch {
    throw new Error('Failed to load due SRS queue.')
  }
}

// TASK: IPC handler for `progress:record-srs-review`.
// HOW CODE SOLVES: Applies SM-2 style updates to per-question SRS state.
async function handleRecordSrsReview(_evt: unknown, payload: RecordSrsReviewInput): Promise<SRSCard> {
  try {
    const db = getDb()
    return recordSrsReview(db, payload)
  } catch {
    throw new Error('Failed to update SRS review state.')
  }
}

// TASK: IPC handler for `progress:get-earned-badges`.
// HOW CODE SOLVES: Evaluates all badge conditions from existing DB data and returns
//                  the full badge list with unlockedAt set for earned badges.
async function handleGetEarnedBadges(): Promise<EarnedBadge[]> {
  try {
    const db = getDb()
    return getEarnedBadges(db)
  } catch {
    throw new Error('Failed to load earned badges.')
  }
}