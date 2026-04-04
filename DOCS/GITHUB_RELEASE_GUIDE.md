# GitHub Release Guide

This project is set up so you can keep the source in GitHub while sharing only the packaged macOS app with testers.

## Recommended Distribution Format

Use the `.dmg` as the primary download.

Why:

- It feels more polished than a raw zip
- It is familiar to Mac users
- It is easy to attach to a GitHub Release

Keep the `.zip` as a fallback artifact for users who prefer it.

## Local Release Flow

From the `hamstudy-pro/` directory:

```bash
npm install
npm run generate:icon
npm run dist:mac
```

Expected output:

- `release/HamStudy Pro-<version>-arm64.dmg`
- `release/HamStudy Pro-<version>-arm64-mac.zip`

## GitHub Repo Setup

Recommended repo contents:

- source code
- `data/`
- `DOCS/`
- `public/`
- `scripts/`
- `src/`
- `build/icon.icns`
- `build/icon.png`

Do not commit:

- `node_modules/`
- `out/`
- `release/`
- `playwright-report/`
- `test-results/`
- `.electron-home/`
- `build/icon.iconset/`

## Create A Release Manually

1. Push your latest source changes to GitHub
2. Create a tag, for example `v1.0.0`
3. Push the tag
4. In GitHub, open `Releases`
5. Draft a new release for that tag
6. Upload the `.dmg`
7. Optionally upload the `.zip` too
8. Add short install notes for Mac users

Suggested release notes starter:

```text
HamStudy Pro for macOS

- Offline FCC ham radio study app
- Includes Technician, General, and Extra pools
- Supports quiz, flashcards, weak-area drill, speed round, and exam simulator
- Includes authored hints and figure-based question support

Install:
1. Download the .dmg
2. Drag HamStudy Pro to Applications
3. If macOS warns on first launch, right-click the app and choose Open
```

## GitHub Actions Workflow

This repo includes:

- `.github/workflows/build-macos.yml`

What it does:

- builds the macOS app on pushed `v*` tags
- uploads the `.dmg` and `.zip` as workflow artifacts

This is useful even before signing and notarization, because it gives you repeatable release artifacts.

## Future Improvements

When you are ready for broader public distribution, add:

- Apple Developer ID signing
- notarization
- a version bump workflow
- optional automatic GitHub Release publishing from CI
