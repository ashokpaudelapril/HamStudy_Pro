import { useCallback, useEffect, useMemo, useState } from 'react'
import { ipcBridge } from '@shared/ipcBridge'
import type { ExamTier, MasteryState, QuestionBrowserRow } from '@shared/types'
import { ModeBar } from '../components/ModeBar'

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
  const [searchText, setSearchText] = useState('')
  const [masteryFilter, setMasteryFilter] = useState<MasteryState>('all')

  const filteredRows = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    return rows.filter((row) => {
      const matchesMastery = masteryFilter === 'all' || row.masteryState === masteryFilter
      const matchesQuery =
        query.length === 0 ||
        row.id.toLowerCase().includes(query) ||
        row.subElement.toLowerCase().includes(query) ||
        row.groupId.toLowerCase().includes(query) ||
        row.questionText.toLowerCase().includes(query)
      return matchesMastery && matchesQuery
    })
  }, [masteryFilter, rows, searchText])

  const selected = useMemo(() => filteredRows.find((row) => row.id === selectedId) ?? null, [filteredRows, selectedId])

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

  useEffect(() => {
    if (filteredRows.length === 0) {
      setSelectedId(null)
      return
    }

    if (!filteredRows.some((row) => row.id === selectedId)) {
      setSelectedId(filteredRows[0].id)
    }
  }, [filteredRows, selectedId])

  return (
    <main className="app-shell">
      <ModeBar title="Mastery Map" onBack={onBackToModes} />

      <section className="mastery-controls-panel">
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

        <div className="mastery-filter-row">
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Filter by ID, topic, group, or text"
          />
          <select value={masteryFilter} onChange={(event) => setMasteryFilter(event.target.value as MasteryState)}>
            <option value="all">All mastery</option>
            <option value="unseen">Unseen</option>
            <option value="learning">Learning</option>
            <option value="known">Known</option>
            <option value="mastered">Mastered</option>
          </select>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              setSearchText('')
              setMasteryFilter('all')
            }}
          >
            Clear
          </button>
        </div>

        <div className="mastery-legend mastery-legend-strip">
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

      <section className="mastery-layout">
        {loading ? <p>Loading mastery map...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        {!loading && !error ? (
          <>
            <div className="mastery-table-shell">
              <div className="mastery-table-header mono-data">
                <span>ID</span>
                <span>Topic</span>
                <span>State</span>
                <span>Acc</span>
              </div>
              <div className="mastery-grid" role="list" aria-label="Mastery map question index">
                {filteredRows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    role="listitem"
                    className={`mastery-row mastery-${row.masteryState} ${selectedId === row.id ? 'active' : ''}`}
                    title={`${row.id} — ${formatMasteryLabel(row.masteryState)}`}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <span className="mastery-row-id">{row.id}</span>
                    <span className="mastery-row-topic">{row.subElement}</span>
                    <span className="mastery-row-state">{formatMasteryLabel(row.masteryState)}</span>
                    <span className="mastery-row-accuracy">{row.accuracyPct}%</span>
                  </button>
                ))}
              </div>
            </div>

            <aside className="mastery-detail">
              {selected ? (
                <>
                  <div className="mastery-detail-header">
                    <div>
                      <p className="mode-eyebrow mono-data">Selected</p>
                      <h2>{selected.id}</h2>
                    </div>
                    <span className={`question-position-chip mono-data mastery-state-chip mastery-${selected.masteryState}`}>
                      {formatMasteryLabel(selected.masteryState)}
                    </span>
                  </div>

                  <div className="mastery-detail-metrics">
                    <div>
                      <span className="mode-config-label">Topic</span>
                      <strong>{selected.subElement}</strong>
                      <p className="meta">{selected.groupId}</p>
                    </div>
                    <div>
                      <span className="mode-config-label">Attempts</span>
                      <strong>{selected.attempts}</strong>
                      <p className="meta">Accuracy {selected.accuracyPct}%</p>
                    </div>
                  </div>

                  <p className="mastery-detail-text">{selected.questionText}</p>

                  <div className="action-row">
                    <button type="button" className="primary-button" onClick={onOpenQuestionBrowser}>
                      Open in Browser
                    </button>
                    <button type="button" className="ghost-btn" onClick={() => void fetchMasteryRows()}>
                      Refresh
                    </button>
                  </div>
                </>
              ) : (
                <p className="meta">Select a row to inspect question-level mastery details.</p>
              )}
            </aside>
          </>
        ) : null}
      </section>
    </main>
  )
}
