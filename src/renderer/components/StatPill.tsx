type StatPillProps = {
  label: string
  value: string | number
  icon?: string
  color?: 'primary' | 'good' | 'warn' | 'bad' | 'info'
}

export function StatPill({ label, value, icon, color = 'primary' }: StatPillProps) {
  return (
    <div 
      className={`stat-pill-technical ${color}`}
      aria-label={`${label}: ${value}`}
    >
      <div className="stat-pill-label mono-data">{label}</div>
      <div className="stat-pill-main">
        {icon && <span className="stat-icon" aria-hidden="true">{icon}</span>}
        <span className="stat-value mono-data">{value}</span>
      </div>
    </div>
  )
}
