// Leaderboard persistence on Supabase Postgres. Fast solves rank first.

import { supabase, configured } from "./config.js";

// Save a finished race result. `solveMs` is time from race start to reaching
// the exit; `won` marks whether this player won the race.
export async function saveScore({ name, solveMs, won }) {
  if (!configured) return { error: "supabase not configured" };
  const { error } = await supabase.from("scores").insert({
    name: name || "player",
    solve_ms: solveMs,
    won,
  });
  return { error: error?.message || null };
}

// Top winning solves (fastest first).
export async function topScores(limit = 10) {
  if (!configured) return [];
  const { data, error } = await supabase
    .from("scores")
    .select("name, solve_ms, created_at")
    .eq("won", true)
    .order("solve_ms", { ascending: true })
    .limit(limit);
  if (error) return [];
  return data;
}
