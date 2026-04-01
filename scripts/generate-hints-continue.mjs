#!/usr/bin/env node
/**
 * generate-hints-continue.mjs
 *
 * Continues generating comprehensive hints for exam questions, starting from
 * questions that don't yet have detailed explanations.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/generate-hints-continue.mjs [tier] [batch_size]
 *   Example: node scripts/generate-hints-continue.mjs technician 10
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

const [tier = 'technician', batchSizeStr = '10'] = process.argv.slice(2)
const BATCH_SIZE = parseInt(batchSizeStr, 10)

const SYSTEM_PROMPT = `You are generating educational study aids for FCC amateur radio exam questions.

Your hints must be COMPREHENSIVE and EDUCATIONAL - designed for actual learning, not just regurgitating rules.

For each question you receive, output ONLY a JSON object with exactly these four fields:

  "hint"        — One sentence that nudges the student toward the right answer without revealing it.
                  Hint should encourage critical thinking, not just pattern matching.

  "explanation" — 2–6 sentences (300-1000+ characters) explaining why the CORRECT answer is right.
                  Must include:
                  • What the concept/rule actually means (don't assume prior knowledge)
                  • Real ham radio context or practical example from FCC Part 97
                  • Why this matters in actual operation (safety, legal, technical)
                  • Cite the specific FCC rule number if directly relevant
                  • Address common misconceptions that lead to wrong answers

  "mnemonic"    — One vivid memory device (acronym, rhyme, imagery, or short story)
                  specifically tied to the correct answer. Make it memorable and sticky.

  "why_wrong"   — A JSON array of exactly 4 strings, one per answer choice (A=index 0, B=1, C=2, D=3).
                  For the CORRECT answer index, use an empty string "".
                  For each WRONG answer, write 1–2 sentences explaining specifically why
                  that choice is incorrect and what misconception it exploits.

Rules:
- Output ONLY the raw JSON object. No markdown fences, no preamble, no trailing text.
- All fields must be present. hint, explanation, mnemonic must be non-empty strings.
- explanation must be substantive: 300+ characters, with real-world context and learning value.
- why_wrong must be an array of exactly 4 strings; correct-answer slot must be "".
- Be specific to ham radio practice and FCC regulations—not generic test-taking advice.`

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
      max_tokens: 1024,
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

    // Validate explanation length (must be substantive)
    if (parsed.explanation.length < 300) {
      throw new Error(`Explanation too short (${parsed.explanation.length} chars, need 300+)`)
    }

    const whyWrong = Array.isArray(parsed.why_wrong) ? parsed.why_wrong : null
    if (!whyWrong || whyWrong.length !== 4) {
      throw new Error('Invalid why_wrong array')
    }

    // Verify correct answer index matches empty string position
    const emptyIdx = whyWrong.findIndex(s => s === '')
    if (emptyIdx !== q.correct) {
      throw new Error(
        `why_wrong structure error: empty string at index ${emptyIdx}, but correct answer is ${q.correct}`
      )
    }

    return {
      hint: String(parsed.hint).trim(),
      explanation: String(parsed.explanation).trim(),
      mnemonic: String(parsed.mnemonic).trim(),
      why_wrong: whyWrong.map((s) => (typeof s === 'string' ? s.trim() : '')),
    }
  } catch (err) {
    throw new Error(`Parse failed for ${q.id}: ${err.message}. Raw: ${raw.slice(0, 300)}`)
  }
}

async function main() {
  const questionsPath = join(DATA, `${tier}.json`)
  const hintsPath = join(HINTS, `${tier}.json`)

  const questionsRaw = await readFile(questionsPath, 'utf8')
  const questions = JSON.parse(questionsRaw)

  const hintsRaw = await readFile(hintsPath, 'utf8')
  const hints = JSON.parse(hintsRaw)

  // Find questions that need comprehensive hints (explanation < 300 chars)
  const needsWork = questions.filter(q => {
    const h = hints[q.id]
    return !h || h.explanation.length < 300
  })

  if (needsWork.length === 0) {
    console.log(`✅ All ${tier} questions have comprehensive hints!`)
    return
  }

  const batch = needsWork.slice(0, BATCH_SIZE)
  console.log(
    `\nGenerating ${batch.length} comprehensive hints for ${tier}...`
  )
  console.log(`(${needsWork.length} questions total still need work)\n`)

  let done = 0
  let errors = 0

  for (const q of batch) {
    try {
      const idx = needsWork.indexOf(q) + 1
      const totalNeeded = needsWork.length
      console.log(`[${idx}/${totalNeeded}] ${q.id}...`)
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

  console.log(`\n✅ Done: ${done} generated, ${errors} errors.`)
  console.log(`💾 Hints saved to ${hintsPath}`)

  const remaining = needsWork.length - batch.length
  if (remaining > 0) {
    console.log(`\n📋 Remaining: ${remaining} questions need hints.`)
    console.log(`   Run again to continue.`)
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message)
  process.exit(1)
})
