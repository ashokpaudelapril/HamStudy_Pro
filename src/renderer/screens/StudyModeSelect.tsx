import React from 'react'
import { BookOpen, Award, Zap, BarChart2, Map, MessageSquare, Shield, FileText, Settings, Search } from 'lucide-react'

type StudyMode =
  | 'select'
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

type ModeDef = {
  id: StudyMode
  label: string
  desc: string
  shortDesc: string
  icon: React.ReactNode
  accent?: 'primary' | 'warn' | 'info' | 'good'
}

type ModeGroup = {
  title: string
  modes: ModeDef[]
}

const GROUPS: ModeGroup[] = [
  {
    title: 'OPERATIONAL_MODES',
    modes: [
      { id: 'quiz', label: 'PRACTICE_QUIZ', desc: 'Standard question drill with immediate feedback.', shortDesc: 'Fast drill with instant feedback.', icon: <BookOpen size={18} />, accent: 'primary' },
      { id: 'flashcard', label: 'FLASHCARD_DRIVE', desc: 'Active recall training with adaptive repetition.', shortDesc: 'Recall mode with spaced review.', icon: <Zap size={18} />, accent: 'warn' },
      { id: 'exam', label: 'EXAM_SIMULATOR', desc: 'Full-timed simulator under FCC regulations.', shortDesc: 'Timed mock exam conditions.', icon: <Shield size={18} />, accent: 'good' },
    ]
  },
  {
    title: 'DIAGNOSTIC_TOOLS',
    modes: [
      { id: 'weak-area', label: 'WEAK_DOMAIN_DRILL', desc: 'Targeted focus on identified performance gaps.', shortDesc: 'Hit your weakest subelements first.', icon: <BarChart2 size={18} />, accent: 'info' },
      { id: 'speed', label: 'SPEED_ROUND_TX', desc: 'Rapid-fire response time training.', shortDesc: 'Short rounds built for pace.', icon: <Zap size={18} />, accent: 'warn' },
      { id: 'custom', label: 'CUSTOM_WIZARD', desc: 'Configure custom session parameters.', shortDesc: 'Build a filtered study run.', icon: <Settings size={18} /> },
    ]
  },
  {
    title: 'KNOWLEDGE_BASE',
    modes: [
      { id: 'browser', label: 'QUESTION_DB_EXPLORER', desc: 'Browse and search the complete question pool.', shortDesc: 'Search the full FCC pool.', icon: <Search size={18} /> },
      { id: 'mastery-map', label: 'MASTER_SYLLABUS_MAP', desc: 'Visual representation of syllabus coverage.', shortDesc: 'See topic coverage at a glance.', icon: <Map size={18} /> },
      { id: 'reference', label: 'REF_EXTRACTS', desc: 'Charts, formulas, and technical supplements.', shortDesc: 'Quick charts and formulas.', icon: <FileText size={18} /> },
    ]
  },
  {
    title: 'SYSTEM_INTERFACE',
    modes: [
      { id: 'analytics', label: 'ANALYTICS_OVERVIEW', desc: 'Detailed performance metrics and trends.', shortDesc: 'Track readiness and trends.', icon: <BarChart2 size={18} /> },
      { id: 'achievements', label: 'OPERATOR_LOG', desc: 'Earned certifications and milestone records.', shortDesc: 'Badges, streaks, milestones.', icon: <Award size={18} /> },
      { id: 'tutor-chat', label: 'ELMER_AI_INTERFACE', desc: 'Generative AI assistance for complex topics.', shortDesc: 'Ask for hints and simpler explanations.', icon: <MessageSquare size={18} />, accent: 'info' },
    ]
  }
]

export function StudyModeSelect({ onSelectMode }: StudyModeSelectProps) {
  return (
    <div className="launcher-console">
      <section className="launcher-hero">
        <div className="launcher-hero-copy">
          <p className="launcher-kicker mono-data">HAMSTUDY PRO // GOOGLE SIGNAL THEME</p>
          <h1 className="launcher-title">Pick a workspace and start studying.</h1>
          <p className="launcher-summary">Everything here is built to stay compact, fast, and readable.</p>
        </div>

        <div className="launcher-hero-panel launcher-hero-panel-compact">
          <div className="launcher-hero-metric">
            <span className="launcher-hero-label mono-data">WORKSPACES</span>
            <strong>12</strong>
          </div>
          <div className="launcher-hero-metric">
            <span className="launcher-hero-label mono-data">FOCUS MODES</span>
            <strong>Quiz, Flashcards, Exam</strong>
          </div>
          <div className="launcher-hero-metric">
            <span className="launcher-hero-label mono-data">LAYOUT</span>
            <strong>Command Center</strong>
          </div>
        </div>
      </section>

      <div className="launcher-header">
        <h2 className="mono-data">AVAILABLE_WORKSPACES // SELECT_TO_INITIALIZE</h2>
      </div>

      <div className="launcher-grid-layout">
        {GROUPS.map((group) => (
          <section key={group.title} className="launcher-group">
            <h3 className="launcher-group-title mono-data">{group.title}</h3>
            <div className="launcher-mode-list">
              {group.modes.map((mode) => (
                <button
                  key={mode.id}
                  className={`launcher-mode-item ${mode.accent ? `accent-${mode.accent}` : ''}`}
                  onClick={() => onSelectMode(mode.id)}
                >
                  <div className="mode-icon-box">{mode.icon}</div>
                  <div className="mode-text-box">
                    <span className="mode-label mono-data">{mode.label}</span>
                    <p className="mode-desc">{mode.shortDesc}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
