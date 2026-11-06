// Scoring for the level-complete card: stars, score, and the "Flawless!" flag.

const DIFF_BONUS = { Easy: 100, Normal: 160, Hard: 240 };

// result: { timeMs, mistakes, hintsUsed, difficulty, solutionLen }
export function computeResult({ timeMs, mistakes = 0, hintsUsed = 0, difficulty = "Normal", solutionLen = 20 }) {
  // 3 stars = flawless: no mistakes, no hints. Lose a star for each.
  let stars = 3;
  if (mistakes > 0 || hintsUsed > 0) stars = 2;
  if (mistakes > 3 || hintsUsed > 1) stars = 1;

  const seconds = Math.max(1, Math.round(timeMs / 1000));
  const base = (DIFF_BONUS[difficulty] || 160) + solutionLen * 20;
  const speedBonus = Math.max(0, 1200 - seconds * 20);
  const penalty = mistakes * 40 + hintsUsed * 80;
  const score = Math.max(0, base + speedBonus - penalty) + (stars === 3 ? 500 : 0);

  return {
    stars,
    score,
    timeMs,
    seconds,
    flawless: stars === 3,
    percent: Math.max(0, 100 - mistakes * 5 - hintsUsed * 10),
    mistakes,
    hintsUsed,
  };
}

export function formatTime(ms) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
