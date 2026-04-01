import type { ExamTier } from './types'

export const EXAM_TIERS: Array<{ id: ExamTier; label: string; count: number }> = [
  { id: 'technician', label: 'Technician (Element 2)', count: 411 },
  { id: 'general', label: 'General (Element 3)', count: 427 },
  { id: 'extra', label: 'Amateur Extra (Element 4)', count: 602 },
]

export const EXAM_QUESTION_COUNTS: Record<ExamTier, number> = {
  technician: 35,
  general: 35,
  extra: 50,
}

export const SRS_DEFAULTS = {
  interval: 1,
  easeFactor: 2.5,
  repetitions: 0,
} as const

export const XP_THRESHOLDS = [0, 500, 1200, 2200, 3500, 5000]

export const XP_LEVEL_TITLES = ['Novice', 'Technician', 'General', 'Advanced', 'Extra', 'Elmer'] as const

export type ShortcutDescriptor = {
  key: string
  action: string
}

export type BadgeDefinition = {
  id: string
  title: string
  description: string
  icon: string
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  { id: 'first-correct', title: 'First Step', description: 'Get your first correct answer.', icon: '⭐' },
  { id: 'century-club', title: 'Century Club', description: 'Answer 100 questions correctly.', icon: '🎯' },
  { id: 'quiz-master', title: 'Quiz Master', description: 'Answer 500 questions correctly.', icon: '🏆' },
  { id: 'week-warrior', title: 'Week Warrior', description: 'Maintain a 7-day study streak.', icon: '🔥' },
  { id: 'fortnight-faithful', title: 'Fortnight Faithful', description: 'Maintain a 14-day study streak.', icon: '⚡' },
  { id: 'monthly-master', title: 'Monthly Master', description: 'Maintain a 30-day study streak.', icon: '🌟' },
  { id: 'perfect-exam', title: 'Perfect Score', description: 'Score 100% on a full exam simulation.', icon: '💯' },
  { id: 'xp-pioneer', title: 'XP Pioneer', description: 'Reach 1,000 total XP.', icon: '🚀' },
  { id: 'challenge-champion', title: 'Challenge Champion', description: 'Complete your first daily challenge.', icon: '🎖️' },
]

export const SHORTCUTS = {
  modeSelect: [
    { key: '1 or ⌘1', action: 'Open Dashboard' },
    { key: '2 or ⌘2', action: 'Open Analytics' },
    { key: '3 or ⌘3', action: 'Open Mastery Map' },
    { key: '4 or ⌘4', action: 'Open Settings' },
    { key: '5 or ⌘5', action: 'Open Quiz Mode' },
    { key: '6 or ⌘6', action: 'Open Flashcard Mode' },
    { key: '7', action: 'Open Speed Round' },
    { key: '8', action: 'Open Weak Area Drill' },
    { key: '9', action: 'Open Custom Quiz' },
    { key: '0', action: 'Open Question Browser' },
    { key: 'E', action: 'Open Full Exam Simulator' },
    { key: 'R', action: 'Open Reference Sheets' },
    { key: 'A', action: 'Open Achievements' },
    { key: 'C', action: 'Open Tutor Chat' },
    { key: '?', action: 'Toggle shortcut help' },
  ] as ShortcutDescriptor[],
  quiz: [
    { key: 'A / B / C / D', action: 'Select answer choice' },
    { key: 'Enter', action: 'Submit answer' },
    { key: 'Cmd/Ctrl + R', action: 'Read question aloud' },
    { key: 'N', action: 'Next question' },
    { key: 'Esc', action: 'Back to mode select' },
    { key: '?', action: 'Toggle shortcut help' },
  ] as ShortcutDescriptor[],
  flashcard: [
    { key: 'Cmd/Ctrl + R', action: 'Read card aloud' },
    { key: 'Space / Enter', action: 'Reveal answer' },
    { key: 'N', action: 'Next card' },
    { key: 'Esc', action: 'Back to mode select' },
    { key: '?', action: 'Toggle shortcut help' },
  ] as ShortcutDescriptor[],
  exam: [
    { key: 'A / B / C / D', action: 'Select answer choice' },
    { key: 'Cmd/Ctrl + R', action: 'Read question aloud' },
    { key: 'N', action: 'Next question' },
    { key: 'P', action: 'Previous question' },
    { key: 'F', action: 'Flag question' },
    { key: 'Esc', action: 'Back to mode select' },
    { key: '?', action: 'Toggle shortcut help' },
  ] as ShortcutDescriptor[],
} as const
