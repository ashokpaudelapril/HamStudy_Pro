type StatPillProps = {
  label: string
  value: string | number
  icon?: string
}

// TASK: Render a compact, consistent stat item across screen headers.
// HOW CODE SOLVES: Standardizes label/value formatting while preserving
//                  existing `stats-grid` layout semantics.
//                  Uses aria-label for screen readers to read stat as "label: value".
export function StatPill({ label, value, icon }: StatPillProps) {
  return (
    <p aria-label={`${label}: ${value}`}>
      {icon ? (
        <span className="stat-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="stat-text-group">
        <span className="stat-label">{label}</span>
        <span className="stat-value" aria-hidden="false">{value}</span>
      </span>
    </p>
  )
}
