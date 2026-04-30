type TabItem = {
  id: string
  label: string
}

type SectionTabsProps = {
  items: TabItem[]
  activeId: string
  onChange: (id: string) => void
}

export function SectionTabs({ items, activeId, onChange }: SectionTabsProps) {
  return (
    <div className="section-tabs" role="tablist" aria-label="Section tabs">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === activeId}
          className={`section-tab${item.id === activeId ? ' active' : ''}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
