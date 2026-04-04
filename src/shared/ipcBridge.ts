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

type OfflineJsonPoolQuestion = {
  id: string
  correct: number
  refs: string
  question: string
  answers: string[]
}

const DEFAULT_USER_SETTINGS: UserSettings = {
  theme: 'system',
  visualTheme: 'signal-lab',
  dailyGoalMinutes: 20,
  aiProvider: null,
  textSize: 'medium',
  voiceId: null,
  voiceRate: 1,
}

let offlineQuestionPoolsPromise: Promise<Record<'technician' | 'general' | 'extra', Question[]>> | null = null
const LOCAL_SETTINGS_KEY = 'hamstudy-pro:settings'
const LOCAL_REVIEW_STATE_KEY = 'hamstudy-pro:question-review-state'

type LocalReviewState = {
  starred?: boolean
  flagged?: boolean
}

function readLocalStorageJson<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    if (!raw) {
      return fallback
    }

    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeLocalStorageJson(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value))
  } catch {
    // ignore compatibility-mode storage failures
  }
}

function getLocalSettingsSnapshot(): UserSettings {
  return readLocalStorageJson<UserSettings>(LOCAL_SETTINGS_KEY, DEFAULT_USER_SETTINGS)
}

function setLocalSettingsSnapshot(settings: UserSettings): UserSettings {
  writeLocalStorageJson(LOCAL_SETTINGS_KEY, settings)
  return settings
}

function getLocalReviewStateSnapshot(): Record<string, LocalReviewState> {
  return readLocalStorageJson<Record<string, LocalReviewState>>(LOCAL_REVIEW_STATE_KEY, {})
}

function setLocalReviewStateSnapshot(next: Record<string, LocalReviewState>): void {
  writeLocalStorageJson(LOCAL_REVIEW_STATE_KEY, next)
}

function applyOfflineReviewState(question: Question): Question {
  const reviewState = getLocalReviewStateSnapshot()[question.id]
  if (!reviewState) {
    return question
  }

  return {
    ...question,
    starred: reviewState.starred ?? false,
    flagged: reviewState.flagged ?? false,
  }
}

function parseIdToSubElementAndGroup(id: string): { subElement: string; groupId: string } {
  const tierLetter = id[0] as 'T' | 'G' | 'E'
  const subDigit = id[1]
  const groupLetter = id[2]
  return {
    subElement: `${tierLetter}${subDigit}`,
    groupId: `${tierLetter}${subDigit}${groupLetter}`,
  }
}

function mapOfflinePoolQuestion(question: OfflineJsonPoolQuestion, tier: 'technician' | 'general' | 'extra'): Question {
  const { subElement, groupId } = parseIdToSubElementAndGroup(question.id)
  return applyOfflineReviewState({
    id: question.id,
    examTier: tier,
    subElement,
    groupId,
    questionText: question.question,
    answers: question.answers,
    correctIndex: question.correct,
    refs: question.refs,
  })
}

async function getOfflineQuestionPools(): Promise<Record<'technician' | 'general' | 'extra', Question[]>> {
  if (!offlineQuestionPoolsPromise) {
    offlineQuestionPoolsPromise = Promise.all([
      import('../../data/technician.json'),
      import('../../data/general.json'),
      import('../../data/extra.json'),
    ]).then(([technicianModule, generalModule, extraModule]) => ({
      technician: (technicianModule.default as OfflineJsonPoolQuestion[]).map((question) =>
        mapOfflinePoolQuestion(question, 'technician'),
      ),
      general: (generalModule.default as OfflineJsonPoolQuestion[]).map((question) =>
        mapOfflinePoolQuestion(question, 'general'),
      ),
      extra: (extraModule.default as OfflineJsonPoolQuestion[]).map((question) =>
        mapOfflinePoolQuestion(question, 'extra'),
      ),
    }))
  }

  return offlineQuestionPoolsPromise
}

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
  const hamstudyApi = await getHamstudyApiOrThrow().catch(() => null)
  if (!hamstudyApi?.getQuestionPool) {
    const offlinePools = await getOfflineQuestionPools()
    return offlinePools[filter.tier]
  }
  return hamstudyApi.getQuestionPool(filter)
}

// TASK: Renderer-side typed wrapper for `questions:get-by-id`.
// HOW CODE SOLVES: Uses the preload bridge contract to fetch one question by ID.
async function getQuestionByIdImpl(questionId: string): Promise<Question | null> {
  const hamstudyApi = await getHamstudyApiOrThrow().catch(() => null)
  if (!hamstudyApi?.getQuestionById) {
    const offlinePools = await getOfflineQuestionPools()
    return Object.values(offlinePools)
      .flat()
      .find((question) => question.id === questionId) ?? null
  }
  return hamstudyApi.getQuestionById(questionId)
}

// TASK: Renderer-side typed wrapper for `questions:search`.
// HOW CODE SOLVES: Delegates DB-backed search through preload IPC methods.
async function searchQuestionsImpl(filter: QuestionSearchFilter): Promise<Question[]> {
  const hamstudyApi = await getHamstudyApiOrThrow().catch(() => null)
  if (!hamstudyApi?.searchQuestions) {
    const offlinePools = await getOfflineQuestionPools()
    const normalized = filter.query.trim().toLowerCase()
    const limit = filter.limit ?? 50
    const tiers = filter.tier ? [filter.tier] : (['technician', 'general', 'extra'] as const)
    const matches = tiers
      .flatMap((tier) => offlinePools[tier])
      .filter((question) => {
        if (normalized.length === 0) {
          return true
        }

        return [
          question.id,
          question.questionText,
          question.refs,
          question.subElement,
          question.groupId,
        ].some((value) => value.toLowerCase().includes(normalized))
      })

    return matches.slice(0, limit)
  }
  return hamstudyApi.searchQuestions(filter)
}

// TASK: Renderer-side typed wrapper for `questions:get-browser-rows`.
// HOW CODE SOLVES: Loads browser list rows with tier/query/mastery/review-state filters.
async function getQuestionBrowserRowsImpl(filter: QuestionBrowserFilter): Promise<QuestionBrowserRow[]> {
  const hamstudyApi = await getHamstudyApiOrThrow().catch(() => null)
  if (!hamstudyApi?.getQuestionBrowserRows) {
    const offlinePools = await getOfflineQuestionPools()
    const normalized = (filter.query ?? '').trim().toLowerCase()
    const baseRows = offlinePools[filter.tier]
      .map(applyOfflineReviewState)
      .filter((question) => {
        if (filter.subElement !== 'all' && question.subElement !== filter.subElement) {
          return false
        }
        if (filter.starredOnly && !question.starred) {
          return false
        }
        if (filter.flaggedOnly && !question.flagged) {
          return false
        }
        if (filter.mastery !== 'all' && filter.mastery !== 'unseen') {
          return false
        }
        if (normalized.length === 0) {
          return true
        }

        return [
          question.id,
          question.questionText,
          question.refs,
          question.subElement,
          question.groupId,
        ].some((value) => value.toLowerCase().includes(normalized))
      })
      .slice(0, filter.limit)
      .map((question) => ({
        id: question.id,
        examTier: question.examTier,
        subElement: question.subElement,
        groupId: question.groupId,
        questionText: question.questionText,
        refs: question.refs,
        starred: question.starred ?? false,
        flagged: question.flagged ?? false,
        attempts: 0,
        correctAnswers: 0,
        accuracyPct: 0,
        masteryState: 'unseen' as const,
      }))

    return baseRows
  }
  return hamstudyApi.getQuestionBrowserRows(filter)
}

// TASK: Renderer-side typed wrapper for `questions:get-browser-detail`.
// HOW CODE SOLVES: Loads explanation/history/SRS detail payload for one selected question.
async function getQuestionBrowserDetailImpl(filter: QuestionBrowserDetailFilter): Promise<QuestionBrowserDetail | null> {
  const hamstudyApi = await getHamstudyApiOrThrow().catch(() => null)
  if (!hamstudyApi?.getQuestionBrowserDetail) {
    const question = await getQuestionByIdImpl(filter.questionId)
    if (!question) {
      return null
    }

    return {
      question,
      srsCard: null,
      historySummary: {
        attempts: 0,
        correctAnswers: 0,
        accuracyPct: 0,
        averageTimeMs: 0,
        lastAnsweredAt: null,
      },
      recentAnswers: [],
    }
  }
  return hamstudyApi.getQuestionBrowserDetail(filter)
}

// TASK: Renderer-side typed wrapper for `questions:update-review-state`.
// HOW CODE SOLVES: Persists per-question starred/flagged review flags through main process DB APIs.
async function updateQuestionReviewStateImpl(input: UpdateQuestionReviewStateInput): Promise<Question> {
  const hamstudyApi = await getHamstudyApiOrThrow().catch(() => null)
  if (!hamstudyApi?.updateQuestionReviewState) {
    const question = await getQuestionByIdImpl(input.questionId)
    if (!question) {
      throw new Error(`Question not found for id ${input.questionId}.`)
    }

    const snapshot = getLocalReviewStateSnapshot()
    snapshot[input.questionId] = {
      starred: input.starred ?? question.starred ?? false,
      flagged: input.flagged ?? question.flagged ?? false,
    }
    setLocalReviewStateSnapshot(snapshot)

    return {
      ...question,
      starred: snapshot[input.questionId].starred ?? false,
      flagged: snapshot[input.questionId].flagged ?? false,
    }
  }
  return hamstudyApi.updateQuestionReviewState(input)
}

// TASK: Renderer-side typed wrapper for `questions:get-weak-area-pool`.
// HOW CODE SOLVES: Delegates weak-area pool requests to preload IPC bridge methods.
async function getWeakAreaQuestionPoolImpl(filter: WeakAreaPoolFilter): Promise<Question[]> {
  const hamstudyApi = await getHamstudyApiOrThrow().catch(() => null)
  if (!hamstudyApi?.getWeakAreaQuestionPool) {
    const offlinePools = await getOfflineQuestionPools()
    return offlinePools[filter.tier].slice(0, filter.limit ?? 35)
  }
  return hamstudyApi.getWeakAreaQuestionPool(filter)
}

// TASK: Renderer-side typed wrapper for `questions:get-custom-quiz-pool`.
// HOW CODE SOLVES: Delegates custom pool requests to preload IPC bridge methods.
async function getCustomQuizQuestionPoolImpl(filter: CustomQuizPoolFilter): Promise<Question[]> {
  const hamstudyApi = await getHamstudyApiOrThrow().catch(() => null)
  if (!hamstudyApi?.getCustomQuizQuestionPool) {
    const offlinePools = await getOfflineQuestionPools()
    const matches = offlinePools[filter.tier].filter((question) =>
      !filter.subElements?.length || filter.subElements.includes(question.subElement),
    )
    return matches.slice(0, filter.limit ?? 20)
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
  const hamstudyApi = await getHamstudyApiOrThrow().catch(() => null)
  if (!hamstudyApi?.saveAnswer) {
    return {
      id: Date.now(),
      questionId: payload.questionId,
      selectedIndex: payload.selectedIndex,
      isCorrect: payload.isCorrect,
      timeTakenMs: payload.timeTakenMs,
      answeredAt: payload.answeredAt ?? new Date().toISOString(),
      sessionId: payload.sessionId,
    }
  }
  return hamstudyApi.saveAnswer(payload)
}

// TASK: Renderer-side typed wrapper for `progress:get-stats`.
// HOW CODE SOLVES: Loads aggregate progress metrics from persisted answers.
async function getProgressStatsImpl(): Promise<ProgressStats> {
  const hamstudyApi = await getHamstudyApiOrThrow().catch(() => null)
  if (!hamstudyApi?.getProgressStats) {
    return {
      totalAnswers: 0,
      correctAnswers: 0,
      accuracyPct: 0,
      uniqueQuestionsAnswered: 0,
    }
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
  const hamstudyApi = await getHamstudyApiOrThrow().catch(() => null)
  if (!hamstudyApi?.getSettings) {
    return getLocalSettingsSnapshot()
  }
  return hamstudyApi.getSettings()
}

// TASK: Renderer-side typed wrapper for `settings:save`.
// HOW CODE SOLVES: Writes settings through preload IPC with shared typing.
async function saveSettingsImpl(settings: UserSettings): Promise<UserSettings> {
  const hamstudyApi = await getHamstudyApiOrThrow().catch(() => null)
  if (!hamstudyApi?.saveSettings) {
    return setLocalSettingsSnapshot(settings)
  }
  return hamstudyApi.saveSettings(settings)
}

// TASK: Renderer-side typed wrapper for `settings:reset-app-data`.
// HOW CODE SOLVES: Calls preload bridge reset endpoint and returns summary counts.
async function resetAppDataImpl(): Promise<ResetAppDataResult> {
  const hamstudyApi = await getHamstudyApiOrThrow().catch(() => null)
  if (!hamstudyApi?.resetAppData) {
    setLocalSettingsSnapshot(DEFAULT_USER_SETTINGS)
    setLocalReviewStateSnapshot({})
    return {
      clearedAnswers: 0,
      clearedSessions: 0,
      clearedSrsCards: 0,
      resetQuestionReviewState: 0,
      clearedSettings: 1,
    }
  }
  return hamstudyApi.resetAppData()
}

// TASK: Renderer-side typed wrapper for `settings:voice-list`.
// HOW CODE SOLVES: Returns available speech voices when bridge exists,
//                  otherwise returns a safe empty list in compatibility mode.
async function listVoicesImpl(): Promise<VoiceOption[]> {
  const hamstudyApi = await getHamstudyApiOrThrow().catch(() => null)
  if (!hamstudyApi?.listVoices) {
    return []
  }
  return hamstudyApi.listVoices()
}

// TASK: Renderer-side typed wrapper for `settings:voice-speak`.
// HOW CODE SOLVES: Sends read-aloud text to main speech shell with compatibility fallback.
async function speakTextImpl(input: VoiceSpeakInput): Promise<VoiceSpeakResult> {
  const hamstudyApi = await getHamstudyApiOrThrow().catch(() => null)
  if (!hamstudyApi?.speakText) {
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
  const hamstudyApi = await getHamstudyApiOrThrow().catch(() => null)
  if (!hamstudyApi?.getVoiceDiagnostics) {
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
