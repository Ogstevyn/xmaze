// Canvas rendering for the free-the-arrows board. Each arrow is a line spanning
// its cell along its direction with an arrowhead, so adjacent arrows connect into
// the maze-of-lines look from the reference. Empty cells show a faint dot.
// Supports a pan/zoom view transform (broad on desktop, pinch on mobile).
// `flash` is a Map "x,y" -> colour for transient tap feedback (red = blocked).

export const CELL = 44;

export function worldSize(board) {
  return { w: board.width * CELL, h: board.height * CELL };
}

const cx = (x) => x * CELL + CELL / 2;
const cy = (y) => y * CELL + CELL / 2;

export function fitView(board, canvasW, canvasH, pad = 24) {
  const { w, h } = worldSize(board);
  const scale = Math.min((canvasW - pad * 2) / w, (canvasH - pad * 2) / h);
  return { scale, ox: (canvasW - w * scale) / 2, oy: (canvasH - h * scale) / 2 };
}

export function cellAt(view, board, px, py) {
  const wx = (px - view.ox) / view.scale;
  const wy = (py - view.oy) / view.scale;
  const x = Math.floor(wx / CELL);
  const y = Math.floor(wy / CELL);
  return board.isActive(x, y) ? [x, y] : null;
}

function arrowHead(ctx, fromX, fromY, toX, toY, size, colour) {
  const ang = Math.atan2(toY - fromY, toX - fromX);
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - size * Math.cos(ang - 0.5), toY - size * Math.sin(ang - 0.5));
  ctx.lineTo(toX - size * Math.cos(ang + 0.5), toY - size * Math.sin(ang + 0.5));
  ctx.closePath();
  ctx.fill();
}

export function draw(ctx, board, view, theme, flash) {
  const canvas = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(view.scale, 0, 0, view.scale, view.ox, view.oy);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // empty-cell dots + optional flash highlight
  for (const ck of board.active) {
    const [x, y] = ck.split(",").map(Number);
    const f = flash && flash.get(ck);
    if (f) {
      ctx.fillStyle = f;
      ctx.globalAlpha = 0.3;
      ctx.fillRect(x * CELL + 3, y * CELL + 3, CELL - 6, CELL - 6);
      ctx.globalAlpha = 1;
    }
    if (!board.arrows.has(ck)) {
      ctx.fillStyle = theme.dot;
      ctx.beginPath();
      ctx.arc(cx(x), cy(y), 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // arrows: a line across the cell along its axis + an arrowhead at the tip
  ctx.strokeStyle = theme.arrow;
  ctx.lineWidth = 4;
  const half = CELL * 0.5;
  for (const [ck, dir] of board.arrows) {
    const [x, y] = ck.split(",").map(Number);
    const col = flash && flash.get(ck) ? flash.get(ck) : theme.arrow;
    ctx.strokeStyle = col;
    const mx = cx(x);
    const my = cy(y);
    const tailX = mx - dir.dx * half;
    const tailY = my - dir.dy * half;
    const tipX = mx + dir.dx * half;
    const tipY = my + dir.dy * half;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    arrowHead(ctx, mx, my, tipX, tipY, 9, col);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
