import type { EarnedBadge } from '@shared/types'
import {
  filterBadges,
  getLatestUnlockedBadge,
  getNextLockedBadge,
  sortBadgesForDisplay,
} from './achievementsUtils'

const sampleBadges: EarnedBadge[] = [
  {
    id: 'locked-alpha',
    title: 'Alpha',
    description: 'Locked alpha badge',
    icon: 'A',
    unlockedAt: null,
  },
  {
    id: 'recent-unlock',
    title: 'Bravo',
    description: 'Recently unlocked badge',
    icon: 'B',
    unlockedAt: '2026-04-01T10:00:00.000Z',
  },
  {
    id: 'older-unlock',
    title: 'Charlie',
    description: 'Older unlocked badge',
    icon: 'C',
    unlockedAt: '2026-03-28T10:00:00.000Z',
  },
  {
    id: 'locked-zulu',
    title: 'Zulu',
    description: 'Locked zulu badge',
    icon: 'Z',
    unlockedAt: null,
  },
]

describe('achievementsUtils', () => {
  it('sorts unlocked badges before locked badges and keeps newest unlock first', () => {
    const sorted = sortBadgesForDisplay(sampleBadges)

    expect(sorted.map((badge) => badge.id)).toEqual([
      'recent-unlock',
      'older-unlock',
      'locked-alpha',
      'locked-zulu',
    ])
  })

  it('filters unlocked and locked badges correctly', () => {
    const sorted = sortBadgesForDisplay(sampleBadges)

    expect(filterBadges(sorted, 'unlocked').map((badge) => badge.id)).toEqual([
      'recent-unlock',
      'older-unlock',
    ])

    expect(filterBadges(sorted, 'locked').map((badge) => badge.id)).toEqual([
      'locked-alpha',
      'locked-zulu',
    ])
  })

  it('returns the next locked badge and latest unlocked badge from sorted results', () => {
    const sorted = sortBadgesForDisplay(sampleBadges)

    expect(getNextLockedBadge(sorted)?.id).toBe('locked-alpha')
    expect(getLatestUnlockedBadge(sorted)?.id).toBe('recent-unlock')
  })

  it('returns null focus badges when every badge is either locked or absent', () => {
    expect(getLatestUnlockedBadge([])).toBeNull()
    expect(getNextLockedBadge([])).toBeNull()
  })
})
