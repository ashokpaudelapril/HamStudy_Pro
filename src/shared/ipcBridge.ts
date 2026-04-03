import type {
  AccuracyHeatmapData,
  AiProvider,
  ApiKeyStatus,
  DailyChallengeEvent,
  EarnedBadge,
  MasteryState,
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
} from './types'

export interface QuestionPoolFilter {
  tier: 'technician' | 'general' | 'extra'
}

export interface QuestionSearchFilter {
  query: string
  tier?: 'technician' | 'general' | 'extra'
  limit?: number
}

export interface CustomQuizPoolFilter {
  tier: 'technician' | 'general' | 'extra'
  subElements?: string[]
  limit?: number
}

export interface WeakAreaPoolFilter {
  tier: 'technician' | 'general' | 'extra'
  limit?: number
  recentAnswers?: number
  weakSubElements?: number
}

export interface ProgressAnswerInput {
  questionId: string
  selectedIndex: number
  isCorrect: boolean
  timeTakenMs: number
  sessionId: string
  answeredAt?: string
}

export interface ProgressStats {
  totalAnswers: number
  correctAnswers: number
  accuracyPct: number
  uniqueQuestionsAnswered: number
}

export interface GetSessionHistoryFilter {
  limit?: number
}

export interface RecentAnswerActivityFilter {
  limit?: number
}

export interface DailyChallengeEventFilter {
  limit?: number
}

export interface AccuracyHeatmapFilter {
  tier?: 'all' | 'technician' | 'general' | 'extra'
  minAttempts?: number
  limit?: number
}

export interface GetProgressionSummaryFilter {
  streakGraceHours?: number
}

export interface GetProgressionTrendFilter {
  days?: number
  streakGraceHours?: number
  tier?: 'all' | 'technician' | 'general' | 'extra'
}

export interface DueSrsQueueFilter {
  tier: 'technician' | 'general' | 'extra'
  limit?: number
}

export interface RecordSrsReviewInput {
  questionId: string
  isCorrect: boolean
  reviewedAt?: string
}

export interface QuestionBrowserFilter {
  tier: 'technician' | 'general' | 'extra'
  query?: string
  subElement?: string
  starredOnly?: boolean
  flaggedOnly?: boolean
  mastery?: MasteryState
  limit?: number
}

export interface QuestionBrowserDetailFilter {
  questionId: string
  recentLimit?: number
}

export interface UpdateQuestionReviewStateInput {
  questionId: string
  starred?: boolean
  flagged?: boolean
}

export interface ReloadAuthoredContentResult {
  ok: true
}

export interface ResetAppDataResult {
  clearedAnswers: number
  clearedSessions: number
  clearedSrsCards: number
  resetQuestionReviewState: number
  clearedSettings: number
}

export interface GetRecentChatHistoryFilter {
  limit?: number
}

declare global {
  interface GlobalThis {
    hamstudy?: {
      version: string
      getQuestionPool: (filter: QuestionPoolFilter) => Promise<Question[]>
      getQuestionById: (questionId: string) => Promise<Question | null>
      searchQuestions: (filter: QuestionSearchFilter) => Promise<Question[]>
      getQuestionBrowserRows: (filter: QuestionBrowserFilter) => Promise<QuestionBrowserRow[]>
      getQuestionBrowserDetail: (filter: QuestionBrowserDetailFilter) => Promise<QuestionBrowserDetail | null>
      updateQuestionReviewState: (input: UpdateQuestionReviewStateInput) => Promise<Question>
      getWeakAreaQuestionPool: (filter: WeakAreaPoolFilter) => Promise<Question[]>
      getCustomQuizQuestionPool: (filter: CustomQuizPoolFilter) => Promise<Question[]>
      reloadAuthoredContent: () => Promise<ReloadAuthoredContentResult>
      saveAnswer: (payload: ProgressAnswerInput) => Promise<UserAnswer>
      getProgressStats: () => Promise<ProgressStats>
      getTierProgressStats: () => Promise<TierProgressStats[]>
      getSessionHistory: (filter?: GetSessionHistoryFilter) => Promise<Session[]>
      getRecentAnswerActivity: (filter?: RecentAnswerActivityFilter) => Promise<RecentAnswerActivity[]>
      getDailyChallengeEvents: (filter?: DailyChallengeEventFilter) => Promise<DailyChallengeEvent[]>
      getAccuracyHeatmap: (filter?: AccuracyHeatmapFilter) => Promise<AccuracyHeatmapData>
      getProgressionSummary: (filter?: GetProgressionSummaryFilter) => Promise<UserProgressionSummary>
      getProgressionTrend: (filter?: GetProgressionTrendFilter) => Promise<ProgressionTrendData>
      getDueSrsQueue: (filter: DueSrsQueueFilter) => Promise<Question[]>
      recordSrsReview: (payload: RecordSrsReviewInput) => Promise<SRSCard>
      getSettings: () => Promise<UserSettings>
      saveSettings: (settings: UserSettings) => Promise<UserSettings>
      resetAppData: () => Promise<ResetAppDataResult>
      listVoices: () => Promise<VoiceOption[]>
      speakText: (input: VoiceSpeakInput) => Promise<VoiceSpeakResult>
      stopSpeech: () => Promise<VoiceSpeakResult>
      getVoiceDiagnostics: () => Promise<VoiceDiagnostics>
      setApiKey: (input: { provider: AiProvider; key: string }) => Promise<{ success: boolean }>
      deleteApiKey: (input: { provider: AiProvider }) => Promise<{ success: boolean }>
      getApiKeyStatus: () => Promise<ApiKeyStatus[]>,
      getRecentChatHistory: (filter?: GetRecentChatHistoryFilter) => Promise<import('./types').ChatMessage[]>,
      sendChatMessage: (input: SendChatMessageInput) => Promise<void>,
      onAiChunk: (callback: (chunk: string) => void) => () => void,
      onAiChunkEnd: (callback: () => void) => () => void,
      onAiError: (callback: (error: string) => void) => () => void,
      getAdaptivePlan: () => Promise<string>,
      getUserMnemonic: (questionId: string) => Promise<string | null>,
      generateMnemonic: (questionId: string) => Promise<string>,
      getEarnedBadges: () => Promise<EarnedBadge[]>,
    }
  }
}

type HamstudyApi = NonNullable<GlobalThis['hamstudy']>

// ISSUE: Bridge lookup only on `globalThis.hamstudy` can fail in some runtime contexts
//        where the bridge is attached to `window` but not resolved through the cast path.
// FIX APPLIED: Resolve bridge via `window.hamstudy` first, then fallback to `globalThis`.
function getHamstudyApi(): HamstudyApi | null {
  const fromWindow = (globalThis as { window?: { hamstudy?: HamstudyApi } }).window?.hamstudy
  const fromGlobal = (globalThis as { hamstudy?: HamstudyApi }).hamstudy
  return fromWindow ?? fromGlobal ?? null
}

// ISSUE: During dev startup/HMR reloads, renderer code can run before preload bridge is visible.
// FIX APPLIED: Retry bridge detection briefly before throwing to avoid false-negative startup errors.
async function getHamstudyApiOrThrow(): Promise<HamstudyApi> {
  const immediate = getHamstudyApi()
  if (immediate) {
    return immediate
  }

  const maxAttempts = 40
  const waitMs = 50

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, waitMs))
    const next = getHamstudyApi()
    if (next) {
      return next
    }
  }

  throw new Error('Question IPC bridge is not available.')
}

// TASK: Provide a typed placeholder bridge API for renderer usage.
// HOW CODE SOLVES: Defines stable method signatures now so future IPC wiring
//                  can be added without changing screen-level call contracts.
// TASK: Renderer-side typed wrapper for `questions:get-pool`.
// HOW CODE SOLVES: Delegates the call to the preload bridge on `window.hamstudy`
//                   to keep DB/IPCs in the main process and preserve security.
async function getQuestionPoolImpl(filter: QuestionPoolFilter): Promise<Question[]> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.getQuestionPool) {
    throw new Error('Question IPC bridge is not available.')
  }
  return hamstudyApi.getQuestionPool(filter)
}

// TASK: Renderer-side typed wrapper for `questions:get-by-id`.
// HOW CODE SOLVES: Uses the preload bridge contract to fetch one question by ID.
async function getQuestionByIdImpl(questionId: string): Promise<Question | null> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.getQuestionById) {
    throw new Error('Question detail IPC bridge is not available.')
  }
  return hamstudyApi.getQuestionById(questionId)
}

// TASK: Renderer-side typed wrapper for `questions:search`.
// HOW CODE SOLVES: Delegates DB-backed search through preload IPC methods.
async function searchQuestionsImpl(filter: QuestionSearchFilter): Promise<Question[]> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.searchQuestions) {
    throw new Error('Question search IPC bridge is not available.')
  }
  return hamstudyApi.searchQuestions(filter)
}

// TASK: Renderer-side typed wrapper for `questions:get-browser-rows`.
// HOW CODE SOLVES: Loads browser list rows with tier/query/mastery/review-state filters.
async function getQuestionBrowserRowsImpl(filter: QuestionBrowserFilter): Promise<QuestionBrowserRow[]> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.getQuestionBrowserRows) {
    throw new Error('Question browser IPC bridge is not available. Restart the app to reload preload bridge changes.')
  }
  return hamstudyApi.getQuestionBrowserRows(filter)
}

// TASK: Renderer-side typed wrapper for `questions:get-browser-detail`.
// HOW CODE SOLVES: Loads explanation/history/SRS detail payload for one selected question.
async function getQuestionBrowserDetailImpl(filter: QuestionBrowserDetailFilter): Promise<QuestionBrowserDetail | null> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.getQuestionBrowserDetail) {
    throw new Error('Question browser detail IPC bridge is not available. Restart the app to reload preload bridge changes.')
  }
  return hamstudyApi.getQuestionBrowserDetail(filter)
}

// TASK: Renderer-side typed wrapper for `questions:update-review-state`.
// HOW CODE SOLVES: Persists per-question starred/flagged review flags through main process DB APIs.
async function updateQuestionReviewStateImpl(input: UpdateQuestionReviewStateInput): Promise<Question> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.updateQuestionReviewState) {
    throw new Error('Question review-state IPC bridge is not available. Restart the app to reload preload bridge changes.')
  }
  return hamstudyApi.updateQuestionReviewState(input)
}

// TASK: Renderer-side typed wrapper for `questions:get-weak-area-pool`.
// HOW CODE SOLVES: Delegates weak-area pool requests to preload IPC bridge methods.
async function getWeakAreaQuestionPoolImpl(filter: WeakAreaPoolFilter): Promise<Question[]> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.getWeakAreaQuestionPool) {
    throw new Error('Weak-area question IPC bridge is not available. Restart the app to reload preload bridge changes.')
  }
  return hamstudyApi.getWeakAreaQuestionPool(filter)
}

// TASK: Renderer-side typed wrapper for `questions:get-custom-quiz-pool`.
// HOW CODE SOLVES: Delegates custom pool requests to preload IPC bridge methods.
async function getCustomQuizQuestionPoolImpl(filter: CustomQuizPoolFilter): Promise<Question[]> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.getCustomQuizQuestionPool) {
    throw new Error('Custom quiz IPC bridge is not available. Restart the app to reload preload bridge changes.')
  }
  return hamstudyApi.getCustomQuizQuestionPool(filter)
}

// TASK: Renderer-side typed wrapper for `questions:reload-authored-content`.
// HOW CODE SOLVES: Requests re-application of local authored hint packs so UI validation
//                  can happen without restarting the Electron main process.
async function reloadAuthoredContentImpl(): Promise<ReloadAuthoredContentResult> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.reloadAuthoredContent) {
    throw new Error('Authored content reload IPC bridge is not available. Restart the app to reload preload bridge changes.')
  }
  return hamstudyApi.reloadAuthoredContent()
}

// TASK: Renderer-side typed wrapper for `progress:save-answer`.
// HOW CODE SOLVES: Forwards answer events to main process for persistence.
async function saveAnswerImpl(payload: ProgressAnswerInput): Promise<UserAnswer> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.saveAnswer) {
    throw new Error('Progress save IPC bridge is not available.')
  }
  return hamstudyApi.saveAnswer(payload)
}

// TASK: Renderer-side typed wrapper for `progress:get-stats`.
// HOW CODE SOLVES: Loads aggregate progress metrics from persisted answers.
async function getProgressStatsImpl(): Promise<ProgressStats> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.getProgressStats) {
    throw new Error('Progress stats IPC bridge is not available.')
  }
  return hamstudyApi.getProgressStats()
}

// TASK: Renderer-side typed wrapper for `progress:get-tier-stats`.
// HOW CODE SOLVES: Loads per-tier aggregate stats used by readiness calibration.
async function getTierProgressStatsImpl(): Promise<TierProgressStats[]> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.getTierProgressStats) {
    return []
  }
  return hamstudyApi.getTierProgressStats()
}

// TASK: Renderer-side typed wrapper for `progress:get-session-history`.
// HOW CODE SOLVES: Retrieves recent session rows using optional filters.
async function getSessionHistoryImpl(filter?: GetSessionHistoryFilter): Promise<Session[]> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.getSessionHistory) {
    throw new Error('Session history IPC bridge is not available.')
  }
  return hamstudyApi.getSessionHistory(filter)
}

// TASK: Renderer-side typed wrapper for `progress:get-recent-answer-activity`.
// HOW CODE SOLVES: Retrieves latest answer events for dashboard activity feeds.
async function getRecentAnswerActivityImpl(filter?: RecentAnswerActivityFilter): Promise<RecentAnswerActivity[]> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.getRecentAnswerActivity) {
    throw new Error('Recent answer activity IPC bridge is not available. Restart the app to reload preload bridge changes.')
  }
  return hamstudyApi.getRecentAnswerActivity(filter)
}

// TASK: Renderer-side typed wrapper for `progress:get-daily-challenge-events`.
// HOW CODE SOLVES: Loads persisted daily challenge completion records for audit/history UI.
async function getDailyChallengeEventsImpl(filter?: DailyChallengeEventFilter): Promise<DailyChallengeEvent[]> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.getDailyChallengeEvents) {
    return []
  }
  return hamstudyApi.getDailyChallengeEvents(filter)
}

// TASK: Renderer-side typed wrapper for `progress:get-accuracy-heatmap`.
// HOW CODE SOLVES: Loads grouped accuracy cells for analytics heatmap rendering.
async function getAccuracyHeatmapImpl(filter?: AccuracyHeatmapFilter): Promise<AccuracyHeatmapData> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.getAccuracyHeatmap) {
    throw new Error('Accuracy heatmap IPC bridge is not available. Restart the app to reload preload bridge changes.')
  }
  return hamstudyApi.getAccuracyHeatmap(filter)
}

// TASK: Renderer-side typed wrapper for `progress:get-progression-summary`.
// HOW CODE SOLVES: Retrieves XP/level/streak summary for progression UI state.
async function getProgressionSummaryImpl(filter?: GetProgressionSummaryFilter): Promise<UserProgressionSummary> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.getProgressionSummary) {
    throw new Error('Progression summary IPC bridge is not available. Restart the app to reload preload bridge changes.')
  }
  return hamstudyApi.getProgressionSummary(filter)
}

// TASK: Renderer-side typed wrapper for `progress:get-progression-trend`.
// HOW CODE SOLVES: Retrieves progression trend series (XP/level/streak by day)
//                  for analytics chart overlays and milestone panels.
async function getProgressionTrendImpl(filter?: GetProgressionTrendFilter): Promise<ProgressionTrendData> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.getProgressionTrend) {
    throw new Error('Progression trend IPC bridge is not available. Restart the app to reload preload bridge changes.')
  }
  return hamstudyApi.getProgressionTrend(filter)
}

// TASK: Renderer-side typed wrapper for `progress:get-due-srs-queue`.
// HOW CODE SOLVES: Loads due SRS questions by selected tier.
async function getDueSrsQueueImpl(filter: DueSrsQueueFilter): Promise<Question[]> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.getDueSrsQueue) {
    throw new Error('Due SRS queue IPC bridge is not available. Restart the app to reload preload bridge changes.')
  }
  return hamstudyApi.getDueSrsQueue(filter)
}

// TASK: Renderer-side typed wrapper for `progress:record-srs-review`.
// HOW CODE SOLVES: Persists SRS interval/ease/repetition updates after submissions.
async function recordSrsReviewImpl(payload: RecordSrsReviewInput): Promise<SRSCard> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.recordSrsReview) {
    throw new Error('SRS review IPC bridge is not available. Restart the app to reload preload bridge changes.')
  }
  return hamstudyApi.recordSrsReview(payload)
}

// TASK: Renderer-side typed wrapper for `settings:get`.
// HOW CODE SOLVES: Reads persisted settings through preload IPC surface.
async function getSettingsImpl(): Promise<UserSettings> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.getSettings) {
    throw new Error('Settings read IPC bridge is not available.')
  }
  return hamstudyApi.getSettings()
}

// TASK: Renderer-side typed wrapper for `settings:save`.
// HOW CODE SOLVES: Writes settings through preload IPC with shared typing.
async function saveSettingsImpl(settings: UserSettings): Promise<UserSettings> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.saveSettings) {
    throw new Error('Settings save IPC bridge is not available.')
  }
  return hamstudyApi.saveSettings(settings)
}

// TASK: Renderer-side typed wrapper for `settings:reset-app-data`.
// HOW CODE SOLVES: Calls preload bridge reset endpoint and returns summary counts.
async function resetAppDataImpl(): Promise<ResetAppDataResult> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.resetAppData) {
    throw new Error('App reset IPC bridge is not available.')
  }
  return hamstudyApi.resetAppData()
}

// TASK: Renderer-side typed wrapper for `settings:voice-list`.
// HOW CODE SOLVES: Returns available speech voices when bridge exists,
//                  otherwise returns a safe empty list in compatibility mode.
async function listVoicesImpl(): Promise<VoiceOption[]> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.listVoices) {
    return []
  }
  return hamstudyApi.listVoices()
}

// TASK: Renderer-side typed wrapper for `settings:voice-speak`.
// HOW CODE SOLVES: Sends read-aloud text to main speech shell with compatibility fallback.
async function speakTextImpl(input: VoiceSpeakInput): Promise<VoiceSpeakResult> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.speakText) {
    return { ok: false, reason: 'not-implemented' }
  }
  return hamstudyApi.speakText(input)
}

// TASK: Renderer-side typed wrapper for `settings:voice-stop`.
// HOW CODE SOLVES: Stops active speech through main shell endpoint with compatibility fallback.
async function stopSpeechImpl(): Promise<VoiceSpeakResult> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.stopSpeech) {
    return { ok: false, reason: 'not-implemented' }
  }
  return hamstudyApi.stopSpeech()
}

async function getVoiceDiagnosticsImpl(): Promise<VoiceDiagnostics> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.getVoiceDiagnostics) {
    return {
      platform: 'unknown',
      supported: false,
      error: 'IPC bridge not available',
      voices: [],
    }
  }
  return hamstudyApi.getVoiceDiagnostics()
}

async function setApiKeyImpl(input: { provider: AiProvider; key: string }): Promise<{ success: boolean }> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.setApiKey) {
    throw new Error('API key IPC bridge is not available.')
  }
  return hamstudyApi.setApiKey(input)
}

async function deleteApiKeyImpl(input: { provider: AiProvider }): Promise<{ success: boolean }> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.deleteApiKey) {
    throw new Error('API key IPC bridge is not available.')
  }
  return hamstudyApi.deleteApiKey(input)
}

async function getApiKeyStatusImpl(): Promise<ApiKeyStatus[]> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.getApiKeyStatus) {
    throw new Error('API key IPC bridge is not available.')
  }
  return hamstudyApi.getApiKeyStatus()
}

async function getRecentChatHistoryImpl(filter?: GetRecentChatHistoryFilter): Promise<import('./types').ChatMessage[]> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.getRecentChatHistory) {
    return []
  }
  return hamstudyApi.getRecentChatHistory(filter)
}

function sendChatMessageImpl(input: SendChatMessageInput): Promise<void> {
  const hamstudyApi = getHamstudyApi()
  if (!hamstudyApi?.sendChatMessage) {
    throw new Error('Chat IPC bridge is not available.')
  }
  return hamstudyApi.sendChatMessage(input)
}

function onAiChunkImpl(callback: (chunk: string) => void): () => void {
  const hamstudyApi = getHamstudyApi()
  if (!hamstudyApi?.onAiChunk) {
    console.warn('AI chunk IPC bridge is not available.')
    return () => {}
  }
  return hamstudyApi.onAiChunk(callback)
}

function onAiChunkEndImpl(callback: () => void): () => void {
  const hamstudyApi = getHamstudyApi()
  if (!hamstudyApi?.onAiChunkEnd) {
    console.warn('AI chunk end IPC bridge is not available.')
    return () => {}
  }
  return hamstudyApi.onAiChunkEnd(callback)
}

function onAiErrorImpl(callback: (error: string) => void): () => void {
  const hamstudyApi = getHamstudyApi()
  if (!hamstudyApi?.onAiError) {
    console.warn('AI error IPC bridge is not available.')
    return () => {}
  }
  return hamstudyApi.onAiError(callback)
}

// TASK: Renderer-side typed wrapper for `ai:get-adaptive-plan`.
// HOW CODE SOLVES: Delegates the one-shot plan request to the preload bridge,
//                  which invokes the main-process handler that queries SQLite and calls the AI.
async function getAdaptivePlanImpl(): Promise<string> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.getAdaptivePlan) {
    throw new Error('Adaptive plan IPC bridge is not available. Restart the app.')
  }
  return hamstudyApi.getAdaptivePlan()
}

// TASK: Renderer-side typed wrapper for `ai:get-user-mnemonic`.
// HOW CODE SOLVES: Reads any previously saved custom mnemonic for a question
//                  so the ExplanationPanel can show it without an AI call.
async function getUserMnemonicImpl(questionId: string): Promise<string | null> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.getUserMnemonic) {
    return null
  }
  return hamstudyApi.getUserMnemonic(questionId)
}

// TASK: Renderer-side typed wrapper for `ai:generate-mnemonic`.
// HOW CODE SOLVES: Triggers the main-process AI call that generates and persists
//                  a custom mnemonic, then returns the result string.
async function generateMnemonicImpl(questionId: string): Promise<string> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.generateMnemonic) {
    throw new Error('Mnemonic generation IPC bridge is not available. Restart the app.')
  }
  return hamstudyApi.generateMnemonic(questionId)
}

// TASK: Renderer-side typed wrapper for `progress:get-earned-badges`.
// HOW CODE SOLVES: Fetches all badges with unlock state evaluated in main process from DB data.
async function getEarnedBadgesImpl(): Promise<EarnedBadge[]> {
  const hamstudyApi = await getHamstudyApiOrThrow()
  if (!hamstudyApi.getEarnedBadges) {
    return []
  }
  return hamstudyApi.getEarnedBadges()
}

// TASK: Typed IPC bridge exposed to renderer.
// HOW CODE SOLVES: Calls the secure preload bridge methods (contextBridge)
//                   which forward requests to main via IPC.
export const ipcBridge = {
  getQuestionPool: getQuestionPoolImpl,
  getQuestionById: getQuestionByIdImpl,
  searchQuestions: searchQuestionsImpl,
  getQuestionBrowserRows: getQuestionBrowserRowsImpl,
  getQuestionBrowserDetail: getQuestionBrowserDetailImpl,
  updateQuestionReviewState: updateQuestionReviewStateImpl,
  getWeakAreaQuestionPool: getWeakAreaQuestionPoolImpl,
  getCustomQuizQuestionPool: getCustomQuizQuestionPoolImpl,
  reloadAuthoredContent: reloadAuthoredContentImpl,
  saveAnswer: saveAnswerImpl,
  getProgressStats: getProgressStatsImpl,
  getTierProgressStats: getTierProgressStatsImpl,
  getSessionHistory: getSessionHistoryImpl,
  getRecentAnswerActivity: getRecentAnswerActivityImpl,
  getDailyChallengeEvents: getDailyChallengeEventsImpl,
  getAccuracyHeatmap: getAccuracyHeatmapImpl,
  getProgressionSummary: getProgressionSummaryImpl,
  getProgressionTrend: getProgressionTrendImpl,
  getDueSrsQueue: getDueSrsQueueImpl,
  recordSrsReview: recordSrsReviewImpl,
  getSettings: getSettingsImpl,
  saveSettings: saveSettingsImpl,
  resetAppData: resetAppDataImpl,
  listVoices: listVoicesImpl,
  speakText: speakTextImpl,
  stopSpeech: stopSpeechImpl,
  getVoiceDiagnostics: getVoiceDiagnosticsImpl,
  setApiKey: setApiKeyImpl,
  deleteApiKey: deleteApiKeyImpl,
  getApiKeyStatus: getApiKeyStatusImpl,
  getRecentChatHistory: getRecentChatHistoryImpl,
  sendChatMessage: sendChatMessageImpl,
  onAiChunk: onAiChunkImpl,
  onAiChunkEnd: onAiChunkEndImpl,
  onAiError: onAiErrorImpl,
  getAdaptivePlan: getAdaptivePlanImpl,
  getUserMnemonic: getUserMnemonicImpl,
  generateMnemonic: generateMnemonicImpl,
  getEarnedBadges: getEarnedBadgesImpl,
}
