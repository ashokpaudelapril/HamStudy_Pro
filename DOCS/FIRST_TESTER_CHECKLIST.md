# First Tester Checklist

Use this as a lightweight manual smoke test before sharing a build.

## Launch

- Open `release/mac-arm64/HamStudy Pro.app`
- Confirm the app starts without a blank screen
- Confirm the dashboard loads without obvious layout glitches

## Core Flows

- Open Quiz Mode and answer one question
- Open Flashcards and reveal one answer
- Open Weak Area Drill and start a session
- Open Custom Quiz and build a small filtered quiz
- Open Exam Simulator and start an exam
- Open Speed Round and answer one question

## Figure Questions

- Open at least one figure-based question in any mode
- Confirm the related figure image appears below the reference line
- Confirm the image changes when moving to a different figure-based question

Suggested checks:

- `T6C09`
- `G7A09`
- `E9B01`

## Settings And Persistence

- Open Settings and confirm the reset warning text is explicit
- Change one setting and confirm it still appears after reopening the app

## Final Pass

- Reopen the app once after closing it
- Confirm progress data and figures still load normally
- Note any screen with visual inconsistency for follow-up polish
