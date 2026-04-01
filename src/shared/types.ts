export type ExamTier = 'technician' | 'general' | 'extra'
export type MasteryState = 'all' | 'unseen' | 'learning' | 'known' | 'mastered'

export interface Question {
  id: string
  examTier: ExamTier
  subElement: string
  groupId: string
  questionText: string
  answers: string[]
  correctIndex: number
  refs: string
  hint?: string
  explanation?: string
  mnemonic?: string
  whyWrong?: string[]
  starred?: boolean
  flagged?: boolean
}

export interface QuestionBrowserRow {
  id: string
  examTier: ExamTier
  subElement: string
  groupId: string
  questionText: string
  refs: string
  starred: boolean
  flagged: boolean
  attempts: number
  correctAnswers: number
  accuracyPct: number
  masteryState: Exclude<MasteryState, 'all'>
}

export interface QuestionHistorySummary {
  attempts: number
  correctAnswers: number
  accuracyPct: number
  averageTimeMs: number
  lastAnsweredAt: string | null
}

export interface QuestionBrowserDetail {
  question: Question
  srsCard: SRSCard | null
  historySummary: QuestionHistorySummary
  recentAnswers: UserAnswer[]
}

export interface UserAnswer {
  id: number
  questionId: string
  selectedIndex: number
  isCorrect: boolean
  timeTakenMs: number
  answeredAt: string
  sessionId: string
}

export interface RecentAnswerActivity {
  id: number
  questionId: string
  examTier: ExamTier
  subElement: string
  isCorrect: boolean
  answeredAt: string
  sessionId: string
}

export interface Session {
  id: string
  startedAt: string
  endedAt: string | null
  mode: 'flashcard' | 'quiz' | 'exam' | 'weak-area' | 'custom' | 'speed'
  examTier: ExamTier
  score: number
  totalQuestions: number
}

export interface TierProgressStats {
  tier: ExamTier
  totalAnswers: number
  correctAnswers: number
  accuracyPct: number
  uniqueQuestionsAnswered: number
  totalQuestions: number
  coveragePct: number
}

export interface SRSCard {
  questionId: string
  interval: number
  easeFactor: number
  nextReview: string
  repetitions: number
}

export interface Badge {
  badgeId: string
  earnedAt: string
}

export interface EarnedBadge {
  id: string
  title: string
  description: string
  icon: string
  unlockedAt: string | null
}

export type ProgressionLevelTitle = 'Novice' | 'Technician' | 'General' | 'Advanced' | 'Extra' | 'Elmer'

export interface UserProgressionSummary {
  totalXp: number
  levelIndex: number
  levelTitle: ProgressionLevelTitle
  xpToNextLevel: number
  nextLevelTitle: ProgressionLevelTitle | null
  currentStreakDays: number
  longestStreakDays: number
  todaysAnswers: number
  todaysCorrectAnswers: number
  todaysAccuracyPct: number
  dailyChallengeTarget: number
  dailyChallengeCompletedToday: boolean
  dailyChallengeRemaining: number
  dailyChallengeXpBonus: number
}

export interface ProgressionTrendPoint {
  date: string
  totalXp: number
  dailyXp: number
  levelIndex: number
  levelTitle: ProgressionLevelTitle
  streakDays: number
  answers: number
  correctAnswers: number
  dailyChallengeCompleted: boolean
}

export interface ProgressionTrendData {
  points: ProgressionTrendPoint[]
}

export interface DailyChallengeEvent {
  id: number
  learningDay: string
  completedAt: string
  challengeTarget: number
  bonusXp: number
  answersAtCompletion: number
  streakDaysAtCompletion: number
}

export interface AccuracyHeatmapCell {
  examTier: ExamTier
  subElement: string
  groupId: string
  attempts: number
  correctAnswers: number
  accuracyPct: number
}

export interface AccuracyHeatmapData {
  cells: AccuracyHeatmapCell[]
}

export type AiProvider = 'anthropic' | 'openai'

export interface ApiKeyStatus {
  provider: AiProvider
  isSet: boolean
}

export interface UserSettings {
  theme: 'dark' | 'light' | 'system'
  visualTheme: 'signal-lab' | 'field-manual' | 'ocean-chart'
  dailyGoalMinutes: number
  aiProvider: AiProvider | null
  textSize: 'small' | 'medium' | 'large'
  voiceId: string | null
  voiceRate: number
}

export interface VoiceOption {
  id: string
  name: string
  language: string
  isDefault: boolean
}

export interface VoiceSpeakInput {
  text: string
  voiceId?: string
  rate?: number
}

export interface VoiceSpeakResult {
  ok: boolean
  reason?: 'not-implemented' | 'invalid-input' | 'no-active-session' | 'spawn-failed'
}

export interface VoiceDiagnostics {
  platform: string
  supported: boolean
  error?: string
  voices: VoiceOption[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface SendChatMessageInput {
  message: string
  context?: {
    questionId?: string
  }
}
