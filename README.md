# xmaze

A directed-arrow maze puzzle. The board is a grid of **one-way arrow corridors**.
Starting at the green dot, you **drag one continuous line** to the red exit — you
may only travel a corridor the way its arrow points. Opposing arrows form a wall.
Levels ramp in difficulty, you keep a **daily streak**, earn **stars** (3 =
Flawless) and a score, and spend **hint drops** when stuck. **Multiplayer** is an
extra mode: two players join a room by invite code and race the same board.

The shipped game is the **web app** in `web/` (HTML5 canvas, no build step).
Multiplayer runs over **Supabase Realtime** and scores are stored in **Supabase
Postgres**. The `core/`, `client/`, `server/` Python tree is an earlier pygame
prototype, kept for reference and tests; the web app is the canonical game.

## Gameplay

- **Trace** by dragging from the green start; the line follows only arrows that
  point your way. Drag back to undo. Reach the red exit to win.
- **Zoom**: broad full board on tablet/desktop; pinch to zoom + two-finger pan on
  mobile (wheel zoom on desktop).
- **Hints**: tap the 💡 to reveal the next correct step; each costs a 💧 drop.
- **Streak / levels / score / themes** persist in `localStorage`; the 🎨 icon
  cycles themes.

## Layout

```
web/            browser game (deploy this to Vercel)
  index.html, styles.css
  src/
    grid.js        directed-arrow grid model, seeded gen, BFS solver (hints)
    trace.js       trace play state (extend/undo/win, hints, mistakes)
    render.js      canvas drawing (arrows, red trace) with pan/zoom transform
    input.js       pointer controller: drag-trace, pinch/wheel zoom, pan
    streak.js      daily streak (localStorage)
    levels.js      level defs (seed/size/difficulty) + progress
    score.js       stars / score / Flawless
    theme.js       palette themes (persisted)
    audio.js       Web Audio background music
    realtime.js    invite-code rooms over Supabase Realtime (MP mode)
    leaderboard.js Supabase Postgres score queries
    config.js      Supabase URL + publishable key (already set for this project)
    app.js         screen router: streak -> levels -> game -> win (+ MP)
supabase/schema.sql   leaderboard table + RLS
core/ client/ server/ tests/   Python pygame prototype + pytest suite
```

## Run the web game locally

```bash
cd web
python -m http.server 8123
# open http://localhost:8123
```

"Practice solo" works with no backend. Create/Join (multiplayer) and the
leaderboard need Supabase configured (below).

## Supabase setup (database + realtime)

1. Create a project at https://supabase.com (free tier is fine).
2. **Schema:** open the project's SQL editor and run `supabase/schema.sql`
   (creates the `scores` table with Row Level Security).
3. **Keys:** Settings → API. Copy the Project URL and the `anon`/publishable key
   into `web/src/config.js`:
   ```js
   export const SUPABASE_URL = "https://xxxx.supabase.co";
   export const SUPABASE_ANON_KEY = "eyJ...";   // anon key is public; RLS guards it
   ```
4. Realtime needs no tables — rooms run over broadcast + presence on a channel
   named `room:<CODE>`.

### Supabase MCP (optional, lets the agent manage the DB)
Add the Supabase MCP server so Claude Code can run migrations/queries for you.
Create a personal access token (Supabase → Account → Access Tokens), then add to
`.claude/settings.json` under `mcpServers` (ask me and I'll wire it):
```jsonc
"supabase": {
  "command": "npx",
  "args": ["-y", "@supabase/mcp-server-supabase@latest", "--access-token", "<TOKEN>"]
}
```

## Deploy to Vercel

The Vercel CLI is already installed. These steps are credential-gated, so run
them yourself (in this session, prefix with `!` to run inline, e.g.
`! vercel login`):

```bash
! vercel login                 # authenticate
cd web
! vercel                       # first run links/creates the project (root = web/)
! vercel --prod                # production deploy
```

`web/vercel.json` enables clean URLs. Because the anon key is public and guarded
by RLS, `config.js` can ship as-is; no secret env vars are required for the
static site.

### Vercel MCP (optional)
Per https://vercel.com/get-started.md, install the Vercel guidance + MCP once so
the agent can see deployments:
```bash
! vercel install        # or add the Vercel plugin / skill
```
Then connect the Vercel MCP endpoint in your Claude Code settings.

## Python prototype (reference)

```bash
pip install -r requirements.txt
python -m pytest -q                 # 23 tests
python -m client.game               # single-player pygame
python -m server.server             # websocket server :8765
python -m client.mp ws://localhost:8765 alice   # multiplayer client
```

## How multiplayer works (no server to host)

- Creator generates a 4-char invite code and opens a Realtime channel `room:CODE`.
- Players join the channel; **presence** tracks the roster + ready state.
- When all (≥2) are ready, the host picks one random **seed** and broadcasts
  `start`; every client builds the identical maze from that seed (deterministic
  `mulberry32` RNG), so the race is fair.
- Progress and the winning claim are broadcast events; the first `over` wins and
  the result is written to the `scores` leaderboard.
