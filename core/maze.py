"""Directed-arrow maze: data model and seeded, solvable generation.

The maze is a grid of one-way arrow tiles. Each cell points at one orthogonal
neighbour (N/E/S/W). A "cascade" started on a cell follows the arrows from cell
to cell until it leaves the board, revisits a cell, or reaches the exit. See
``sim.py`` for the cascade logic. Generation produces a maze whose start cell
cascades to the exit, so every generated level is solvable.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from enum import Enum


class Direction(Enum):
    """An orthogonal arrow direction with its (dx, dy) grid delta.

    y grows downward (screen coordinates), so SOUTH is (0, +1).
    """

    NORTH = (0, -1)
    EAST = (1, 0)
    SOUTH = (0, 1)
    WEST = (-1, 0)

    @property
    def dx(self) -> int:
        return self.value[0]

    @property
    def dy(self) -> int:
        return self.value[1]

    @property
    def opposite(self) -> "Direction":
        return Direction((-self.dx, -self.dy))


# Short wire codes so a maze serialises compactly and stays human-readable.
_DIR_TO_CODE = {
    Direction.NORTH: "N",
    Direction.EAST: "E",
    Direction.SOUTH: "S",
    Direction.WEST: "W",
}
_CODE_TO_DIR = {code: direction for direction, code in _DIR_TO_CODE.items()}


@dataclass
class Cell:
    """One arrow tile. ``active`` marks cells the current cascade has entered."""

    x: int
    y: int
    direction: Direction
    active: bool = False

    def target(self) -> tuple[int, int]:
        """The coordinate this arrow points at (may be off-board)."""
        return (self.x + self.direction.dx, self.y + self.direction.dy)


@dataclass
class Maze:
    width: int
    height: int
    cells: dict[tuple[int, int], Cell] = field(default_factory=dict)
    start: tuple[int, int] = (0, 0)
    exit: tuple[int, int] = (0, 0)

    def in_bounds(self, x: int, y: int) -> bool:
        return 0 <= x < self.width and 0 <= y < self.height

    def cell(self, x: int, y: int) -> Cell:
        return self.cells[(x, y)]

    def reset_active(self) -> None:
        for cell in self.cells.values():
            cell.active = False

    # -- serialisation -----------------------------------------------------

    def to_dict(self) -> dict:
        """Full serialisation. For the race we normally ship only the seed,
        but this is handy for debugging and tests."""
        return {
            "width": self.width,
            "height": self.height,
            "start": list(self.start),
            "exit": list(self.exit),
            "cells": {
                f"{x},{y}": _DIR_TO_CODE[c.direction]
                for (x, y), c in self.cells.items()
            },
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Maze":
        maze = cls(
            width=data["width"],
            height=data["height"],
            start=tuple(data["start"]),
            exit=tuple(data["exit"]),
        )
        for key, code in data["cells"].items():
            x_str, y_str = key.split(",")
            x, y = int(x_str), int(y_str)
            maze.cells[(x, y)] = Cell(x, y, _CODE_TO_DIR[code])
        return maze


def _walk(maze: Maze, start: tuple[int, int]) -> tuple[list[tuple[int, int]], bool]:
    """Follow arrows from ``start``. Return the visited path and whether it
    reaches the exit. Stops on exit, off-board, or a revisit (loop)."""
    path: list[tuple[int, int]] = []
    seen: set[tuple[int, int]] = set()
    x, y = start
    while maze.in_bounds(x, y) and (x, y) not in seen:
        seen.add((x, y))
        path.append((x, y))
        if (x, y) == maze.exit:
            return path, True
        x, y = maze.cell(x, y).target()
    return path, False


def is_solvable(maze: Maze) -> bool:
    """True if the cascade from ``start`` reaches ``exit``."""
    _, reached = _walk(maze, maze.start)
    return reached


def generate(
    width: int,
    height: int,
    seed: int,
    *,
    extra_density: float = 0.0,
) -> Maze:
    """Build a solvable directed-arrow maze deterministically from ``seed``.

    First lay a guaranteed solution path from ``start`` (top-left) to ``exit``
    (bottom-right) using a self-avoiding random walk; those cells get arrows
    pointing along the path. Every remaining cell gets a random in-bounds arrow.
    ``extra_density`` is reserved for future difficulty tuning (longer forced
    detours); unused cells stay random for now.
    """
    if width < 2 or height < 2:
        raise ValueError("maze must be at least 2x2")

    rng = random.Random(seed)
    maze = Maze(width=width, height=height, start=(0, 0), exit=(width - 1, height - 1))

    path = _solution_path(width, height, rng)

    # Arrow for each solution cell points to the next cell on the path.
    on_path: set[tuple[int, int]] = set(path)
    for (x, y), (nx, ny) in zip(path, path[1:]):
        maze.cells[(x, y)] = Cell(x, y, Direction((nx - x, ny - y)))

    # Fill the rest (including the exit cell) with random valid arrows.
    for y in range(height):
        for x in range(width):
            if (x, y) in maze.cells:
                continue
            maze.cells[(x, y)] = Cell(x, y, _random_valid_dir(maze, x, y, rng))

    assert is_solvable(maze), "generator produced an unsolvable maze"
    return maze


def _random_valid_dir(
    maze: Maze, x: int, y: int, rng: random.Random
) -> Direction:
    """Pick a direction whose target stays on-board when possible, so most
    arrows lead somewhere rather than off the edge."""
    inward = [d for d in Direction if maze.in_bounds(x + d.dx, y + d.dy)]
    return rng.choice(inward) if inward else rng.choice(list(Direction))


def _solution_path(
    width: int, height: int, rng: random.Random
) -> list[tuple[int, int]]:
    """Self-avoiding walk from (0,0) to (width-1, height-1).

    Biased toward the exit so it terminates quickly, with restart-on-dead-end.
    Guaranteed to return a valid path (falls back to an L-shaped route)."""
    start, exit_ = (0, 0), (width - 1, height - 1)

    for _ in range(200):  # restart budget; dead ends are cheap to retry
        path = [start]
        seen = {start}
        x, y = start
        for _ in range(width * height * 4):
            if (x, y) == exit_:
                return path
            moves = [
                (d, x + d.dx, y + d.dy)
                for d in Direction
                if 0 <= x + d.dx < width
                and 0 <= y + d.dy < height
                and (x + d.dx, y + d.dy) not in seen
            ]
            if not moves:
                break  # dead end: restart the walk
            # Bias toward moves that reduce Manhattan distance to the exit.
            rng.shuffle(moves)
            moves.sort(key=lambda m: abs(m[1] - exit_[0]) + abs(m[2] - exit_[1]))
            # Keep some randomness: usually take a good move, sometimes any.
            _, nx, ny = moves[0] if rng.random() < 0.7 else rng.choice(moves)
            x, y = nx, ny
            path.append((x, y))
            seen.add((x, y))

    return _fallback_path(width, height)


def _fallback_path(width: int, height: int) -> list[tuple[int, int]]:
    """Deterministic L-shaped route: right along the top, then down."""
    path = [(x, 0) for x in range(width)]
    path += [(width - 1, y) for y in range(1, height)]
    return path
