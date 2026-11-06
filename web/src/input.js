// Pointer input: a single tap clears an arrow; two-pointer pinch zooms and pans
// (mobile); the wheel zooms (desktop). A one-pointer drag beyond a small
// threshold is treated as a pan, not a tap, so the board can be nudged.

import { cellAt, fitView } from "./render.js";

const MIN_SCALE = 0.3;
const MAX_SCALE = 6;
const TAP_SLOP = 10; // px of movement still counted as a tap

export class InputController {
  constructor(canvas, { getBoard, onTap, onChange }) {
    this.canvas = canvas;
    this.getBoard = getBoard;
    this.onTap = onTap;
    this.onChange = onChange;
    this.view = { scale: 1, ox: 0, oy: 0 };
    this.pointers = new Map();
    this._pinch = null;
    this._downPos = null;
    this._moved = 0;

    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", (e) => this._down(e));
    canvas.addEventListener("pointermove", (e) => this._move(e));
    canvas.addEventListener("pointerup", (e) => this._up(e));
    canvas.addEventListener("pointercancel", (e) => this._up(e));
    canvas.addEventListener("wheel", (e) => this._wheel(e), { passive: false });
  }

  resizeAndFit() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    const board = this.getBoard();
    if (board) {
      this.view = fitView(board, this.canvas.width, this.canvas.height, 20 * dpr);
      if (rect.width < 560) this._zoomAt(this.canvas.width / 2, this.canvas.height / 2, 1.3);
    }
    this.onChange();
  }

  _pos(e) {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * dpr, y: (e.clientY - rect.top) * dpr };
  }

  _down(e) {
    this.canvas.setPointerCapture(e.pointerId);
    const p = this._pos(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) {
      this._startPinch();
      this._downPos = null;
      return;
    }
    this._downPos = p;
    this._moved = 0;
  }

  _move(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const prev = this.pointers.get(e.pointerId);
    const p = this._pos(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) {
      this._updatePinch();
      return;
    }
    if (this._downPos) {
      this._moved += Math.hypot(p.x - prev.x, p.y - prev.y);
      if (this._moved > TAP_SLOP) {
        // single-finger pan once it is clearly a drag
        this.view.ox += p.x - prev.x;
        this.view.oy += p.y - prev.y;
        this.onChange();
      }
    }
  }

  _up(e) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this._pinch = null;
    // tap: single pointer that barely moved
    if (this._downPos && this._moved <= TAP_SLOP && p) {
      const board = this.getBoard();
      const cell = cellAt(this.view, board, p.x, p.y);
      if (cell) {
        this.onTap?.(cell[0], cell[1]);
        this.onChange();
      }
    }
    this._downPos = null;
  }

  _startPinch() {
    const [a, b] = [...this.pointers.values()];
    this._pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  _updatePinch() {
    if (!this._pinch) return this._startPinch();
    const [a, b] = [...this.pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const mcx = (a.x + b.x) / 2;
    const mcy = (a.y + b.y) / 2;
    this._zoomAt(mcx, mcy, dist / this._pinch.dist);
    this.view.ox += mcx - this._pinch.cx;
    this.view.oy += mcy - this._pinch.cy;
    this._pinch = { dist, cx: mcx, cy: mcy };
    this.onChange();
  }

  _wheel(e) {
    e.preventDefault();
    const p = this._pos(e);
    this._zoomAt(p.x, p.y, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    this.onChange();
  }

  _zoomAt(px, py, factor) {
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.view.scale * factor));
    const applied = next / this.view.scale;
    this.view.ox = px - (px - this.view.ox) * applied;
    this.view.oy = py - (py - this.view.oy) * applied;
    this.view.scale = next;
  }
}
