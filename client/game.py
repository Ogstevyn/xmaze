"""Local single-player loop: generate a maze, trigger the cascade, watch the
chain open to the exit. Run with ``python -m client.game [seed] [size]``.

Controls:
  click a tile  start the cascade there (the chain opens one arrow at a time)
  R             new maze (next seed)
  M             toggle music
  Esc / close   quit
"""

from __future__ import annotations

import sys

import pygame

from core.maze import generate
from core.sim import GameState, Outcome
from . import audio, render, theme

_STEP_MS = 110  # delay between cascade steps (chain animation speed)


class LocalGame:
    def __init__(self, seed: int = 1, size: int = 10):
        self.size = size
        self.seed = seed
        self.font = pygame.font.SysFont("georgia", 22)
        self.small = pygame.font.SysFont("georgia", 16)
        self._new_maze(seed)
        w, h = render.board_pixel_size(self.maze)
        self.screen = pygame.display.set_mode((w, h))
        pygame.display.set_caption("xmaze")
        self._last_step = 0

    def _new_maze(self, seed: int) -> None:
        self.seed = seed
        self.maze = generate(self.size, self.size, seed=seed)
        self.state = GameState(self.maze)
        self.running_cascade = False

    def _cell_at(self, mx: int, my: int):
        gx = (mx - theme.MARGIN) // theme.CELL
        gy = (my - theme.MARGIN - theme.HUD_H) // theme.CELL
        if self.maze.in_bounds(gx, gy):
            return (gx, gy)
        return None

    def _begin(self, cell) -> None:
        self.state.begin(cell)
        self.running_cascade = self.state.outcome is Outcome.RUNNING
        self._last_step = pygame.time.get_ticks()

    def _draw_hud(self) -> None:
        title = self.font.render(f"xmaze  —  seed {self.seed}", True, theme.TEXT)
        self.screen.blit(title, (theme.MARGIN, 16))
        if self.state.outcome is Outcome.WON:
            msg, colour = "Solved!  R for next", theme.WIN
        elif self.state.outcome is Outcome.STUCK:
            msg, colour = "Stuck — try another start", theme.LOSE
        else:
            msg, colour = "Click a tile to open the chain", theme.TEXT_DIM
        self.screen.blit(self.small.render(msg, True, colour), (theme.MARGIN, 44))

    def run(self) -> None:
        clock = pygame.time.Clock()
        alive = True
        while alive:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    alive = False
                elif event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_ESCAPE:
                        alive = False
                    elif event.key == pygame.K_r:
                        self._new_maze(self.seed + 1)
                    elif event.key == pygame.K_m:
                        audio.toggle()
                elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    cell = self._cell_at(*event.pos)
                    if cell is not None:
                        self._begin(cell)

            now = pygame.time.get_ticks()
            if self.running_cascade and now - self._last_step >= _STEP_MS:
                self._last_step = now
                if self.state.step() is not Outcome.RUNNING:
                    self.running_cascade = False

            render.draw_board(self.screen, self.maze, self.state)
            self._draw_hud()
            pygame.display.flip()
            clock.tick(60)
        pygame.quit()


def main() -> None:
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    size = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    pygame.init()
    audio.init()
    LocalGame(seed=seed, size=size).run()


if __name__ == "__main__":
    main()
