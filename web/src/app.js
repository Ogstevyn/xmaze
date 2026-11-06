// App router: Daily Streak -> Level Select -> Game -> Win -> next level.
// The game is the free-the-arrows puzzle: tap an arrow to send it off the board
// if its path is clear; clear every arrow to win. Multiplayer (invite-code race)
// is an extra mode that races the same board.

import { generate } from "./puzzle.js";
import { draw, drawFlying } from "./render.js";
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
const LIVES_MAX = 3;
const FLASH_MS = 320;

const $ = (id) => document.getElementById(id);
const on = (id, ev, fn) => document.getElementById(id)?.addEventListener(ev, fn);
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
  lives: LIVES_MAX,
  startedAt: 0,
  input: null,
  flash: new Map(),
  flying: [],
  animating: false,
  mp: false,
  room: null,
  roster: [],
};

const FLY_MS = 260;

// --- rendering ------------------------------------------------------------

function redraw() {
  if (!S.board) return;
  const ctx = $("board").getContext("2d");
  draw(ctx, S.board, S.input.view, currentTheme(), S.flash);
  for (const f of S.flying) drawFlying(ctx, S.board, S.input.view, currentTheme(), f);
}

// Animate arrows flying off the board. Runs only while there are flyers.
function startAnim() {
  if (S.animating) return;
  S.animating = true;
  const step = () => {
    const now = performance.now();
    S.flying = S.flying.filter((f) => {
      f.progress = (now - f.t0) / FLY_MS;
      return f.progress < 1;
    });
    redraw();
    if (S.flying.length) {
      requestAnimationFrame(step);
    } else {
      S.animating = false;
    }
  };
  requestAnimationFrame(step);
}

function launch(x, y, dir) {
  S.flying.push({ x, y, dir, t0: performance.now(), progress: 0 });
  startAnim();
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
  S.lives = LIVES_MAX;
  S.flash.clear();
  S.flying = [];
  S.startedAt = performance.now();
  $("g-level").textContent = `Level ${n}`;
  $("g-diff").textContent = S.cfg.difficulty;
  $("rival").textContent = "";
  renderLives();
  show("game");
  ensureInput();
  requestAnimationFrame(() => {
    S.input.resizeAndFit();
    fadeZoomHint();
  });
}

// The HUD icons are LIVES, not hints: a blocked (red) tap costs one, and at
// zero it is game over. Hearts fill/empty with remaining lives.
function renderLives() {
  const el = $("drops");
  el.innerHTML = "";
  for (let i = 0; i < LIVES_MAX; i++) {
    const d = document.createElement("span");
    const alive = i < S.lives;
    d.className = "life" + (alive ? "" : " lost");
    d.textContent = alive ? "❤️" : "🤍";
    el.appendChild(d);
  }
  $("g-hint").disabled = S.hintsUsed >= HINT_MAX;
}

function onTap(x, y) {
  if (!S.board) return;
  const dir = S.board.arrowAt(x, y); // capture before removal for the animation
  const result = S.board.tap(x, y);
  if (result === "left") {
    audio.sfxLeave();
    launch(x, y, dir);
    if (S.mp) S.room?.progress(S.total - S.board.remaining);
    if (S.board.solved) setTimeout(onWin, FLY_MS);
  } else if (result === "blocked") {
    S.mistakes++;
    S.lives--;
    audio.sfxBlocked();
    flashCell(x, y, currentTheme().exit);
    renderLives();
    if (S.lives <= 0) setTimeout(gameOver, FLASH_MS);
  }
}

function gameOver() {
  $("go-level").textContent = S.mp ? "Race" : `Level ${S.level}`;
  show("gameover");
}

function useHint() {
  if (!S.board || S.hintsUsed >= HINT_MAX) return;
  const cell = S.board.firstClearArrow();
  if (!cell) return;
  S.hintsUsed++;
  renderLives();
  const dir = S.board.arrowAt(cell[0], cell[1]);
  S.board.tap(cell[0], cell[1]);
  audio.sfxLeave();
  launch(cell[0], cell[1], dir);
  if (S.mp) S.room?.progress(S.total - S.board.remaining);
  if (S.board.solved) setTimeout(onWin, FLY_MS);
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
  audio.sfxWin();
  burstConfetti();
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

// Lightweight confetti burst on win — a handful of falling coloured chips.
function burstConfetti() {
  const colours = ["#e8962c", "#5aaa78", "#d25c48", "#c8803c", "#7fa58a"];
  const layer = document.createElement("div");
  layer.className = "confetti";
  for (let i = 0; i < 36; i++) {
    const c = document.createElement("i");
    c.style.left = Math.random() * 100 + "vw";
    c.style.background = colours[i % colours.length];
    c.style.animationDelay = Math.random() * 0.3 + "s";
    c.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.appendChild(c);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 2600);
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
  S.lives = LIVES_MAX;
  S.flash.clear();
  S.flying = [];
  S.startedAt = performance.now();
  $("g-level").textContent = "Race";
  $("g-diff").textContent = "Multiplayer";
  renderLives();
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
  // guarded: tolerate a stale/partial DOM so init never dies on one missing node
  on("btn-retry", "click", () => (S.mp ? leaveMp() : startLevel(S.level)));
  on("btn-go-levels", "click", () => (S.mp ? leaveMp() : (show("levels"), renderLevels())));

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
