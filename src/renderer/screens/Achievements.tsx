import { useEffect, useMemo, useState } from 'react'
import { ipcBridge } from '@shared/ipcBridge'
import type { EarnedBadge } from '@shared/types'
import { AchievementBadge } from '../components/AchievementBadge'
import { ScreenHeader } from '../components/ScreenHeader'
import { StatPill } from '../components/StatPill'
import {
  type AchievementFilter,
  filterBadges,
  getLatestUnlockedBadge,
  getNextLockedBadge,
  sortBadgesForDisplay,
} from './achievementsUtils'

// TASK: Render the badge wall showing all locked and unlocked achievements.
// HOW CODE SOLVES: Fetches the full badge list (with unlock state) via IPC on mount
//                  and maps each entry to an AchievementBadge cell in a CSS grid layout.
export function AchievementsScreen({ onBackToModes }: { onBackToModes: () => void }) {
  const [badges, setBadges] = useState<EarnedBadge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<AchievementFilter>('all')

  useEffect(() => {
    let cancelled = false

    ipcBridge
      .getEarnedBadges()
      .then((earned) => {
        if (!cancelled) setBadges(earned)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const unlockedCount = badges.filter((b) => b.unlockedAt !== null).length
  const lockedCount = Math.max(badges.length - unlockedCount, 0)
  const completionPct = badges.length > 0 ? Math.round((unlockedCount / badges.length) * 100) : 0

  // TASK: Keep the achievements list focused on the status the learner wants to review.
  // HOW CODE SOLVES: Sorts unlocked badges first by most recent unlock date, then applies
  // the selected all/unlocked/locked filter before rendering the grid.
  const visibleBadges = useMemo(() => {
    const sorted = sortBadgesForDisplay(badges)
    return filterBadges(sorted, filter)
  }, [badges, filter])

  const nextBadge = useMemo(
    () => getNextLockedBadge(sortBadgesForDisplay(badges)),
    [badges],
  )

  const latestUnlockedBadge = useMemo(() => {
    return getLatestUnlockedBadge(sortBadgesForDisplay(badges))
  }, [badges])

  return (
    <main className="app-shell">
      <ScreenHeader
        title="HamStudy Pro"
        subtitle={loading ? 'Achievements' : `Achievements • ${unlockedCount} / ${badges.length} earned`}
        actions={
          <button type="button" className="ghost-btn" onClick={onBackToModes}>
            Back to Modes
          </button>
        }
        stats={
          <>
            <StatPill label="Unlocked" value={unlockedCount} icon="🏆" />
            <StatPill label="Locked" value={lockedCount} icon="🔒" />
            <StatPill label="Completion" value={`${completionPct}%`} icon="📈" />
          </>
        }
      />

      <section className="panel achievements-summary-panel">
        <div className="achievement-summary-card">
          <span className="achievement-summary-label">Unlocked</span>
          <strong>{unlockedCount}</strong>
        </div>
        <div className="achievement-summary-card">
          <span className="achievement-summary-label">Locked</span>
          <strong>{lockedCount}</strong>
        </div>
        <div className="achievement-summary-card achievement-summary-progress">
          <div className="achievement-progress-copy">
            <span className="achievement-summary-label">Collection Progress</span>
            <strong>{completionPct}%</strong>
          </div>
          <div className="achievement-progress-bar" aria-hidden="true">
            <span style={{ width: `${completionPct}%` }} />
          </div>
        </div>
      </section>

      <section className="panel achievements-focus-panel">
        <article className="achievement-focus-card">
          <span className="achievement-summary-label">Next Badge To Chase</span>
          {nextBadge ? (
            <>
              <div className="achievement-focus-header">
                <span className="achievement-focus-icon" aria-hidden="true">
                  {nextBadge.icon}
                </span>
                <div>
                  <h2>{nextBadge.title}</h2>
                  <p>{nextBadge.description}</p>
                </div>
              </div>
              <small>Keep building progress in your current study modes to unlock this badge.</small>
            </>
          ) : (
            <>
              <h2>Badge wall complete</h2>
              <p>You have unlocked every badge currently available in the app.</p>
            </>
          )}
        </article>

        <article className="achievement-focus-card">
          <span className="achievement-summary-label">Latest Unlock</span>
          {latestUnlockedBadge ? (
            <>
              <div className="achievement-focus-header">
                <span className="achievement-focus-icon" aria-hidden="true">
                  {latestUnlockedBadge.icon}
                </span>
                <div>
                  <h2>{latestUnlockedBadge.title}</h2>
                  <p>{latestUnlockedBadge.description}</p>
                </div>
              </div>
              <small>
                Earned on {new Date(latestUnlockedBadge.unlockedAt ?? '').toLocaleDateString()}.
              </small>
            </>
          ) : (
            <>
              <h2>No badges earned yet</h2>
              <p>Your first correct answer will start filling this wall.</p>
            </>
          )}
        </article>
      </section>

      <section className="panel">
        {error ? <p className="error-text">{error}</p> : null}
        {loading ? (
          <p>Loading achievements…</p>
        ) : (
          <>
            <div className="achievement-filter-row" role="tablist" aria-label="Achievement filters">
              <button
                type="button"
                className={`achievement-filter-chip ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`achievement-filter-chip ${filter === 'unlocked' ? 'active' : ''}`}
                onClick={() => setFilter('unlocked')}
              >
                Unlocked
              </button>
              <button
                type="button"
                className={`achievement-filter-chip ${filter === 'locked' ? 'active' : ''}`}
                onClick={() => setFilter('locked')}
              >
                Locked
              </button>
            </div>

            {visibleBadges.length === 0 ? (
              <div className="achievement-empty-state">
                <h2>No badges in this view yet</h2>
                <p>
                  {filter === 'unlocked'
                    ? 'Keep answering questions and completing study goals to unlock your first badge.'
                    : 'Everything in this filter has already been cleared.'}
                </p>
              </div>
            ) : (
              <div className="badge-grid">
                {visibleBadges.map((badge) => (
                  <AchievementBadge
                    key={badge.id}
                    id={badge.id}
                    title={badge.title}
                    description={badge.description}
                    icon={badge.icon}
                    unlockedAt={badge.unlockedAt}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}
