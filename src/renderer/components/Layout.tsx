import React from 'react'
import { NavigationRail } from './NavigationRail'
import { WorkspaceTabs } from './WorkspaceTabs'
import type { Tab } from './WorkspaceTabs'
import { User } from 'lucide-react'

type LayoutProps = {
  children: React.ReactNode
  activeMode: string
  onModeChange: (mode: any) => void
  tabs: Tab[]
  onSelectTab: (id: string) => void
  onCloseTab?: (id: string) => void
}

export function Layout({ 
  children, 
  activeMode, 
  onModeChange,
  tabs,
  onSelectTab,
  onCloseTab,
}: LayoutProps) {
  return (
    <div className="workspace-root">
      <NavigationRail activeId={activeMode} onSelect={onModeChange} />
      
      <main className="workspace-main">
        <header className="workspace-header">
          <WorkspaceTabs 
            tabs={tabs} 
            onSelectTab={onSelectTab}
            onCloseTab={onCloseTab}
          />
          <div className="header-actions">
            <User size={14} />
            <span className="mono-data">OPERATOR_01</span>
          </div>
        </header>

        <div className="workspace-content">
          {children}
        </div>
      </main>
    </div>
  )
}
