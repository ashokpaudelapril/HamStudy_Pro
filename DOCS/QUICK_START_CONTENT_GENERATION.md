# Quick Start Guide: Using Codex & Gemini for Content Generation

## Which Model for Which Section?

### Use **Codex (OpenAI GPT-4)** for:
- **T0A, T0B, T0C** (Safety sections) — Better at technical precision and sensory language
- **T1B** (Frequency bands & power) — Better at explaining technical rationale
- **Regulatory nuance** — Better at parsing FCC rule implications
- **When:** You want maximum technical accuracy and depth

**Strengths:**
- Superior technical explanation
- Excellent at explaining "why" rules exist
- Great misconception analysis for safety topics
- Consistent output quality

**Cost:** ~$0.03–$0.10 per 10-question batch

---

### Use **Gemini (Google)** for:
- **T1A, T1C, T1D** (Rules & procedures) — Better at teaching administrative concepts
- **Memory aids & mnemonics** — Often more creative with story-based memory devices
- **General accessibility** — Free tier available, faster iteration cycles
- **When:** You want quick turnaround or prefer creative storytelling

**Strengths:**
- Often more creative mnemonics
- Great at procedural/administrative explanations
- Faster turnaround (cheaper/free tier)
- Good misconception analysis with conversational tone

**Cost:** Free tier or ~$0.02–$0.05 per 10-question batch

---

## Recommended Workflow

### Phase 1: Safety (T0A, T0B, T0C)
1. **Use Codex** for all T0A, T0B, T0C questions
2. Process in batches of 10 (12 questions per T0A, ~10 per T0B, 13 per T0C)
3. **Total batches:** ~5 batches = ~25 Technician safety questions covered
4. **Est. cost:** $0.15–$0.50
5. **Est. time:** 30–60 minutes

**Codex Batch 1: T0A01–T0A12** (Electrical Safety)
```
Copy the entire PROMPT_CODEX_OPENAI.md content
Paste these 12 questions as JSON
Request: "Improve these 12 T0A (electrical safety) questions. Return pure JSON only."
```

**Codex Batch 2: T0B01–T0B11** (Antenna/RF Safety)
**Codex Batch 3: T0C01–T0C13** (RF Radiation Health)

---

### Phase 2: Regulations (T1A, T1C, T1D)
1. **Use Gemini** for T1A, T1C, T1D questions
2. Process in batches of 12 (11 questions per T1A, 11 per T1C, variable per T1D)
3. **Total batches:** ~4 batches = ~40+ regulation questions covered
4. **Est. cost:** Free to $0.20
5. **Est. time:** 1–2 hours

**Gemini Batch 1: T1A01–T1A11** (FCC Rules & Purpose)
```
Copy the entire PROMPT_GEMINI.md content
Paste these 11 questions as JSON
Request: "These are T1A questions about FCC rules and the purpose of amateur radio. Improve them. Return pure JSON only."
```

**Gemini Batch 2: T1C01–T1C11** (License Classes & Renewal)
**Gemini Batch 3: T1D01–T1D11** (Prohibited/Permitted Communications)

---

### Phase 3: Bands & Modes (T1B)
1. **Use Codex** (technical precision matters here)
2. Process in batches of 10 (12 questions total)
3. **Total batches:** 1–2 batches = ~12 questions covered
4. **Est. cost:** $0.03–$0.10
5. **Est. time:** 15–30 minutes

**Codex Batch 4: T1B01–T1B12** (Frequency Bands & Power)

---

## How to Execute Each Batch

### Template: Codex Batch Execution

**Step 1: Prepare the prompt**
```
1. Open this file: DOCS/PROMPT_CODEX_OPENAI.md
2. Select and copy **all content** (from "# Prompt for OpenAI..." to the end)
```

**Step 2: Prepare your question data**
```
1. Extract the X questions from hamstudy-pro/data/hints/technician.json
2. Create a clean JSON object with:
   - Question ID (T0A01, etc.)
   - correct_answer
   - wrong_answers array (4 items)
3. Example:
{
  "T0A01": {
    "correct_answer": "Shorting the terminals can cause burns, fire, or an explosion",
    "wrong_answers": [
      "Touching the terminals with both hands",
      "High-frequency emissions from nearby equipment",
      "All of these are equally dangerous"
    ]
  },
  "T0A02": { ... }
}
```

**Step 3: Use Codex**
- Go to [https://platform.openai.com/playground](https://platform.openai.com/playground)
- Or use ChatGPT (gpt-4 model recommended)
- Paste the **full prompt** into the system message or context
- Paste your **question JSON** after the prompt
- Add instruction: "Return only valid JSON, no markdown."
- Click "Generate" or "Send"
- **Wait 1-3 minutes** for response

**Step 4: Validate output**
- Copy the returned JSON
- Paste into [https://jsonlint.com](https://jsonlint.com)
- Check for valid JSON structure
- If invalid, ask Codex to fix: "Fix the JSON syntax errors and return again."

**Step 5: Integrate**
- Once valid, save to a temporary file
- Manually review 2-3 entries for quality
- If good, merge into `hamstudy-pro/data/hints/technician.json`

---

### Template: Gemini Batch Execution

**Step 1: Prepare the prompt**
```
1. Open this file: DOCS/PROMPT_GEMINI.md
2. Select and copy **all content** (from "# Prompt for Google Gemini..." to the end)
```

**Step 2: Prepare your question data** (same as Codex)

**Step 3: Use Gemini**
- Go to [https://gemini.google.com](https://gemini.google.com)
- Or use Gemini API if you have access
- Paste the **full prompt** into the message
- Paste your **question JSON** after the prompt
- Add instruction: "Return only valid JSON, no explanations."
- Press Enter
- **Wait 30 seconds to 2 minutes** for response

**Step 4–5: Same as Codex** (validate + review + integrate)

---

## Data Integration Checklist

After each batch:

- [ ] JSON is valid (passes jsonlint.com test)?
- [ ] All 4 fields present (hint, explanation, mnemonic, why_wrong)?
- [ ] Spot-checked 2-3 entries for quality?
- [ ] Compared against the quality framework from CONTENT_IMPROVEMENTS_DRAFT.md?
- [ ] Ready to merge into technician.json?

---

## Merging Results into the App

Once all batches are complete:

1. **Backup the original:**
   ```bash
   cp hamstudy-pro/data/hints/technician.json hamstudy-pro/data/hints/technician.json.backup
   ```

2. **Create a merge script** (optional but recommended):
   - Read your generated JSON batches
   - Merge all improved content into the main hints file
   - Verify no duplicates or conflicts

3. **Test in the app:**
   ```bash
   cd hamstudy-pro
   npm run dev
   # Open the app and view a question
   # Check that hints, explanations, mnemonics, and why_wrong are displayed correctly
   ```

4. **Run tests:**
   ```bash
   npm test
   npm run test:e2e
   ```

---

## Cost & Time Estimates

### Full Technician Exam (300+ questions)

| Phase | Model | Batches | Cost | Time | Output |
|-------|-------|---------|------|------|--------|
| T0A (12 Q) | Codex | 1 | $0.05 | 5 min | 12 improved |
| T0B (11 Q) | Codex | 1 | $0.05 | 5 min | 11 improved |
| T0C (13 Q) | Codex | 1 | $0.05 | 5 min | 13 improved |
| T1A (11 Q) | Gemini | 1 | Free | 10 min | 11 improved |
| T1B (12 Q) | Codex | 1 | $0.05 | 5 min | 12 improved |
| T1C (11 Q) | Gemini | 1 | Free | 10 min | 11 improved |
| T1D-T1F (remaining) | Gemini | 3–4 | Free | 30–60 min | 100+ improved |
| **Subtotal** | Mixed | ~9 | ~$0.20-0.30 | 1.5-2 hrs | 180+ improved |

---

## Pro Tips

1. **Process safety first.** T0A–C are critical for safety; use Codex for maximum precision.
2. **Reuse the prompts.** After T0A works well, the same Codex prompt works for all T0 sections.
3. **Validate aggressively.** Check 2-3 questions per 10 until you trust the quality.
4. **Iterate if needed.** If output doesn't match the framework, ask "This mnemonic is too acronym-focused. Make it a vivid story instead."
5. **Keep logs.** Note which questions you've processed to avoid duplicate work.
6. **Test in the app early.** Don't wait until all batches are done—integrate and test after each phase.

---

## Troubleshooting

### Problem: Gemini returns invalid JSON

**Solution:**
- Ask Gemini: "Fix the JSON syntax errors and return only the corrected JSON."
- Or manually fix quotes/brackets and re-validate

### Problem: Codex explanations are too technical/dry

**Solution:**
- Adjust the prompt: Add "Use conversational tone, not academic jargon"
- Re-run the batch with the updated prompt

### Problem: Mnemonics are generic acronyms, not stories

**Solution:**
- Append to your next batch instruction: "Each mnemonic must be a vivid story or image, never just an acronym."
- Re-run

### Problem: Why_wrong sections are repetitive ("It points to X instead")

**Solution:**
- The model might be overfitting to the old format
- Insert an example of good why_wrong analysis into the prompt
- Re-run the batch

---

## Next Steps (After Generation Complete)

1. **Merge all improved content** into technician.json
2. **Test in the app** (npm run dev)
3. **Verify display:**
   - Open Question Browser
   - Select a question
   - Verify hint appears and is helpful
   - Verify explanation teaches the concept
   - Verify mnemonic is memorable
   - Verify why_wrong explains misconceptions
4. **Run full test suite:**
   ```bash
   npm test
   npm run test:e2e
   ```
5. **Commit to git** with a message like:
   ```
   feat: improve study content hints, explanations, mnemonics, and misconception analysis for Technician exam
   - Generated using GPT-4 (T0A-B-C, T1B) and Gemini (T1A, T1C, T1D)
   - Framework: educational hints, real-world explanations, vivid mnemonics, misconception-based why_wrong
   - Coverage: Technician exam (T0A-T1F sections)
   ```

---

## Files You're Using

| File | Purpose |
|------|---------|
| DOCS/PROMPT_CODEX_OPENAI.md | Full prompt for OpenAI Codex/ChatGPT-4 |
| DOCS/PROMPT_GEMINI.md | Full prompt for Google Gemini |
| DOCS/CONTENT_IMPROVEMENTS_DRAFT.md | Reference: Quality framework & examples |
| hamstudy-pro/data/hints/technician.json | Your target data file (to be updated) |
| hamstudy-pro/data/hints/technician.json.backup | Backup after merge (recommended) |

