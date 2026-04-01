interface XPBarProps {
  levelTitle: string;
  totalXp: number;
  xpToNextLevel: number | null;
}

// TASK: Render the user's current XP level and progress towards the next level
// HOW CODE SOLVES: Displays the level title, current total XP, and a visual progress
//                  bar if there is a next level to reach.
export function XPBar({ levelTitle, totalXp, xpToNextLevel }: XPBarProps) {
  // If we have xpToNextLevel, we calculate an approximate percentage.
  // To be precise we'd need the base XP of the current level, but as a fallback
  // visual, we can show how close they are based on a nominal chunk (e.g. out of the next requirement).
  const isMaxLevel = xpToNextLevel === null || xpToNextLevel <= 0;
  
  return (
    <div className="xp-bar-container">
      <div className="xp-bar-header">
        <span className="xp-level-title">{levelTitle}</span>
        <span className="xp-total-text">{totalXp.toLocaleString()} XP</span>
      </div>
      
      {!isMaxLevel && (
        <div className="xp-bar-next">
          {xpToNextLevel} XP to next level
        </div>
      )}
    </div>
  );
}