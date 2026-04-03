import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ipcBridge, type ProgressStats } from '@shared/ipcBridge'
import type { AccuracyHeatmapCell, DailyChallengeEvent, ProgressionTrendData, RecentAnswerActivity, TierProgressStats } from '@shared/types'
import { StatPill } from '../components/StatPill'
import { calculateOverallReadiness, calculateTierReadiness } from '../utils/readiness'

type AnalyticsScreenProps = {
  onBackToModes: () => void
}

type AnalyticsTier = 'all' | 'technician' | 'general' | 'extra'
type TrendWindowDays = 14 | 30 | 60
type MetricScope = 'all' | 'selected'

type DueCountsByTier = {
  technician: number
  general: number
  extra: number
}

type ScoreTrendPoint = {
  date: string
  attempts: number
  correct: number
  accuracy: number
  totalXp: number
  streakDays: number
  levelTitle: string
  dailyXp: number
  dailyChallengeCompleted: boolean
}

type RadarPoint = {
  subElement: string
  attempts: number
  accuracy: number
}

type HeatmapBand = 'unseen' | 'struggling' | 'developing' | 'solid' | 'mastered'

type ReadinessBand = 'unseen' | 'struggling' | 'developing' | 'solid' | 'mastered'

type FocusRecommendation = {
  label: string
  reason: string
}

function formatDayLabel(dayKey: string): string {
  const [yearRaw, monthRaw, dayRaw] = dayKey.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return dayKey
  }

  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function buildScoreTrend(points: ProgressionTrendData['points']): ScoreTrendPoint[] {
  return points.map((point) => ({
    date: formatDayLabel(point.date),
    attempts: point.answers,
    correct: point.correctAnswers,
    accuracy: point.answers > 0 ? Number(((point.correctAnswers / point.answers) * 100).toFixed(2)) : 0,
    totalXp: point.totalXp,
    streakDays: point.streakDays,
    levelTitle: point.levelTitle,
    dailyXp: point.dailyXp,
    dailyChallengeCompleted: point.dailyChallengeCompleted,
  }))
}

function buildLevelMilestones(points: ProgressionTrendData['points']): Array<{ date: string; levelTitle: string }> {
  if (points.length === 0) {
    return []
  }

  const milestones: Array<{ date: string; levelTitle: string }> = []
  let previousLevelIndex = points[0].levelIndex

  for (let i = 1; i < points.length; i += 1) {
    const point = points[i]
    if (point.levelIndex > previousLevelIndex) {
      milestones.push({
        date: formatDayLabel(point.date),
        levelTitle: point.levelTitle,
      })
    }
    previousLevelIndex = point.levelIndex
  }

  return milestones
}

function buildRecentRewardEvents(points: ProgressionTrendData['points']): Array<{ date: string; label: string }> {
  return points
    .filter((point) => point.dailyChallengeCompleted || point.streakDays > 0)
    .map((point) => {
      const rewards: string[] = []
      if (point.dailyChallengeCompleted) {
        rewards.push('Daily challenge +50 XP')
      }
      if (point.streakDays > 0) {
        rewards.push(`Streak bonus +${point.streakDays * 25} XP`)
      }

      return {
        date: formatDayLabel(point.date),
        label: rewards.join(' · '),
      }
    })
    .slice(-6)
    .reverse()
}

function buildPersistedChallengeEvents(events: DailyChallengeEvent[]): Array<{ date: string; label: string }> {
  return events.slice(0, 6).map((event) => ({
    date: formatDayLabel(event.learningDay),
    label: `Daily challenge +${event.bonusXp} XP · Streak bonus +${event.streakDaysAtCompletion * 25} XP`,
  }))
}

function buildSubElementRadar(activity: RecentAnswerActivity[]): RadarPoint[] {
  const bySubElement = new Map<string, { attempts: number; correct: number }>()

  for (const entry of activity) {
    const current = bySubElement.get(entry.subElement) ?? { attempts: 0, correct: 0 }
    current.attempts += 1
    current.correct += entry.isCorrect ? 1 : 0
    bySubElement.set(entry.subElement, current)
  }

  return Array.from(bySubElement.entries())
    .map(([subElement, metrics]) => ({
      subElement,
      attempts: metrics.attempts,
      accuracy: metrics.attempts > 0 ? Number(((metrics.correct / metrics.attempts) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, 8)
    .sort((a, b) => a.subElement.localeCompare(b.subElement))
}

function resolveHeatmapBand(cell: AccuracyHeatmapCell): HeatmapBand {
  if (cell.attempts === 0) return 'unseen'
  if (cell.accuracyPct < 50) return 'struggling'
  if (cell.accuracyPct < 70) return 'developing'
  if (cell.accuracyPct < 85) return 'solid'
  return 'mastered'
}

function resolveReadinessBand(score: number): ReadinessBand {
  if (score <= 0) return 'unseen'
  if (score < 50) return 'struggling'
  if (score < 70) return 'developing'
  if (score < 85) return 'solid'
  return 'mastered'
}

function formatTierName(tier: AnalyticsTier | TierProgressStats['tier']): string {
  if (tier === 'all') return 'All Tiers'
  if (tier === 'technician') return 'Technician'
  if (tier === 'general') return 'General'
  return 'Extra'
}

function buildFocusRecommendation(
  selectedTier: AnalyticsTier,
  tierReadiness: ReturnType<typeof calculateTierReadiness>[],
  heatmapCells: AccuracyHeatmapCell[],
  dueByTier: DueCountsByTier,
): FocusRecommendation {
  const lowestTier = [...tierReadiness].sort((a, b) => a.score - b.score)[0]
  const weakestGroup = [...heatmapCells]
    .filter((cell) => cell.attempts > 0)
    .sort((a, b) => a.accuracyPct - b.accuracyPct || b.attempts - a.attempts)[0]

  if (selectedTier !== 'all' && weakestGroup) {
    return {
      label: `${weakestGroup.groupId} · ${weakestGroup.subElement}`,
      reason: `${weakestGroup.accuracyPct}% accuracy across ${weakestGroup.attempts} attempts in ${formatTierName(selectedTier)}.`,
    }
  }

  if (lowestTier) {
    const tierDue =
      lowestTier.tier === 'technician'
        ? dueByTier.technician
        : lowestTier.tier === 'general'
          ? dueByTier.general
          : dueByTier.extra

    return {
      label: formatTierName(lowestTier.tier),
      reason: `${lowestTier.score}% readiness with ${tierDue} due review item${tierDue === 1 ? '' : 's'}.`,
    }
  }

  return {
    label: 'Start a practice session',
    reason: 'Analytics gets more useful as soon as answer history begins to accumulate.',
  }
}

// TASK: Provide a first-pass analytics workspace with charted trends.
// HOW CODE SOLVES: Reuses persisted answer activity + progress metrics to render
//                  score-over-time and sub-element radar visualizations.
export function AnalyticsScreen({ onBackToModes }: AnalyticsScreenProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTier, setSelectedTier] = useState<AnalyticsTier>('all')
  const [metricScope, setMetricScope] = useState<MetricScope>('selected')
  const [trendWindowDays, setTrendWindowDays] = useState<TrendWindowDays>(14)
  const [stats, setStats] = useState<ProgressStats | null>(null)
  const [tierStats, setTierStats] = useState<TierProgressStats[]>([])
  const [recentActivity, setRecentActivity] = useState<RecentAnswerActivity[]>([])
  const [dailyChallengeEvents, setDailyChallengeEvents] = useState<DailyChallengeEvent[]>([])
  const [accuracyHeatmap, setAccuracyHeatmap] = useState<AccuracyHeatmapCell[]>([])
  const [progressionTrend, setProgressionTrend] = useState<ProgressionTrendData | null>(null)
  const [dueByTier, setDueByTier] = useState<DueCountsByTier>({
    technician: 0,
    general: 0,
    extra: 0,
  })

  const totalDueToday = dueByTier.technician + dueByTier.general + dueByTier.extra
  const selectedTierDue =
    selectedTier === 'all'
      ? totalDueToday
      : selectedTier === 'technician'
        ? dueByTier.technician
        : selectedTier === 'general'
          ? dueByTier.general
          : dueByTier.extra
  const isScopeLockedToAll = selectedTier === 'all'
  const effectiveMetricScope: MetricScope = isScopeLockedToAll ? 'all' : metricScope
  const dueForScope = effectiveMetricScope === 'all' ? totalDueToday : selectedTierDue
  const dueScopeLabel = effectiveMetricScope === 'all' ? 'All Tiers' : `${selectedTier} tier`
  const tierLabel = selectedTier === 'all' ? 'All Tiers' : `${selectedTier[0].toUpperCase()}${selectedTier.slice(1)}`
  const scopeLabel = effectiveMetricScope === 'all' ? 'All Tiers' : 'Selected Tier'
  const showScopedDueCards = effectiveMetricScope === 'selected' && selectedTier !== 'all'
  const scoreTrend = useMemo(() => buildScoreTrend(progressionTrend?.points ?? []), [progressionTrend])
  const activeStreakDays = progressionTrend?.points.at(-1)?.streakDays ?? 0
  const tierReadiness = useMemo(
    () =>
      tierStats.map((row) =>
        calculateTierReadiness(
          row,
          row.tier === 'technician' ? dueByTier.technician : row.tier === 'general' ? dueByTier.general : dueByTier.extra,
          activeStreakDays,
        ),
      ),
    [tierStats, dueByTier, activeStreakDays],
  )
  const activeTierReadiness = useMemo(() => {
    if (selectedTier === 'all' || effectiveMetricScope === 'all') {
      return calculateOverallReadiness(tierReadiness, tierStats)
    }

    return tierReadiness.find((row) => row.tier === selectedTier)?.score ?? 0
  }, [selectedTier, effectiveMetricScope, tierReadiness, tierStats])
  const levelMilestones = useMemo(() => buildLevelMilestones(progressionTrend?.points ?? []), [progressionTrend])
  const rewardEvents = useMemo(() => {
    if (dailyChallengeEvents.length > 0) {
      return buildPersistedChallengeEvents(dailyChallengeEvents)
    }

    return buildRecentRewardEvents(progressionTrend?.points ?? [])
  }, [dailyChallengeEvents, progressionTrend])
  const radarData = useMemo(() => buildSubElementRadar(recentActivity), [recentActivity])
  const readinessPct = useMemo(() => Number(activeTierReadiness.toFixed(2)), [activeTierReadiness])
  const readinessEmphasisTier = selectedTier === 'all' ? null : selectedTier
  const leadTier = useMemo(() => [...tierReadiness].sort((a, b) => b.score - a.score)[0] ?? null, [tierReadiness])
  const weakestTier = useMemo(() => [...tierReadiness].sort((a, b) => a.score - b.score)[0] ?? null, [tierReadiness])
  const latestTrendPoint = progressionTrend?.points.at(-1) ?? null
  const previousTrendPoint = progressionTrend && progressionTrend.points.length > 1 ? progressionTrend.points[progressionTrend.points.length - 2] : null
  const xpTrendDelta = latestTrendPoint && previousTrendPoint ? latestTrendPoint.totalXp - previousTrendPoint.totalXp : 0
  const focusRecommendation = useMemo(
    () => buildFocusRecommendation(selectedTier, tierReadiness, accuracyHeatmap, dueByTier),
    [selectedTier, tierReadiness, accuracyHeatmap, dueByTier],
  )
  const challengeCompletionRate =
    progressionTrend?.points.length && progressionTrend.points.length > 0
      ? Number(
          (
            (progressionTrend.points.filter((point) => point.dailyChallengeCompleted).length / progressionTrend.points.length) *
            100
          ).toFixed(2),
        )
      : 0

  const refreshAnalytics = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const [techDue, genDue, extraDue, activity, trend, challengeEvents, heatmap, baseStats, perTierStats] = await Promise.all([
        ipcBridge.getDueSrsQueue({ tier: 'technician', limit: 300 }),
        ipcBridge.getDueSrsQueue({ tier: 'general', limit: 300 }),
        ipcBridge.getDueSrsQueue({ tier: 'extra', limit: 300 }),
        ipcBridge.getRecentAnswerActivity({ limit: 400 }),
        ipcBridge.getProgressionTrend({
          days: trendWindowDays,
          streakGraceHours: 2,
          tier: selectedTier,
        }),
        ipcBridge.getDailyChallengeEvents({ limit: 30 }),
        ipcBridge.getAccuracyHeatmap({ tier: selectedTier, minAttempts: 0, limit: 240 }),
        ipcBridge.getProgressStats(),
        ipcBridge.getTierProgressStats(),
      ])

      const filteredActivity =
        selectedTier === 'all' ? activity : activity.filter((entry) => entry.examTier === selectedTier)
      const filteredCorrectCount = filteredActivity.filter((entry) => entry.isCorrect).length

      const filteredStats =
        selectedTier === 'all'
          ? baseStats
          : {
              totalAnswers: filteredActivity.length,
              correctAnswers: filteredCorrectCount,
              accuracyPct:
                filteredActivity.length > 0
                  ? Number(((filteredCorrectCount / filteredActivity.length) * 100).toFixed(2))
                  : 0,
              uniqueQuestionsAnswered: new Set(filteredActivity.map((entry) => entry.questionId)).size,
            }

      setStats(filteredStats)
      setDueByTier({
        technician: techDue.length,
        general: genDue.length,
        extra: extraDue.length,
      })
      setRecentActivity(filteredActivity)
      setProgressionTrend(trend)
      setDailyChallengeEvents(challengeEvents)
      setAccuracyHeatmap(heatmap.cells)
      setTierStats(perTierStats)
    } catch (err: unknown) {
      const details = err instanceof Error ? err.message : String(err)
      setError(`Failed to load analytics. ${details}`)
    } finally {
      setLoading(false)
    }
  }, [selectedTier, trendWindowDays])

  useEffect(() => {
    void refreshAnalytics()
  }, [refreshAnalytics])

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <h1>HamStudy Pro</h1>
          <p className="subtitle">Analytics</p>
        </div>
        <button type="button" className="ghost-btn" onClick={onBackToModes}>
          Back to Modes
        </button>
        <div className="stats-grid">
          <StatPill label="Readiness" value={`${readinessPct}%`} />
          <StatPill label="Answers Tracked" value={recentActivity.length} />
          <StatPill label={`Due Today (${dueScopeLabel})`} value={dueForScope} />
          <StatPill label="All-time Accuracy" value={`${stats?.accuracyPct ?? 0}%`} />
        </div>
      </header>

      <section className="panel dashboard-hero-panel">
        <p className="mode-tagline">Track trend lines, expose weak topics, and calibrate exam readiness.</p>
        <p className="meta">
          {leadTier && weakestTier
            ? `Best current tier: ${formatTierName(leadTier.tier)} at ${leadTier.score}%. Biggest drag: ${formatTierName(weakestTier.tier)} at ${weakestTier.score}%.`
            : 'This is the Phase 3 analytics foundation using persisted answer history and due-queue data.'}
        </p>
        <div className="analytics-filter-chips">
          <span className="analytics-filter-chip">Tier: {tierLabel}</span>
          <span className="analytics-filter-chip">Window: {trendWindowDays}d</span>
          <span className="analytics-filter-chip">Scope: {scopeLabel}</span>
          <span className="analytics-filter-chip">Challenge completion: {challengeCompletionRate}%</span>
        </div>
        <div className="readiness-mini-chart" role="list" aria-label="Tier readiness mini chart">
          {tierReadiness.map((row) => {
            const isEmphasized = readinessEmphasisTier === row.tier
            const band = resolveReadinessBand(row.score)

            return (
              <div
                key={row.tier}
                role="listitem"
                className={`readiness-mini-row ${isEmphasized ? 'active' : ''}`}
                title={`${row.tier}: ${row.score}% readiness, ${row.confidencePct}% confidence`}
              >
                <span className="readiness-mini-label">{row.tier}</span>
                <div className="readiness-mini-track" aria-hidden="true">
                  <span className={`readiness-mini-fill heatmap-${band}`} style={{ width: `${row.score}%` }} />
                </div>
                <span className="readiness-mini-value">{row.score}%</span>
              </div>
            )
          })}
        </div>
        <div className="session-controls-row analytics-controls-row">
          <label>
            Tier
            <select value={selectedTier} onChange={(event) => setSelectedTier(event.target.value as AnalyticsTier)}>
              <option value="all">All Tiers</option>
              <option value="technician">Technician</option>
              <option value="general">General</option>
              <option value="extra">Extra</option>
            </select>
          </label>
          <label>
            Trend Window
            <select
              value={trendWindowDays}
              onChange={(event) => setTrendWindowDays(Number(event.target.value) as TrendWindowDays)}
            >
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={60}>Last 60 days</option>
            </select>
          </label>
          <label>
            Metric Scope
            <select
              value={effectiveMetricScope}
              onChange={(event) => setMetricScope(event.target.value as MetricScope)}
              disabled={isScopeLockedToAll}
            >
              <option value="selected">Selected Tier</option>
              <option value="all">All Tiers</option>
            </select>
          </label>
        </div>
        {isScopeLockedToAll ? <p className="meta">Metric scope is locked to All Tiers while Tier is set to All Tiers.</p> : null}
      </section>

      <section className="panel analytics-grid">
        <article className="dashboard-card">
          <p className="dashboard-label">Best Readiness Tier</p>
          <p className="dashboard-value">{leadTier ? formatTierName(leadTier.tier) : 'No data'}</p>
          <p className="meta">
            {leadTier ? `${leadTier.score}% readiness · ${leadTier.confidencePct}% confidence` : 'Answer more questions to calibrate readiness.'}
          </p>
        </article>

        <article className="dashboard-card">
          <p className="dashboard-label">Focus Next</p>
          <p className="dashboard-value">{focusRecommendation.label}</p>
          <p className="meta">{focusRecommendation.reason}</p>
        </article>

        <article className="dashboard-card">
          <p className="dashboard-label">XP Momentum</p>
          <p className="dashboard-value">
            {xpTrendDelta > 0 ? '+' : ''}
            {xpTrendDelta}
          </p>
          <p className="meta">
            {latestTrendPoint
              ? `${latestTrendPoint.dailyXp} daily XP on the latest learning day · streak ${latestTrendPoint.streakDays}`
              : 'No progression trend yet.'}
          </p>
        </article>
      </section>

      <section className="panel analytics-grid">
        <article className="analytics-card">
          <p className="dashboard-label">Score Over Time ({trendWindowDays}-Day Window)</p>
          {scoreTrend.every((point) => point.attempts === 0) ? (
            <p className="meta">No daily answer history yet. Complete a few sessions and trend lines will appear.</p>
          ) : (
            <div className="analytics-chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={scoreTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(224, 180, 191, 0.35)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="accuracy" name="Accuracy %" stroke="#e60023" strokeWidth={2.4} dot={false} />
                  <Line yAxisId="left" type="monotone" dataKey="attempts" name="Attempts" stroke="#2e8db8" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="totalXp" name="Total XP" stroke="#008578" strokeWidth={2.1} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="streakDays" name="Streak Days" stroke="#f59f00" strokeWidth={1.8} dot={false} />
                  {levelMilestones.slice(-4).map((milestone) => (
                    <ReferenceLine
                      key={`${milestone.date}-${milestone.levelTitle}`}
                      x={milestone.date}
                      stroke="rgba(0, 133, 120, 0.42)"
                      strokeDasharray="4 4"
                      label={{ value: milestone.levelTitle, position: 'insideTopRight', fontSize: 10 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>

        <article className="analytics-card">
          <p className="dashboard-label">Topic Radar (Most Attempted)</p>
          {radarData.length === 0 ? (
            <p className="meta">No topic history yet. Answer questions to map your performance profile.</p>
          ) : (
            <div className="analytics-chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="74%">
                  <PolarGrid stroke="rgba(224, 180, 191, 0.38)" />
                  <PolarAngleAxis dataKey="subElement" tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Radar name="Accuracy %" dataKey="accuracy" stroke="#e60023" fill="#e60023" fillOpacity={0.22} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>
      </section>

      <section className="panel analytics-grid">
        <article className="analytics-card">
          <p className="dashboard-label">Readiness Calibration</p>
          <p className="meta">Calibrated by tier with confidence damping for low-attempt histories.</p>
          {tierReadiness.length === 0 ? (
            <p className="meta">No readiness calibration data yet.</p>
          ) : (
            <ul className="analytics-event-list">
              {tierReadiness.map((row) => (
                <li key={row.tier} className="analytics-event-item">
                  <strong>
                    {row.tier}: {row.score}%
                  </strong>
                  <span className="meta">
                    confidence {row.confidencePct}% · accuracy +{row.accuracyComponent} · coverage +{row.coverageComponent} · due -{row.duePenalty}
                    {' '}· streak +{row.streakBonus}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="dashboard-card">
          <p className="dashboard-label">Active Scope Readiness</p>
          <p className="dashboard-value">{readinessPct}%</p>
          <p className="meta">Tier: {formatTierName(selectedTier)}</p>
          <p className="meta">Scope: {scopeLabel}</p>
          <p className="meta">Due pressure considered: {dueForScope}</p>
        </article>
      </section>

      <section className="panel">
        <p className="dashboard-label">Accuracy Heatmap by Group</p>
        <p className="meta">Grouped by topic and question group. Lower-accuracy cells surface first.</p>

        <div className="heatmap-legend">
          <span className="heatmap-dot heatmap-unseen">Unseen</span>
          <span className="heatmap-dot heatmap-struggling">&lt;50%</span>
          <span className="heatmap-dot heatmap-developing">50-69%</span>
          <span className="heatmap-dot heatmap-solid">70-84%</span>
          <span className="heatmap-dot heatmap-mastered">85%+</span>
        </div>

        {accuracyHeatmap.length === 0 ? (
          <p className="meta">No heatmap cells available yet for this tier/filter combination.</p>
        ) : (
          <div className="accuracy-heatmap-grid" role="list" aria-label="Accuracy heatmap by group">
            {accuracyHeatmap.map((cell) => {
              const band = resolveHeatmapBand(cell)
              return (
                <div
                  key={`${cell.examTier}-${cell.groupId}`}
                  role="listitem"
                  className={`heatmap-cell heatmap-${band}`}
                  title={`${formatTierName(cell.examTier)} • ${cell.groupId} • ${cell.subElement} • ${cell.accuracyPct}% (${cell.correctAnswers}/${cell.attempts})`}
                >
                  <strong>{cell.groupId}</strong>
                  <span>{cell.accuracyPct}%</span>
                  <small>{cell.attempts} attempts</small>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="panel analytics-grid">
        {showScopedDueCards ? (
          <article className="dashboard-card">
            <p className="dashboard-label">{tierLabel} Due</p>
            <p className="dashboard-value">{selectedTierDue}</p>
            <p className="meta">Queue pressure for active tier scope</p>
          </article>
        ) : (
          <>
            <article className="dashboard-card">
              <p className="dashboard-label">Technician Due</p>
              <p className="dashboard-value">{dueByTier.technician}</p>
              <p className="meta">Element 2 queue pressure</p>
            </article>

            <article className="dashboard-card">
              <p className="dashboard-label">General Due</p>
              <p className="dashboard-value">{dueByTier.general}</p>
              <p className="meta">Element 3 queue pressure</p>
            </article>

            <article className="dashboard-card">
              <p className="dashboard-label">Extra Due</p>
              <p className="dashboard-value">{dueByTier.extra}</p>
              <p className="meta">Element 4 queue pressure</p>
            </article>
          </>
        )}

        <article className="dashboard-card">
          <p className="dashboard-label">Unique Questions Seen</p>
          <p className="dashboard-value">{stats?.uniqueQuestionsAnswered ?? 0}</p>
          <p className="meta">
            Coverage out of 1,440 questions · {stats?.totalAnswers ?? 0} total tracked answers
          </p>
        </article>
      </section>

      <section className="panel analytics-grid">
        <article className="analytics-card">
          <p className="dashboard-label">Recent Level Milestones</p>
          {levelMilestones.length === 0 ? (
            <p className="meta">No level transitions in this trend window yet.</p>
          ) : (
            <ul className="analytics-event-list">
              {levelMilestones
                .slice(-6)
                .reverse()
                .map((milestone) => (
                  <li key={`${milestone.date}-${milestone.levelTitle}`} className="analytics-event-item">
                    <strong>{milestone.levelTitle}</strong>
                    <span className="meta">Reached on {milestone.date}</span>
                  </li>
                ))}
            </ul>
          )}
        </article>

        <article className="analytics-card">
          <p className="dashboard-label">Recent Reward Events</p>
          {rewardEvents.length === 0 ? (
            <p className="meta">No reward events recorded yet. Keep answering to unlock bonuses.</p>
          ) : (
            <ul className="analytics-event-list">
              {rewardEvents.map((event) => (
                <li key={`${event.date}-${event.label}`} className="analytics-event-item">
                  <strong>{event.date}</strong>
                  <span className="meta">{event.label}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section className="panel">
        {loading ? <p>Loading analytics...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        {!loading && !error ? (
          <div className="action-row">
            <button type="button" onClick={() => void refreshAnalytics()}>
              Refresh Analytics
            </button>
          </div>
        ) : null}
      </section>
    </main>
  )
}
