export interface AchievementBadgeProps {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlockedAt?: string | null;
}

// TASK: Render an individual achievement badge indicating if the user has unlocked it
// HOW CODE SOLVES: Uses the presence of `unlockedAt` to apply conditional CSS classes
//                  ('unlocked' vs 'locked') and displays the date it was earned.
export function AchievementBadge({ title, description, icon, unlockedAt }: AchievementBadgeProps) {
  const isUnlocked = Boolean(unlockedAt);

  return (
    <div className={`achievement-badge ${isUnlocked ? 'unlocked' : 'locked'}`} aria-label={`${title} achievement`}>
      <div className="achievement-icon" aria-hidden="true">
        {icon}
      </div>
      <div className="achievement-details">
        <h4 className="achievement-title">{title}</h4>
        <p className="achievement-description">{description}</p>
        {isUnlocked && unlockedAt && (
          <span className="achievement-date">Earned: {new Date(unlockedAt).toLocaleDateString()}</span>
        )}
      </div>
    </div>
  );
}