interface StreakBadgeProps {
  currentStreak: number;
  longestStreak?: number;
}

// TASK: Display the user's current day streak with a visual milestone indicator
// HOW CODE SOLVES: Renders a flame icon and day count, applying a highlight class
//                  if the user has reached specific milestone thresholds (3, 7, 14, 30+ days).
export function StreakBadge({ currentStreak, longestStreak }: StreakBadgeProps) {
  const isMilestone = currentStreak === 3 || currentStreak === 7 || currentStreak === 14 || currentStreak >= 30;
  const hasStreak = currentStreak > 0;

  return (
    <div className={`streak-badge ${hasStreak ? 'active' : 'inactive'} ${isMilestone ? 'milestone' : ''}`}>
      <div className="streak-icon">
        {hasStreak ? '🔥' : '⏳'}
      </div>
      <div className="streak-info">
        <div className="streak-count">
          {currentStreak} Day{currentStreak !== 1 ? 's' : ''}
        </div>
        {longestStreak !== undefined && longestStreak > currentStreak && (
          <div className="streak-longest">
            Best: {longestStreak}
          </div>
        )}
        {!hasStreak && (
          <div className="streak-hint">
            Complete a session today!
          </div>
        )}
      </div>
    </div>
  );
}