// TASK: Reference Sheets screen organized by license class (Technician / General / Extra).
// HOW CODE SOLVES: Each tab holds sections relevant to that class's exam; sections share a
//                  left-nav + content-panel layout. Static data only — no IPC or DB calls.

import { type ReactElement, useMemo, useState } from 'react'
import type { ExamTier } from '@shared/types'
import { ModeBar } from '../components/ModeBar'

type ReferenceSheetsScreenProps = {
  onBackToModes: () => void
}

type TableRow = {
  label: string
  value: string
  note: string
}

type ReferenceGroup = {
  title: string
  items: string[]
}

type WorkedExample = {
  title: string
  formula: string
  steps: string[]
  answer: string
}

type UnitCard = {
  unit: string
  meaning: string
  example: string
  trap: string
}

type AlphabetCard = {
  letter: string
  word: string
  tip: string
}

type ReferenceSection = {
  id: string
  title: string
  subtitle: string
  summary: string
  memoryTip?: string
  bullets?: string[]
  table?: TableRow[]
  groups?: ReferenceGroup[]
  workedExamples?: WorkedExample[]
  unitCards?: UnitCard[]
  alphabetCards?: AlphabetCard[]
}

// ---------------------------------------------------------------------------
// Shared data
// ---------------------------------------------------------------------------

const PHONETIC_ALPHABET: AlphabetCard[] = [
  { letter: 'A', word: 'Alfa',     tip: 'Open with a clear two-syllable rhythm.' },
  { letter: 'B', word: 'Bravo',    tip: 'Keep the first syllable crisp so it does not blur into Delta.' },
  { letter: 'C', word: 'Charlie',  tip: 'A familiar anchor word when a call sign starts with C.' },
  { letter: 'D', word: 'Delta',    tip: 'Use the hard D cleanly on weak VHF links.' },
  { letter: 'E', word: 'Echo',     tip: 'Short and easy, but do not rush it into the next word.' },
  { letter: 'F', word: 'Foxtrot',  tip: 'A reminder to separate multi-syllable phonetics.' },
  { letter: 'G', word: 'Golf',     tip: 'Avoid clipping the final consonant.' },
  { letter: 'H', word: 'Hotel',    tip: 'Enunciate both syllables when giving call signs slowly.' },
  { letter: 'I', word: 'India',    tip: 'Useful contrast against Echo and Yankee in noisy audio.' },
  { letter: 'J', word: 'Juliett',  tip: 'The exam sheet spells it with two Ts — do not shorten it.' },
  { letter: 'K', word: 'Kilo',     tip: 'Pairs well with numbers and is easy to recognize.' },
  { letter: 'L', word: 'Lima',     tip: 'Keep it distinct from Delta and Zulu.' },
  { letter: 'M', word: 'Mike',     tip: 'A strong single-beat phonetic for weak-signal work.' },
  { letter: 'N', word: 'November', tip: 'Say the full word to avoid confusion with Victor.' },
  { letter: 'O', word: 'Oscar',    tip: 'Round vowel sound helps this cut through noise.' },
  { letter: 'P', word: 'Papa',     tip: 'Repeat cleanly if pileup or contest audio gets messy.' },
  { letter: 'Q', word: 'Quebec',   tip: 'A common test item because it is less intuitive to beginners.' },
  { letter: 'R', word: 'Romeo',    tip: 'Do not flatten the ending into radio chatter.' },
  { letter: 'S', word: 'Sierra',   tip: 'A three-syllable word worth speaking with spacing.' },
  { letter: 'T', word: 'Tango',    tip: 'A solid anchor when call signs begin with T.' },
  { letter: 'U', word: 'Uniform',  tip: 'Keep the middle consonant distinct on FM audio.' },
  { letter: 'V', word: 'Victor',   tip: 'Useful contrast against November and Sierra.' },
  { letter: 'W', word: 'Whiskey',  tip: 'Speak both syllables instead of a rushed single sound.' },
  { letter: 'X', word: 'X-ray',    tip: 'Memorable special case — the hyphenated pronunciation.' },
  { letter: 'Y', word: 'Yankee',   tip: 'Say it cleanly; it often follows digits in call signs.' },
  { letter: 'Z', word: 'Zulu',     tip: 'A high-value anchor for procedure and UTC contexts.' },
]

// ---------------------------------------------------------------------------
// Technician sections
// ---------------------------------------------------------------------------

const TECHNICIAN_SECTIONS: ReferenceSection[] = [
  {
    id: 'tech-bands',
    title: 'Band Privileges',
    subtitle: 'What Technicians can transmit on, and where',
    summary:
      'Technicians have full privileges on VHF and UHF bands. On HF, privileges are limited to specific segments — mostly CW and data, with a small phone window on 10 meters.',
    memoryTip: 'Remember: Tech = VHF/UHF home base + a narrow HF window on 10m phone (28.300–28.500 MHz).',
    table: [
      { label: '80m CW/Data only', value: '3.525–3.600 MHz', note: 'No phone — CW and digital modes only' },
      { label: '40m CW/Data only', value: '7.025–7.125 MHz', note: 'No phone — CW and digital modes only' },
      { label: '15m CW/Data only', value: '21.025–21.200 MHz', note: 'No phone — CW and digital modes only' },
      { label: '10m CW/Data',      value: '28.000–28.300 MHz', note: 'CW, RTTY, digital modes' },
      { label: '10m Phone',        value: '28.300–28.500 MHz', note: 'SSB voice — most common Tech HF privilege question' },
      { label: '10m All modes',    value: '28.500–29.700 MHz', note: 'Full mode access in this sub-band' },
      { label: '6m All modes',     value: '50–54 MHz',         note: '"Magic band" — Technician has full access' },
      { label: '2m All modes',     value: '144–148 MHz',       note: 'Primary VHF FM, repeater, and simplex band' },
      { label: '1.25m All modes',  value: '222–225 MHz',       note: 'Less common but tested on exams' },
      { label: '70cm All modes',   value: '420–450 MHz',       note: 'Popular handheld, repeater, and satellite band' },
      { label: '33cm All modes',   value: '902–928 MHz',       note: 'Tested in weak-signal and spread spectrum context' },
      { label: '23cm All modes',   value: '1240–1300 MHz',     note: 'Intro microwave band' },
    ],
  },
  {
    id: 'tech-frequencies',
    title: 'Key Frequencies',
    subtitle: 'Calling channels, simplex anchors, and repeater offsets',
    summary:
      'These are the frequencies Technicians memorize first. Start with the national calling frequencies and standard repeater offsets — they appear repeatedly on the exam.',
    memoryTip: 'Lock in 146.520 and 446.000 first. Then add the repeater offsets: 2m is ±600 kHz, 70cm is ±5 MHz.',
    groups: [
      {
        title: 'National Calling Frequencies (FM Simplex)',
        items: [
          '146.520 MHz — 2m FM national simplex calling frequency',
          '446.000 MHz — 70cm FM national simplex calling frequency',
          '52.525 MHz — 6m FM national simplex calling frequency',
          '223.500 MHz — 1.25m FM national simplex calling frequency',
        ],
      },
      {
        title: 'Standard Repeater Offsets',
        items: [
          '2m repeaters: ±600 kHz offset from output frequency',
          '70cm repeaters: ±5 MHz offset from output frequency',
          '6m repeaters: ±1 MHz offset (less standardized locally)',
          'Always verify tone (CTCSS/DCS) and offset before transmitting on a repeater',
        ],
      },
      {
        title: 'NOAA Weather and Emergency',
        items: [
          'NOAA Weather Radio: 162.400–162.550 MHz (receive only)',
          '156.800 MHz (Channel 16): Marine emergency and calling (receive awareness)',
          '121.500 MHz: Aviation emergency frequency (receive awareness)',
        ],
      },
    ],
  },
  {
    id: 'tech-formulas',
    title: 'Formulas and Math',
    subtitle: 'Ohm\'s Law, Power, and Wavelength',
    summary:
      'Technician exam math is built on three formula families: voltage/current/resistance, power, and wavelength. Write the target unit first, then pick the right form.',
    memoryTip: 'For wavelength: λ (meters) = 300 / f (MHz). For Ohm\'s Law: V = IR. For Power: P = IV.',
    bullets: [
      'Voltage: V = I × R',
      'Current: I = V / R  |  I = P / V',
      'Resistance: R = V / I  |  R = V² / P',
      'Power: P = V × I  |  P = I² × R  |  P = V² / R',
      'Wavelength (meters): λ = 300 / f(MHz)  — e.g., 2m band: 300 / 146 ≈ 2.05 m',
      'Half-wave dipole (meters): length ≈ 150 / f(MHz)',
    ],
    workedExamples: [
      {
        title: 'Find Current from Voltage and Resistance',
        formula: 'I = V / R',
        steps: ['Given V = 12 V and R = 50 ohms', 'Divide 12 by 50'],
        answer: 'I = 0.24 A (240 mA)',
      },
      {
        title: 'Find Power from Voltage and Current',
        formula: 'P = V × I',
        steps: ['Given V = 13.8 V and I = 4 A', 'Multiply 13.8 by 4'],
        answer: 'P = 55.2 W',
      },
      {
        title: 'Find Wavelength of 2m Calling Frequency',
        formula: 'λ = 300 / f(MHz)',
        steps: ['f = 146.520 MHz', 'Divide 300 by 146.52'],
        answer: 'λ ≈ 2.05 m',
      },
    ],
    unitCards: [
      { unit: 'milli (m)', meaning: '× 0.001 (10⁻³)', example: '500 mA = 0.5 A', trap: 'Lowercase m is milli — not mega (M).' },
      { unit: 'kilo (k)', meaning: '× 1,000 (10³)',   example: '2.2 kΩ = 2,200 Ω',         trap: 'k = ×1000, not ÷1000.' },
      { unit: 'mega (M)', meaning: '× 1,000,000 (10⁶)', example: '146.52 MHz = 146,520,000 Hz', trap: 'Uppercase M = mega; lowercase m = milli.' },
      { unit: 'micro (μ)', meaning: '× 0.000001 (10⁻⁶)', example: '100 μF = 0.0001 F', trap: 'Micro is 1000× smaller than milli.' },
    ],
  },
  {
    id: 'tech-phonetics',
    title: 'Phonetic Alphabet',
    subtitle: 'Full ITU letter set with memory cues',
    summary:
      'This is the standard ITU phonetic alphabet used on the air and on exams. The goal is clean, repeatable words that survive bad audio. Slow and clear beats fast and garbled.',
    memoryTip: 'When giving your call sign, break it into blocks of two or three characters and pause between groups.',
    alphabetCards: PHONETIC_ALPHABET,
  },
  {
    id: 'tech-qcodes',
    title: 'Q-Codes',
    subtitle: 'High-frequency shorthand tested on the Technician exam',
    summary:
      'Q-codes are three-letter codes used as shorthand on CW and voice. The exam tests the most common ones — grouped here by purpose for faster memorization.',
    memoryTip: 'Group by use: QRM/QRN/QSB = signal problems; QSL/QRZ = acknowledgement; QSY/QTH/QRP = control and location.',
    groups: [
      {
        title: 'Signal Conditions',
        items: [
          'QRM — Man-made interference (other stations, equipment)',
          'QRN — Natural noise (static, atmospheric, lightning)',
          'QSB — Signal is fading in and out',
          'QRO — Increase transmitter power',
          'QRP — Reduce transmitter power (also means low-power operation)',
        ],
      },
      {
        title: 'Acknowledgement and Identification',
        items: [
          'QSL — I acknowledge receipt (confirm a contact)',
          'QRZ? — Who is calling me?',
          'QSO — A radio contact between two stations',
          'QTH — My location is... (station location)',
        ],
      },
      {
        title: 'Operating Control',
        items: [
          'QSY — Change frequency to...',
          'QRX — Wait / stand by',
          'QRT — Stop transmitting / shut down station',
          'QRV — I am ready to receive',
        ],
      },
    ],
  },
  {
    id: 'tech-rules',
    title: 'Part 97 Essentials',
    subtitle: 'Rules every Technician must know cold',
    summary:
      'Part 97 is the FCC regulation governing amateur radio. Technician exam questions focus on identification, content rules, power limits, and operator responsibility.',
    memoryTip: 'Three buckets: WHEN to ID (every 10 min + at end), WHAT is prohibited (business, obscured messages, music), WHO is responsible (control operator).',
    groups: [
      {
        title: 'Station Identification',
        items: [
          'Identify with your FCC call sign at least every 10 minutes during a contact',
          'Identify at the end of every contact',
          'English language required for phone ID (or CW equivalent)',
          'Tactical call signs are allowed during operations, but official ID must still occur',
        ],
      },
      {
        title: 'Prohibited Content',
        items: [
          'No transmissions to obscure the meaning of a message (encryption, except for some control links)',
          'No business communications (except for emergencies)',
          'No broadcasting to the general public (one-way transmissions for entertainment)',
          'No music (with limited exceptions for NTSC TV and certain operational contexts)',
          'No profane or obscene language',
        ],
      },
      {
        title: 'Power and Interference',
        items: [
          'Use the minimum transmitter power necessary to carry out the desired communication',
          'Technicians: maximum 1500W PEP output on most bands',
          'Avoid harmful interference to other stations',
          'Emergency communications take priority over all other amateur radio use',
        ],
      },
      {
        title: 'Control Operator Responsibility',
        items: [
          'A licensed control operator must be present or in control whenever the station transmits',
          'The control operator is responsible for proper operation at all times',
          'Third-party traffic (non-licensees talking through your station) is permitted domestically with proper oversight',
          'RACES (Radio Amateur Civil Emergency Service) operates under local emergency management authority',
        ],
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// General sections
// ---------------------------------------------------------------------------

const GENERAL_SECTIONS: ReferenceSection[] = [
  {
    id: 'gen-bands',
    title: 'Band Privileges',
    subtitle: 'HF access added by the General license',
    summary:
      'General class adds substantial HF phone and data privileges. The key upgrade is full voice access to 80m, 40m, 20m, 15m, and 10m — the most-used HF bands for domestic and DX contacts.',
    memoryTip: 'General\'s key addition over Tech: HF phone access on 80m, 40m, 20m, 15m, 12m, 17m. Technician retains all VHF/UHF; General just adds HF voice.',
    table: [
      { label: '160m Phone',    value: '1.843–2.000 MHz',    note: 'General phone; Extra gets 1.800–1.843 CW/data too' },
      { label: '80m CW/Data',   value: '3.525–3.600 MHz',    note: 'Tech had CW only here too; same segment' },
      { label: '80m Phone',     value: '3.800–4.000 MHz',    note: 'General phone; Extra adds 3.600–3.800' },
      { label: '60m Channels',  value: '5 USB channels',     note: '5.3305, 5.3465, 5.3570, 5.3715, 5.4035 MHz — 100W max, USB only' },
      { label: '40m CW/Data',   value: '7.025–7.125 MHz',    note: 'Same as Tech CW/data window' },
      { label: '40m Phone',     value: '7.175–7.300 MHz',    note: 'General phone; Extra adds 7.125–7.175' },
      { label: '30m CW/Data',   value: '10.100–10.150 MHz',  note: 'CW and digital only — 200W power limit, no phone' },
      { label: '20m CW/Data',   value: '14.025–14.150 MHz',  note: 'CW and digital' },
      { label: '20m Phone',     value: '14.225–14.350 MHz',  note: 'General phone; Extra adds 14.150–14.225' },
      { label: '17m CW/Data',   value: '18.068–18.110 MHz',  note: 'No Novice/Tech segment; General full access' },
      { label: '17m Phone',     value: '18.110–18.168 MHz',  note: 'Full phone for General and Extra' },
      { label: '15m CW/Data',   value: '21.025–21.200 MHz',  note: 'Same as Tech CW segment' },
      { label: '15m Phone',     value: '21.275–21.450 MHz',  note: 'General phone; Extra adds 21.200–21.275' },
      { label: '12m CW/Data',   value: '24.890–24.930 MHz',  note: 'No Novice/Tech segment; General full access' },
      { label: '12m Phone',     value: '24.930–24.990 MHz',  note: 'Full phone for General and Extra' },
      { label: '10m + VHF/UHF', value: 'Same as Technician', note: 'All Technician privileges retained and expanded' },
    ],
  },
  {
    id: 'gen-hf-ops',
    title: 'HF Operating Anchors',
    subtitle: 'Common calling frequencies and mode conventions for HF bands',
    summary:
      'On HF, sideband convention and calling frequency awareness are key operating skills tested on the General exam. LSB is used below 10 MHz; USB is used above.',
    memoryTip: 'LSB = Low frequencies (80m, 40m). USB = Upper frequencies (20m, 17m, 15m, 12m, 10m). Think "Low bands = LSB".',
    groups: [
      {
        title: 'Sideband Convention',
        items: [
          'LSB (Lower Sideband): used on 80m, 60m, 40m (below 10 MHz)',
          'USB (Upper Sideband): used on 20m, 17m, 15m, 12m, 10m, and all VHF/UHF voice',
          '60m: USB only (channel-based operation)',
          'CW, RTTY, and digital modes use the lower sub-band of each band',
        ],
      },
      {
        title: 'HF Calling Frequencies',
        items: [
          '14.225 MHz — 20m USB phone calling (SSB activity center)',
          '14.300 MHz — Maritime Mobile Service Net (20m)',
          '7.178–7.250 MHz — 40m LSB phone activity window',
          '3.940 MHz — common 80m regional net frequency',
          '21.225 MHz — 15m USB phone calling',
          '28.400 MHz — 10m USB SSB activity center',
        ],
      },
      {
        title: 'International / DX Conventions',
        items: [
          'Split operation: DX station listens on a different frequency than it transmits (listen for "listening up" or "up 5")',
          'CQ DX: calling for contacts with distant (international) stations',
          'Pile-up: many stations calling one DX station at once — listen before transmitting',
          'ITU Region 2 covers North and South America; Region 1 covers Europe/Africa; Region 3 covers Asia/Pacific',
        ],
      },
    ],
  },
  {
    id: 'gen-propagation',
    title: 'Propagation',
    subtitle: 'How HF signals travel — ionospheric layers and skip',
    summary:
      'General exam questions frequently test knowledge of ionospheric layers, skip distance, and how solar activity affects HF propagation.',
    memoryTip: 'Layer memory: D (Daytime absorber), E (sporadic, 6m openings), F (long-distance workhorse, splits to F1/F2 in daytime).',
    groups: [
      {
        title: 'Ionospheric Layers',
        items: [
          'D layer: lowest layer, absorbs LF/MF and lower HF signals during daytime; disappears at night',
          'E layer: middle layer, reflects some HF signals; sporadic-E (Es) creates sudden 6m and 10m openings',
          'F1 layer: forms in daytime above E layer; less relevant at night',
          'F2 layer: highest and most useful for long-distance HF DX; persists at night; most active at solar maximum',
        ],
      },
      {
        title: 'Skip and Propagation Terms',
        items: [
          'Skip distance: the minimum distance at which a signal returns to Earth from the ionosphere',
          'Skip zone: the area between the outer edge of the ground wave and the nearest point of sky-wave return — no signal here',
          'MUF (Maximum Usable Frequency): highest frequency that will be reflected back by the ionosphere for a given path',
          'LUF (Lowest Usable Frequency): lowest frequency that will provide adequate signal strength for a given path',
          'Gray line: the terminator between day and night — enhanced propagation at sunrise/sunset on LF and HF',
        ],
      },
      {
        title: 'Solar Activity and Band Conditions',
        items: [
          'High solar flux (solar maximum) → better F2 propagation → higher MUF → 10m and 15m open more often',
          'Low solar flux (solar minimum) → poor HF, reliance on 40m and 80m for reliable communication',
          'Solar flares can cause sudden ionospheric disturbances (SID) — HF blackout on the sunlit side of Earth',
          'Auroral activity (geomagnetic storm) degrades HF propagation and can cause VHF aurora scatter',
        ],
      },
    ],
  },
  {
    id: 'gen-formulas',
    title: 'Formulas',
    subtitle: 'Ohm\'s Law, resonance, and reactance for the General exam',
    summary:
      'General exam math adds LC resonance and basic reactance on top of the Technician formula set. Know the resonance formula and be able to solve for L, C, or f.',
    memoryTip: 'Resonance: f = 1 / (2π√LC). Reactance increases with frequency for inductors (XL = 2πfL) but decreases for capacitors (XC = 1/2πfC).',
    bullets: [
      'Inductive reactance: XL = 2π × f × L  (Ω, Hz, Henries)',
      'Capacitive reactance: XC = 1 / (2π × f × C)  (Ω, Hz, Farads)',
      'Resonance frequency: f = 1 / (2π × √(L × C))',
      'Power factor: PF = R / Z  (ratio of real power to apparent power)',
      'Decibels (power): dB = 10 × log₁₀(P₂ / P₁)',
      'Decibels (voltage): dB = 20 × log₁₀(V₂ / V₁)',
    ],
    workedExamples: [
      {
        title: 'Find Resonant Frequency',
        formula: 'f = 1 / (2π√LC)',
        steps: ['Given L = 10 μH = 10×10⁻⁶ H, C = 100 pF = 100×10⁻¹² F', 'LC = 10×10⁻⁶ × 100×10⁻¹² = 1×10⁻¹⁵', '√(LC) = 3.16×10⁻⁸', '2π × 3.16×10⁻⁸ ≈ 1.99×10⁻⁷'],
        answer: 'f ≈ 5.03 MHz',
      },
      {
        title: 'Power Gain in dB',
        formula: 'dB = 10 × log₁₀(P₂ / P₁)',
        steps: ['Output = 100 W, Input = 10 W', 'P₂/P₁ = 10', 'log₁₀(10) = 1', 'dB = 10 × 1'],
        answer: '10 dB gain',
      },
      {
        title: '3 dB Rule (Half/Double Power)',
        formula: '±3 dB ≈ ×2 or ÷2 power',
        steps: ['Every 3 dB increase doubles the power', 'Every 3 dB decrease halves the power', '10 dB = ×10 power; 20 dB = ×100 power'],
        answer: '3 dB = power × 2; 10 dB = power × 10',
      },
    ],
  },
  {
    id: 'gen-rules',
    title: 'Part 97 — General Class Topics',
    subtitle: 'Rules that expand beyond the Technician basics',
    summary:
      'General exam Part 97 questions focus on HF operating rules, third-party traffic agreements, control operator responsibilities, and volunteer examiner requirements.',
    memoryTip: 'Key additions over Tech: third-party country agreements, remote/automatic control rules, and HF power limits.',
    groups: [
      {
        title: 'Third-Party Traffic',
        items: [
          'Third-party traffic means a non-licensee communicates via your station',
          'Allowed domestically with proper control operator supervision',
          'Internationally only allowed with countries that have a third-party agreement with the US',
          'During emergencies, the US/International restriction is relaxed for safety-of-life communications',
        ],
      },
      {
        title: 'Remote and Automatic Control',
        items: [
          'Remote control: the control operator is not at the station but can monitor and adjust',
          'Automatic control: station operates without a control operator actively present (repeaters, beacons)',
          'The control operator remains responsible for proper operation in all modes',
        ],
      },
      {
        title: 'Power Limits on HF',
        items: [
          'Maximum 1500W PEP output on most HF bands',
          '60m channels: maximum 100W PEP output (effective radiated power limit)',
          '30m band: maximum 200W PEP',
          'Always use the minimum power needed to carry out the communication',
        ],
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Extra sections
// ---------------------------------------------------------------------------

const EXTRA_SECTIONS: ReferenceSection[] = [
  {
    id: 'extra-bands',
    title: 'Extra-Only Segments',
    subtitle: 'The additional frequency space unlocked by the Amateur Extra license',
    summary:
      'The Extra license opens the very bottom of each HF phone and CW band — the quietest, least crowded segments where the most skilled DX operators work.',
    memoryTip: 'Think "Extra gets the bottom": the lowest CW and phone frequencies on every HF band belong exclusively to Extras.',
    table: [
      { label: '160m Extra CW',  value: '1.800–1.843 MHz',  note: 'Extra adds the low CW segment; General starts at 1.843' },
      { label: '80m Extra CW',   value: '3.500–3.525 MHz',  note: 'Extra CW — narrowest exclusive segment' },
      { label: '80m Extra Phone', value: '3.600–3.800 MHz',  note: 'Extra adds 200 kHz of phone below General\'s 3.800' },
      { label: '40m Extra CW',   value: '7.000–7.025 MHz',  note: 'Bottom 25 kHz of 40m — Extra only' },
      { label: '40m Extra Phone', value: '7.125–7.175 MHz',  note: 'Extra phone segment between General\'s CW and phone windows' },
      { label: '20m Extra CW',   value: '14.000–14.025 MHz', note: 'Bottom 25 kHz of 20m — Extra CW only' },
      { label: '20m Extra Phone', value: '14.150–14.225 MHz', note: 'Extra phone below General\'s 14.225 start' },
      { label: '15m Extra CW',   value: '21.000–21.025 MHz', note: 'Bottom 25 kHz — Extra CW only' },
      { label: '15m Extra Phone', value: '21.200–21.275 MHz', note: 'Extra phone segment' },
      { label: '10m Extra',      value: 'Same as Gen/Tech',  note: 'No Extra-only segment on 10m — fully shared' },
    ],
  },
  {
    id: 'extra-formulas',
    title: 'Advanced Formulas',
    subtitle: 'Impedance, Q, filter design, and RF circuit math',
    summary:
      'Extra exam math extends into impedance, Q factor, transmission line theory, and filter response. Most questions require applying one formula, not multi-step derivations.',
    memoryTip: 'Z = √(R² + X²) for impedance. Q = XL/R for a series circuit. Bandwidth BW = f₀/Q.',
    bullets: [
      'Impedance magnitude: Z = √(R² + X²)  (where X = XL − XC)',
      'Series circuit Q: Q = XL / R = f₀ / BW',
      'Parallel circuit Q: Q = R / XL',
      'Bandwidth: BW = f₀ / Q  (or f₀ = BW × Q)',
      'Skin depth (δ) decreases with increasing frequency — RF flows on the conductor surface',
      'SWR = (Zload + Zo) / (Zload − Zo)  for resistive mismatch',
      'Reflection coefficient: Γ = (ZL − Z₀) / (ZL + Z₀)',
      'Transmission line velocity factor: v = c × VF  (VF ≈ 0.66 for coax)',
      'Electrical length (degrees) = physical length × 360 / λ',
    ],
    workedExamples: [
      {
        title: 'Find Impedance of RLC Series Circuit',
        formula: 'Z = √(R² + X²)',
        steps: ['R = 75 Ω, XL = 100 Ω, XC = 25 Ω', 'X = XL − XC = 100 − 25 = 75 Ω', 'Z = √(75² + 75²) = √(5625 + 5625) = √11250'],
        answer: 'Z ≈ 106 Ω',
      },
      {
        title: 'Find Q and Bandwidth of a Tuned Circuit',
        formula: 'Q = f₀ / BW  →  BW = f₀ / Q',
        steps: ['f₀ = 14.250 MHz, Q = 50', 'BW = 14.250 MHz / 50'],
        answer: 'BW = 285 kHz',
      },
      {
        title: 'Voltage Gain in dB',
        formula: 'dB = 20 × log₁₀(V₂ / V₁)',
        steps: ['V₂ = 10 V, V₁ = 1 V', 'V₂/V₁ = 10', 'log₁₀(10) = 1', 'dB = 20 × 1'],
        answer: '20 dB voltage gain',
      },
      {
        title: 'Find Resonant Capacitance',
        formula: 'C = 1 / (4π² × f² × L)',
        steps: ['Target f = 7.2 MHz, L = 1 μH', 'f² = (7.2×10⁶)² = 5.18×10¹³', '4π² × f² × L ≈ 2.04×10⁹', 'C = 1 / 2.04×10⁹'],
        answer: 'C ≈ 490 pF',
      },
    ],
  },
  {
    id: 'extra-operating',
    title: 'Advanced Operating',
    subtitle: 'Contesting, DX, auxiliary, and volunteer examiner rules',
    summary:
      'Extra class exam questions cover advanced operating practices including contest rules, auxiliary and remote station operation, and the Volunteer Examiner program.',
    memoryTip: 'Know the three VE requirements: Extra/General/Tech each have minimum license class for different testing levels. VEs are accredited through a CVEC.',
    groups: [
      {
        title: 'Volunteer Examiner (VE) Program',
        items: [
          'VEs must hold at least the class of license being tested (Extra to give Extra exams)',
          'Three VEs must be present to administer a license exam session',
          'VEs are accredited through a Coordinating VE organization (CVEC) — e.g., ARRL VEC',
          'VEs may not charge fees beyond what is allowed by the CVEC',
          'VEs may not administer an exam to immediate family members',
        ],
      },
      {
        title: 'Auxiliary and Automatic Stations',
        items: [
          'Auxiliary station: an amateur station, other than a repeater, that retransmits signals automatically',
          'Auxiliary stations may operate unattended if they meet automatic control requirements',
          'Auxiliary station control operators must be Extra, Advanced, or General class',
          'They must be able to shut down the station immediately if notified of interference',
        ],
      },
      {
        title: 'Contesting and DX Rules',
        items: [
          'A contest exchange typically includes signal report, serial number, and sometimes state/grid square',
          'Spotting someone on a DX cluster is not a violation, but acting on self-spotted contacts in contests may be',
          'Split frequency operation is common in DX pileups — never transmit on the DX station\'s transmit frequency',
          '"Lid" refers to a poor operator — avoid crowding, calling over contacts, and frequency disputes',
        ],
      },
    ],
  },
  {
    id: 'extra-circuits',
    title: 'Circuit Concepts',
    subtitle: 'Active components, amplifiers, filters, and oscillators',
    summary:
      'Extra exam electronics questions go beyond Ohm\'s Law into transistor biasing, amplifier classes, filter types, and feedback oscillators.',
    memoryTip: 'Amplifier class A = linear/always on, class B = one half-cycle, class C = less than half-cycle (high efficiency, non-linear). Filters: low-pass, high-pass, bandpass, band-reject.',
    groups: [
      {
        title: 'Amplifier Classes',
        items: [
          'Class A: conducts 360° of the input cycle — linear, low distortion, low efficiency (~25–30%)',
          'Class B: conducts 180° of the input cycle — used in push-pull pairs, moderate efficiency',
          'Class AB: slightly more than 180° — balances linearity and efficiency for HF SSB amplifiers',
          'Class C: conducts less than 180° — high efficiency (~70–80%) but non-linear; used for CW/FM',
          'Class D/E: switching amplifiers used in digital/SDR contexts; very high efficiency',
        ],
      },
      {
        title: 'Filter Types',
        items: [
          'Low-pass filter: passes frequencies below cutoff; attenuates above — used to suppress harmonics',
          'High-pass filter: passes frequencies above cutoff; attenuates below — used to block LF interference',
          'Bandpass filter: passes a specific band; attenuates above and below — used in receiver IF stages',
          'Band-reject (notch) filter: attenuates a specific frequency; passes all others — used to eliminate interference',
          'Butterworth: maximally flat passband; Chebyshev: steeper rolloff with ripple; Bessel: best phase response',
        ],
      },
      {
        title: 'Oscillator Types',
        items: [
          'Colpitts oscillator: capacitive voltage divider in feedback path',
          'Hartley oscillator: tapped inductor in feedback path',
          'Pierce oscillator: crystal-controlled, common in VFO and clock circuits',
          'Frequency stability improves with higher-Q resonators and temperature compensation',
        ],
      },
    ],
  },
  {
    id: 'extra-rules',
    title: 'Part 97 — Extra Class Topics',
    subtitle: 'Advanced regulations tested on the Amateur Extra exam',
    summary:
      'Extra exam Part 97 questions cover auxiliary operations, third-party international agreements, spread spectrum, and the most detailed station control rules.',
    memoryTip: 'Key Extra rule topics: spread spectrum requirements, automatically controlled station rules, and when deliberate interference is ever permitted (it never is).',
    groups: [
      {
        title: 'Spread Spectrum',
        items: [
          'Spread spectrum is permitted on amateur bands above 222 MHz',
          'Maximum power: 100 W PEP',
          'The spreading code and technical parameters must be documented',
          'Spread spectrum stations may not cause harmful interference',
        ],
      },
      {
        title: 'Deliberate Interference',
        items: [
          'Willfully or maliciously interfering with another station\'s transmission is never permitted',
          'Attempting to disrupt emergency communications is a serious FCC violation',
          'Transmitting false distress signals is illegal under Part 97 and federal law',
        ],
      },
      {
        title: 'Symbol Rate and Emission Types',
        items: [
          '60m channels: only one signal per channel; max 2.8 kHz bandwidth; USB only',
          'HF symbol rate limits: 300 baud on 30m and below; 1200 baud on 10m through 6m (with exceptions)',
          'Emission designators: first character = type of modulation, second = signal type, third = information content',
          'Example: J3E = single-sideband suppressed-carrier telephony (SSB voice)',
        ],
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Tier map
// ---------------------------------------------------------------------------

const TIER_SECTIONS: Record<ExamTier, ReferenceSection[]> = {
  technician: TECHNICIAN_SECTIONS,
  general:    GENERAL_SECTIONS,
  extra:      EXTRA_SECTIONS,
}

const TIER_LABELS: Record<ExamTier, string> = {
  technician: 'Technician',
  general:    'General',
  extra:      'Amateur Extra',
}

const TIER_SUBTITLES: Record<ExamTier, string> = {
  technician: 'Entry-level license — VHF/UHF + limited HF',
  general:    'Intermediate license — full HF voice access',
  extra:      'Top-class license — all privileges + advanced topics',
}

// ---------------------------------------------------------------------------
// Search filter
// ---------------------------------------------------------------------------

function sectionMatchesQuery(section: ReferenceSection, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  const haystack = [
    section.title,
    section.subtitle,
    section.summary,
    section.memoryTip ?? '',
    ...(section.bullets ?? []),
    ...(section.table?.flatMap((r) => [r.label, r.value, r.note]) ?? []),
    ...(section.groups?.flatMap((g) => [g.title, ...g.items]) ?? []),
    ...(section.workedExamples?.flatMap((e) => [e.title, e.formula, e.answer, ...e.steps]) ?? []),
    ...(section.unitCards?.flatMap((c) => [c.unit, c.meaning, c.example, c.trap]) ?? []),
    ...(section.alphabetCards?.flatMap((c) => [c.letter, c.word, c.tip]) ?? []),
  ]
  return haystack.some((v) => v.toLowerCase().includes(normalized))
}

// ---------------------------------------------------------------------------
// Section content renderer
// ---------------------------------------------------------------------------

function renderSectionContent(section: ReferenceSection): ReactElement {
  return (
    <>
      <p>{section.summary}</p>
      {section.memoryTip ? (
        <p className="meta"><strong>Memory anchor:</strong> {section.memoryTip}</p>
      ) : null}

      {section.table ? (
        <div className="reference-table-wrap" role="region" aria-label={`${section.title} table`}>
          <table className="reference-table">
            <thead>
              <tr><th>Band / Item</th><th>Frequency / Value</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {section.table.map((row) => (
                <tr key={`${row.label}-${row.value}`}>
                  <td>{row.label}</td>
                  <td className="reference-table-mono">{row.value}</td>
                  <td>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {section.groups ? (
        <div className="reference-group-grid">
          {section.groups.map((group) => (
            <article key={group.title} className="reference-group-card">
              <h3>{group.title}</h3>
              <ul className="reference-list">
                {group.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
          ))}
        </div>
      ) : null}

      {section.bullets ? (
        <ul className="reference-list reference-formula-list">
          {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
        </ul>
      ) : null}

      {section.workedExamples ? (
        <div className="formula-example-grid">
          {section.workedExamples.map((example) => (
            <article key={example.title} className="formula-example-card">
              <h3>{example.title}</h3>
              <p className="meta">Formula: <strong>{example.formula}</strong></p>
              <ol>{example.steps.map((step) => <li key={step}>{step}</li>)}</ol>
              <p className="formula-answer">{example.answer}</p>
            </article>
          ))}
        </div>
      ) : null}

      {section.unitCards ? (
        <div className="unit-card-grid">
          {section.unitCards.map((card) => (
            <article key={card.unit} className="unit-card">
              <h3>{card.unit}</h3>
              <p><strong>Scale:</strong> {card.meaning}</p>
              <p><strong>Example:</strong> {card.example}</p>
              <p className="meta"><strong>Exam trap:</strong> {card.trap}</p>
            </article>
          ))}
        </div>
      ) : null}

      {section.alphabetCards ? (
        <div className="alphabet-card-grid">
          {section.alphabetCards.map((card) => (
            <article key={card.letter} className="alphabet-card">
              <p className="mode-eyebrow">{card.letter}</p>
              <h3>{card.word}</h3>
              <p>{card.tip}</p>
            </article>
          ))}
        </div>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// Screen component
// ---------------------------------------------------------------------------

export function ReferenceSheetsScreen({ onBackToModes }: ReferenceSheetsScreenProps) {
  const [activeTier, setActiveTier] = useState<ExamTier>('technician')
  const [searchText, setSearchText] = useState('')
  const [activeSectionId, setActiveSectionId] = useState(TECHNICIAN_SECTIONS[0].id)

  const filteredSections = useMemo(() => {
    return TIER_SECTIONS[activeTier].filter((s) => sectionMatchesQuery(s, searchText))
  }, [activeTier, searchText])

  const activeSection = useMemo(() => {
    return filteredSections.find((s) => s.id === activeSectionId) ?? filteredSections[0] ?? null
  }, [activeSectionId, filteredSections])

  function handleTierChange(tier: ExamTier): void {
    setActiveTier(tier)
    setSearchText('')
    setActiveSectionId(TIER_SECTIONS[tier][0].id)
  }

  return (
    <main className="app-shell">
      <ModeBar title="Reference Sheets" onBack={onBackToModes} />

      {/* License-class tab bar */}
      <section className="panel reference-tier-bar">
        {(Object.keys(TIER_LABELS) as ExamTier[]).map((tier) => (
          <button
            key={tier}
            type="button"
            className={`reference-tier-btn ${activeTier === tier ? 'active' : ''}`}
            onClick={() => handleTierChange(tier)}
          >
            <strong>{TIER_LABELS[tier]}</strong>
            <span>{TIER_SUBTITLES[tier]}</span>
          </button>
        ))}
      </section>

      {/* Search */}
      <section className="panel">
        <div className="search-row">
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={`Search ${TIER_LABELS[activeTier]} reference sheets…`}
          />
          <p className="meta">
            {filteredSections.length} section{filteredSections.length === 1 ? '' : 's'} matched
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="panel reference-layout">
        <aside className="reference-nav" aria-label="Reference sections">
          {filteredSections.map((section, index) => (
            <button
              key={section.id}
              type="button"
              className={`reference-nav-item ${activeSection?.id === section.id ? 'active' : ''}`}
              onClick={() => setActiveSectionId(section.id)}
            >
              <span className="reference-nav-index">{index + 1}</span>
              <span>
                <strong>{section.title}</strong>
                <small>{section.subtitle}</small>
              </span>
            </button>
          ))}
          {filteredSections.length === 0 ? (
            <p className="meta">No sections matched that search.</p>
          ) : null}
        </aside>

        <article className="reference-content">
          {activeSection ? (
            <div className="reference-card">
              <p className="mode-eyebrow">{TIER_LABELS[activeTier]}</p>
              <h2>{activeSection.title}</h2>
              <p className="subtitle">{activeSection.subtitle}</p>
              {renderSectionContent(activeSection)}
            </div>
          ) : (
            <div className="reference-card">
              <h2>No Section Selected</h2>
              <p>Try a broader search term or switch to a different license class tab.</p>
            </div>
          )}
        </article>
      </section>
    </main>
  )
}
