"""Multiplayer client: invite-code rooms, iMessage-game-simple flow.

Screens: MENU -> (CREATE | JOIN) -> LOBBY -> RACE -> OVER.

Run: ``python -m client.mp [ws_url] [name]``
     default url ws://localhost:8765
"""

from __future__ import annotations

import sys

import pygame

from core.maze import generate
from core.sim import GameState, Outcome
from . import audio, render, theme
from .net import NetClient

_STEP_MS = 90
WIN_W, WIN_H = 460, 560


class Screen:
    MENU = "menu"
    JOIN = "join"
    LOBBY = "lobby"
    RACE = "race"
    OVER = "over"


class Button:
    def __init__(self, rect, label):
        self.rect = pygame.Rect(rect)
        self.label = label

    def hit(self, pos) -> bool:
        return self.rect.collidepoint(pos)

    def draw(self, surf, font):
        pygame.draw.rect(surf, theme.ARROW, self.rect, border_radius=10)
        txt = font.render(self.label, True, theme.BG)
        surf.blit(txt, txt.get_rect(center=self.rect.center))


class MultiplayerGame:
    def __init__(self, url: str, name: str):
        self.net = NetClient(url)
        self.net.start()
        self.name = name
        self.screen_id = Screen.MENU
        self.code = ""           # our room code
        self.join_buf = ""       # typed code on the JOIN screen
        self.you = None          # our player id
        self.players: list[dict] = []
        self.status = "Connecting..."
        self.maze = None
        self.state: GameState | None = None
        self.running_cascade = False
        self._last_step = 0
        self.winner_name = None
        self.last_reached_sent = 0

        self.screen = pygame.display.set_mode((WIN_W, WIN_H))
        pygame.display.set_caption("xmaze — multiplayer")
        self.big = pygame.font.SysFont("georgia", 30, bold=True)
        self.font = pygame.font.SysFont("georgia", 22)
        self.small = pygame.font.SysFont("georgia", 16)
        self.code_font = pygame.font.SysFont("consolas", 56, bold=True)

    # -- networking ---------------------------------------------------------

    def _pump_net(self) -> None:
        for msg in self.net.poll():
            self._on_message(msg)

    def _on_message(self, msg: dict) -> None:
        kind = msg["t"]
        if kind == "room":
            self.code = msg["code"]
            self.you = msg["you"]
            self.players = msg["players"]
            self.screen_id = Screen.LOBBY
            self.status = ""
        elif kind == "lobby":
            self.players = msg["players"]
        elif kind == "start":
            self._start_race(msg["seed"], msg["size"])
        elif kind == "rival":
            for p in self.players:
                if p["id"] == msg["player"]:
                    p["reached"] = msg["reached"]
        elif kind == "over":
            self.winner_name = msg["name"]
            self.screen_id = Screen.OVER
        elif kind == "error":
            self.status = msg["msg"]

    def _start_race(self, seed: int, size: int) -> None:
        self.maze = generate(size, size, seed=seed)
        self.state = GameState(self.maze)
        self.running_cascade = False
        self.last_reached_sent = 0
        self.screen_id = Screen.RACE
        # Resize window to fit the board.
        w, h = render.board_pixel_size(self.maze)
        self.screen = pygame.display.set_mode((w, h))

    # -- input --------------------------------------------------------------

    def _on_click(self, pos) -> None:
        if self.screen_id == Screen.MENU:
            if self._create_btn.hit(pos):
                self.net.send("create", name=self.name)
                self.status = "Creating room..."
            elif self._join_btn.hit(pos):
                self.screen_id = Screen.JOIN
                self.join_buf = ""
        elif self.screen_id == Screen.JOIN:
            if self._join_go.hit(pos) and len(self.join_buf) >= 1:
                self.net.send("join", code=self.join_buf, name=self.name)
        elif self.screen_id == Screen.LOBBY:
            if self._ready_btn.hit(pos):
                self.net.send("ready")
        elif self.screen_id == Screen.RACE and self.maze:
            cell = self._cell_at(pos)
            if cell is not None:
                self.state.begin(cell)
                self.running_cascade = self.state.outcome is Outcome.RUNNING
                self._last_step = pygame.time.get_ticks()

    def _on_key(self, event) -> None:
        if self.screen_id == Screen.JOIN:
            if event.key == pygame.K_RETURN and self.join_buf:
                self.net.send("join", code=self.join_buf, name=self.name)
            elif event.key == pygame.K_BACKSPACE:
                self.join_buf = self.join_buf[:-1]
            elif event.unicode.isalnum():
                self.join_buf = (self.join_buf + event.unicode.upper())[:4]
        if event.key == pygame.K_m:
            audio.toggle()

    def _cell_at(self, pos):
        mx, my = pos
        gx = (mx - theme.MARGIN) // theme.CELL
        gy = (my - theme.MARGIN - theme.HUD_H) // theme.CELL
        return (gx, gy) if self.maze.in_bounds(gx, gy) else None

    # -- per-screen drawing -------------------------------------------------

    def _draw_menu(self) -> None:
        self.screen.fill(theme.BG)
        self._title("xmaze")
        self._create_btn = Button((WIN_W // 2 - 110, 220, 220, 56), "Create game")
        self._join_btn = Button((WIN_W // 2 - 110, 300, 220, 56), "Join game")
        self._create_btn.draw(self.screen, self.font)
        self._join_btn.draw(self.screen, self.font)
        self._footer(self.status or "Share a code, race a friend")

    def _draw_join(self) -> None:
        self.screen.fill(theme.BG)
        self._title("Enter code")
        box = pygame.Rect(WIN_W // 2 - 140, 210, 280, 80)
        pygame.draw.rect(self.screen, theme.BG, box)
        pygame.draw.rect(self.screen, theme.ARROW, box, width=2, border_radius=10)
        shown = self.join_buf or "----"
        txt = self.code_font.render(shown, True, theme.TEXT)
        self.screen.blit(txt, txt.get_rect(center=box.center))
        self._join_go = Button((WIN_W // 2 - 90, 320, 180, 52), "Join")
        self._join_go.draw(self.screen, self.font)
        self._footer(self.status or "Type the 4-character code")

    def _draw_lobby(self) -> None:
        self.screen.fill(theme.BG)
        self._title("Invite code")
        code_txt = self.code_font.render(self.code, True, theme.EXIT)
        self.screen.blit(code_txt, code_txt.get_rect(center=(WIN_W // 2, 150)))
        y = 230
        for p in self.players:
            mark = "✓" if p["ready"] else "…"
            me = "  (you)" if p["id"] == self.you else ""
            line = self.font.render(f"{mark}  {p['name']}{me}", True, theme.TEXT)
            self.screen.blit(line, (WIN_W // 2 - 120, y))
            y += 34
        self._ready_btn = Button((WIN_W // 2 - 90, y + 20, 180, 52), "I'm ready")
        self._ready_btn.draw(self.screen, self.font)
        need = "Waiting for a second player..." if len(self.players) < 2 else \
            "Press ready to start"
        self._footer(self.status or need)

    def _draw_race(self) -> None:
        render.draw_board(self.screen, self.maze, self.state)
        # header: my status + rival progress
        if self.state.outcome is Outcome.WON:
            msg, colour = "You solved it!", theme.WIN
        elif self.state.outcome is Outcome.STUCK:
            msg, colour = "Stuck — click another start", theme.LOSE
        else:
            msg, colour = "Open the chain to the exit", theme.TEXT_DIM
        self.screen.blit(self.font.render(msg, True, colour), (theme.MARGIN, 14))
        rivals = [p for p in self.players if p["id"] != self.you]
        if rivals:
            r = rivals[0]
            self.screen.blit(
                self.small.render(f"{r['name']}: {r['reached']} tiles", True, theme.TEXT_DIM),
                (theme.MARGIN, 44),
            )

    def _draw_over(self) -> None:
        self.screen.fill(theme.BG)
        won = self.winner_name == self.name
        self._title("You win!" if won else "You lose")
        who = self.big.render(
            f"{self.winner_name} wins", True, theme.WIN if won else theme.LOSE
        )
        self.screen.blit(who, who.get_rect(center=(self.screen.get_width() // 2, 220)))
        self._footer("Close the window to exit")

    # -- helpers ------------------------------------------------------------

    def _title(self, text: str) -> None:
        t = self.big.render(text, True, theme.TEXT)
        self.screen.blit(t, t.get_rect(center=(self.screen.get_width() // 2, 90)))

    def _footer(self, text: str) -> None:
        t = self.small.render(text, True, theme.TEXT_DIM)
        self.screen.blit(t, t.get_rect(center=(self.screen.get_width() // 2,
                                               self.screen.get_height() - 36)))

    # -- main loop ----------------------------------------------------------

    def run(self) -> None:
        clock = pygame.time.Clock()
        alive = True
        while alive:
            self._pump_net()
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    alive = False
                elif event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_ESCAPE:
                        alive = False
                    else:
                        self._on_key(event)
                elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    self._on_click(event.pos)

            if self.screen_id == Screen.RACE and self.running_cascade:
                now = pygame.time.get_ticks()
                if now - self._last_step >= _STEP_MS:
                    self._last_step = now
                    outcome = self.state.step()
                    if self.state.reached != self.last_reached_sent:
                        self.net.send("progress", reached=self.state.reached)
                        self.last_reached_sent = self.state.reached
                    if outcome is Outcome.WON:
                        self.net.send("won")
                        self.running_cascade = False
                    elif outcome is Outcome.STUCK:
                        self.running_cascade = False

            self._draw_current()
            pygame.display.flip()
            clock.tick(60)
        pygame.quit()

    def _draw_current(self) -> None:
        {
            Screen.MENU: self._draw_menu,
            Screen.JOIN: self._draw_join,
            Screen.LOBBY: self._draw_lobby,
            Screen.RACE: self._draw_race,
            Screen.OVER: self._draw_over,
        }[self.screen_id]()


def main() -> None:
    url = sys.argv[1] if len(sys.argv) > 1 else "ws://localhost:8765"
    name = sys.argv[2] if len(sys.argv) > 2 else "player"
    pygame.init()
    audio.init()
    MultiplayerGame(url, name).run()


if __name__ == "__main__":
    main()
