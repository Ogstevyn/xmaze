# xmaze — Handoff

Handoff for the next agent/engineer continuing this project. Read this fully
before touching code. The game is **playable and deployed**, but quality is
roughly "early beta" — this doc is honest about what's weak and what to fix.

## 1. What the game is (the correct mechanic)

A **"free the arrows" unblock puzzle** (confirmed against the owner's screen
recording `/c/Users/USER/Downloads/6010582116847329017.mp4`):

- The board is a grid packed with arrows, each pointing N/E/S/W.
- **Tap an arrow** → it flies off the board in its direction and leaves **iff**
  every cell in its straight path to the board edge is empty.
- If another arrow blocks that path → the tapped arrow flashes red and stays
  (counts as a mistake).
- **Clear every arrow to win.** Order matters (in principle — see the gameplay
  flaw in §6).

Around that core: Daily Streak, levels + difficulty, stars/score ("Flawless" =
3 stars), **3 lives** (hearts) lost on blocked/red taps — 0 lives = Game Over
(`#gameover` screen, Retry/Levels), a separate hint button, themes, pinch/zoom,
and an invite-code multiplayer race.

> History: the mechanic was misread three times before the screen recording
> clarified it (cascade → snake-tap → drag-a-line → **correct: tap-to-free**).
> Don't reintroduce those. The old `web/src/grid.js`, `trace.js`, `path.js`
> were deleted.

## 2. Live links, repo, services

- **Live app:** https://web-eight-virid-tha38yr560.vercel.app
- **GitHub:** https://github.com/Ogstevyn/xmaze (branch `main`)
- **Vercel:** project `web` under team `stephens-projects-dfadb092`.
  - **Root Directory = `web`** (set in Project Settings → Build & Deployment).
    Critical: the app lives in `web/`, not repo root.
  - **Auto-deploy is wired**: every `git push` to `main` builds a new production
    deployment. Verified working. You can also `cd web && vercel --prod`.
- **Supabase** project ref `qtlmbhrjhwlnegrwdonw`:
  - `scores` table + RLS already applied (`supabase/schema.sql`).
  - Realtime used for multiplayer rooms (channel `room:<CODE>`), no server.
  - Publishable key is in `web/src/config.js` (public by design, guarded by RLS).
  - Supabase MCP is configured in `.mcp.json`; authenticate with `claude /mcp`
    if you need DB tools.

## 3. Architecture / file map

Buildless static ES modules in `web/` (no bundler). Hosted on Vercel.

```
web/
  index.html            all screens (streak, levels, game, win, MP menu/join/lobby/over)
  styles.css            theme-var driven, responsive, animations (confetti, star pop)
  src/
    puzzle.js           BOARD MODEL — arrows, generate(seed), isClear/tap, firstClearArrow
    render.js           canvas draw(board) + drawFlying() for the fly-out animation
    input.js            pointer controller: single tap = clear, pinch/wheel zoom, drag pan
    app.js              router + game loop + animation + SFX wiring + MP + leaderboard
    audio.js            Web Audio bg music + sfxLeave/sfxBlocked/sfxWin
    streak.js           daily streak (localStorage), FRI-start week row
    levels.js           level config (seed/size/difficulty/fill) + progress
    score.js            stars/score/Flawless
    theme.js            5 palette themes, persisted; cycleTheme()
    realtime.js         Supabase Realtime invite-code rooms (presence + broadcast)
    leaderboard.js      Supabase Postgres score insert/read
    config.js           Supabase URL + publishable key
supabase/schema.sql     scores table + RLS (already applied to the project)
core/ client/ server/ tests/   OLD Python/pygame prototype — reference only, NOT shipped
```

Data flow: `app.js` holds state `S` (board, input, flying arrows, mp room). Taps
go `input.js → app.onTap → puzzle.Board.tap → render`. Multiplayer seeds both
clients with one `seed` broadcast so `generate(seed)` builds identical boards.

### Dev hook
`app.js` exposes `window.__xmaze = { state, solve() }` **only on localhost or
`?dev`** (gated off in production). `solve()` auto-clears the board — used for
automated testing. Keep the gate.

## 4. How to run / test / deploy

```bash
# run locally
cd web && python -m http.server 8123   # open http://localhost:8123

# the Python prototype (reference only; not the shipped game)
pip install -r requirements.txt && python -m pytest -q   # 23 tests pass

# deploy (either works)
git push                      # auto-deploys to production
cd web && vercel --prod       # manual production deploy
```

There is **no JS test suite yet** — logic was verified ad hoc in Node and the
browser. Adding one is a recommended early task (see §6).

## 5. What is DONE and verified

- Correct tap-to-free mechanic; generation guarantees solvable; deterministic by
  seed. Blocked-tap red flash + mistake counting.
- Arrow fly-out animation, SFX (leave/blocked/win), confetti + star pop on win,
  screen fade transitions.
- Full screen flow: streak → levels → game → win → next level; progress, streak,
  Today's Levels persist in localStorage.
- Lives: 3 hearts, a blocked (red) tap costs one; at 0 → Game Over screen.
  The 💡 hint (reveal/clear one free arrow) is separate, capped at 3.
- Themes (5), pinch/wheel zoom + pan,
  responsive broad-on-desktop / zoomed-on-mobile.
- Multiplayer: invite-code rooms over Supabase Realtime, seed-synced boards,
  win/lose propagation, Postgres leaderboard. **Verified live with a real 2-tab
  race.**
- Zero console errors across the flow.

## 6. Known quality gaps — this is why it's not good enough yet

Prioritised. The first one is the most important.

1. **Puzzles are too easy / not real puzzles (GAMEPLAY).**
   `puzzle.generate()` uses reverse-placement, which guarantees the board is
   solvable by *greedily clearing any currently-free arrow* — so there is almost
   no ordering challenge and few forced mistakes. The reference game requires
   planning. **Fix:** generate boards with real dependency chains (arrows that
   are only freeable after a specific sequence), tune so that many arrows start
   blocked, and validate difficulty (e.g. minimum solution depth / branching).
   Consider a solver that scores "how many dead-ends a careless player hits."

2. **Arrow art is flat.** Reference arrows are thicker, rounded, and read as
   continuous maze walls; ours are thin centered segments. Do an art pass in
   `render.js` (stroke weight, joins, maybe arrows that visually connect to
   neighbours, subtle shadow).

3. **Board shapes are near-rectangular** (small top notch only). Reference boards
   are organic/irregular. Improve `buildShape()` in `puzzle.js` with varied
   masks per level.

4. **Fly-out animation is basic** (linear slide + fade, straight off-screen).
   Add easing, a little scale/trail, and maybe sound-synced juice. Consider the
   arrow visibly travelling its clear path before exiting.

5. **Streak / settings screens are rough.** Sun is an emoji; the gear and palette
   icons both just cycle the theme (no real settings panel). Build a proper
   settings sheet and nicer streak art + background gradient.

6. **No JS tests.** Add unit tests for `puzzle.js` (solvable, deterministic,
   isClear correctness) and ideally a Playwright smoke test of the flow.

7. **Difficulty curve / level design** is formulaic (`levels.js` scales size +
   fill by number). Hand-authored or better-tuned progression would help.

8. **Mobile pinch/pan not tested on a real device** — only synthetic pointer
   events. Field-test on a phone; tune `TAP_SLOP`, initial zoom, and pan bounds
   (currently unbounded — you can pan the board fully off-screen).

9. **Leaderboard is minimal** (global fastest times, name is free text, no auth).
   Multiplayer "progress" shows a raw cleared-count. Both could be richer.

10. **Audio** is synthesised and simple. Real sound assets would lift feel.

## 7. Gotchas

- **Root Directory must stay `web`** on Vercel or git deploys break.
- Windows line endings: git warns LF→CRLF; harmless.
- `config.js` publishable key is intentionally public (RLS enforces access). Do
  not treat it as a secret, but do keep write policies tight in `schema.sql`.
- The `core/ client/ server/` Python tree is the original wrong-mechanic
  prototype. **Do not** use it as the source of truth; the web app is canonical.
- Custom domain was intentionally skipped — staying on free `.vercel.app`.

## 8. Suggested first moves for the next agent

1. Fix puzzle difficulty/generation (§6.1) — biggest quality lever.
2. Arrow + board art pass (§6.2, §6.3).
3. Add a JS test suite for `puzzle.js` (§6.6) so refactors are safe.
4. Polish streak/settings screens and animation juice (§6.4, §6.5).
5. Real-device mobile pass + pan bounds (§6.8).
