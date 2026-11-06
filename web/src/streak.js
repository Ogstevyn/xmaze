// Daily streak, persisted in localStorage. A streak increments when the player
// completes a level on consecutive calendar days; it resets after a gap.

const KEY = "xmaze.streak";
const DAY = 86400000;

function todayStr(d = new Date()) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD, local-ish; fine for streaks
}

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || { count: 0, last: null, days: [] };
  } catch {
    return { count: 0, last: null, days: [] };
  }
}

function save(s) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function getStreak() {
  return load();
}

// Record that the player was active today. Returns the updated streak.
export function recordToday() {
  const s = load();
  const today = todayStr();
  if (s.last === today) return s; // already counted today
  const yesterday = todayStr(new Date(Date.now() - DAY));
  s.count = s.last === yesterday ? s.count + 1 : 1;
  s.last = today;
  s.days = Array.from(new Set([...(s.days || []), today])).slice(-28);
  save(s);
  return s;
}

// Seven day cells for the week row, starting on the most recent Friday (matches
// the reference's FRI..THU row). Each cell is marked played if its date is in the
// streak's day list; today is flagged.
const LABELS = ["FRI", "SAT", "SUN", "MON", "TUE", "WED", "THU"];
const FRIDAY = 5; // Date.getDay(): Sun=0 .. Fri=5

export function weekRow() {
  const s = load();
  const played = new Set(s.days || []);
  const now = new Date();
  const sinceFriday = (now.getDay() - FRIDAY + 7) % 7;
  const anchor = new Date(now.getTime() - sinceFriday * DAY); // this week's Friday
  const today = todayStr();
  return LABELS.map((label, i) => {
    const date = todayStr(new Date(anchor.getTime() + i * DAY));
    return { label, played: played.has(date), today: date === today };
  });
}
