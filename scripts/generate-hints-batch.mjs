#!/usr/bin/env node
/**
 * generate-hints-batch.mjs
 *
 * Generates hints for a specific range of questions manually.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/generate-hints-batch.mjs <tier> <start> <count>
 *   Example: node scripts/generate-hints-batch.mjs technician 0 10
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA = join(ROOT, 'data')
const HINTS = join(DATA, 'hints')

const API_KEY = process.env.ANTHROPIC_API_KEY
if (!API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY is not set.')
  process.exit(1)
}

const [tier = 'technician', startIdx = '0', count = '10'] = process.argv.slice(2)
const START = parseInt(startIdx, 10)
const COUNT = parseInt(count, 10)

const SYSTEM_PROMPT = `You are generating study aids for FCC amateur radio exam questions.

For each question you receive, output ONLY a JSON object with exactly these four fields:
  "hint"        — One sentence that nudges the student toward the right answer without revealing it.
  "explanation" — 2–4 sentences explaining why the CORRECT answer is right.
                  Cite the FCC Part 97 rule number if directly relevant.
  "mnemonic"    — One vivid memory device (acronym, rhyme, imagery, or short story) tied
                  specifically to the correct answer. Make it stick.
  "why_wrong"   — A JSON array of exactly 4 strings, one per answer choice (A=index 0, B=1, C=2, D=3).
                  For the CORRECT answer index, use an empty string "".
                  For each WRONG answer index, write 1–2 sentences explaining specifically why
                  that choice is incorrect.

Rules:
- Output ONLY the raw JSON object. No markdown fences, no preamble, no trailing text.
- All fields must be present. hint, explanation, mnemonic must be non-empty strings.
- why_wrong must be an array of exactly 4 strings; correct-answer slot must be "".`

function buildUserPrompt(q) {
  const letters = ['A', 'B', 'C', 'D']
  const answerLines = q.answers.map((a, i) => `  ${letters[i]}: ${a}`).join('\n')
  const correct = `${letters[q.correct]}: ${q.answers[q.correct]}`
  return [
    `Question ID: ${q.id}  Refs: ${q.refs}`,
    `Question: ${q.question}`,
    `Answers:\n${answerLines}`,
    `Correct answer: ${correct}`,
  ].join('\n')
}

async function callClaude(userPrompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`API error ${response.status}: ${body}`)
  }

  const data = await response.json()
  return data.content[0].text
}

async function generateForQuestion(q) {
  const raw = await callClaude(buildUserPrompt(q))

  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    const parsed = JSON.parse(cleaned)

    if (!parsed.hint || !parsed.explanation || !parsed.mnemonic) {
      throw new Error('Missing required fields')
    }

    const whyWrong = Array.isArray(parsed.why_wrong) ? parsed.why_wrong : null
    if (!whyWrong || whyWrong.length !== 4) {
      throw new Error('Invalid why_wrong array')
    }

    return {
      hint: String(parsed.hint).trim(),
      explanation: String(parsed.explanation).trim(),
      mnemonic: String(parsed.mnemonic).trim(),
      why_wrong: whyWrong.map((s) => (typeof s === 'string' ? s.trim() : '')),
    }
  } catch (err) {
    throw new Error(`Parse failed for ${q.id}: ${err.message}. Raw: ${raw.slice(0, 200)}`)
  }
}

async function main() {
  const questionsPath = join(DATA, `${tier}.json`)
  const hintsPath = join(HINTS, `${tier}.json`)

  const questionsRaw = await readFile(questionsPath, 'utf8')
  const questions = JSON.parse(questionsRaw)

  const hintsRaw = await readFile(hintsPath, 'utf8')
  const hints = JSON.parse(hintsRaw)

  const batch = questions.slice(START, START + COUNT)

  console.log(`Generating ${batch.length} hints for ${tier} (${START}–${START + batch.length - 1})...\n`)

  let done = 0
  let errors = 0

  for (const q of batch) {
    try {
      console.log(`[${done + 1}/${batch.length}] ${q.id}...`)
      const result = await generateForQuestion(q)
      hints[q.id] = result
      done++

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 500))
    } catch (err) {
      console.error(`  ❌ FAILED: ${err.message}`)
      errors++
    }
  }

  // Sort and save
  const sorted = Object.fromEntries(
    Object.entries(hints).sort(([a], [b]) => a.localeCompare(b))
  )
  await writeFile(hintsPath, JSON.stringify(sorted, null, 2) + '\n', 'utf8')

  console.log(`\nDone: ${done} generated, ${errors} errors.`)
  console.log(`Hints saved to ${hintsPath}`)
}

main().catch(err => {
  console.error('Fatal error:', err.message)
  process.exit(1)
})
