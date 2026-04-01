# HamStudy Pro

HamStudy Pro is an offline-first Electron + React + TypeScript desktop app for FCC amateur radio exam preparation. It is designed to help learners move from question familiarity to real exam readiness with practice modes, progress tracking, reference material, and optional AI-assisted study tools.

## What The App Includes

- Quiz, flashcard, speed round, weak-area drill, custom quiz, and full exam simulator modes
- Dashboard and analytics views for readiness, streaks, due reviews, and study activity
- Mastery map and question browser for inspecting the full FCC question pool
- Offline reference sheets and hint/explanation support
- Achievements, XP progression, and daily challenge tracking
- Optional AI tutor and mnemonic tooling when a provider is configured

## Current Project Status

The app is now well past bare scaffolding. The current workspace includes:

- Electron main, preload, renderer, and shared typed IPC structure
- Local SQLite-backed progress and question data flow
- FCC question pools in `data/`
- Generated first-pass hint datasets in `data/hints/`
- Polished home and achievements screens
- TypeScript typecheck passing

## Run Commands

From this directory:

- Install dependencies: `npm install`
- Start dev app: `npm run dev`
- Typecheck: `npm run typecheck`
- Build production bundle: `npm run build`
- Run tests: `npm run test`
- Lint: `npm run lint`
- Generate API-backed hints: `npm run generate-hints`
- Generate local fallback hints: `npm run generate-hints:local`

## Directory Map

```text
hamstudy-pro/
├── data/
│   ├── technician.json       # FCC Technician question pool
│   ├── general.json          # FCC General question pool
│   ├── extra.json            # FCC Amateur Extra question pool
│   └── hints/                # Hint / explanation / mnemonic datasets
├── public/                   # Static assets
├── scripts/                  # Utility scripts such as hint generation
├── src/
│   ├── main/                 # Electron main process, DB, IPC handlers
│   ├── preload/              # Secure context bridge exposed to renderer
│   ├── renderer/             # React screens, components, styling, state
│   └── shared/               # Shared types, constants, and IPC contracts
├── electron.vite.config.ts   # Electron + Vite config
├── vite.config.ts            # Renderer Vite config
├── vitest.config.ts          # Test config
└── package.json              # Scripts and dependencies
```

## Architecture Notes

- Keep database reads and writes centralized in `src/main/db/queries.ts`
- Keep secrets and API key handling in the main process only
- Use typed IPC wrappers from `src/shared/ipcBridge.ts`
- Keep renderer code free of direct Node access
- Treat `data/` as source content that is safe to ship with the app

## Hints Workflow

The project currently supports two hint-generation paths:

- `npm run generate-hints`
  Requires Anthropic access and uses the API-backed generator in `scripts/generate-hints.mjs`
- `npm run generate-hints:local`
  Uses the local deterministic generator in `scripts/generate-hints-local.mjs`

The local generator is intended as a fallback baseline so hint files are never left empty.

## Recommended Next Steps

1. Continue polishing study-session UX, especially hint presentation and question review flow
2. Improve authored quality of the generated hint datasets over time
3. Add more renderer-side tests for key learner journeys
4. Keep refining onboarding, dashboard guidance, and exam-readiness feedback
