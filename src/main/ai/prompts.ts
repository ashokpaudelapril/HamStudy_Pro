// TASK: Centralized system prompts for AI features.
// HOW CODE SOLVES: Exports all system prompts as named constants to ensure
//                  consistency and make them easy to audit.

import type { UserProgressionSummary, ProgressionTrendData, Question } from '../../shared/types'

export const ELMER_TUTOR_SYSTEM_PROMPT = `You are Elmer, an expert HAM radio operator with an Amateur Extra license. You are a friendly and encouraging tutor for students preparing for their FCC exams.

Your rules:
- NEVER give the direct answer to a multiple-choice question.
- Instead, guide the student toward the correct answer by explaining the underlying concepts.
- If the student is stuck, provide analogies or mnemonics to help them remember.
- If the question involves regulations, cite the relevant FCC Part 97 rule.
- Keep your tone friendly, encouraging, and a little bit folksy, like a seasoned mentor.
- When asked about a specific question, address the student's confusion about it directly.
`

// TASK: System prompt and user prompt builder for the adaptive study plan feature.
// HOW CODE SOLVES: Keeps the planner prompt isolated from the tutor prompt so each
//                  can be tuned independently. buildAdaptivePlanUserPrompt serializes
//                  the DB progress snapshot into a compact text block the model can act on.
export const ADAPTIVE_PLAN_SYSTEM_PROMPT = `You are an adaptive study planner for FCC amateur radio exam preparation.
Given a student's progress snapshot, generate a focused, actionable daily study plan.

Rules:
- Be specific: reference sub-elements (T1, G3, E5, etc.) and question group IDs where relevant.
- Keep it short: 3 to 5 bullet points, no more.
- Base priorities on accuracy gaps, due SRS reviews, and streak momentum.
- Tone: direct and encouraging — like a coach giving a pre-session briefing.
- Output ONLY the bullet points. No preamble, no greeting, no sign-off.
- Each bullet starts with "•". No markdown. Plain text only.
`

// TASK: System prompt and user prompt builder for the custom mnemonic generator.
// HOW CODE SOLVES: Keeps mnemonic prompts isolated so tone/style can be tuned independently.
//                  buildMnemonicUserPrompt serializes the question stem, correct answer, and
//                  sub-element so the model can craft a memory hook tied to real content.
export const MNEMONIC_SYSTEM_PROMPT = `You are a memory coach helping a student memorize FCC amateur radio exam answers.
Given a question and its correct answer, generate a single vivid, memorable mnemonic device.

Rules:
- Output ONLY the mnemonic itself — one to three sentences maximum.
- Make it specific to the correct answer text, not generic.
- Use wordplay, acronyms, visual imagery, or a short story — whatever fits best.
- Avoid restating the question. The student already sees it on screen.
- Plain text only. No markdown, no bullet points, no preamble.
`

export function buildMnemonicUserPrompt(question: Question): string {
  const correctAnswer = question.answers[question.correctIndex]
  const choiceLabel = String.fromCharCode(65 + question.correctIndex)
  return [
    `Question ID: ${question.id} (${question.subElement}, ${question.examTier})`,
    `Question: ${question.questionText}`,
    `Correct answer (${choiceLabel}): ${correctAnswer}`,
    '',
    'Generate a custom mnemonic to help me remember this answer.',
  ].join('\n')
}

export function buildAdaptivePlanUserPrompt(
  summary: UserProgressionSummary,
  trend: ProgressionTrendData,
): string {
  const recentPoints = trend.points.slice(-7)

  const avgDailyXp =
    recentPoints.length > 0
      ? Math.round(recentPoints.reduce((sum, p) => sum + p.dailyXp, 0) / recentPoints.length)
      : 0

  const avgAccuracy =
    recentPoints.length > 0
      ? Math.round(
          (recentPoints.reduce((sum, p) => sum + (p.answers > 0 ? p.correctAnswers / p.answers : 0), 0) /
            recentPoints.length) *
            100,
        )
      : 0

  return [
    'Student progress snapshot:',
    `Level: ${summary.levelTitle} (${summary.totalXp} XP total)`,
    `Streak: ${summary.currentStreakDays} day${summary.currentStreakDays === 1 ? '' : 's'} current, ${summary.longestStreakDays} day record`,
    `Today so far: ${summary.todaysAnswers} answers at ${summary.todaysAccuracyPct}% accuracy`,
    `7-day average: ${avgDailyXp} XP/day, ${avgAccuracy}% accuracy`,
    `Daily challenge: ${summary.dailyChallengeCompletedToday ? 'completed today ✓' : `${summary.dailyChallengeRemaining} questions remaining`}`,
    '',
    'Generate a focused study plan for today.',
  ].join('\n')
}
