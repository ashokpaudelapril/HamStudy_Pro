type ModeBarProps = {
  title: string
  onBack?: () => void
  actions?: React.ReactNode
  backLabel?: string
}

export function ModeBar({ title, onBack, actions, backLabel = 'Back' }: ModeBarProps) {
  return (
    <header className="mode-bar">
      <div className="mode-bar-copy">
        <p className="mode-eyebrow mono-data">Mode</p>
        <strong>{title}</strong>
      </div>

      <div className="mode-bar-actions">
        {actions}
        {onBack ? (
          <button type="button" className="ghost-btn compact-back-btn" onClick={onBack}>
            {backLabel}
          </button>
        ) : null}
      </div>
    </header>
  )
}
