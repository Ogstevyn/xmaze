// App router: Daily Streak -> Level Select -> Game -> Win -> next level.
// The game is the free-the-arrows puzzle: tap an arrow to send it off the board
// if its path is clear; clear every arrow to win. Multiplayer (invite-code race)
// is an extra mode that races the same board.

import { generate } from "./puzzle.js";
import { draw } from "./render.js";
import { InputController } from "./input.js";
import * as audio from "./audio.js";
import { currentTheme, cycleTheme, applyCssVars } from "./theme.js";
import { getStreak, recordToday, weekRow } from "./streak.js";
import { getLevel, loadProgress, completeLevel, isCompleted, levelWindow, bumpTodaysLevels } from "./levels.js";
import { computeResult, formatTime } from "./score.js";
import { Room } from "./realtime.js";
import { configured } from "./config.js";
import { saveScore, topScores } from "./leaderboard.js";

const MP_BOARD = { width: 11, height: 7, fill: 0.68 };
const HINT_MAX = 3;
const FLASH_MS = 320;

const $ = (id) => document.getElementById(id);
const show = (id) => {
  for (const s of document.querySelectorAll(".screen")) s.classList.remove("active");
  $(id).classList.add("active");
};

const S = {
  level: 1,
  cfg: null,
  board: null,
  total: 0,
  mistakes: 0,
  hintsUsed: 0,
  startedAt: 0,
  input: null,
  flash: new Map(),
  mp: false,
  room: null,
  roster: [],
};

// --- rendering ------------------------------------------------------------

function redraw() {
  if (!S.board) return;
  draw($("board").getContext("2d"), S.board, S.input.view, currentTheme(), S.flash);
}

function ensureInput() {
  if (S.input) return;
  S.input = new InputController($("board"), {
    getBoard: () => S.board,
    onTap,
    onChange: redraw,
  });
}

function flashCell(x, y, colour) {
  const k = `${x},${y}`;
  S.flash.set(k, colour);
  redraw();
  setTimeout(() => {
    S.flash.delete(k);
    redraw();
  }, FLASH_MS);
}

// --- streak ---------------------------------------------------------------

function renderStreak() {
  $("streak-count").textContent = getStreak().count || 0;
  const row = $("week-row");
  row.innerHTML = "";
  for (const d of weekRow()) {
    const cell = document.createElement("div");
    cell.className = "week-cell";
    cell.innerHTML = `<div class="week-dot ${d.played ? "played" : ""} ${d.today ? "today" : ""}">${d.played ? "✓" : ""}</div><span>${d.label}</span>`;
    row.appendChild(cell);
  }
}

// --- level select ---------------------------------------------------------

function renderLevels() {
  S.level = loadProgress().current || 1;
  $("lv-num").textContent = S.level;
  $("lv-difficulty").textContent = getLevel(S.level).difficulty;
  renderDots("level-dots", S.level);
}

function renderDots(targetId, center) {
  const el = $(targetId);
  el.innerHTML = "";
  for (const n of levelWindow(center)) {
    const d = document.createElement("div");
    d.className = "dot" + (n === center ? " cur" : isCompleted(n) ? " done" : "");
    d.textContent = n;
    el.appendChild(d);
  }
}

// --- game -----------------------------------------------------------------

function startLevel(n) {
  S.mp = false;
  S.level = n;
  S.cfg = getLevel(n);
  S.board = generate(S.cfg.seed, { width: S.cfg.width, height: S.cfg.height, fill: S.cfg.fill ?? 0.72 });
  S.total = S.board.remaining;
  S.mistakes = 0;
  S.hintsUsed = 0;
  S.flash.clear();
  S.startedAt = performance.now();
  $("g-level").textContent = `Level ${n}`;
  $("g-diff").textContent = S.cfg.difficulty;
  $("rival").textContent = "";
  renderDrops();
  show("game");
  ensureInput();
  requestAnimationFrame(() => {
    S.input.resizeAndFit();
    fadeZoomHint();
  });
}

function renderDrops() {
  const el = $("drops");
  el.innerHTML = "";
  for (let i = 0; i < HINT_MAX; i++) {
    const d = document.createElement("span");
    d.className = "drop" + (i < S.hintsUsed ? " used" : "");
    d.textContent = "💧";
    el.appendChild(d);
  }
  $("g-hint").disabled = S.hintsUsed >= HINT_MAX;
}

function onTap(x, y) {
  if (!S.board) return;
  const result = S.board.tap(x, y);
  if (result === "left") {
    if (S.mp) S.room?.progress(S.total - S.board.remaining);
    if (S.board.solved) onWin();
  } else if (result === "blocked") {
    S.mistakes++;
    flashCell(x, y, currentTheme().exit);
  }
}

function useHint() {
  if (!S.board || S.hintsUsed >= HINT_MAX) return;
  const cell = S.board.firstClearArrow();
  if (!cell) return;
  S.hintsUsed++;
  renderDrops();
  flashCell(cell[0], cell[1], currentTheme().start);
  S.board.tap(cell[0], cell[1]);
  if (S.mp) S.room?.progress(S.total - S.board.remaining);
  redraw();
  if (S.board.solved) onWin();
}

async function onWin() {
  const timeMs = performance.now() - S.startedAt;
  const result = computeResult({
    timeMs,
    mistakes: S.mistakes,
    hintsUsed: S.hintsUsed,
    difficulty: S.cfg.difficulty,
    solutionLen: S.total,
  });
  if (S.mp) {
    await saveScore({ name: mpName(), solveMs: Math.round(timeMs), won: true });
    await S.room?.claimWin(Math.round(timeMs));
    return;
  }
  completeLevel(S.level);
  recordToday();
  const todays = bumpTodaysLevels();
  showWin(result, todays);
}

function showWin(result, todays) {
  $("stars").textContent = "⭐".repeat(result.stars) + "☆".repeat(3 - result.stars);
  $("win-title").textContent = result.flawless ? "Flawless!" : "Level Complete";
  $("w-diff").textContent = S.cfg.difficulty;
  $("w-time").textContent = formatTime(result.timeMs);
  $("w-score").textContent = result.score;
  $("w-today").textContent = todays;
  $("w-pct").textContent = `${result.percent}%`;
  $("w-mist").textContent = `✕ ${result.mistakes}`;
  $("w-hints").textContent = `💡 ${result.hintsUsed}`;
  renderDots("win-dots", S.level + 1);
  show("win");
}

function fadeZoomHint() {
  const el = $("zoom-hint");
  el.style.opacity = "1";
  setTimeout(() => (el.style.opacity = "0"), 2500);
}

// --- multiplayer ----------------------------------------------------------

function mpName() {
  return ($("name").value || "player").slice(0, 24);
}

const roomCallbacks = {
  roster(roster) {
    S.roster = roster;
    renderLobby();
  },
  start({ seed }) {
    startMpRace(seed);
  },
  rival({ id, reached }) {
    const p = S.roster.find((x) => x.id === id);
    if (p) p.reached = reached;
    renderRival();
  },
  over(payload) {
    showOver(payload);
  },
};

async function mpCreate() {
  audio.start();
  S.room = await Room.create(mpName(), roomCallbacks);
  enterLobby();
}

async function mpJoin() {
  audio.start();
  const code = $("join-code").value.trim().toUpperCase();
  if (code.length < 4) return;
  S.room = await Room.join(mpName(), code, roomCallbacks);
  enterLobby();
}

function enterLobby() {
  show("lobby");
  $("lobby-code").textContent = S.room.code;
  renderLobby();
}

function renderLobby() {
  const list = $("roster");
  list.innerHTML = "";
  for (const p of S.roster) {
    const li = document.createElement("li");
    const me = S.room && p.id === S.room.id ? " (you)" : "";
    li.textContent = `${p.ready ? "✓" : "…"}  ${p.name}${me}`;
    list.appendChild(li);
  }
  const waiting = S.roster.length < 2;
  $("lobby-hint").textContent = configured
    ? waiting ? "Share the code — waiting for a player…" : "Press Ready to start"
    : "Supabase not configured — multiplayer needs it";
}

function startMpRace(seed) {
  S.mp = true;
  S.cfg = { difficulty: "Hard" };
  S.board = generate(seed, MP_BOARD);
  S.total = S.board.remaining;
  S.mistakes = 0;
  S.hintsUsed = 0;
  S.flash.clear();
  S.startedAt = performance.now();
  $("g-level").textContent = "Race";
  $("g-diff").textContent = "Multiplayer";
  renderDrops();
  renderRival();
  show("game");
  ensureInput();
  requestAnimationFrame(() => S.input.resizeAndFit());
}

function renderRival() {
  const rivals = S.roster.filter((p) => S.room && p.id !== S.room.id);
  $("rival").textContent = rivals.map((r) => `${r.name}: ${r.reached || 0}`).join("  ");
}

async function showOver(payload) {
  const youWon = S.room ? payload.id === S.room.id : true;
  $("over-title").textContent = youWon ? "You win!" : "You lose";
  $("over-title").className = youWon ? "logo win" : "logo lose";
  $("over-detail").textContent = payload.ms ? `${payload.name} — ${(payload.ms / 1000).toFixed(1)}s` : `${payload.name} wins`;
  show("over");
  await renderLeaderboard("over-board");
}

async function renderLeaderboard(id) {
  const el = $(id);
  if (!el) return;
  const rows = await topScores(10);
  el.innerHTML = rows.length
    ? rows.map((r, i) => `<li>${i + 1}. ${r.name} — ${(r.solve_ms / 1000).toFixed(1)}s</li>`).join("")
    : `<li>${configured ? "No scores yet" : "Connect Supabase to track scores"}</li>`;
}

function leaveMp() {
  S.room?.leave();
  S.room = null;
  S.mp = false;
  show("levels");
  renderLevels();
}

// --- wiring ---------------------------------------------------------------

function cycleAndRedraw() {
  cycleTheme();
  redraw();
}

function init() {
  applyCssVars();
  renderStreak();

  $("btn-continue").addEventListener("click", () => {
    show("levels");
    renderLevels();
  });
  $("lv-theme").addEventListener("click", cycleAndRedraw);
  $("lv-settings").addEventListener("click", cycleAndRedraw);
  $("btn-play").addEventListener("click", () => {
    audio.start();
    startLevel(S.level);
  });
  $("btn-mp").addEventListener("click", () => {
    show("mpmenu");
    renderLeaderboard("menu-board");
  });

  $("g-back").addEventListener("click", () => (S.mp ? leaveMp() : (show("levels"), renderLevels())));
  $("g-theme").addEventListener("click", cycleAndRedraw);
  $("g-settings").addEventListener("click", cycleAndRedraw);
  $("g-hint").addEventListener("click", useHint);
  $("btn-next").addEventListener("click", () => startLevel(S.level + 1));

  $("btn-create").addEventListener("click", mpCreate);
  $("btn-join").addEventListener("click", () => {
    show("join");
    $("join-code").value = "";
    $("join-code").focus();
  });
  $("btn-mp-back").addEventListener("click", () => (show("levels"), renderLevels()));
  $("btn-join-go").addEventListener("click", mpJoin);
  $("btn-join-back").addEventListener("click", () => show("mpmenu"));
  $("btn-ready").addEventListener("click", () => S.room?.setReady());
  $("btn-lobby-back").addEventListener("click", leaveMp);
  $("btn-again").addEventListener("click", leaveMp);
  $("join-code").addEventListener("keydown", (e) => {
    if (e.key === "Enter") mpJoin();
  });

  $("btn-mute").addEventListener("click", () => {
    const muted = audio.toggleMute();
    $("btn-mute").textContent = muted ? "♪ off" : "♪ on";
  });

  window.addEventListener("resize", () => {
    if ($("game").classList.contains("active") && S.input) S.input.resizeAndFit();
  });

  show("streak");

  // Dev-only auto-solve hook for automated checks (gated off in production).
  const dev = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.search.includes("dev");
  if (dev) {
    window.__xmaze = {
      state: S,
      solve() {
        let guard = S.board.remaining * 5;
        while (!S.board.solved && guard-- > 0) {
          const c = S.board.firstClearArrow();
          if (!c) break;
          onTap(c[0], c[1]);
        }
        redraw();
      },
    };
  }
}

init();
