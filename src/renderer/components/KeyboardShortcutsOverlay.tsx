import type { ShortcutDescriptor } from '@shared/constants'

type KeyboardShortcutsOverlayProps = {
  title: string
  shortcuts: ShortcutDescriptor[]
  onClose: () => void
}

// TASK: Provide a compact reusable shortcut-help overlay for keyboard-first study flows.
// HOW CODE SOLVES: Renders a dismissible modal with key/action pairs that screens
//                  can toggle with the `?` shortcut or dedicated help triggers.
export function KeyboardShortcutsOverlay({ title, shortcuts, onClose }: KeyboardShortcutsOverlayProps) {
  return (
    <div className="shortcut-overlay" role="dialog" aria-modal="true" aria-label={`${title} keyboard shortcuts`}>
      <div className="shortcut-modal">
        <div className="shortcut-header">
          <h2>{title}</h2>
          <button type="button" className="ghost-btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="shortcut-list" role="list">
          {shortcuts.map((shortcut) => (
            <article key={`${shortcut.key}-${shortcut.action}`} className="shortcut-item" role="listitem">
              <kbd>{shortcut.key}</kbd>
              <p>{shortcut.action}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
