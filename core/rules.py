"""Game rules: move validation and win/stuck queries over a cascade.

Thin layer on top of ``sim`` so the server and client agree on what a legal
move is and when a player has won, without duplicating logic.
"""

from __future__ import annotations

from .maze import Maze
from .sim import GameState, Outcome, cascade


def valid_start(maze: Maze, cell: tuple[int, int]) -> bool:
    """A cascade may only be started on an in-bounds cell. For this race the
    only meaningful start is the maze start, but we keep it general."""
    return maze.in_bounds(*cell)


def has_won(state: GameState) -> bool:
    return state.outcome is Outcome.WON


def is_stuck(state: GameState) -> bool:
    return state.outcome is Outcome.STUCK


def solves(maze: Maze, start: tuple[int, int]) -> bool:
    """Would starting the cascade on ``start`` reach the exit?"""
    return cascade(maze, start).won
