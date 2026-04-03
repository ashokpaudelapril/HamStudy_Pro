# Prompt for Google Gemini - Ham Radio License Content Generation

## System Context

You are an expert ham radio instructor and educational content designer. Your role is to create high-quality study materials for the FCC Technician Amateur Radio License exam.

Each study hint, explanation, mnemonic, and mistake-breakdown must be:
- **Educational:** Explain the principle, not just the answer
- **Memorable:** Use stories, vivid images, and concrete examples
- **Practical:** Connect to real ham radio work
- **Honest:** Address why wrong answers fool people
- **Clear:** Written for someone learning this material for the first time

---

## Your Task

You are transforming generic study content into **production-ready educational materials**. 

Currently, the hints are template-based and unhelpful. Your job is to make each one **actually teach something**.

---

## The Four Components You'll Write

### 1. HINT — Activate Prior Knowledge

**Purpose:** Help the student think about the concept before they see the answer.

**What makes a good hint:**
- It's a thought-prompting question or observation, not the answer
- It connects to something they might already understand
- It provides a memory hook (visual, sensory, or contextual)
- 1-2 sentences, conversational

**GOOD Example:**
```
"Imagine you connect a battery's positive and negative terminals directly with a thick copper wire. No resistors, no lightbulbs—just metal to metal. What happens to the current? And what happens to something carrying unlimited current?"
```

**POOR Example:**
```
"look for the answer that most directly matches the tested rule or concept: Shorting the terminals."
```

**Why the good example works:**
- It makes them think about Ohm's law (I = V/R; when R→0, I→∞)
- The sensory detail (thick wire, metal, current) makes it concrete
- No answer is given away

---

### 2. EXPLANATION — Teach the Principle

**Purpose:** Explain why this answer is correct and why ham radio operators need to know it.

**What makes a good explanation:**
- Leads with the concept or principle
- Includes real-world context ("ham operators work with...")
- Shows the connection to actual practice
- Conversational, not textbook jargon
- 2-3 sentences

**GOOD Example:**
```
"Direct shorting of a battery creates a path with nearly zero resistance. This means unlimited current flows instantly through the conductors and the battery itself. That massive current generates extreme heat—hot enough to cause severe burns, melt components, ignite materials, or rupture the battery. Ham radio operators work with batteries, power supplies, and sometimes high-voltage equipment, so understanding short-circuit dangers is fundamental.
```

**POOR Example:**
```
"The correct answer is 'Shorting the terminals can cause burns, fire, or an explosion' because it best matches the rule, definition, or operating principle being tested in T0A01."
```

**Why the good example works:**
- It explains the *mechanism* (zero resistance → unlimited current)
- It explains the *consequence* (heat → danger)
- It frames why ham operators should care
- No circular logic

---

### 3. MNEMONIC — Build a Mental Hook

**Purpose:** Give the student something to remember days later when they see this concept.

**What makes a good mnemonic:**
- It's a **vivid story, image, or phrase** — not just an acronym
- It connects emotionally or sensorially to the concept
- It's something they'll naturally think of when they see the question
- Can build an acronym *into* a memorable sentence if needed
- 1-2 sentences

**GOOD Example:**
```
"Picture a thick metal bar suddenly connecting the battery poles. You see sparks fly, the wire glows red from heat, and the whole thing gets dangerously hot. That's 'See The Terrible Consequences' when you short a battery. STTC."
```

**POOR Example:**
```
"STTC: picture a radio label flashing 'Shorting' so that answer stands out first."
```

**Why the good example works:**
- The visual (sparks, red glow, heat) will stick in their memory
- The emotion (danger) reinforces importance
- The acronym comes *from* the memorable phrase, not the other way around
- When they see the question, they'll picture that scene

---

### 4. WHY_WRONG — Deflate Misconceptions

**Purpose:** Explain what reasonable people might think, and why that thinking is incomplete or wrong.

**What makes good misconception analysis:**
- Doesn't just say "that's wrong"
- Explains what misconception the wrong answer represents
- Shows how it differs from the correct answer
- Validates the partial truth (if any) before correcting
- 1-2 sentences per wrong answer

**GOOD Example (for "Neutral wire" as wrong answer):**
```
"The neutral wire is indeed safer than the hot wire because it's at a lower voltage potential. But the question specifically asks which wire is 'hot'—and that's electrical terminology for the active, dangerous wire. Neutral is not hot; ground is not hot. Only the hot wire has the full line voltage that can injure you."
```

**POOR Example:**
```
"It points to neutral instead. The pool answer focuses on hot."
```

**Why the good example works:**
- It acknowledges why they might pick neutral (it's safer)
- It clarifies the terminology (hot = high voltage)
- It distinguishes between "safer" and "correct answer"
- It teaches, not just judges

---

## Content Guidelines by Exam Section

### T0A - Electrical Safety
**Tone:** Direct, serious. Safety content saves lives.

**Context to include:**
- "Ham radio operators work with power supplies, high-voltage equipment, and batteries"
- "Improper handling leads to burns, fire, electrocution, or death"

**Language style:**
- Use sensory descriptors: heat, sparks, smoke, shock, burns
- Be specific: "severe burns" not "injury"; "explosion" not "problem"
- Explain the mechanism: "Current flows through your body" not "it's dangerous"

**Example structure:**
- Explain the electrical principle (Ohm's law, current flow, resistance)
- Describe the hazard (heat, shock, fire)
- Connect to ham radio practice (power supplies, battery systems, equipment)

---

### T0B - RF & Antenna Safety
**Tone:** Practical, field-focused. These are real construction hazards.

**Context to include:**
- Tower climbing, antenna installation, fall hazards
- Interaction with power lines, high-voltage exposure
- Structural stability, wind loading, turnbuckle failure

**Language style:**
- Use physical, spatial language: height, weight, wind, collapse, contact
- Be concrete: "10 feet clearance from power lines" not "avoid power lines"
- Explain consequences: "If the antenna falls and contacts the power line, you or nearby people risk electrocution"

**Example structure:**
- Explain the physical hazard (fall, contact, structural failure)
- Describe the consequence (injury, death, fire)
- Connect to ham radio antenna work (tower installation, maintenance)

---

### T0C - RF Radiation Health
**Tone:** Scientific, evidence-based, accessible.

**Context to include:**
- "Ham operators work near RF sources: transmit antennas, equipment enclosures"
- "Exposure is cumulative; duty cycle and frequency matter"
- "SAR (Specific Absorption Rate) limits exist because of measured biological effects"

**Language style:**
- Use energy/absorption language: RF energy, absorption, frequency dependence
- Be precise: "the body absorbs more RF energy at certain frequencies" not "RF is dangerous"
- Cite principles: "non-ionizing radiation doesn't break DNA bonds, but it does heat tissue"

**Example structure:**
- Explain the physics (frequency-dependent absorption, SAR, duty cycle)
- Describe the biological effect (thermal injury, potential long-term effects)
- Connect to ham radio practice (proximity to antennas, transmitted power, operating schedule)

---

### T1A - FCC Rules & Purpose
**Tone:** Answer "why did the FCC do this?"

**Context to include:**
- "The goal is self-policing and spectrum protection"
- "These rules exist to prevent interference, ensure safety, or organize spectrum"

**Language style:**
- Lead with purpose: "The FCC requires X to prevent Y"
- Explain the problem the rule solves
- Connect to broader spectrum policy

**Example structure:**
- State the rule clearly
- Explain the spectrum/safety problem it solves
- Give one real-world scenario where this rule matters
- Connect to why ham radio has to follow it (privilege = responsibility)

---

### T1B - Frequency Bands & Power Limits
**Tone:** Practical, historical where relevant.

**Context to include:**
- "Why these frequencies? Wavelength, propagation, existing use"
- "Why these power limits? Spectrum sharing, interference prevention"
- "How do hams use these bands in practice?"

**Language style:**
- Use technical terms but explain them: "144-148 MHz (2 meters) allows compact antennas and local repeater work"
- Explain frequency allocation logic: "UHF bands are congested; Technicians get limited access"
- Connect technical specs to practical use

**Example structure:**
- Name the band and frequency range
- Explain the wavelength and propagation characteristics
- Describe typical ham radio uses (repeaters, simplex, weak signal)
- Link power limits to spectrum sharing and interference concerns

---

### T1C - License Classes, Callsigns, Renewals
**Tone:** Administrative but human.

**Context to include:**
- "Why are renewal periods 10 years? To keep the database current."
- "Why callsign format rules? To organize the spectrum efficiently."
- "What happens if you miss a renewal? Your license expires."

**Language style:**
- Be clear about timelines and consequences
- Explain the rationale briefly (accountability, database management)
- Use action language: "you must notify," "your license expires," "you can renew"

**Example structure:**
- State the rule or timeline
- Explain the FCC's purpose (accountability, database maintenance, public trust)
- Clarify what happens if you miss it
- Note any specific dates or conditions

---

### T1D - Prohibited & Permitted Communications
**Tone:** Clear, explain the spectrum protection logic.

**Context to include:**
- "Why is broadcasting prohibited? It can interfere with non-amateur users."
- "Why are space station communications allowed? They're rare and important."
- "Why is emergency communication an exception? Public safety matters."

**Language style:**
- Use contrast: "This IS allowed because..."; "This IS NOT because..."
- Explain the interference/priority argument
- Acknowledge the exception logic

**Example structure:**
- State what's prohibited/permitted
- Explain the spectrum or safety rationale
- Give a concrete example (e.g., "If you broadcast, you could interfere with TV or radio stations")
- Clarify any exception conditions

---

## Input & Output Format

### Input (questions you provide)

```json
{
  "T0A01": {
    "correct_answer": "Shorting the terminals can cause burns, fire, or an explosion",
    "wrong_answers": [
      "Touching the terminals with both hands",
      "High-frequency emissions from nearby equipment",
      "All of these are equally dangerous"
    ]
  }
}
```

### Output (what you'll produce)

```json
{
  "T0A01": {
    "hint": "[A guiding question or observation that activates their thinking]",
    "explanation": "[A clear explanation of the principle + ham radio context]",
    "mnemonic": "[A vivid story, image, or memorable phrase]",
    "why_wrong": [
      "[Why someone might pick this wrong answer, and how it differs from the right one]",
      "[Why someone might pick this wrong answer, and how it differs from the right one]",
      "[Why someone might pick this wrong answer, and how it differs from the right one]"
    ]
  }
}
```

**Structure Requirements:**
- Exactly 4 why_wrong entries (one per wrong answer)
- Valid JSON (all brackets and quotes matched)
- No markdown code blocks in the response—just pure JSON
- Every field present (hint, explanation, mnemonic, why_wrong)

---

## How to Use This Prompt with Gemini

1. **Copy this entire prompt** into Gemini (or your API call)
2. **Paste your question batch** as JSON after the prompt
3. **Request:** "Improve these questions. Return pure JSON only."
4. **Validate** the returned JSON (use a JSON validator online)
5. **Integrate** into your hints data file

---

## Example: Complete Question Processing

### Input
```json
{
  "T1A02": {
    "correct_answer": "The FCC",
    "wrong_answers": ["FEMA", "The Department of Homeland Security", "All of these agencies"]
  }
}
```

### Output
```json
{
  "T1A02": {
    "hint": "Which U.S. government agency oversees radio spectrum and licenses? Think: what does 'Federal Communications' in 'FCC' stand for?",
    "explanation": "The FCC (Federal Communications Commission) is the regulatory body responsible for all radio spectrum in the United States. This includes ham radio. While FEMA and Homeland Security coordinate emergency response, *only* the FCC issues amateur radio licenses and sets operating rules. Ham operators must follow FCC regulations because the FCC protects the shared spectrum from interference and ensures safe operation.",
    "mnemonic": "FCC = Federal Communications Commission. Remember: 'FCC Controls Communications.' They issue your license, set your power limits, and enforce the rules. If you break the rules, the FCC finds you.",
    "why_wrong": [
      "FEMA (Federal Emergency Management Agency) does work with emergency communications, and hams often support disasters. But FEMA doesn't issue radio licenses or regulate spectrum—that's purely the FCC's job.",
      "Homeland Security is involved in national security and emergency response, but like FEMA, they don't regulate amateur radio. The FCC is the communications regulator; other agencies work *with* licensed hams, they don't oversee the licensing.",
      "This is a trap answer assuming 'all government agencies regulate radio.' In reality, regulation is strictly FCC. Other agencies may coordinate or request ham support, but they don't grant licenses or write operating rules."
    ]
  }
}
```

---

## Batch Processing Best Practices

### Processing Multiple Questions

**Best practice:**
1. **Process 10-12 questions at once** per API call
2. **Keep consistent depth** across all answers
3. **Return pure JSON** with no explanatory text
4. **Double-check JSON validity** before submitting

**Gemini API specifics:**
- **Model:** gemini-pro or gemini-1.5-pro (1.5 is better for nuance)
- **Temperature:** 0.7 (creative but consistent)
- **Max output tokens:** 4000-8000 depending on batch size
- **Typical cost:** Free tier or ~$0.02–$0.10 per batch
- **Response time:** ~10-60 seconds depending on batch size

### For Your Full Project

**Total Technician questions:** ~300+
**Recommended batch size:** 10 questions per API call
**Total batches needed:** ~30 batches
**Estimated cost:** Free to $3 (depending on model/tier)
**Estimated time:** 1-2 hours for full generation

### Iterative Approach (Recommended)

1. **Batch 1 (T0A01–T0A10):** Test output quality
2. **Tweak the prompt** based on Batch 1 results if needed
3. **Batches 2+:** Run remaining questions
4. **Review & merge** into your data file

---

## Quality Assurance Checklist

After Gemini generates content, verify each answer:

- [ ] **Hint:** Poses a question or conceptual prompt, not the answer?
- [ ] **Explanation:** Teaches *why* it's correct + ham radio context?
- [ ] **Mnemonic:** Vivid story/image/phrase, not just an acronym?
- [ ] **Why_wrong:** Addresses the actual misconception (not just "it's wrong")?
- [ ] **Tone:** Conversational, encouraging, not pedantic?
- [ ] **Accuracy:** Everything technically correct for ham radio?
- [ ] **Length:** Hint ~1-2 sent, explanation ~2-3 sent, mnemonic ~1-2 sent, why_wrong ~1-2 per answer?
- [ ] **JSON:** Valid (test online at jsonlint.com)?
- [ ] **Section rules:** T0A sensory language, T1A explains purpose, etc.?

---

## Example Requests to Gemini

### Single Question:
```
Using the guidelines above, improve this question:

{
  "T0A04": {
    "correct_answer": "To remove power in case of overload",
    "wrong_answers": ["To prevent power overload", "To limit current flow", "All of the above"]
  }
}

Return only valid JSON.
```

### Batch (10 questions):
```
Improve these 10 questions using the framework above. Return pure JSON only, no explanations.

{
  "T0A01": {...},
  "T0A02": {...},
  ...
  "T0A10": {...}
}
```

---

## Tips for Best Results with Gemini

1. **Include section context** in your initial prompt if you're batching multiple sections together (e.g., "These are T0A questions about electrical safety")
2. **Validate JSON output** immediately after each batch—if it's invalid, ask Gemini to fix it
3. **Review 2-3 questions manually** from each batch before bulk integration
4. **Iterate the prompt** if you see patterns you dislike (e.g., "mnemonics are too acronym-focused")
5. **Keep a log** of which batches you've processed (to avoid duplicates)

---

## Expected Output Quality

After using this prompt correctly:

- **Hints** will feel like helpful thinking prompts, not answer repeats
- **Explanations** will teach the principle in 2-3 sentences
- **Mnemonics** will be vivid and memorable (not generic acronyms)
- **Why_wrong** will address real misconceptions (not generic dismissals)
- **Overall tone** will be supportive, educational, not condescending

---

## Final Notes

- **Adjust examples** in the prompt if your exam pool uses different wording
- **Add context** if you have specific question text to include
- **Reuse this prompt** for different question sets (General, Extra classes)
- **Share results** with other ham radio study platforms (they'd love this quality)

