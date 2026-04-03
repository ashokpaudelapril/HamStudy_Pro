import { useCallback, useEffect, useMemo, useState } from 'react'
import { ipcBridge } from '@shared/ipcBridge'
import type { DailyChallengeEvent, ExamTier, ProgressionTrendData, RecentAnswerActivity, TierProgressStats } from '@shared/types'
import { StatPill } from '../components/StatPill'
import { StreakBadge } from '../components/StreakBadge'
import { XPBar } from '../components/XPBar'
import { useProgressionStore } from '../store/useProgressionStore'
import { calculateOverallReadiness, calculateTierReadiness } from '../utils/readiness'

type DashboardScreenProps = {
  onBackToModes: () => void
  onStartDailyChallenge: () => void
}

type DueCountsByTier = {
  technician: number
  general: number
  extra: number
}

type DailyChallengePlan = {
  focusTier: ExamTier
  targetQuestions: number
  completedToday: number
  remaining: number
  isComplete: boolean
}

const DAILY_CHALLENGE_TARGET = 10

function formatTierName(tier: ExamTier): string {
  if (tier === 'technician') return 'Technician'
  if (tier === 'general') return 'General'
  return 'Extra'
}

function getHeatBand(score: number): 'cool' | 'warm' | 'hot' {
  if (score >= 80) return 'hot'
  if (score >= 60) return 'warm'
  return 'cool'
}

function toDayKey(dateString: string): string {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

function formatRelativeTime(timestamp: string): string {
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown time'
  }

  const deltaMs = Date.now() - parsed.getTime()
  const deltaMinutes = Math.max(0, Math.floor(deltaMs / 60000))

  if (deltaMinutes < 1) return 'just now'
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`

  const deltaHours = Math.floor(deltaMinutes / 60)
  if (deltaHours < 24) return `${deltaHours}h ago`

  const deltaDays = Math.floor(deltaHours / 24)
  if (deltaDays < 7) return `${deltaDays}d ago`

  return parsed.toLocaleDateString()
}

function pickFocusTier(dueByTier: DueCountsByTier): ExamTier {
  const ranking: Array<{ tier: ExamTier; count: number }> = [
    { tier: 'technician', count: dueByTier.technician },
    { tier: 'general', count: dueByTier.general },
    { tier: 'extra', count: dueByTier.extra },
  ]

  ranking.sort((a, b) => b.count - a.count)
  if (ranking[0].count > 0) {
    return ranking[0].tier
  }

  return 'technician'
}

function buildDailyChallengePlan(dueByTier: DueCountsByTier, activity: RecentAnswerActivity[]): DailyChallengePlan {
  const focusTier = pickFocusTier(dueByTier)
  const todayKey = toDayKey(new Date().toISOString())

  const completedToday = activity.filter(
    (entry) => entry.examTier === focusTier && toDayKey(entry.answeredAt) === todayKey,
  ).length

  const remaining = Math.max(0, DAILY_CHALLENGE_TARGET - completedToday)

  return {
    focusTier,
    targetQuestions: DAILY_CHALLENGE_TARGET,
    completedToday,
    remaining,
    isComplete: remaining === 0,
  }
}

// TASK: Surface progress and due-review summary in one dashboard view.
// HOW CODE SOLVES: Reads aggregate progress plus tier-specific due queues and
//                  presents a compact readiness snapshot with quick guidance.
export function DashboardScreen({ onBackToModes, onStartDailyChallenge }: DashboardScreenProps) {
  const progressionSummary = useProgressionStore((state) => state.summary)
  const progressionLoading = useProgressionStore((state) => state.loading)
  const progressionError = useProgressionStore((state) => state.error)
  const refreshProgression = useProgressionStore((state) => state.refresh)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tierStats, setTierStats] = useState<TierProgressStats[]>([])
  const [recentActivity, setRecentActivity] = useState<RecentAnswerActivity[]>([])
  const [dailyChallengeEvents, setDailyChallengeEvents] = useState<DailyChallengeEvent[]>([])
  const [progressionTrend, setProgressionTrend] = useState<ProgressionTrendData | null>(null)
  const [dueByTier, setDueByTier] = useState<DueCountsByTier>({
    technician: 0,
    general: 0,
    extra: 0,
  })
  const [adaptivePlan, setAdaptivePlan] = useState<string | null>(null)
  const [adaptivePlanLoading, setAdaptivePlanLoading] = useState(false)
  const [adaptivePlanError, setAdaptivePlanError] = useState<string | null>(null)
  const [hasAiProvider, setHasAiProvider] = useState(false)

  const streakDays = progressionSummary?.currentStreakDays ?? 0

  const totalDueToday = dueByTier.technician + dueByTier.general + dueByTier.extra
  const tierReadiness = useMemo(
    () =>
      tierStats.map((row) =>
        calculateTierReadiness(
          row,
          row.tier === 'technician' ? dueByTier.technician : row.tier === 'general' ? dueByTier.general : dueByTier.extra,
          streakDays,
        ),
      ),
    [tierStats, dueByTier, streakDays],
  )
  const dailyChallenge = useMemo(() => buildDailyChallengePlan(dueByTier, recentActivity), [dueByTier, recentActivity])
  const readinessPct = useMemo(() => calculateOverallReadiness(tierReadiness, tierStats), [tierReadiness, tierStats])
  const latestTrendPoint = progressionTrend?.points.at(-1) ?? null
  const previousTrendPoint = progressionTrend && progressionTrend.points.length > 1 ? progressionTrend.points[progressionTrend.points.length - 2] : null
  const dailyXpDelta = latestTrendPoint ? latestTrendPoint.dailyXp : 0
  const streakTrendLabel = latestTrendPoint
    ? latestTrendPoint.streakDays > 0
      ? `${latestTrendPoint.streakDays} active day${latestTrendPoint.streakDays === 1 ? '' : 's'} in a row`
      : 'Start a session today to begin a streak.'
    : 'No progression trend yet.'
  const readinessLead = tierReadiness.length > 0 ? [...tierReadiness].sort((a, b) => b.score - a.score)[0] : null
  const lastChallengeEvent = dailyChallengeEvents[0] ?? null
  const trendDirection =
    latestTrendPoint && previousTrendPoint ? latestTrendPoint.totalXp - previousTrendPoint.totalXp : 0
  const dailyChallengeProgressPct = Math.round((dailyChallenge.completedToday / dailyChallenge.targetQuestions) * 100)
  const focusDueCount =
    dailyChallenge.focusTier === 'technician'
      ? dueByTier.technician
      : dailyChallenge.focusTier === 'general'
        ? dueByTier.general
        : dueByTier.extra
  const nextFocusMessage =
    totalDueToday > 0
      ? `Start with ${formatTierName(dailyChallenge.focusTier)}. That tier has the biggest due queue right now.`
      : readinessLead
        ? `Push your strongest momentum in ${formatTierName(readinessLead.tier)} while your due queue is clear.`
        : 'Start any practice session to establish a baseline and build momentum.'
  const readinessSupportCopy = readinessLead
    ? `${formatTierName(readinessLead.tier)} is leading at ${readinessLead.score}% readiness with ${readinessLead.confidencePct}% confidence.`
    : 'No readiness signal yet. A few sessions will unlock smarter guidance.'

  // TASK: Refresh dashboard metrics from persisted IPC-backed data.
  // HOW CODE SOLVES: Fetches progress stats and due counts in parallel across
  //                  all tiers, then stores normalized values for rendering.
  const refreshDashboard = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const [nextTierStats, techDue, genDue, extraDue, activity, challengeHistory, nextProgressionTrend] = await Promise.all([
        ipcBridge.getTierProgressStats(),
        ipcBridge.getDueSrsQueue({ tier: 'technician', limit: 300 }),
        ipcBridge.getDueSrsQueue({ tier: 'general', limit: 300 }),
        ipcBridge.getDueSrsQueue({ tier: 'extra', limit: 300 }),
        ipcBridge.getRecentAnswerActivity({ limit: 18 }),
        ipcBridge.getDailyChallengeEvents({ limit: 6 }),
        ipcBridge.getProgressionTrend({ days: 7, streakGraceHours: 2, tier: 'all' }),
      ])

      setTierStats(nextTierStats)
      setRecentActivity(activity)
      setDailyChallengeEvents(challengeHistory)
      setProgressionTrend(nextProgressionTrend)
      setDueByTier({
        technician: techDue.length,
        general: genDue.length,
        extra: extraDue.length,
      })
    } catch (err: unknown) {
      const details = err instanceof Error ? err.message : String(err)
      setError(`Failed to load dashboard metrics. ${details}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.all([refreshDashboard(), refreshProgression()])
  }, [refreshDashboard, refreshProgression])

  // TASK: Check whether an AI provider is configured so the plan card can gate correctly.
  // HOW CODE SOLVES: Reads settings once on mount; no polling needed since the user
  //                  would have to navigate to Settings and back to change the provider.
  useEffect(() => {
    void ipcBridge.getSettings().then((s) => setHasAiProvider(Boolean(s.aiProvider)))
  }, [])

  // TASK: Fetch a one-shot adaptive study plan from the AI provider.
  // HOW CODE SOLVES: Calls the IPC handler which reads SQLite progress, builds a prompt,
  //                  and returns the full plan string. Loading + error state shown in the card.
  const handleGeneratePlan = useCallback(async () => {
    setAdaptivePlanLoading(true)
    setAdaptivePlanError(null)
    try {
      const plan = await ipcBridge.getAdaptivePlan()
      setAdaptivePlan(plan)
    } catch (err: unknown) {
      setAdaptivePlanError(err instanceof Error ? err.message : String(err))
    } finally {
      setAdaptivePlanLoading(false)
    }
  }, [])

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <h1>HamStudy Pro</h1>
          <p className="subtitle">Dashboard</p>
        </div>
        <button type="button" className="ghost-btn" onClick={onBackToModes}>
          Back to Modes
        </button>
        <div className="stats-grid">
          <StatPill label="Readiness" value={`${readinessPct}%`} icon="🧭" />
          <StatPill label="Due Today" value={totalDueToday} icon="⏳" />
        </div>
        <div className="dashboard-progression-row">
          <StreakBadge
            currentStreak={progressionSummary?.currentStreakDays ?? 0}
            longestStreak={progressionSummary?.longestStreakDays ?? 0}
          />
          <XPBar
            levelTitle={progressionSummary?.levelTitle ?? 'Novice'}
            totalXp={progressionSummary?.totalXp ?? 0}
            xpToNextLevel={progressionSummary?.xpToNextLevel ?? null}
          />
        </div>
      </header>

      <section className="panel dashboard-hero-panel">
        <p className="mode-tagline">Stay consistent. Clear your due queue. Build confidence before exam day.</p>
        <p className="meta">
          {totalDueToday > 0
            ? `You have ${totalDueToday} due review item${totalDueToday === 1 ? '' : 's'} waiting across tiers.`
            : 'No due reviews right now. Keep momentum with a new practice session.'}
        </p>
        <div className="stats-grid">
          <StatPill label="Daily XP" value={`+${dailyXpDelta}`} icon="⚡" />
          <StatPill
            label="Trend"
            value={
              trendDirection > 0 ? 'Climbing' : trendDirection < 0 ? 'Cooling' : latestTrendPoint ? 'Steady' : 'Starting'
            }
            icon="📈"
          />
          <StatPill label="Today" value={`${progressionSummary?.todaysAccuracyPct ?? 0}% accuracy`} icon="🧠" />
        </div>
        <p className="meta">{streakTrendLabel}</p>
      </section>

      <section className="panel dashboard-focus-panel">
        <div className="dashboard-focus-header">
          <div>
            <p className="dashboard-label">Next Best Step</p>
            <h2>{nextFocusMessage}</h2>
          </div>
          <div className="dashboard-focus-pill">
            <span>Focus tier</span>
            <strong>{formatTierName(dailyChallenge.focusTier)}</strong>
          </div>
        </div>
        <div className="dashboard-focus-grid">
          <article className="dashboard-focus-card">
            <span className="dashboard-focus-label">Due now</span>
            <strong>{focusDueCount}</strong>
            <p>{formatTierName(dailyChallenge.focusTier)} cards ready for review today</p>
          </article>
          <article className="dashboard-focus-card">
            <span className="dashboard-focus-label">Challenge progress</span>
            <strong>
              {dailyChallenge.completedToday}/{dailyChallenge.targetQuestions}
            </strong>
            <p>{dailyChallenge.isComplete ? 'Today’s goal is complete' : `${dailyChallenge.remaining} answers left for the daily target`}</p>
          </article>
          <article className="dashboard-focus-card">
            <span className="dashboard-focus-label">Readiness signal</span>
            <strong>{readinessPct}%</strong>
            <p>{readinessSupportCopy}</p>
          </article>
        </div>
      </section>

      <section className="panel dashboard-grid">
        <article className="dashboard-card">
          <p className="dashboard-label">Technician Due</p>
          <p className="dashboard-value">{dueByTier.technician}</p>
          <p className="meta">Element 2 due queue</p>
        </article>

        <article className="dashboard-card">
          <p className="dashboard-label">General Due</p>
          <p className="dashboard-value">{dueByTier.general}</p>
          <p className="meta">Element 3 due queue</p>
        </article>

        <article className="dashboard-card">
          <p className="dashboard-label">Extra Due</p>
          <p className="dashboard-value">{dueByTier.extra}</p>
          <p className="meta">Element 4 due queue</p>
        </article>

        <article className="dashboard-card">
          <p className="dashboard-label">Daily Streak</p>
          <p className="dashboard-value">{streakDays} day{streakDays === 1 ? '' : 's'}</p>
          <p className="meta">Longest streak: {progressionSummary?.longestStreakDays ?? 0} days</p>
        </article>

        <article className="dashboard-card">
          <p className="dashboard-label">Progression</p>
          <p className="dashboard-value">{progressionSummary?.levelTitle ?? 'Novice'}</p>
          <p className="meta">
            XP: {progressionSummary?.totalXp ?? 0}
            {progressionSummary?.nextLevelTitle
              ? ` · ${progressionSummary.xpToNextLevel} to ${progressionSummary.nextLevelTitle}`
              : ' · Max level reached'}
          </p>
          <p className="meta">
            Daily challenge bonus: {progressionSummary?.dailyChallengeXpBonus ?? 0} XP
            {progressionSummary?.dailyChallengeCompletedToday ? ' (earned today)' : ''}
          </p>
        </article>

        <article className="dashboard-card">
          <p className="dashboard-label">Tier Readiness Calibration</p>
          <div className="readiness-mini-chart" role="list" aria-label="Tier readiness summary">
            {tierReadiness.map((row) => {
              const band = getHeatBand(row.score)
              const isLeadTier = readinessLead?.tier === row.tier

              return (
                <div key={row.tier} className={`readiness-mini-row ${isLeadTier ? 'active' : ''}`} role="listitem">
                  <span className="readiness-mini-label">{formatTierName(row.tier)}</span>
                  <div className="readiness-mini-track" aria-hidden="true">
                    <span className={`readiness-mini-fill heatmap-${band}`} style={{ width: `${row.score}%` }} />
                  </div>
                  <span className="readiness-mini-value">{row.score}%</span>
                </div>
              )
            })}
          </div>
          {tierReadiness.length === 0 ? <p className="meta">No tier history yet.</p> : null}
          {readinessLead ? (
            <p className="meta">
              Strongest current tier: {formatTierName(readinessLead.tier)} · confidence {readinessLead.confidencePct}% · due penalty{' '}
              {readinessLead.duePenalty}
            </p>
          ) : null}
        </article>

        <article className="dashboard-card">
          <p className="dashboard-label">Momentum Snapshot</p>
          <p className="dashboard-value">{progressionSummary?.todaysAnswers ?? 0}</p>
          <p className="meta">Answers logged today</p>
          <p className="meta">
            Correct today: {progressionSummary?.todaysCorrectAnswers ?? 0} · accuracy {progressionSummary?.todaysAccuracyPct ?? 0}%
          </p>
          <p className="meta">
            {latestTrendPoint
              ? `This week: ${latestTrendPoint.totalXp} total XP · ${latestTrendPoint.answers} answers on latest learning day`
              : 'Complete a session to start building weekly momentum.'}
          </p>
        </article>
      </section>

      <section className="panel daily-challenge-panel">
        <p className="dashboard-label">Daily Challenge</p>
        <p className="mode-tagline">
          {dailyChallenge.isComplete
            ? `Challenge complete for ${dailyChallenge.focusTier}. Nice work.`
            : `${dailyChallenge.remaining} question${dailyChallenge.remaining === 1 ? '' : 's'} left in ${dailyChallenge.focusTier}.`}
        </p>
        <p className="meta">
          Target: {dailyChallenge.targetQuestions} answers in your focus tier today. Completed: {dailyChallenge.completedToday}.
        </p>
        <p className="meta">
          Progression reward status:{' '}
          {progressionSummary?.dailyChallengeCompletedToday
            ? `bonus unlocked (+${progressionSummary.dailyChallengeXpBonus} XP)`
            : `${progressionSummary?.dailyChallengeRemaining ?? dailyChallenge.remaining} to go for +50 XP`}
        </p>
        <div className="dashboard-challenge-progress" aria-label="Daily challenge progress">
          <div className="dashboard-challenge-progress-copy">
            <strong>{dailyChallengeProgressPct}% complete</strong>
            <span>
              {dailyChallenge.completedToday} answered today in {formatTierName(dailyChallenge.focusTier)}
            </span>
          </div>
          <div
            className="dashboard-challenge-progress-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={dailyChallengeProgressPct}
          >
            <span style={{ width: `${dailyChallengeProgressPct}%` }} />
          </div>
        </div>
        {lastChallengeEvent ? (
          <p className="meta">
            Last completed challenge: {new Date(lastChallengeEvent.completedAt).toLocaleDateString()} · +{lastChallengeEvent.bonusXp} XP · streak at
            completion {lastChallengeEvent.streakDaysAtCompletion}
          </p>
        ) : (
          <p className="meta">No completed daily challenges yet. Finish one to start a consistency trail.</p>
        )}
        <div className="action-row">
          <button type="button" className="primary-button" onClick={onStartDailyChallenge}>
            {dailyChallenge.isComplete ? 'Practice Weak Areas' : 'Start Daily Challenge'}
          </button>
          <button type="button" className="ghost-btn" onClick={() => void refreshDashboard()}>
            Check Progress
          </button>
        </div>
      </section>

      {/* TASK: Adaptive study plan card — Tier 2 AI feature.
          HOW CODE SOLVES: Gated behind hasAiProvider; on click calls handleGeneratePlan
          which invokes the IPC handler. Plan text rendered as plain lines. */}
      <section className="panel adaptive-plan-panel">
        <p className="dashboard-label">AI Study Plan</p>
        {hasAiProvider ? (
          <>
            {adaptivePlan ? (
              <div className="adaptive-plan-output">
                {adaptivePlan.split('\n').filter(Boolean).map((line, i) => (
                  <p key={i} className="adaptive-plan-line">{line}</p>
                ))}
              </div>
            ) : (
              <p className="meta">Generate a personalised plan based on your current progress.</p>
            )}
            {adaptivePlanError ? <p className="error-text">{adaptivePlanError}</p> : null}
            <div className="action-row">
              <button type="button" className="primary-button" onClick={() => void handleGeneratePlan()} disabled={adaptivePlanLoading}>
                {adaptivePlanLoading ? 'Generating…' : adaptivePlan ? 'Regenerate Plan' : 'Generate Plan'}
              </button>
            </div>
          </>
        ) : (
          <p className="meta">
            No AI provider configured. Add an API key in{' '}
            <strong>Settings → AI &amp; API Keys</strong> to unlock this feature.
          </p>
        )}
      </section>

      <section className="panel activity-panel">
        <p className="dashboard-label">Recent Activity</p>
        {recentActivity.length === 0 ? (
          <p className="meta">No answer history yet. Complete a quick session and activity will appear here.</p>
        ) : (
          <div className="activity-list">
            {recentActivity.map((entry) => (
              <article key={entry.id} className="activity-item">
                <p className="dashboard-label">
                  {entry.isCorrect ? 'Correct' : 'Incorrect'} · {formatTierName(entry.examTier)} · {entry.subElement}
                </p>
                <p className="meta activity-id">{entry.questionId}</p>
                <p className="meta">
                  {formatRelativeTime(entry.answeredAt)} · session {entry.sessionId.replace(/^.*?-/, '')}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        {loading ? <p>Loading dashboard metrics...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {progressionLoading ? <p>Loading progression...</p> : null}
        {progressionError ? <p className="error-text">{progressionError}</p> : null}

        {!loading && !error && !progressionLoading ? (
          <div className="action-row">
            <button
              type="button"
              onClick={() => {
                void Promise.all([refreshDashboard(), refreshProgression()])
              }}
            >
              Refresh Dashboard
            </button>
          </div>
        ) : null}
      </section>
    </main>
  )
}
