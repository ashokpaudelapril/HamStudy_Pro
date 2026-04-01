#!/usr/bin/env node
/**
 * generate-hints.mjs
 *
 * Generates hint, explanation, and mnemonic for every FCC ham radio exam
 * question and writes the results into data/hints/{tier}.json.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/generate-hints.mjs
 *
 * Options (set as env vars):
 *   TIER=technician|general|extra   Only process one tier (default: all)
 *   CONCURRENCY=5                   Parallel requests (default: 5)
 *   OVERWRITE=1                     Regenerate even already-filled entries
 *
 * Resume-safe: already-filled entries are skipped unless OVERWRITE=1.
 * Progress is saved after every question, so you can Ctrl-C and resume.
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

const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? '5', 10)
const OVERWRITE = process.env.OVERWRITE === '1'
const TIER_FILTER = process.env.TIER ?? null

const TIERS = ['technician', 'general', 'extra']

// ---------------------------------------------------------------------------
// Anthropic API call — no SDK, uses native fetch
// ---------------------------------------------------------------------------
async function callClaude(systemPrompt, userPrompt) {
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
      system: systemPrompt,
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

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are generating study aids for FCC amateur radio exam questions.

For each question you receive, output ONLY a JSON object with exactly these four fields:
  "hint"        — One sentence that nudges the student toward the right answer without revealing it.
                  Reference the concept or regulation involved, not the answer text itself.
  "explanation" — 2–4 sentences explaining why the CORRECT answer is right.
                  Cite the FCC Part 97 rule number if directly relevant.
  "mnemonic"    — One vivid memory device (acronym, rhyme, imagery, or short story) tied
                  specifically to the correct answer. Make it stick.
  "why_wrong"   — A JSON array of exactly 4 strings, one per answer choice (A=index 0, B=1, C=2, D=3).
                  For the CORRECT answer index, use an empty string "".
                  For each WRONG answer index, write 1–2 sentences explaining specifically why
                  that choice is incorrect (wrong value, wrong concept, partially true but incomplete, etc.).

Rules:
- Output ONLY the raw JSON object. No markdown fences, no preamble, no trailing text.
- All fields must be present. hint, explanation, mnemonic must be non-empty strings.
- why_wrong must be an array of exactly 4 strings; correct-answer slot must be "".
- Keep fields concise: hint ≤ 25 words, explanation ≤ 60 words, mnemonic ≤ 30 words, each why_wrong entry ≤ 30 words.`

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

// ---------------------------------------------------------------------------
// Per-question generator with retry
// ---------------------------------------------------------------------------
async function generateForQuestion(q, attempt = 1) {
  const raw = await callClaude(SYSTEM_PROMPT, buildUserPrompt(q))

  let parsed
  try {
    // Strip any accidental markdown fences if the model disobeys
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    if (attempt < 3) {
      await sleep(1000 * attempt)
      return generateForQuestion(q, attempt + 1)
    }
    throw new Error(`JSON parse failed for ${q.id} after 3 attempts. Raw: ${raw.slice(0, 200)}`)
  }

  const whyWrong = Array.isArray(parsed.why_wrong) ? parsed.why_wrong : null

  if (!parsed.hint || !parsed.explanation || !parsed.mnemonic || !whyWrong || whyWrong.length !== 4) {
    if (attempt < 3) {
      await sleep(1000 * attempt)
      return generateForQuestion(q, attempt + 1)
    }
    throw new Error(`Incomplete fields for ${q.id}: ${JSON.stringify(parsed)}`)
  }

  return {
    hint: String(parsed.hint).trim(),
    explanation: String(parsed.explanation).trim(),
    mnemonic: String(parsed.mnemonic).trim(),
    why_wrong: whyWrong.map((s) => (typeof s === 'string' ? s.trim() : '')),
  }
}

// ---------------------------------------------------------------------------
// Concurrency pool
// ---------------------------------------------------------------------------
async function runConcurrent(tasks, concurrency) {
  const results = []
  let i = 0

  async function worker() {
    while (i < tasks.length) {
      const idx = i++
      results[idx] = await tasks[idx]()
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker)
  await Promise.all(workers)
  return results
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Process one tier
// ---------------------------------------------------------------------------
async function processTier(tier) {
  const questionsPath = join(DATA, `${tier}.json`)
  const hintsPath = join(HINTS, `${tier}.json`)

  const questionsRaw = await readFile(questionsPath, 'utf8')
  const questions = JSON.parse(questionsRaw)

  const hintsRaw = await readFile(hintsPath, 'utf8')
  const hints = JSON.parse(hintsRaw)

  const todo = questions.filter((q) => {
    const existing = hints[q.id]
    if (OVERWRITE) return true
    if (!existing || !existing.hint || !existing.explanation || !existing.mnemonic) return true
    // Also regenerate if why_wrong is missing or all empty (added after initial generation)
    const ww = existing.why_wrong
    if (!Array.isArray(ww) || ww.length !== 4 || !ww.some((s) => s)) return true
    return false
  })

  console.log(`\n[${tier}] ${questions.length} questions — ${todo.length} to generate (${questions.length - todo.length} already done)`)

  if (todo.length === 0) return

  let done = 0
  let errors = 0

  const tasks = todo.map((q) => async () => {
    try {
      const result = await generateForQuestion(q)
      hints[q.id] = result
      done++

      if (done % 10 === 0 || done === todo.length) {
        await saveHints(hintsPath, hints)
        process.stdout.write(`\r[${tier}] ${done}/${todo.length} generated, ${errors} errors   `)
      }
    } catch (err) {
      errors++
      console.error(`\n[${tier}] FAILED ${q.id}: ${err.message}`)
    }
  })

  await runConcurrent(tasks, CONCURRENCY)

  // Final save
  await saveHints(hintsPath, hints)
  console.log(`\n[${tier}] Done. ${done} generated, ${errors} errors.`)
}

async function saveHints(filePath, hints) {
  // Write sorted by key for stable diffs
  const sorted = Object.fromEntries(
    Object.entries(hints).sort(([a], [b]) => a.localeCompare(b))
  )
  await writeFile(filePath, JSON.stringify(sorted, null, 2) + '\n', 'utf8')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const tiers = TIER_FILTER ? [TIER_FILTER] : TIERS

console.log(`HamStudy Pro — hint generator`)
console.log(`Model: claude-haiku-4-5-20251001 | Concurrency: ${CONCURRENCY} | Overwrite: ${OVERWRITE}`)
console.log(`Tiers: ${tiers.join(', ')}`)

for (const tier of tiers) {
  await processTier(tier)
}

console.log('\nAll done.')
