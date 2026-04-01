# HamStudy Pro (Implementation Workspace)

This directory contains the executable app scaffold for HamStudy Pro.

HamStudy Pro is an Electron + React + TypeScript macOS desktop application for FCC amateur radio exam prep, designed to be offline-first with optional live AI features.

## Current Status

Phase 1 foundation is in progress:

- Project scaffold created
- Core dependencies installed
- Architecture folders created
- Shared types/constants/IPC bridge stubs added
- FCC question bank copied into `data/`
- TypeScript typecheck passing
- Startup blocker currently open (see `../DOCS/BUGS.md`, BUG-01)

## Run Commands

From this directory:

- Install: `npm install`
- Dev: `npm run dev`
- Typecheck: `npm run typecheck`
- Build: `npm run build`
- Lint: `npm run lint`

## Directory Map

```text
hamstudy-pro/
├── data/                    # FCC question pools (technician/general/extra)
├── scripts/                 # Utility scripts (e.g., explanation generation later)
├── src/
│   ├── main/                # Electron main process (window, DB, IPC, AI calls)
│   ├── preload/             # Secure context bridge
│   ├── renderer/            # React app UI
│   └── shared/              # Shared types/constants/IPC contracts
├── electron.vite.config.ts
├── tailwind.config.js
└── package.json
```

## Key Rules

- Keep DB access centralized in `src/main/db/queries.ts` (once implemented)
- Keep API key handling in Main process + Keychain only
- Use typed IPC wrappers in `src/shared/ipcBridge.ts`
- Keep renderer free of direct Node or secret access

## Next Engineering Step

1. Resolve Electron startup blocker (`app.whenReady` undefined)
2. Finish Week 1 verification (`npm run dev` launches window)
3. Implement Week 2 DB seed + query layer + first IPC question fetch

## Project Docs

- Master context: `../DOCS/CLAUDE.md`
- Progress tracker: `../DOCS/PROGRESS.md`
- Dev log: `../DOCS/DEVLOG.md`
- Bug tracker: `../DOCS/BUGS.md`
- Security policy: `../DOCS/SECURITY.md`
