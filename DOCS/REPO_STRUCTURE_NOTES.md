# Repo Structure Notes

This repository is intended to hold the app source, not bundled release output.

## Source Of Truth

Treat these directories as the working project:

- `src/`
- `data/`
- `public/`
- `scripts/`
- `DOCS/`

## Generated Locally

These are safe to delete and regenerate:

- `out/`
- `release/`
- `playwright-report/`
- `test-results/`
- `.electron-home/`
- `build/icon.iconset/`

## Keep For Packaging

These should stay in the repo because they support release creation:

- `build/icon.icns`
- `build/icon.png`
- `public/app-icon.svg`
- `scripts/generate-mac-icon.sh`

## Normal Development Loop

```bash
npm install
npm run dev
```

## Before Sharing A Build

```bash
npm run typecheck
npm run test:e2e
npm run dist:mac
```

## Important Principle

The GitHub repository should remain the editable source project.
The `.dmg` and `.zip` files should be published through GitHub Releases, not committed into the repo.
