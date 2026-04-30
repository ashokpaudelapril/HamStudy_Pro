import React from 'react'

const NavIcon = ({ path }: { path: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d={path} />
  </svg>
)

const NAV_ITEMS = [
  { id: 'select', label: 'HOME', icon: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" },
  { id: 'dashboard', label: 'OPER', icon: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2zm0-4H7V7h10v2zm0 8H7v-2h10v2z" },
  { id: 'quiz', label: 'PRAC', icon: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2zm0-4H7V7h10v2zm0 8H7v-2h10v2z" },
  { id: 'flashcard', label: 'CARD', icon: "M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 16H6V4h12v14zM8 7h8v2H8V7zm0 4h8v2H8v-2zm0 4h5v2H8v-2z" },
  { id: 'analytics', label: 'ANLY', icon: "M10 20h4V4h-4v16zm-6 0h4v-8H4v8zM16 9v11h4V9h-4z" },
  { id: 'mastery-map', label: 'MAP', icon: "M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z" },
  { id: 'tutor-chat', label: 'ELMR', icon: "M12 2c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm9 7h-6v13h-2v-6h-2v6H9V9H3V7h18v2z" },
]

type NavigationRailProps = {
  activeId: string
  onSelect: (id: string) => void
}

export const NavigationRail: React.FC<NavigationRailProps> = ({ activeId, onSelect }) => {
  return (
    <nav className="navigation-rail technical-rail">
      <div className="rail-top">
        <div className="rail-logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        </div>
      </div>
      
      <div className="rail-items">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`rail-item ${activeId === item.id ? 'active' : ''}`}
            onClick={() => onSelect(item.id)}
            title={item.label}
          >
            <div className="rail-icon-wrapper">
              <NavIcon path={item.icon} />
            </div>
            <span className="rail-label mono-data">{item.label}</span>
          </button>
        ))}
      </div>
      
      <div className="rail-bottom">
        <button className={`rail-item ${activeId === 'settings' ? 'active' : ''}`} onClick={() => onSelect('settings')} title="SETTINGS">
           <div className="rail-icon-wrapper">
             <NavIcon path="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65z" />
           </div>
        </button>
      </div>
    </nav>
  )
}
