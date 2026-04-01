type StatPillProps = {
  label: string
  value: string | number
}

// TASK: Render a compact, consistent stat item across screen headers.
// HOW CODE SOLVES: Standardizes label/value formatting while preserving
//                  existing `stats-grid` layout semantics.
export function StatPill({ label, value }: StatPillProps) {
  return (
    <p>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </p>
  )
}
