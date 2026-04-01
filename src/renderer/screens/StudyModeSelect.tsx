import { useEffect, useState } from 'react'
import { SHORTCUTS } from '@shared/constants'
import { KeyboardShortcutsOverlay } from '../components/KeyboardShortcutsOverlay'

type StudyMode =
  | 'dashboard'
  | 'analytics'
  | 'mastery-map'
  | 'achievements'
  | 'settings'
  | 'tutor-chat'
  | 'quiz'
  | 'flashcard'
  | 'speed'
  | 'weak-area'
  | 'custom'
  | 'browser'
  | 'exam'
  | 'reference'

type StudyModeSelectProps = {
  onSelectMode: (mode: StudyMode) => void
}

type ModeCardProps = {
  icon: string
  title: string
  description: string
  onClick: () => void
  featured?: boolean
  accented?: boolean
  animDelay?: number
}

// TASK: Render a single clickable mode card with icon, title, and description.
// HOW CODE SOLVES: Wraps a button with home-specific layout classes; featured and
//                  accented modifiers apply visual emphasis without extra state.
function ModeCard({ icon, title, description, onClick, featured, accented, animDelay }: ModeCardProps) {
  const cls = [
    'home-mode-card',
    featured ? 'home-mode-card--featured' : '',
    accented ? 'home-mode-card--accented' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      style={animDelay ? { animationDelay: `${animDelay}ms` } : undefined}
    >
      <span className="home-mode-icon" aria-hidden="true">{icon}</span>
      <span className="home-mode-body">
        <span className="home-mode-title">{title}</span>
        <span className="home-mode-desc">{description}</span>
      </span>
    </button>
  )
}

// TASK: Present the home screen — hero banner, grouped mode sections, keyboard shortcuts.
// HOW CODE SOLVES: Replaces flat mode-grid with four named sections (Practice / Simulate /
//                  Track / Tools) each with icon-annotated cards, giving clear visual hierarchy.
export function StudyModeSelect({ onSelectMode }: StudyModeSelectProps) {
  const [showShortcuts, setShowShortcuts] = useState(false)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const key = event.key.toLowerCase()

      if (key === '?' || (event.shiftKey && key === '/')) {
        event.preventDefault()
        setShowShortcuts((prev) => !prev)
        return
      }

      if (key === 'escape') {
        setShowShortcuts(false)
        return
      }

      if (showShortcuts) {
        return
      }

      // TASK: Support both plain-key and ⌘-key shortcuts for primary modes.
      // HOW CODE SOLVES: Checks metaKey (⌘ on Mac, Win on Windows) so ⌘1–⌘6
      //                  work even when an input element has focus.
      if (key === '1' || (event.metaKey && key === '1')) onSelectMode('dashboard')
      else if (key === '2' || (event.metaKey && key === '2')) onSelectMode('analytics')
      else if (key === '3' || (event.metaKey && key === '3')) onSelectMode('mastery-map')
      else if (key === '4' || (event.metaKey && key === '4')) onSelectMode('settings')
      else if (key === '5' || (event.metaKey && key === '5')) onSelectMode('quiz')
      else if (key === '6' || (event.metaKey && key === '6')) onSelectMode('flashcard')
      else if (key === 'c') onSelectMode('tutor-chat')
      else if (key === '7') onSelectMode('speed')
      else if (key === '8') onSelectMode('weak-area')
      else if (key === '9') onSelectMode('custom')
      else if (key === '0') onSelectMode('browser')
      else if (key === 'e') onSelectMode('exam')
      else if (key === 'r') onSelectMode('reference')
      else if (key === 'a') onSelectMode('achievements')
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onSelectMode, showShortcuts])

  return (
    <main className="app-shell home-shell">

      {/* ── Hero ──────────────────────────────────────── */}
      <section className="home-hero">
        <div className="home-hero-inner">
          <h1 className="home-hero-title">HamStudy Pro</h1>
          <p className="home-hero-sub">Master the FCC amateur radio exam. Train smart, not hard.</p>
          <div className="home-hero-pills">
            <span className="home-pill">1,440 questions</span>
            <span className="home-pill">Spaced repetition</span>
            <span className="home-pill">Offline — no subscription</span>
            <span className="home-pill">AI tutoring</span>
          </div>
          <p className="home-hero-hint">
            Press <kbd>?</kbd> for keyboard shortcuts
          </p>
        </div>
      </section>

      {/* ── Start Here ───────────────────────────────── */}
      <section className="home-section home-section--start">
        <div className="home-start-header">
          <div>
            <p className="home-section-label">Start Here</p>
            <h2 className="home-start-title">A simple study path when you are not sure where to begin</h2>
            <p className="home-start-copy">
              Learn the pool, fix your weak spots, then validate your readiness under timed conditions.
            </p>
          </div>
        </div>

        <div className="home-start-grid">
          <button type="button" className="home-start-card" onClick={() => onSelectMode('flashcard')}>
            <span className="home-start-step">1</span>
            <div className="home-start-body">
              <strong>Learn The Pool</strong>
              <p>Start in Flashcard Mode to build recognition and recall without time pressure.</p>
              <span className="home-start-cta">Open Flashcard Mode</span>
            </div>
          </button>

          <button type="button" className="home-start-card" onClick={() => onSelectMode('weak-area')}>
            <span className="home-start-step">2</span>
            <div className="home-start-body">
              <strong>Fix Weak Spots</strong>
              <p>Use Weak Area Drill once you have some history so the app can target what still trips you up.</p>
              <span className="home-start-cta">Open Weak Area Drill</span>
            </div>
          </button>

          <button type="button" className="home-start-card" onClick={() => onSelectMode('exam')}>
            <span className="home-start-step">3</span>
            <div className="home-start-body">
              <strong>Simulate Exam Day</strong>
              <p>Take a full exam when you want a realistic pass-fail check before the real test session.</p>
              <span className="home-start-cta">Open Full Exam Simulator</span>
            </div>
          </button>
        </div>
      </section>

      {/* ── Practice ──────────────────────────────────── */}
      <section className="home-section">
        <p className="home-section-label">Practice</p>
        <div className="home-mode-grid">
          <ModeCard
            icon="❓"
            title="Quiz Mode"
            description="Multiple-choice practice with instant correct/wrong feedback."
            onClick={() => onSelectMode('quiz')}
            animDelay={0}
          />
          <ModeCard
            icon="🃏"
            title="Flashcard Mode"
            description="Reveal-style recall with known / needs-review tracking."
            onClick={() => onSelectMode('flashcard')}
            animDelay={60}
          />
          <ModeCard
            icon="⚡"
            title="Speed Round"
            description="Timed sprint — auto-submits when the clock hits zero."
            onClick={() => onSelectMode('speed')}
            animDelay={120}
          />
          <ModeCard
            icon="🎯"
            title="Weak Area Drill"
            description="Questions ranked by your lowest-accuracy sub-elements — fix gaps fast."
            onClick={() => onSelectMode('weak-area')}
            accented
            animDelay={180}
          />
          <ModeCard
            icon="🔧"
            title="Custom Quiz"
            description="Pick tier, sub-elements, and question count for a focused session."
            onClick={() => onSelectMode('custom')}
            animDelay={240}
          />
        </div>
      </section>

      {/* ── Simulate ──────────────────────────────────── */}
      <section className="home-section">
        <p className="home-section-label">Simulate</p>
        <ModeCard
          icon="📋"
          title="Full Exam Simulator"
          description="35 or 50 questions, 26-minute countdown, pass/fail scorecard with per-sub-element breakdown. The closest thing to the real FCC exam session."
          onClick={() => onSelectMode('exam')}
          featured
          animDelay={0}
        />
      </section>

      {/* ── Track ─────────────────────────────────────── */}
      <section className="home-section">
        <p className="home-section-label">Track</p>
        <div className="home-mode-grid home-mode-grid--2col">
          <ModeCard
            icon="📊"
            title="Dashboard"
            description="Streak, exam readiness, SRS due-today counts, and AI study plan."
            onClick={() => onSelectMode('dashboard')}
            animDelay={0}
          />
          <ModeCard
            icon="📈"
            title="Analytics"
            description="Score-over-time chart and per-sub-element performance breakdown."
            onClick={() => onSelectMode('analytics')}
            animDelay={60}
          />
          <ModeCard
            icon="🗺️"
            title="Mastery Map"
            description="All 1,440 questions color-coded: unseen, learning, known, mastered."
            onClick={() => onSelectMode('mastery-map')}
            animDelay={120}
          />
          <ModeCard
            icon="🔍"
            title="Question Browser"
            description="Search, filter by tier and sub-element, and inspect any question in full detail."
            onClick={() => onSelectMode('browser')}
            animDelay={180}
          />
          <ModeCard
            icon="🏆"
            title="Achievements"
            description="Badge wall showing all locked and unlocked milestones — XP, streaks, perfect exams."
            onClick={() => onSelectMode('achievements')}
            animDelay={240}
          />
        </div>
      </section>

      {/* ── Tools ─────────────────────────────────────── */}
      <section className="home-section">
        <p className="home-section-label">Tools</p>
        <div className="home-mode-grid">
          <ModeCard
            icon="📚"
            title="Reference Sheets"
            description="Band plans, Ohm's Law, Q-codes, phonetics, Part 97 — all offline."
            onClick={() => onSelectMode('reference')}
            animDelay={0}
          />
          <ModeCard
            icon="🤖"
            title="Elmer AI Tutor"
            description="Live AI chat tutor — ask anything, get explanations, hints, and study advice."
            onClick={() => onSelectMode('tutor-chat')}
            animDelay={60}
          />
          <ModeCard
            icon="⚙️"
            title="Settings"
            description="Theme, text size, API keys, and data management."
            onClick={() => onSelectMode('settings')}
            animDelay={120}
          />
        </div>
      </section>

      {showShortcuts ? (
        <KeyboardShortcutsOverlay
          title="Mode Select Shortcuts"
          shortcuts={SHORTCUTS.modeSelect}
          onClose={() => setShowShortcuts(false)}
        />
      ) : null}
    </main>
  )
}
