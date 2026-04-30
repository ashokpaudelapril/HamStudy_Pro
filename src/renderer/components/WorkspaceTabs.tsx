import React from 'react'
import { X } from 'lucide-react'

export type Tab = {
  id: string
  label: string
  active?: boolean
}

type WorkspaceTabsProps = {
  tabs: Tab[]
  onSelectTab: (id: string) => void
  onCloseTab?: (id: string) => void
}

export const WorkspaceTabs: React.FC<WorkspaceTabsProps> = ({ tabs, onSelectTab, onCloseTab }) => {
  return (
    <div className="workspace-tabs">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab-item ${tab.active ? 'active' : ''}`}
          onClick={() => onSelectTab(tab.id)}
        >
          <span className="tab-label">{tab.label}</span>
          {onCloseTab && tabs.length > 1 && (
            <button
              className="tab-close-btn"
              onClick={(e) => {
                e.stopPropagation()
                onCloseTab(tab.id)
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
