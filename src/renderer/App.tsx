import { useEffect, useState } from 'react'
import { ipcBridge } from '@shared/ipcBridge'
import type { Question, UserSettings } from '@shared/types'
import { AchievementsScreen } from './screens/Achievements'
import { AnalyticsScreen } from './screens/AnalyticsScreen'
import { CustomQuizScreen } from './screens/CustomQuizScreen'
import { DashboardScreen } from './screens/Dashboard'
import { ExamSimulatorScreen } from './screens/ExamSimulatorScreen'
import { FlashcardScreen } from './screens/FlashcardScreen'
import { MasteryMapScreen } from './screens/MasteryMapScreen'
import { QuestionBrowserScreen } from './screens/QuestionBrowserScreen'
import { QuestionScreen } from './screens/QuestionScreen'
import { ReferenceSheetsScreen } from './screens/ReferenceSheetsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { SpeedRoundScreen } from './screens/SpeedRoundScreen'
import { StudyModeSelect } from './screens/StudyModeSelect'
import { TutorChatScreen } from './screens/TutorChat'
import { WeakAreaScreen } from './screens/WeakAreaScreen'

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

  if (mode === 'select') {
    return <StudyModeSelect onSelectMode={setMode} />
  }

  if (mode === 'quiz') {
    return (
      <QuestionScreen
        onBackToModes={() => setMode('select')}
        onAskAboutQuestion={(question) => openTutorChatFrom('quiz', question)}
        onExplainDifferently={(question) =>
          openTutorChatFrom('quiz', question, alternateExplanationPrompt)
        }
      />
    )
  }

  if (mode === 'dashboard') {
    return <DashboardScreen onBackToModes={() => setMode('select')} onStartDailyChallenge={() => setMode('weak-area')} />
  }

  if (mode === 'analytics') {
    return <AnalyticsScreen onBackToModes={() => setMode('select')} />
  }

  if (mode === 'mastery-map') {
    return <MasteryMapScreen onBackToModes={() => setMode('select')} onOpenQuestionBrowser={() => setMode('browser')} />
  }

  if (mode === 'settings') {
    return <SettingsScreen onBackToModes={() => setMode('select')} />
  }

  if (mode === 'tutor-chat') {
    return <TutorChatScreen onBackToModes={handleBackFromTutorChat} chatContext={tutorChatContext} />
  }

  if (mode === 'flashcard') {
    return (
      <FlashcardScreen
        onBackToModes={() => setMode('select')}
        onAskAboutQuestion={(question) => openTutorChatFrom('flashcard', question)}
        onExplainDifferently={(question) =>
          openTutorChatFrom('flashcard', question, alternateExplanationPrompt)
        }
      />
    )
  }

  if (mode === 'speed') {
    return (
      <SpeedRoundScreen
        onBackToModes={() => setMode('select')}
        onAskAboutQuestion={(question) => openTutorChatFrom('speed', question)}
        onExplainDifferently={(question) =>
          openTutorChatFrom('speed', question, alternateExplanationPrompt)
        }
      />
    )
  }

  if (mode === 'weak-area') {
    return (
      <WeakAreaScreen
        onBackToModes={() => setMode('select')}
        onAskAboutQuestion={(question) => openTutorChatFrom('weak-area', question)}
        onExplainDifferently={(question) =>
          openTutorChatFrom('weak-area', question, alternateExplanationPrompt)
        }
      />
    )
  }

  if (mode === 'custom') {
    return (
      <CustomQuizScreen
        onBackToModes={() => setMode('select')}
        onAskAboutQuestion={(question) => openTutorChatFrom('custom', question)}
        onExplainDifferently={(question) =>
          openTutorChatFrom('custom', question, alternateExplanationPrompt)
        }
      />
    )
  }

  if (mode === 'browser') {
    return (
      <QuestionBrowserScreen
        onBackToModes={() => setMode('select')}
        onAskAboutQuestion={(question) => openTutorChatFrom('browser', question)}
        onExplainDifferently={(question) =>
          openTutorChatFrom('browser', question, alternateExplanationPrompt)
        }
      />
    )
  }

  if (mode === 'exam') {
    return (
      <ExamSimulatorScreen
        onBackToModes={() => setMode('select')}
        onAskAboutQuestion={(question) => openTutorChatFrom('exam', question)}
        onExplainDifferently={(question) =>
          openTutorChatFrom('exam', question, alternateExplanationPrompt)
        }
      />
    )
  }

  if (mode === 'reference') {
    return <ReferenceSheetsScreen onBackToModes={() => setMode('select')} />
  }

  if (mode === 'achievements') {
    return <AchievementsScreen onBackToModes={() => setMode('select')} />
  }

  return null
}

export default App
