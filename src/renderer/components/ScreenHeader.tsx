import type { ReactNode } from 'react'

type ScreenHeaderProps = {
  title: string
  subtitle: string
  actions?: ReactNode
  stats?: ReactNode
}

// TASK: Provide a consistent branded header across study screens.
// HOW CODE SOLVES: Wraps the existing top-bar styling with predictable slots for
//                  title/subtitle, action buttons, and stats so screens stop
//                  hand-assembling slightly different header layouts.
export function ScreenHeader({ title, subtitle, actions, stats }: ScreenHeaderProps) {
  return (
    <div className="screen-header-stack">
      <header className="top-bar screen-header">
        <div className="screen-header-main">
          <h1>{title}</h1>
          <p className="subtitle screen-header-subtitle">{subtitle}</p>
        </div>

        {actions ? <div className="screen-header-actions">{actions}</div> : null}
      </header>

      {stats ? (
        <section className="panel screen-header-stats-bar" aria-label={`${title} summary stats`}>
          <div className="stats-grid screen-header-stats">{stats}</div>
        </section>
      ) : null}
    </div>
  )
}
