import type { EarnedBadge } from '@shared/types'

export type AchievementFilter = 'all' | 'unlocked' | 'locked'

// TASK: Sort badges so the most meaningful progress appears first in the UI.
// HOW CODE SOLVES: Places unlocked badges ahead of locked ones, orders unlocked
// badges by most recent earn date, and alphabetizes remaining locked badges.
export function sortBadgesForDisplay(badges: EarnedBadge[]): EarnedBadge[] {
  return [...badges].sort((left, right) => {
    if (left.unlockedAt && right.unlockedAt) {
      return new Date(right.unlockedAt).getTime() - new Date(left.unlockedAt).getTime()
    }

    if (left.unlockedAt) return -1
    if (right.unlockedAt) return 1

    return left.title.localeCompare(right.title)
  })
}

// TASK: Filter badges by unlocked state for the achievements screen tabs.
// HOW CODE SOLVES: Applies the selected all/unlocked/locked mode to the already
// sorted list so screen rendering stays simple and deterministic.
export function filterBadges(badges: EarnedBadge[], filter: AchievementFilter): EarnedBadge[] {
  if (filter === 'unlocked') return badges.filter((badge) => badge.unlockedAt !== null)
  if (filter === 'locked') return badges.filter((badge) => badge.unlockedAt === null)
  return badges
}

// TASK: Identify the next badge the learner should work toward.
// HOW CODE SOLVES: Returns the first locked badge in the list, which matches the
// display order shown on the achievements screen.
export function getNextLockedBadge(badges: EarnedBadge[]): EarnedBadge | null {
  return badges.find((badge) => badge.unlockedAt === null) ?? null
}

// TASK: Find the most recently unlocked badge for the focus card.
// HOW CODE SOLVES: Reuses the screen ordering so the first unlocked badge is also
// the latest unlocked badge shown to the learner.
export function getLatestUnlockedBadge(badges: EarnedBadge[]): EarnedBadge | null {
  return badges.find((badge) => badge.unlockedAt !== null) ?? null
}
