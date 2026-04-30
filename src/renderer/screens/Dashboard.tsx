import { useCallback, useEffect, useMemo, useState } from 'react'
import { ipcBridge } from '@shared/ipcBridge'
import type { ExamTier, RecentAnswerActivity, TierProgressStats } from '@shared/types'
import { StatPill } from '../components/StatPill'
import { useProgressionStore } from '../store/useProgressionStore'
import { calculateOverallReadiness, calculateTierReadiness } from '../utils/readiness'
import { Activity, Target, Zap, Clock, ShieldAlert } from 'lucide-react'

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
  return tier.toUpperCase()
}

function toDayKey(dateString: string): string {
  const date = new Date(dateString)
  return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

function formatRelativeTime(timestamp: string): string {
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) return 'UNKNOWN_TIME'
  const deltaMs = Date.now() - parsed.getTime()
  const deltaMinutes = Math.max(0, Math.floor(deltaMs / 60000))
  if (deltaMinutes < 1) return 'JUST_NOW'
  if (deltaMinutes < 60) return `${deltaMinutes}M_AGO`
  const deltaHours = Math.floor(deltaMinutes / 60)
  if (deltaHours < 24) return `${deltaHours}H_AGO`
  return parsed.toLocaleDateString().replace(/\//g, '-')
}

function buildDailyChallengePlan(dueByTier: DueCountsByTier, activity: RecentAnswerActivity[]): DailyChallengePlan {
  const ranking: Array<{ tier: ExamTier; count: number }> = [
    { tier: 'technician', count: dueByTier.technician },
    { tier: 'general', count: dueByTier.general },
    { tier: 'extra', count: dueByTier.extra },
  ]
  ranking.sort((a, b) => b.count - a.count)
  const focusTier = ranking[0].count > 0 ? ranking[0].tier : 'technician'
  const todayKey = toDayKey(new Date().toISOString())
  const completedToday = activity.filter(
    (entry) => entry.examTier === focusTier && toDayKey(entry.answeredAt) === todayKey,
  ).length
  const remaining = Math.max(0, DAILY_CHALLENGE_TARGET - completedToday)
  return { focusTier, targetQuestions: DAILY_CHALLENGE_TARGET, completedToday, remaining, isComplete: remaining === 0 }
}

export function DashboardScreen({ onStartDailyChallenge }: DashboardScreenProps) {
  const progressionSummary = useProgressionStore((state) => state.summary)
  const refreshProgression = useProgressionStore((state) => state.refresh)

  const [tierStats, setTierStats] = useState<TierProgressStats[]>([])
  const [recentActivity, setRecentActivity] = useState<RecentAnswerActivity[]>([])
  const [dueByTier, setDueByTier] = useState<DueCountsByTier>({ technician: 0, general: 0, extra: 0 })

  const streakDays = progressionSummary?.currentStreakDays ?? 0
  const totalDueToday = dueByTier.technician + dueByTier.general + dueByTier.extra
  const totalAnswersTracked = useMemo(() => tierStats.reduce((sum, row) => sum + row.totalAnswers, 0), [tierStats])
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

  const refreshDashboard = useCallback(async (): Promise<void> => {
    try {
      const [nextTierStats, techDue, genDue, extraDue, activity] = await Promise.all([
        ipcBridge.getTierProgressStats(),
        ipcBridge.getDueSrsQueue({ tier: 'technician', limit: 300 }),
        ipcBridge.getDueSrsQueue({ tier: 'general', limit: 300 }),
        ipcBridge.getDueSrsQueue({ tier: 'extra', limit: 300 }),
        ipcBridge.getRecentAnswerActivity({ limit: 10 }),
      ])
      setTierStats(nextTierStats)
      setRecentActivity(activity)
      setDueByTier({ technician: techDue.length, general: genDue.length, extra: extraDue.length })
    } catch (err) {
      console.error(err)
    }
  }, [])

  useEffect(() => {
    void Promise.all([refreshDashboard(), refreshProgression()])
  }, [refreshDashboard, refreshProgression])

  return (
    <div className="dashboard-console-fixed">
      {/* 1. TOP METRICS STRIP */}
      <section className="console-stats-row">
        <StatPill label="SYS_READINESS" value={`${readinessPct}%`} color="info" icon="📡" />
        <StatPill label="ACTIVE_STREAK" value={`${streakDays}D`} color="warn" icon="🔥" />
        <StatPill label="TOTAL_ANSWERS" value={totalAnswersTracked} color="primary" icon="📝" />
        <StatPill label="TOTAL_DUE" value={totalDueToday} color={totalDueToday > 20 ? 'bad' : 'good'} icon="⏳" />
      </section>

      <div className="dashboard-bento-grid">
        <div className="bento-column left">
          {/* DAILY FOCUS WIDGET */}
          <article className="panel widget flex-none">
            <div className="widget-header">
              <Target size={14} />
              <h3 className="mono-data">FOCUS_TARGET: {formatTierName(dailyChallenge.focusTier)}</h3>
            </div>
            <div className="widget-body">
              <div className="metric-group">
                <span className="mono-data">PROGRESS: {dailyChallenge.completedToday}/{dailyChallenge.targetQuestions}</span>
                <div className="meter-container">
                  <div 
                    className="meter-fill" 
                    style={{ width: `${(dailyChallenge.completedToday / dailyChallenge.targetQuestions) * 100}%` }} 
                  />
                </div>
              </div>
              <p className="meta mono-data metric-note">
                {dailyChallenge.isComplete ? 'STATUS: GOAL_ACHIEVED' : `STATUS: ${dailyChallenge.remaining}_REMAINING`}
              </p>
              <button 
                className="console-button primary full-width-action"
                onClick={onStartDailyChallenge}
              >
                EXECUTE_PRACTICE_DRILL
              </button>
            </div>
          </article>

          {/* QUEUE STATUS WIDGET */}
          <article className="panel widget flex-1">
            <div className="widget-header">
              <Clock size={14} />
              <h3 className="mono-data">SRS_QUEUE_STATUS</h3>
            </div>
            <div className="widget-body-grid">
              <div className="status-cell">
                <span className="label mono-data">TECH</span>
                <span className={`value mono-data ${dueByTier.technician > 0 ? 'text-warn' : ''}`}>{dueByTier.technician}</span>
              </div>
              <div className="status-cell">
                <span className="label mono-data">GEN</span>
                <span className={`value mono-data ${dueByTier.general > 0 ? 'text-warn' : ''}`}>{dueByTier.general}</span>
              </div>
              <div className="status-cell">
                <span className="label mono-data">EXTRA</span>
                <span className={`value mono-data ${dueByTier.extra > 0 ? 'text-warn' : ''}`}>{dueByTier.extra}</span>
              </div>
            </div>
          </article>
        </div>

        <div className="bento-column right">
          {/* RECENT ACTIVITY LOG */}
          <article className="panel widget activity-log flex-1">
            <div className="widget-header">
              <Activity size={14} />
              <h3 className="mono-data">LOG_RECENT_ACTIVITY</h3>
            </div>
            <div className="scroll-pane activity-table-area">
              <div className="activity-table">
                {recentActivity.map((entry) => (
                  <div key={entry.id} className="log-entry">
                    <span className={`log-status ${entry.isCorrect ? 'good' : 'bad'}`}>
                      {entry.isCorrect ? 'PASS' : 'FAIL'}
                    </span>
                    <span className="log-id mono-data">{entry.questionId}</span>
                    <span className="log-time mono-data">{formatRelativeTime(entry.answeredAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          </article>

          {/* SYSTEM MESSAGES / AI INSIGHTS */}
          <article className="panel widget flex-none">
            <div className="widget-header">
              <Zap size={14} />
              <h3 className="mono-data">SYS_MESSAGES</h3>
            </div>
            <div className="widget-body">
              <div className="msg-entry info">
                <ShieldAlert size={12} />
                <span className="mono-data">READINESS_EST_STABLE_AT_{readinessPct}PCT</span>
              </div>
              <p className="meta mono-data metric-note">
                &gt; RECOMMENDATION: Focus on Sub-element T1 to maximize retention.
              </p>
            </div>
          </article>
        </div>
      </div>
    </div>
  )
}
