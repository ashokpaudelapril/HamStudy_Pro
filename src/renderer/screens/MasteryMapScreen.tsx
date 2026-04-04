import { useCallback, useEffect, useMemo, useState } from 'react'
import { ipcBridge } from '@shared/ipcBridge'
import type { ExamTier, QuestionBrowserRow } from '@shared/types'
import { ScreenHeader } from '../components/ScreenHeader'
import { StatPill } from '../components/StatPill'

type MasteryMapScreenProps = {
  onBackToModes: () => void
  onOpenQuestionBrowser: () => void
}

type MasteryCounts = {
  unseen: number
  learning: number
  known: number
  mastered: number
}

const MASTERY_ORDER = ['unseen', 'learning', 'known', 'mastered'] as const

function formatMasteryLabel(value: keyof MasteryCounts): string {
  if (value === 'unseen') return 'Unseen'
  if (value === 'learning') return 'Learning'
  if (value === 'known') return 'Known'
  return 'Mastered'
}

// TASK: Visualize all questions by mastery state in a compact tier-aware map.
// HOW CODE SOLVES: Loads browser row summaries, groups by mastery state,
//                  and renders clickable tiles with a detail side panel.
export function MasteryMapScreen({ onBackToModes, onOpenQuestionBrowser }: MasteryMapScreenProps) {
  const [tier, setTier] = useState<ExamTier>('technician')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<QuestionBrowserRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = useMemo(() => rows.find((row) => row.id === selectedId) ?? null, [rows, selectedId])

  const masteryCounts = useMemo<MasteryCounts>(() => {
    const counts: MasteryCounts = {
      unseen: 0,
      learning: 0,
      known: 0,
      mastered: 0,
    }

    for (const row of rows) {
      counts[row.masteryState] += 1
    }

    return counts
  }, [rows])

  const masteryPct = useMemo(() => {
    const total = rows.length
    if (total === 0) {
      return {
        unseen: 0,
        learning: 0,
        known: 0,
        mastered: 0,
      }
    }

    return {
      unseen: Number(((masteryCounts.unseen / total) * 100).toFixed(1)),
      learning: Number(((masteryCounts.learning / total) * 100).toFixed(1)),
      known: Number(((masteryCounts.known / total) * 100).toFixed(1)),
      mastered: Number(((masteryCounts.mastered / total) * 100).toFixed(1)),
    }
  }, [masteryCounts, rows.length])

  const fetchMasteryRows = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const nextRows = await ipcBridge.getQuestionBrowserRows({
        tier,
        mastery: 'all',
        limit: 1600,
      })

      setRows(nextRows)
      setSelectedId(nextRows[0]?.id ?? null)
    } catch (err: unknown) {
      const details = err instanceof Error ? err.message : String(err)
      setError(`Failed to load mastery map. ${details}`)
      setRows([])
      setSelectedId(null)
    } finally {
      setLoading(false)
    }
  }, [tier])

  useEffect(() => {
    void fetchMasteryRows()
  }, [fetchMasteryRows])

  return (
    <main className="app-shell">
      <ScreenHeader
        title="HamStudy Pro"
        subtitle="Mastery Map"
        actions={
          <button type="button" className="ghost-btn" onClick={onBackToModes}>
            Back to Modes
          </button>
        }
        stats={
          <>
            <StatPill label="Tier" value={tier} />
            <StatPill label="Questions" value={rows.length} />
            <StatPill label="Mastered" value={`${masteryCounts.mastered}`} />
            <StatPill label="Coverage" value={`${Number((masteryPct.known + masteryPct.mastered).toFixed(1))}%`} />
          </>
        }
      />

      <section className="panel mastery-controls-panel">
        <div className="exam-tier-buttons">
          <button type="button" className={`exam-tier-btn ${tier === 'technician' ? 'active' : ''}`} onClick={() => setTier('technician')}>
            Technician
          </button>
          <button type="button" className={`exam-tier-btn ${tier === 'general' ? 'active' : ''}`} onClick={() => setTier('general')}>
            General
          </button>
          <button type="button" className={`exam-tier-btn ${tier === 'extra' ? 'active' : ''}`} onClick={() => setTier('extra')}>
            Extra
          </button>
        </div>

        <div className="mastery-legend">
          {MASTERY_ORDER.map((state) => (
            <div key={state} className={`mastery-legend-item mastery-${state}`}>
              <span>{formatMasteryLabel(state)}</span>
              <strong>
                {masteryCounts[state]} ({masteryPct[state]}%)
              </strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel mastery-layout">
        {loading ? <p>Loading mastery map...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        {!loading && !error ? (
          <>
            <div className="mastery-grid" role="list" aria-label="Mastery map question tiles">
              {rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  role="listitem"
                  className={`mastery-tile mastery-${row.masteryState} ${selectedId === row.id ? 'active' : ''}`}
                  title={`${row.id} — ${formatMasteryLabel(row.masteryState)}`}
                  onClick={() => setSelectedId(row.id)}
                >
                  <span>{row.id}</span>
                </button>
              ))}
            </div>

            <aside className="mastery-detail panel">
              {selected ? (
                <>
                  <p className="dashboard-label">Selected Question</p>
                  <p className="mode-tagline">{selected.id}</p>
                  <p className="meta">{selected.subElement} · {selected.groupId}</p>
                  <p className="meta">Mastery: {formatMasteryLabel(selected.masteryState)}</p>
                  <p className="meta">Attempts: {selected.attempts}</p>
                  <p className="meta">Accuracy: {selected.accuracyPct}%</p>
                  <p className="meta">{selected.questionText}</p>
                  <div className="action-row">
                    <button type="button" onClick={onOpenQuestionBrowser}>Open in Question Browser</button>
                    <button type="button" className="ghost-btn" onClick={() => void fetchMasteryRows()}>Refresh Map</button>
                  </div>
                </>
              ) : (
                <p className="meta">Select a tile to inspect question-level mastery details.</p>
              )}
            </aside>
          </>
        ) : null}
      </section>
    </main>
  )
}
