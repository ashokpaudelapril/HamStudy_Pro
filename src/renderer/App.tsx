import { lazy, Suspense, useEffect, useState } from 'react'
import { ipcBridge } from '@shared/ipcBridge'
import type { Question, UserSettings } from '@shared/types'
import { StudyModeSelect } from './screens/StudyModeSelect'
import { Layout } from './components/Layout'
import type { Tab } from './components/WorkspaceTabs'

const AchievementsScreen = lazy(() =>
  import('./screens/Achievements').then((module) => ({ default: module.AchievementsScreen })),
)
const AnalyticsScreen = lazy(() =>
  import('./screens/AnalyticsScreen').then((module) => ({ default: module.AnalyticsScreen })),
)
const CustomQuizScreen = lazy(() =>
  import('./screens/CustomQuizScreen').then((module) => ({ default: module.CustomQuizScreen })),
)
const DashboardScreen = lazy(() =>
  import('./screens/Dashboard').then((module) => ({ default: module.DashboardScreen })),
)
const ExamSimulatorScreen = lazy(() =>
  import('./screens/ExamSimulatorScreen').then((module) => ({ default: module.ExamSimulatorScreen })),
)
const FlashcardScreen = lazy(() =>
  import('./screens/FlashcardScreen').then((module) => ({ default: module.FlashcardScreen })),
)
const MasteryMapScreen = lazy(() =>
  import('./screens/MasteryMapScreen').then((module) => ({ default: module.MasteryMapScreen })),
)
const QuestionBrowserScreen = lazy(() =>
  import('./screens/QuestionBrowserScreen').then((module) => ({ default: module.QuestionBrowserScreen })),
)
const QuestionScreen = lazy(() =>
  import('./screens/QuestionScreen').then((module) => ({ default: module.QuestionScreen })),
)
const ReferenceSheetsScreen = lazy(() =>
  import('./screens/ReferenceSheetsScreen').then((module) => ({ default: module.ReferenceSheetsScreen })),
)
const SettingsScreen = lazy(() =>
  import('./screens/SettingsScreen').then((module) => ({ default: module.SettingsScreen })),
)
const SpeedRoundScreen = lazy(() =>
  import('./screens/SpeedRoundScreen').then((module) => ({ default: module.SpeedRoundScreen })),
)
const TutorChatScreen = lazy(() =>
  import('./screens/TutorChat').then((module) => ({ default: module.TutorChatScreen })),
)
const WeakAreaScreen = lazy(() =>
  import('./screens/WeakAreaScreen').then((module) => ({ default: module.WeakAreaScreen })),
)

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

const MODE_LABELS: Record<StudyMode, string> = {
  select: 'HOME_LAUNCHER',
  dashboard: 'DASHBOARD_FEED',
  analytics: 'SYSTEM_ANALYTICS',
  'mastery-map': 'KNOWLEDGE_MAP',
  achievements: 'OPERATOR_BADGES',
  settings: 'SYS_CONFIG',
  'tutor-chat': 'ELMER_AI_LLM',
  quiz: 'PRACTICE_QUIZ',
  flashcard: 'FLASHCARDS',
  speed: 'SPEED_ROUND',
  'weak-area': 'DIAGNOSTIC_DRILL',
  custom: 'CUSTOM_WIZARD',
  browser: 'QUESTION_DB',
  exam: 'EXAM_SIMULATOR',
  reference: 'REF_DOCS'
}

type TutorChatContext = {
  questionId?: string
  questionLabel?: string
  initialMessage?: string
  sourceMode: Exclude<StudyMode, 'tutor-chat'>
}

function App() {
  const [activeTabId, setActiveTabId] = useState<StudyMode>('select')
  const [openTabs, setOpenTabs] = useState<StudyMode[]>(['select'])
  const [tutorChatContext, setTutorChatContext] = useState<TutorChatContext | null>(null)

  useEffect(() => {
    function resolveAndApplyTheme(theme: string): void {
      const resolved =
        theme === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : theme
      document.documentElement.setAttribute('data-theme', resolved)
    }

    let cleanupSystemListener: (() => void) | null = null

    void ipcBridge
      .getSettings()
      .then((settings: UserSettings) => {
        resolveAndApplyTheme(settings.theme)
        document.documentElement.setAttribute('data-visual-theme', settings.visualTheme)
        document.documentElement.setAttribute('data-text-size', settings.textSize)

        if (settings.theme === 'system') {
          const mq = window.matchMedia('(prefers-color-scheme: dark)')
          const handleChange = (): void => resolveAndApplyTheme('system')
          mq.addEventListener('change', handleChange)
          cleanupSystemListener = () => mq.removeEventListener('change', handleChange)
        }
      })
      .catch(() => {
        resolveAndApplyTheme('system')
        document.documentElement.setAttribute('data-visual-theme', 'ocean-chart')
        document.documentElement.setAttribute('data-text-size', 'medium')
      })

    return () => {
      cleanupSystemListener?.()
    }
  }, [])

  // Handle mode changes (from rail or launcher)
  const handleModeChange = (mode: StudyMode) => {
    if (!openTabs.includes(mode)) {
      setOpenTabs(prev => [...prev, mode])
    }
    setActiveTabId(mode)
  }

  const handleCloseTab = (id: string) => {
    const modeId = id as StudyMode
    if (openTabs.length <= 1) return
    
    const newTabs = openTabs.filter(t => t !== modeId)
    setOpenTabs(newTabs)
    
    if (activeTabId === modeId) {
      setActiveTabId(newTabs[newTabs.length - 1])
    }
  }

  function openTutorChatFrom(
    sourceMode: Exclude<StudyMode, 'tutor-chat'>,
    question?: Question,
    initialMessage?: string,
  ): void {
    setTutorChatContext({
      sourceMode,
      questionId: question?.id,
      questionLabel: question ? `${question.id} • ${question.subElement}` : undefined,
      initialMessage,
    })
    handleModeChange('tutor-chat')
  }

  function handleBackFromTutorChat(): void {
    handleModeChange(tutorChatContext?.sourceMode ?? 'select')
  }

  const alternateExplanationPrompt =
    'Please explain this question in a different way, using a simpler explanation or a new analogy, without giving away the answer directly.'

  const loadingFallback = null

  const tabs: Tab[] = openTabs.map(id => ({
    id,
    label: MODE_LABELS[id],
    active: activeTabId === id
  }))

  const renderActiveScreen = (mode: StudyMode) => {
    if (mode === 'select') return <StudyModeSelect onSelectMode={handleModeChange} />
    if (mode === 'quiz') return (
      <QuestionScreen
        onBackToModes={() => handleModeChange('select')}
        onAskAboutQuestion={(question) => openTutorChatFrom('quiz', question)}
        onExplainDifferently={(question) => openTutorChatFrom('quiz', question, alternateExplanationPrompt)}
      />
    )
    if (mode === 'dashboard') return <DashboardScreen onBackToModes={() => handleModeChange('select')} onStartDailyChallenge={() => handleModeChange('weak-area')} />
    if (mode === 'analytics') return <AnalyticsScreen onBackToModes={() => handleModeChange('select')} />
    if (mode === 'mastery-map') return <MasteryMapScreen onBackToModes={() => handleModeChange('select')} onOpenQuestionBrowser={() => handleModeChange('browser')} />
    if (mode === 'settings') return <SettingsScreen onBackToModes={() => handleModeChange('select')} />
    if (mode === 'tutor-chat') return <TutorChatScreen onBackToModes={handleBackFromTutorChat} chatContext={tutorChatContext} />
    if (mode === 'flashcard') return (
      <FlashcardScreen
        onBackToModes={() => handleModeChange('select')}
        onAskAboutQuestion={(question) => openTutorChatFrom('flashcard', question)}
        onExplainDifferently={(question) => openTutorChatFrom('flashcard', question, alternateExplanationPrompt)}
      />
    )
    if (mode === 'speed') return (
      <SpeedRoundScreen
        onBackToModes={() => handleModeChange('select')}
        onAskAboutQuestion={(question) => openTutorChatFrom('speed', question)}
        onExplainDifferently={(question) => openTutorChatFrom('speed', question, alternateExplanationPrompt)}
      />
    )
    if (mode === 'weak-area') return (
      <WeakAreaScreen
        onBackToModes={() => handleModeChange('select')}
        onAskAboutQuestion={(question) => openTutorChatFrom('weak-area', question)}
        onExplainDifferently={(question) => openTutorChatFrom('weak-area', question, alternateExplanationPrompt)}
      />
    )
    if (mode === 'custom') return (
      <CustomQuizScreen
        onBackToModes={() => handleModeChange('select')}
        onAskAboutQuestion={(question) => openTutorChatFrom('custom', question)}
        onExplainDifferently={(question) => openTutorChatFrom('custom', question, alternateExplanationPrompt)}
      />
    )
    if (mode === 'browser') return (
      <QuestionBrowserScreen
        onBackToModes={() => handleModeChange('select')}
        onAskAboutQuestion={(question) => openTutorChatFrom('browser', question)}
        onExplainDifferently={(question) => openTutorChatFrom('browser', question, alternateExplanationPrompt)}
      />
    )
    if (mode === 'exam') return (
      <ExamSimulatorScreen
        onBackToModes={() => handleModeChange('select')}
        onAskAboutQuestion={(question) => openTutorChatFrom('exam', question)}
        onExplainDifferently={(question) => openTutorChatFrom('exam', question, alternateExplanationPrompt)}
      />
    )
    if (mode === 'reference') return <ReferenceSheetsScreen onBackToModes={() => handleModeChange('select')} />
    if (mode === 'achievements') return <AchievementsScreen onBackToModes={() => handleModeChange('select')} />
    return null
  }

  return (
    <Suspense fallback={loadingFallback}>
      <Layout 
        activeMode={activeTabId} 
        onModeChange={handleModeChange}
        tabs={tabs}
        onSelectTab={(id) => setActiveTabId(id as StudyMode)}
        onCloseTab={handleCloseTab}
      >
        <div key={activeTabId} className="workspace-pane-wrapper">
          {renderActiveScreen(activeTabId)}
        </div>
      </Layout>
    </Suspense>
  )
}

export default App
