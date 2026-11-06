"""Pure drawing helpers. No game logic, no event handling.

Given a pygame surface and a maze/state, draw the board. The client loop owns
the window and timing; this module only paints.
"""

from __future__ import annotations

import pygame

from core.maze import Direction, Maze
from core.sim import GameState, Outcome
from . import theme


def board_pixel_size(maze: Maze) -> tuple[int, int]:
    w = maze.width * theme.CELL + 2 * theme.MARGIN
    h = maze.height * theme.CELL + 2 * theme.MARGIN + theme.HUD_H
    return w, h


def _cell_rect(x: int, y: int) -> pygame.Rect:
    px = theme.MARGIN + x * theme.CELL
    py = theme.MARGIN + theme.HUD_H + y * theme.CELL
    return pygame.Rect(px, py, theme.CELL, theme.CELL)


def _arrow_points(
    cx: float, cy: float, direction: Direction, size: float
) -> list[tuple[float, float]]:
    """Triangle-ish arrow centred at (cx, cy) pointing along ``direction``."""
    dx, dy = direction.dx, direction.dy
    # perpendicular for the tail width
    px, py = -dy, dx
    tip = (cx + dx * size, cy + dy * size)
    left = (cx - dx * size * 0.4 + px * size * 0.7, cy - dy * size * 0.4 + py * size * 0.7)
    right = (cx - dx * size * 0.4 - px * size * 0.7, cy - dy * size * 0.4 - py * size * 0.7)
    return [tip, left, right]


def draw_board(
    surface: pygame.Surface, maze: Maze, state: GameState | None = None
) -> None:
    surface.fill(theme.BG)

    # grid lines
    for gx in range(maze.width + 1):
        x = theme.MARGIN + gx * theme.CELL
        pygame.draw.line(
            surface, theme.GRID,
            (x, theme.MARGIN + theme.HUD_H),
            (x, theme.MARGIN + theme.HUD_H + maze.height * theme.CELL), 1,
        )
    for gy in range(maze.height + 1):
        y = theme.MARGIN + theme.HUD_H + gy * theme.CELL
        pygame.draw.line(
            surface, theme.GRID,
            (theme.MARGIN, y),
            (theme.MARGIN + maze.width * theme.CELL, y), 1,
        )

    # start / exit tints
    pygame.draw.rect(surface, theme.START, _cell_rect(*maze.start), border_radius=6)
    pygame.draw.rect(surface, theme.EXIT, _cell_rect(*maze.exit), border_radius=6)

    # arrows
    for (x, y), cell in maze.cells.items():
        rect = _cell_rect(x, y)
        colour = theme.ARROW_ACTIVE if cell.active else theme.ARROW
        pts = _arrow_points(rect.centerx, rect.centery, cell.direction, theme.CELL * 0.3)
        pygame.draw.polygon(surface, colour, pts)
