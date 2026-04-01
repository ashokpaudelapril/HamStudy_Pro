#!/usr/bin/env node
/**
 * generate-hints-local.mjs
 *
 * Builds deterministic first-pass hints for the offline FCC ham radio pools
 * without requiring any external API access.
 *
 * Usage:
 *   node scripts/generate-hints-local.mjs
 *   TIER=technician node scripts/generate-hints-local.mjs
 *   OVERWRITE=1 node scripts/generate-hints-local.mjs
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA = join(ROOT, 'data')
const HINTS = join(DATA, 'hints')

const OVERWRITE = process.env.OVERWRITE === '1'
const TIER_FILTER = process.env.TIER ?? null
const TIERS = ['technician', 'general', 'extra']

function normalize(text) {
  return text.replace(/\s+/g, ' ').trim()
}

function titleWords(text, count = 4) {
  return normalize(text)
    .replace(/[^A-Za-z0-9\s/-]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, count)
}

function firstMeaningfulWord(words) {
  return words.find((word) => word.length > 2) ?? words[0] ?? 'radio'
}

function acronym(words) {
  const letters = words
    .filter((word) => /[A-Za-z]/.test(word))
    .slice(0, 4)
    .map((word) => word[0].toUpperCase())
    .join('')
  return letters || 'HAM'
}

function uniqueKeywords(text) {
  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'are', 'was', 'from', 'which',
    'what', 'when', 'where', 'into', 'than', 'then', 'your', 'their', 'have',
    'will', 'would', 'should', 'could', 'about', 'there', 'these', 'those',
    'under', 'part', 'most', 'more', 'less', 'used', 'using', 'legal', 'radio',
    'service', 'amateur', 'following', 'choice', 'choices', 'correct'
  ])

  return Array.from(
    new Set(
      normalize(text)
        .toLowerCase()
        .replace(/[^a-z0-9\s/-]/g, ' ')
        .split(' ')
        .filter((token) => token.length > 2 && !stopWords.has(token))
    )
  )
}

function buildHint(question, correctAnswer) {
  const refsLead = question.refs ? `Use ${question.refs} and ` : ''
  const keywords = titleWords(correctAnswer, 3).join(' ')
  return normalize(`${refsLead}look for the answer that most directly matches the tested rule or concept: ${keywords}.`)
}

function buildExplanation(question, correctAnswer) {
  const refsTail = question.refs ? ` under ${question.refs}` : ''
  return normalize(`The correct answer is "${correctAnswer}" because it best matches the rule, definition, or operating principle being tested in ${question.id}${refsTail}. This is the pool answer that directly satisfies the question asked.`)
}

function buildMnemonic(question, correctAnswer) {
  const words = titleWords(correctAnswer, 4)
  const anchor = firstMeaningfulWord(words)
  const shortAcronym = acronym(words)
  return normalize(`${shortAcronym}: picture a radio label flashing "${anchor}" so that answer stands out first.`)
}

function buildWhyWrong(question, correctAnswer, answer, index, correctIndex) {
  if (index === correctIndex) return ''

  const answerKeywords = uniqueKeywords(answer)
  const correctKeywords = uniqueKeywords(correctAnswer)
  const uniqueWrong = answerKeywords.filter((word) => !correctKeywords.includes(word)).slice(0, 2)
  const uniqueRight = correctKeywords.filter((word) => !answerKeywords.includes(word)).slice(0, 2)

  const wrongFragment = uniqueWrong.length > 0 ? `It points to ${uniqueWrong.join(' and ')} instead.` : 'It does not match the tested concept.'
  const rightFragment = uniqueRight.length > 0 ? `The pool answer focuses on ${uniqueRight.join(' and ')}.` : `The pool answer is "${correctAnswer}".`

  return normalize(`${wrongFragment} ${rightFragment}`)
}

function shouldGenerate(existing) {
  if (OVERWRITE) return true
  if (!existing) return true
  const wrong = Array.isArray(existing.why_wrong) ? existing.why_wrong : []
  return !(existing.hint && existing.explanation && existing.mnemonic && wrong.length === 4 && wrong.some(Boolean))
}

async function saveHints(filePath, hints) {
  const sorted = Object.fromEntries(Object.entries(hints).sort(([a], [b]) => a.localeCompare(b)))
  await writeFile(filePath, JSON.stringify(sorted, null, 2) + '\n', 'utf8')
}

async function processTier(tier) {
  const questionsPath = join(DATA, `${tier}.json`)
  const hintsPath = join(HINTS, `${tier}.json`)

  const questions = JSON.parse(await readFile(questionsPath, 'utf8'))
  const hints = JSON.parse(await readFile(hintsPath, 'utf8'))

  let generated = 0

  for (const question of questions) {
    if (!shouldGenerate(hints[question.id])) continue

    const correctAnswer = question.answers[question.correct]

    hints[question.id] = {
      hint: buildHint(question, correctAnswer),
      explanation: buildExplanation(question, correctAnswer),
      mnemonic: buildMnemonic(question, correctAnswer),
      why_wrong: question.answers.map((answer, index) => buildWhyWrong(question, correctAnswer, answer, index, question.correct))
    }

    generated += 1
  }

  await saveHints(hintsPath, hints)
  console.log(`[${tier}] generated ${generated} hint records`)
}

const tiers = TIER_FILTER ? [TIER_FILTER] : TIERS
console.log('HamStudy Pro — local hint generator')
console.log(`Tiers: ${tiers.join(', ')} | Overwrite: ${OVERWRITE}`)

for (const tier of tiers) {
  await processTier(tier)
}
