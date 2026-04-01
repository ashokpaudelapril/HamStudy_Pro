import { contextBridge, ipcRenderer } from 'electron'
import type {
  AccuracyHeatmapFilter,
  GetSessionHistoryFilter,
  GetRecentChatHistoryFilter,
  ProgressAnswerInput,
  ProgressStats,
  QuestionPoolFilter,
  CustomQuizPoolFilter,
  DueSrsQueueFilter,
  RecordSrsReviewInput,
  QuestionBrowserFilter,
  QuestionBrowserDetailFilter,
  UpdateQuestionReviewStateInput,
  QuestionSearchFilter,
  GetProgressionSummaryFilter,
  GetProgressionTrendFilter,
  ResetAppDataResult,
  RecentAnswerActivityFilter,
  WeakAreaPoolFilter,
  DailyChallengeEventFilter,
} from '../shared/ipcBridge'
import type {
  AccuracyHeatmapData,
  AiProvider,
  ApiKeyStatus,
  ChatMessage,
  DailyChallengeEvent,
  EarnedBadge,
  ProgressionTrendData,
  Question,
  QuestionBrowserDetail,
  QuestionBrowserRow,
  RecentAnswerActivity,
  SRSCard,
  SendChatMessageInput,
  Session,
  TierProgressStats,
  UserAnswer,
  UserProgressionSummary,
  UserSettings,
  VoiceDiagnostics,
  VoiceOption,
  VoiceSpeakInput,
  VoiceSpeakResult,
} from '../shared/types'

// TASK: IPC helper for `questions:get-pool`.
// HOW CODE SOLVES: Uses Electron IPC to execute DB queries in the main
//                   process and return typed results to the renderer.
async function getQuestionPool(filter: QuestionPoolFilter): Promise<Question[]> {
  return ipcRenderer.invoke('questions:get-pool', { tier: filter.tier })
}

// TASK: IPC helper for `questions:get-by-id`.
// HOW CODE SOLVES: Requests a single question document from main by stable ID.
async function getQuestionById(questionId: string): Promise<Question | null> {
  return ipcRenderer.invoke('questions:get-by-id', { questionId })
}

// TASK: IPC helper for `questions:search`.
// HOW CODE SOLVES: Sends query/tier/limit criteria to main for SQL-backed
//                   question searching without exposing DB access to renderer.
async function searchQuestions(filter: QuestionSearchFilter): Promise<Question[]> {
  return ipcRenderer.invoke('questions:search', filter)
}

// TASK: IPC helper for `questions:get-browser-rows`.
// HOW CODE SOLVES: Returns tier/query/mastery filtered rows for browser list rendering.
async function getQuestionBrowserRows(filter: QuestionBrowserFilter): Promise<QuestionBrowserRow[]> {
  return ipcRenderer.invoke('questions:get-browser-rows', filter)
}

// TASK: IPC helper for `questions:get-browser-detail`.
// HOW CODE SOLVES: Loads explanation/history/SRS payload for one selected question.
async function getQuestionBrowserDetail(filter: QuestionBrowserDetailFilter): Promise<QuestionBrowserDetail | null> {
  return ipcRenderer.invoke('questions:get-browser-detail', filter)
}

// TASK: IPC helper for `questions:update-review-state`.
// HOW CODE SOLVES: Persists starred/flagged question state for browser-driven review workflows.
async function updateQuestionReviewState(input: UpdateQuestionReviewStateInput): Promise<Question> {
  return ipcRenderer.invoke('questions:update-review-state', input)
}

// TASK: IPC helper for `questions:get-weak-area-pool`.
// HOW CODE SOLVES: Requests a prioritized weak-area question set from main process DB logic.
async function getWeakAreaQuestionPool(filter: WeakAreaPoolFilter): Promise<Question[]> {
  return ipcRenderer.invoke('questions:get-weak-area-pool', filter)
}

// TASK: IPC helper for `questions:get-custom-quiz-pool`.
// HOW CODE SOLVES: Requests a randomized pool filtered by tier/sub-elements/limit.
async function getCustomQuizQuestionPool(filter: CustomQuizPoolFilter): Promise<Question[]> {
  return ipcRenderer.invoke('questions:get-custom-quiz-pool', filter)
}

// TASK: IPC helper for `progress:save-answer`.
// HOW CODE SOLVES: Persists answer events through main process and returns
//                   the stored answer payload.
async function saveAnswer(payload: ProgressAnswerInput): Promise<UserAnswer> {
  return ipcRenderer.invoke('progress:save-answer', payload)
}

// TASK: IPC helper for `progress:get-stats`.
// HOW CODE SOLVES: Retrieves aggregate progress metrics computed from DB rows.
async function getProgressStats(): Promise<ProgressStats> {
  return ipcRenderer.invoke('progress:get-stats')
}

// TASK: IPC helper for `progress:get-tier-stats`.
// HOW CODE SOLVES: Loads per-tier aggregate stats used by readiness calibration.
async function getTierProgressStats(): Promise<TierProgressStats[]> {
  return ipcRenderer.invoke('progress:get-tier-stats')
}

// TASK: IPC helper for `progress:get-session-history`.
// HOW CODE SOLVES: Loads recent sessions with optional result limit.
async function getSessionHistory(filter?: GetSessionHistoryFilter): Promise<Session[]> {
  return ipcRenderer.invoke('progress:get-session-history', filter)
}

// TASK: IPC helper for `progress:get-recent-answer-activity`.
// HOW CODE SOLVES: Loads newest answer events for dashboard activity lists.
async function getRecentAnswerActivity(filter?: RecentAnswerActivityFilter): Promise<RecentAnswerActivity[]> {
  return ipcRenderer.invoke('progress:get-recent-answer-activity', filter)
}

// TASK: IPC helper for `progress:get-progression-summary`.
// HOW CODE SOLVES: Loads deterministic XP/level/streak summary values.
async function getProgressionSummary(filter?: GetProgressionSummaryFilter): Promise<UserProgressionSummary> {
  return ipcRenderer.invoke('progress:get-progression-summary', filter)
}

// TASK: IPC helper for `progress:get-progression-trend`.
// HOW CODE SOLVES: Loads daily progression points for analytics trend overlays.
async function getProgressionTrend(filter?: GetProgressionTrendFilter): Promise<ProgressionTrendData> {
  return ipcRenderer.invoke('progress:get-progression-trend', filter)
}

// TASK: IPC helper for `progress:get-accuracy-heatmap`.
// HOW CODE SOLVES: Loads grouped accuracy cells for analytics heatmap rendering.
async function getAccuracyHeatmap(filter?: AccuracyHeatmapFilter): Promise<AccuracyHeatmapData> {
  return ipcRenderer.invoke('progress:get-accuracy-heatmap', filter)
}

// TASK: IPC helper for `progress:get-due-srs-queue`.
// HOW CODE SOLVES: Loads due-question queue by tier and bounded limit.
async function getDueSrsQueue(filter: DueSrsQueueFilter): Promise<Question[]> {
  return ipcRenderer.invoke('progress:get-due-srs-queue', filter)
}

// TASK: IPC helper for `progress:record-srs-review`.
// HOW CODE SOLVES: Persists interval/ease/repetition updates after each answer.
async function recordSrsReview(payload: RecordSrsReviewInput): Promise<SRSCard> {
  return ipcRenderer.invoke('progress:record-srs-review', payload)
}

// TASK: IPC helper for `settings:get`.
// HOW CODE SOLVES: Retrieves persisted user settings from main process storage.
async function getSettings(): Promise<UserSettings> {
  return ipcRenderer.invoke('settings:get')
}

// TASK: IPC helper for `settings:save`.
// HOW CODE SOLVES: Saves a typed settings payload through main process DB APIs.
async function saveSettings(settings: UserSettings): Promise<UserSettings> {
  return ipcRenderer.invoke('settings:save', settings)
}

// TASK: IPC helper for `settings:reset-app-data`.
// HOW CODE SOLVES: Executes full user-data reset in main process and returns
//                  table-level reset counts for UI confirmation.
async function resetAppData(): Promise<ResetAppDataResult> {
  return ipcRenderer.invoke('settings:reset-app-data')
}

// TASK: IPC helper for `settings:voice-list`.
// HOW CODE SOLVES: Loads renderer-safe voice options through main process channel.
async function listVoices(): Promise<VoiceOption[]> {
  return ipcRenderer.invoke('settings:voice-list')
}

// TASK: IPC helper for `settings:voice-speak`.
// HOW CODE SOLVES: Sends text payload to main process speech shell channel.
async function speakText(input: VoiceSpeakInput): Promise<VoiceSpeakResult> {
  return ipcRenderer.invoke('settings:voice-speak', input)
}

// TASK: IPC helper for `settings:voice-stop`.
// HOW CODE SOLVES: Requests active speech stop through main process shell channel.
async function stopSpeech(): Promise<VoiceSpeakResult> {
  return ipcRenderer.invoke('settings:voice-stop')
}

// TASK: IPC helper for `settings:voice-diagnostics`.
// HOW CODE SOLVES: Loads runtime speech support diagnostics through main process checks.
async function getVoiceDiagnostics(): Promise<VoiceDiagnostics> {
  return ipcRenderer.invoke('settings:voice-diagnostics')
}

// TASK: IPC helper for `keychain:set-api-key`.
// HOW CODE SOLVES: Stores user provider keys in the main-process Keychain layer only.
async function setApiKey(input: { provider: AiProvider; key: string }): Promise<{ success: boolean }> {
  return ipcRenderer.invoke('keychain:set-api-key', input)
}

// TASK: IPC helper for `keychain:delete-api-key`.
// HOW CODE SOLVES: Deletes a stored provider key without exposing any key material to renderer state.
async function deleteApiKey(input: { provider: AiProvider }): Promise<{ success: boolean }> {
  return ipcRenderer.invoke('keychain:delete-api-key', input)
}

// TASK: IPC helper for `keychain:get-api-key-status`.
// HOW CODE SOLVES: Returns provider presence booleans so settings UI can gate Tier 2 features safely.
async function getApiKeyStatus(): Promise<ApiKeyStatus[]> {
  return ipcRenderer.invoke('keychain:get-api-key-status')
}

// TASK: IPC helper for `ai:get-chat-history`.
// HOW CODE SOLVES: Loads recently persisted tutor messages through main-process DB access.
async function getRecentChatHistory(filter?: GetRecentChatHistoryFilter): Promise<ChatMessage[]> {
  return ipcRenderer.invoke('ai:get-chat-history', filter)
}

// TASK: IPC helper for `ai:get-adaptive-plan`.
// HOW CODE SOLVES: Requests a one-shot adaptive study plan from main, which reads progress
//                  from SQLite and calls the AI provider, returning the full plan as a string.
async function getAdaptivePlan(): Promise<string> {
  return ipcRenderer.invoke('ai:get-adaptive-plan')
}

// TASK: IPC helper for `ai:get-user-mnemonic`.
// HOW CODE SOLVES: Reads any previously saved custom mnemonic for a question without
//                  triggering an AI call — used to pre-populate the mnemonic section on load.
async function getUserMnemonic(questionId: string): Promise<string | null> {
  return ipcRenderer.invoke('ai:get-user-mnemonic', { questionId })
}

// TASK: IPC helper for `ai:generate-mnemonic`.
// HOW CODE SOLVES: Sends the question ID to main, which calls the AI provider, saves the
//                  result to user_mnemonics, and returns the mnemonic string.
async function generateMnemonic(questionId: string): Promise<string> {
  return ipcRenderer.invoke('ai:generate-mnemonic', { questionId })
}

// TASK: IPC helper for `ai:chat-message`.
// HOW CODE SOLVES: Sends the user's chat payload to main where the provider call and streaming occur.
async function sendChatMessage(input: SendChatMessageInput): Promise<void> {
  return ipcRenderer.invoke('ai:chat-message', input)
}

// TASK: IPC event subscription for streaming AI text chunks.
// HOW CODE SOLVES: Registers a scoped listener and returns an unsubscribe function for cleanup.
function onAiChunk(callback: (chunk: string) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, chunk: string) => {
    callback(chunk)
  }
  ipcRenderer.on('ai:chunk', listener)
  return () => {
    ipcRenderer.removeListener('ai:chunk', listener)
  }
}

// TASK: IPC event subscription for AI stream completion.
// HOW CODE SOLVES: Lets the renderer stop loading state when the main-process stream ends.
function onAiChunkEnd(callback: () => void): () => void {
  const listener = () => {
    callback()
  }
  ipcRenderer.on('ai:chunk-end', listener)
  return () => {
    ipcRenderer.removeListener('ai:chunk-end', listener)
  }
}

// TASK: IPC event subscription for streaming AI errors.
// HOW CODE SOLVES: Forwards provider/runtime failures back to renderer without leaking secrets.
function onAiError(callback: (error: string) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, error: string) => {
    callback(error)
  }
  ipcRenderer.on('ai:error', listener)
  return () => {
    ipcRenderer.removeListener('ai:error', listener)
  }
}

// TASK: Expose a minimal typed bridge to renderer code.
// HOW CODE SOLVES: Publishes a narrow API surface through contextBridge so
//                   renderer code can call IPC-backed methods without
//                   direct Node access or secret exposure.
contextBridge.exposeInMainWorld('hamstudy', {
  version: '0.1.0',
  getQuestionPool,
  getQuestionById,
  searchQuestions,
  getQuestionBrowserRows,
  getQuestionBrowserDetail,
  updateQuestionReviewState,
  getWeakAreaQuestionPool,
  getCustomQuizQuestionPool,
  saveAnswer,
  getProgressStats,
  getTierProgressStats,
  getSessionHistory,
  getRecentAnswerActivity,
  getProgressionSummary,
  getProgressionTrend,
  getAccuracyHeatmap,
  getDueSrsQueue,
  recordSrsReview,
  getSettings,
  saveSettings,
  resetAppData,
  listVoices,
  speakText,
  stopSpeech,
  getVoiceDiagnostics,
  getDailyChallengeEvents,
  setApiKey,
  deleteApiKey,
  getApiKeyStatus,
  getRecentChatHistory,
  sendChatMessage,
  onAiChunk,
  onAiChunkEnd,
  onAiError,
  getAdaptivePlan,
  getUserMnemonic,
  generateMnemonic,
  getEarnedBadges,
})

// TASK: IPC helper for `progress:get-daily-challenge-events`.
// HOW CODE SOLVES: Loads persisted challenge completion records for analytics panels.
async function getDailyChallengeEvents(filter?: DailyChallengeEventFilter): Promise<DailyChallengeEvent[]> {
  return ipcRenderer.invoke('progress:get-daily-challenge-events', filter)
}

// TASK: IPC helper for `progress:get-earned-badges`.
// HOW CODE SOLVES: Fetches the full badge list with unlock state derived from DB data in main process.
async function getEarnedBadges(): Promise<EarnedBadge[]> {
  return ipcRenderer.invoke('progress:get-earned-badges')
}
