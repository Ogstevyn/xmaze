"""Cascade simulation: pure, deterministic, no I/O.

A cascade starts on one cell and flows along arrows cell-to-cell. Each visited
cell is marked active ("opened"), which is what reveals/enables the next arrow in
the reference game. The cascade ends when it reaches the exit (win), leaves the
board, or revisits a cell (stuck in a loop).

Two entry points:

* ``cascade`` — resolve a whole chain at once (used by tests and solvability).
* ``GameState`` — advance one cell per step, so the client can animate the chain
  and the server can validate a player's progress move by move.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from .maze import Maze


class Outcome(Enum):
    RUNNING = "running"
    WON = "won"  # reached exit
    STUCK = "stuck"  # off-board or revisited cell


@dataclass
class CascadeResult:
    path: list[tuple[int, int]]
    outcome: Outcome

    @property
    def won(self) -> bool:
        return self.outcome is Outcome.WON


def cascade(maze: Maze, start: tuple[int, int]) -> CascadeResult:
    """Resolve the full chain from ``start`` in one shot."""
    path: list[tuple[int, int]] = []
    seen: set[tuple[int, int]] = set()
    x, y = start
    while True:
        if not maze.in_bounds(x, y) or (x, y) in seen:
            return CascadeResult(path, Outcome.STUCK)
        seen.add((x, y))
        path.append((x, y))
        if (x, y) == maze.exit:
            return CascadeResult(path, Outcome.WON)
        x, y = maze.cell(x, y).target()


@dataclass
class GameState:
    """One player's in-progress cascade on their own copy of the maze.

    The player first ``begin``s on the start cell, then ``step``s to follow the
    arrows. ``active_path`` is the chain revealed so far; cells are marked active
    on the maze for rendering.
    """

    maze: Maze
    active_path: list[tuple[int, int]] = field(default_factory=list)
    outcome: Outcome = Outcome.RUNNING
    _seen: set[tuple[int, int]] = field(default_factory=set)
    _cursor: tuple[int, int] | None = None

    def begin(self, start: tuple[int, int] | None = None) -> None:
        """Start the cascade on ``start`` (defaults to the maze start)."""
        self.maze.reset_active()
        self.active_path.clear()
        self._seen.clear()
        self.outcome = Outcome.RUNNING
        self._cursor = start if start is not None else self.maze.start
        self._enter(self._cursor)

    def step(self) -> Outcome:
        """Advance the cascade by one cell. Returns the new outcome.

        No-op once the cascade has ended."""
        if self.outcome is not Outcome.RUNNING or self._cursor is None:
            return self.outcome
        nx, ny = self.maze.cell(*self._cursor).target()
        if not self.maze.in_bounds(nx, ny) or (nx, ny) in self._seen:
            self.outcome = Outcome.STUCK
            return self.outcome
        self._cursor = (nx, ny)
        self._enter(self._cursor)
        return self.outcome

    def run(self) -> Outcome:
        """Step until the cascade ends (no animation)."""
        while self.outcome is Outcome.RUNNING:
            self.step()
        return self.outcome

    @property
    def reached(self) -> int:
        """How many cells the cascade has opened — the race progress metric."""
        return len(self.active_path)

    def _enter(self, cell: tuple[int, int]) -> None:
        self._seen.add(cell)
        self.active_path.append(cell)
        self.maze.cell(*cell).active = True
        if cell == self.maze.exit:
            self.outcome = Outcome.WON
