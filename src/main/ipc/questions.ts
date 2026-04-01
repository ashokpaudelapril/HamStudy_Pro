import { ipcMain } from 'electron'
import type { ExamTier, MasteryState, Question, QuestionBrowserDetail, QuestionBrowserRow } from '../../shared/types'
import { getDb } from '../db/database'
import {
  getCustomQuizQuestionPool,
  getQuestionBrowserDetail,
  getQuestionBrowserRows,
  getQuestionById,
  getQuestionPool,
  getWeakAreaQuestionPool,
  searchQuestions,
  updateQuestionReviewState,
} from '../db/queries'

type QuestionPoolFilter = { tier: ExamTier }
type QuestionByIdFilter = { questionId: string }
type QuestionSearchFilter = { query: string; tier?: ExamTier; limit?: number }
type QuestionBrowserFilter = {
  tier: ExamTier
  query?: string
  subElement?: string
  starredOnly?: boolean
  flaggedOnly?: boolean
  mastery?: MasteryState
  limit?: number
}
type WeakAreaPoolFilter = { tier: ExamTier; limit?: number; recentAnswers?: number; weakSubElements?: number }
type CustomQuizPoolFilter = { tier: ExamTier; subElements?: string[]; limit?: number }
type UpdateQuestionReviewStateInput = { questionId: string; starred?: boolean; flagged?: boolean }
type QuestionBrowserDetailFilter = { questionId: string; recentLimit?: number }

// TASK: Register IPC handlers for question pool retrieval.
// HOW CODE SOLVES: Enables the renderer to request DB-backed question lists
//                   via typed IPC (`questions:get-pool`), without direct DB access.
export function registerQuestionsIpcHandlers(): void {
  ipcMain.handle('questions:get-pool', handleGetQuestionPool)
  ipcMain.handle('questions:get-by-id', handleGetQuestionById)
  ipcMain.handle('questions:search', handleSearchQuestions)
  ipcMain.handle('questions:get-browser-rows', handleGetQuestionBrowserRows)
  ipcMain.handle('questions:get-browser-detail', handleGetQuestionBrowserDetail)
  ipcMain.handle('questions:update-review-state', handleUpdateQuestionReviewState)
  ipcMain.handle('questions:get-weak-area-pool', handleGetWeakAreaPool)
  ipcMain.handle('questions:get-custom-quiz-pool', handleGetCustomQuizPool)
}

// TASK: IPC handler for `questions:get-pool`.
// HOW CODE SOLVES: Retrieves SQLite question records by exam tier using the
//                   centralized query-layer function, then returns them to renderer.
async function handleGetQuestionPool(_evt: unknown, filter: QuestionPoolFilter): Promise<Question[]> {
  try {
    const db = getDb()
    return getQuestionPool(db, filter.tier)
  } catch {
    // Avoid leaking internal details and paths to renderer.
    throw new Error('Failed to load questions.')
  }
}

// TASK: IPC handler for `questions:get-by-id`.
// HOW CODE SOLVES: Performs a primary-key lookup against the centralized
//                   query layer and returns either one typed question or null.
async function handleGetQuestionById(_evt: unknown, filter: QuestionByIdFilter): Promise<Question | null> {
  try {
    const db = getDb()
    return getQuestionById(db, filter.questionId)
  } catch {
    throw new Error('Failed to load question details.')
  }
}

// TASK: IPC handler for `questions:search`.
// HOW CODE SOLVES: Delegates search filtering/limits to DB query functions,
//                   keeping renderer free of direct SQL logic.
async function handleSearchQuestions(_evt: unknown, filter: QuestionSearchFilter): Promise<Question[]> {
  try {
    const db = getDb()
    return searchQuestions(db, filter)
  } catch {
    throw new Error('Failed to search questions.')
  }
}

// TASK: IPC handler for `questions:get-browser-rows`.
// HOW CODE SOLVES: Returns rows tailored for browser list filtering and mastery display.
async function handleGetQuestionBrowserRows(_evt: unknown, filter: QuestionBrowserFilter): Promise<QuestionBrowserRow[]> {
  try {
    const db = getDb()
    return getQuestionBrowserRows(db, filter)
  } catch {
    throw new Error('Failed to load question browser rows.')
  }
}

// TASK: IPC handler for `questions:get-browser-detail`.
// HOW CODE SOLVES: Returns explanation/history/SRS detail payload for selected question.
async function handleGetQuestionBrowserDetail(
  _evt: unknown,
  filter: QuestionBrowserDetailFilter,
): Promise<QuestionBrowserDetail | null> {
  try {
    const db = getDb()
    return getQuestionBrowserDetail(db, filter)
  } catch {
    throw new Error('Failed to load question browser detail.')
  }
}

// TASK: IPC handler for `questions:update-review-state`.
// HOW CODE SOLVES: Saves starred/flagged review state and returns updated question details.
async function handleUpdateQuestionReviewState(_evt: unknown, input: UpdateQuestionReviewStateInput): Promise<Question> {
  try {
    const db = getDb()
    return updateQuestionReviewState(db, input)
  } catch {
    throw new Error('Failed to update question review state.')
  }
}

// TASK: IPC handler for `questions:get-weak-area-pool`.
// HOW CODE SOLVES: Returns a tier-scoped question set prioritized by the user's
//                   weakest recent sub-elements, computed in the DB layer.
async function handleGetWeakAreaPool(_evt: unknown, filter: WeakAreaPoolFilter): Promise<Question[]> {
  try {
    const db = getDb()
    return getWeakAreaQuestionPool(db, filter)
  } catch {
    throw new Error('Failed to load weak-area question pool.')
  }
}

// TASK: IPC handler for `questions:get-custom-quiz-pool`.
// HOW CODE SOLVES: Returns randomized tier/sub-element filtered questions
//                   for user-driven custom quiz sessions.
async function handleGetCustomQuizPool(_evt: unknown, filter: CustomQuizPoolFilter): Promise<Question[]> {
  try {
    const db = getDb()
    return getCustomQuizQuestionPool(db, filter)
  } catch {
    throw new Error('Failed to load custom quiz question pool.')
  }
}

