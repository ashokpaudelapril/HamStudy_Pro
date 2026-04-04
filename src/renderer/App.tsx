import { lazy, Suspense, useEffect, useState } from 'react'
import { ipcBridge } from '@shared/ipcBridge'
import type { Question, UserSettings } from '@shared/types'
import { StudyModeSelect } from './screens/StudyModeSelect'

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

type TutorChatContext = {
  questionId?: string
  questionLabel?: string
  initialMessage?: string
  sourceMode: Exclude<StudyMode, 'tutor-chat'>
}

function App() {
  const [mode, setMode] = useState<StudyMode>('select')
  const [tutorChatContext, setTutorChatContext] = useState<TutorChatContext | null>(null)

  useEffect(() => {
    // TASK: Apply persisted visual settings globally at app startup, with system theme detection.
    // HOW CODE SOLVES: Resolves 'system' theme to 'dark'/'light' via matchMedia so the correct
    //                  CSS variable block activates. Attaches a listener so OS-level dark-mode
    //                  toggles are reflected in real-time while theme is set to 'system'.
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

  useEffect(() => {
    // TASK: Start every mode at the top of the screen instead of preserving the
    //       previous screen's scroll position.
    // HOW CODE SOLVES: Resets both window and document scroll containers whenever
    //                  the active top-level mode changes in this single-page renderer.
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [mode])

  // TASK: Open Tutor Chat with optional active-question context from another screen.
  // HOW CODE SOLVES: Stores the source mode plus selected FCC question metadata
  //                  so Tutor Chat can inject `questionId` into IPC requests and route back cleanly.
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
    setMode('tutor-chat')
  }

  // TASK: Route back out of Tutor Chat to the originating screen when possible.
  // HOW CODE SOLVES: Falls back to mode select only when chat was opened without a tracked source mode.
  function handleBackFromTutorChat(): void {
    setMode(tutorChatContext?.sourceMode ?? 'select')
  }

  // TASK: Route between mode selection and active study screens.
  // HOW CODE SOLVES: Holds top-level mode state and maps each mode to its screen.
  const alternateExplanationPrompt =
    'Please explain this question in a different way, using a simpler explanation or a new analogy, without giving away the answer directly.'

  // ISSUE: Mode changes showed a temporary "Loading the requested study screen..." panel
  //        while lazy-loaded screens resolved, which felt like an extra transition window.
  // FIX APPLIED: Use a non-visual Suspense fallback so mode switches stay direct and
  //              don't flash intermediate loading text between screens.
  const loadingFallback = null

  return (
    <Suspense fallback={loadingFallback}>
      {mode === 'select' ? (
        <StudyModeSelect onSelectMode={setMode} />
      ) : mode === 'quiz' ? (
        <QuestionScreen
          onBackToModes={() => setMode('select')}
          onAskAboutQuestion={(question) => openTutorChatFrom('quiz', question)}
          onExplainDifferently={(question) =>
            openTutorChatFrom('quiz', question, alternateExplanationPrompt)
          }
        />
      ) : mode === 'dashboard' ? (
        <DashboardScreen onBackToModes={() => setMode('select')} onStartDailyChallenge={() => setMode('weak-area')} />
      ) : mode === 'analytics' ? (
        <AnalyticsScreen onBackToModes={() => setMode('select')} />
      ) : mode === 'mastery-map' ? (
        <MasteryMapScreen onBackToModes={() => setMode('select')} onOpenQuestionBrowser={() => setMode('browser')} />
      ) : mode === 'settings' ? (
        <SettingsScreen onBackToModes={() => setMode('select')} />
      ) : mode === 'tutor-chat' ? (
        <TutorChatScreen onBackToModes={handleBackFromTutorChat} chatContext={tutorChatContext} />
      ) : mode === 'flashcard' ? (
        <FlashcardScreen
          onBackToModes={() => setMode('select')}
          onAskAboutQuestion={(question) => openTutorChatFrom('flashcard', question)}
          onExplainDifferently={(question) =>
            openTutorChatFrom('flashcard', question, alternateExplanationPrompt)
          }
        />
      ) : mode === 'speed' ? (
        <SpeedRoundScreen
          onBackToModes={() => setMode('select')}
          onAskAboutQuestion={(question) => openTutorChatFrom('speed', question)}
          onExplainDifferently={(question) =>
            openTutorChatFrom('speed', question, alternateExplanationPrompt)
          }
        />
      ) : mode === 'weak-area' ? (
        <WeakAreaScreen
          onBackToModes={() => setMode('select')}
          onAskAboutQuestion={(question) => openTutorChatFrom('weak-area', question)}
          onExplainDifferently={(question) =>
            openTutorChatFrom('weak-area', question, alternateExplanationPrompt)
          }
        />
      ) : mode === 'custom' ? (
        <CustomQuizScreen
          onBackToModes={() => setMode('select')}
          onAskAboutQuestion={(question) => openTutorChatFrom('custom', question)}
          onExplainDifferently={(question) =>
            openTutorChatFrom('custom', question, alternateExplanationPrompt)
          }
        />
      ) : mode === 'browser' ? (
        <QuestionBrowserScreen
          onBackToModes={() => setMode('select')}
          onAskAboutQuestion={(question) => openTutorChatFrom('browser', question)}
          onExplainDifferently={(question) =>
            openTutorChatFrom('browser', question, alternateExplanationPrompt)
          }
        />
      ) : mode === 'exam' ? (
        <ExamSimulatorScreen
          onBackToModes={() => setMode('select')}
          onAskAboutQuestion={(question) => openTutorChatFrom('exam', question)}
          onExplainDifferently={(question) =>
            openTutorChatFrom('exam', question, alternateExplanationPrompt)
          }
        />
      ) : mode === 'reference' ? (
        <ReferenceSheetsScreen onBackToModes={() => setMode('select')} />
      ) : mode === 'achievements' ? (
        <AchievementsScreen onBackToModes={() => setMode('select')} />
      ) : null}
    </Suspense>
  )
}

export default App
