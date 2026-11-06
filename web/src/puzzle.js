// "Free the arrows" puzzle.
//
// The board is packed with arrows, each pointing N/E/S/W. Tap an arrow and it
// flies off in its direction and LEAVES the board entirely — but only if every
// cell along its straight path to the edge is empty (no arrow blocking it).
// A blocked arrow cannot leave. Clearing arrows opens paths for the rest; the
// board is solved when every arrow has left.
//
// Generation is the reverse of solving: we place arrows one at a time, each only
// where it currently has a clear path to the edge. Removing them in reverse
// placement order is therefore always a valid solution, so every level is
// solvable. Seeded + deterministic (mulberry32).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DIRS = [
  { name: "N", dx: 0, dy: -1 },
  { name: "E", dx: 1, dy: 0 },
  { name: "S", dx: 0, dy: 1 },
  { name: "W", dx: -1, dy: 0 },
];
const key = (x, y) => `${x},${y}`;

export class Board {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.active = new Set(); // "x,y" cells that are part of the board
    this.arrows = new Map(); // "x,y" -> DIR (absent = empty cell)
    this.order = []; // placement order (reverse = a valid solve order), for hints
  }

  isActive(x, y) {
    return this.active.has(key(x, y));
  }
  arrowAt(x, y) {
    return this.arrows.get(key(x, y)) || null;
  }
  get remaining() {
    return this.arrows.size;
  }
  get solved() {
    return this.arrows.size === 0;
  }

  // Would the arrow at (x,y) have a clear path off the board in its direction?
  // Only arrow-occupied cells block; empty + inactive cells are passed through.
  isClear(x, y) {
    const dir = this.arrowAt(x, y);
    if (!dir) return false;
    let cx = x + dir.dx;
    let cy = y + dir.dy;
    while (cx >= 0 && cx < this.width && cy >= 0 && cy < this.height) {
      if (this.arrows.has(key(cx, cy))) return false; // blocked by another arrow
      cx += dir.dx;
      cy += dir.dy;
    }
    return true; // reached the edge with nothing in the way
  }

  // Tap: remove the arrow if it can leave. Returns "left" | "blocked" | "empty".
  tap(x, y) {
    if (!this.arrows.has(key(x, y))) return "empty";
    if (!this.isClear(x, y)) return "blocked";
    this.arrows.delete(key(x, y));
    return "left";
  }

  // Any arrow that can currently leave — used by the hint button.
  firstClearArrow() {
    for (const k of this.arrows.keys()) {
      const [x, y] = k.split(",").map(Number);
      if (this.isClear(x, y)) return [x, y];
    }
    return null;
  }
}

// Build a shape: a rectangle, optionally with a notch cut from the top-middle so
// the board reads as the irregular landscape from the reference.
function buildShape(width, height, rng, notch) {
  const active = new Set();
  const notchW = notch ? Math.floor(width * 0.18) : 0;
  const notchX0 = Math.floor((width - notchW) / 2);
  const notchH = notch ? Math.max(1, Math.floor(height * 0.35)) : 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (notch && y < notchH && x >= notchX0 && x < notchX0 + notchW) continue;
      active.add(key(x, y));
    }
  }
  return active;
}

export function generate(seed, { width = 12, height = 7, fill = 0.72, notch = true } = {}) {
  const rng = mulberry32(seed);
  const board = new Board(width, height);
  board.active = buildShape(width, height, rng, notch && width >= 10);

  const cells = [...board.active].map((k) => k.split(",").map(Number));
  const target = Math.floor(cells.length * fill);

  // Reverse-placement: only place an arrow where its ray to the edge is currently
  // clear, so the reverse order solves the board.
  let guard = cells.length * 40;
  while (board.arrows.size < target && guard-- > 0) {
    const [x, y] = cells[Math.floor(rng() * cells.length)];
    if (board.arrows.has(key(x, y))) continue;
    const dirs = shuffle(DIRS.slice(), rng);
    for (const d of dirs) {
      board.arrows.set(key(x, y), d);
      if (board.isClear(x, y)) {
        board.order.push([x, y]);
        break;
      }
      board.arrows.delete(key(x, y));
    }
  }
  return board;
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
