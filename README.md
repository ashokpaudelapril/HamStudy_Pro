# HamStudy Pro

HamStudy Pro is an offline-first Electron + React + TypeScript desktop app for FCC amateur radio exam preparation. It is designed to help learners move from question familiarity to real exam readiness with practice modes, progress tracking, reference material, and optional AI-assisted study tools.

## What The App Includes

- Quiz, flashcard, speed round, weak-area drill, custom quiz, and full exam simulator modes
- Dashboard and analytics views for readiness, streaks, due reviews, and study activity
- Mastery map and question browser for inspecting the full FCC question pool
- Offline reference sheets, authored hints, and figure support for figure-based questions
- Achievements, XP progression, and daily challenge tracking
- Optional AI tutor and mnemonic tooling when a provider is configured

## Current Project Status

The app is now functionally complete for core study use. The current workspace includes:

- Electron main, preload, renderer, and shared typed IPC structure
- Local SQLite-backed progress and question data flow
- FCC question pools in `data/`
- Detailed authored hint datasets for Technician, General, and Extra in `data/hints/`
- Figure image assets in `data/images/` for figure-based pool questions
- Multiple study modes, dashboard/analytics, question browser, and reference sheets
- TypeScript build and Playwright regression coverage passing
- Packaged macOS app build passing

## Run Commands

From this directory:

- Install dependencies: `npm install`
- Start dev app: `npm run dev`
- Typecheck: `npm run typecheck`
- Build production bundle: `npm run build`
- Build distributable app bundle: `npm run dist`
- Build unpacked release directory: `npm run dist:dir`
- Build macOS release artifacts: `npm run dist:mac`
- Generate branded macOS icon assets: `npm run generate:icon`
- Run tests: `npm run test`
- Run browser regression suite: `npm run test:e2e`
- Lint: `npm run lint`
- Generate API-backed hints: `npm run generate-hints`
- Generate local fallback hints: `npm run generate-hints:local`

## Verified State

Most recent local verification:

- `npm run typecheck`
- `npm run build`
- `npm run dist:dir`

Latest packaged app output:

- `release/mac-arm64/HamStudy Pro.app`

## Directory Map

```text
hamstudy-pro/
├── data/
│   ├── technician.json       # FCC Technician question pool
│   ├── general.json          # FCC General question pool
│   ├── extra.json            # FCC Amateur Extra question pool
│   ├── hints/                # Hint / explanation / mnemonic datasets
│   └── images/               # Figure assets for figure-based questions
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

## First Tester Notes

- Open the packaged app from `release/mac-arm64/HamStudy Pro.app`
- If macOS warns on first launch, use right-click -> Open
- Figure-based questions should show their matching images inside the study flow
- The app stores progress locally, so testing on one machine will reuse that machine's local study state

## Release Docs

- GitHub release workflow: `DOCS/GITHUB_RELEASE_GUIDE.md`
- Repo/source layout notes: `DOCS/REPO_STRUCTURE_NOTES.md`
- Manual tester checklist: `DOCS/FIRST_TESTER_CHECKLIST.md`

## Recommended Next Steps

1. Add Developer ID signing and notarization for public macOS distribution
2. Do a manual smoke pass on a packaged `dist:mac` build
3. Write short release notes for first external testers
4. Continue improving hint quality and visual polish over time
