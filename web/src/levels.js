// Level definitions + progress. A level number maps deterministically to a board
// (seed = level) and a difficulty/size that ramps up. Progress (completed levels)
// persists in localStorage. "Today's Levels" groups levels into daily sets.

const KEY = "xmaze.progress";
const PER_DAY = 4;

export function getLevel(n) {
  const difficulty = n <= 3 ? "Easy" : n <= 8 ? "Normal" : "Hard";
  // board grows with difficulty; width:height keeps the broad landscape shape
  const width = Math.min(8 + Math.floor(n / 2), 18);
  const height = Math.min(5 + Math.floor(n / 4), 10);
  // packing density: harder levels are fuller (more arrows blocking each other)
  const fill = difficulty === "Easy" ? 0.6 : difficulty === "Normal" ? 0.7 : 0.78;
  return { number: n, difficulty, seed: n * 2654435761 >>> 0, width, height, fill };
}

export function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || { completed: [], current: 1 };
  } catch {
    return { completed: [], current: 1 };
  }
}

export function completeLevel(n) {
  const p = loadProgress();
  if (!p.completed.includes(n)) p.completed.push(n);
  p.current = Math.max(p.current, n + 1);
  localStorage.setItem(KEY, JSON.stringify(p));
  return p;
}

export function isCompleted(n) {
  return loadProgress().completed.includes(n);
}

// The set of levels shown together with the player's current level in the
// middle, like the video's level dots (e.g. 5,6,7,8,9).
export function levelWindow(center, span = 5) {
  const half = Math.floor(span / 2);
  const start = Math.max(1, center - half);
  return Array.from({ length: span }, (_, i) => start + i);
}

// How many of today's levels are done (resets each calendar day).
export function todaysLevelsCount() {
  const p = loadProgress();
  const today = new Date().toISOString().slice(0, 10);
  const log = p.dayLog && p.dayLog.date === today ? p.dayLog.count : 0;
  return log;
}

export function bumpTodaysLevels() {
  const p = loadProgress();
  const today = new Date().toISOString().slice(0, 10);
  if (!p.dayLog || p.dayLog.date !== today) p.dayLog = { date: today, count: 0 };
  p.dayLog.count += 1;
  localStorage.setItem(KEY, JSON.stringify(p));
  return p.dayLog.count;
}
