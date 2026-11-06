"""Room = one match, addressed by a short invite code (like an iMessage game).

A host creates a room and shares the code; others join with it. When everyone is
ready the room picks one random seed and broadcasts ``start`` so all clients
build the identical maze. First player to claim the exit wins.

This module is transport-agnostic: it holds state and decides what to broadcast,
but does not touch sockets. ``server.py`` wires it to WebSockets.
"""

from __future__ import annotations

import random
import secrets
import string
from dataclasses import dataclass, field
from enum import Enum

CODE_ALPHABET = string.ascii_uppercase + string.digits
CODE_LEN = 4
MAZE_SIZE = 10


class Phase(Enum):
    LOBBY = "lobby"
    RACING = "racing"
    DONE = "done"


@dataclass
class Player:
    id: str
    name: str
    ready: bool = False
    reached: int = 0


def new_code() -> str:
    # Avoid 0/O/1/I confusion for codes people read aloud.
    alphabet = "".join(c for c in CODE_ALPHABET if c not in "O0I1")
    return "".join(secrets.choice(alphabet) for _ in range(CODE_LEN))


@dataclass
class Room:
    code: str
    seed: int
    size: int = MAZE_SIZE
    phase: Phase = Phase.LOBBY
    players: dict[str, Player] = field(default_factory=dict)
    winner: str | None = None

    @classmethod
    def create(cls, code: str) -> "Room":
        return cls(code=code, seed=random.randrange(1, 2**31))

    def add_player(self, name: str) -> Player:
        player = Player(id=secrets.token_hex(4), name=name or "player")
        self.players[player.id] = player
        return player

    def remove_player(self, player_id: str) -> None:
        self.players.pop(player_id, None)

    def roster(self) -> list[dict]:
        return [
            {"id": p.id, "name": p.name, "ready": p.ready, "reached": p.reached}
            for p in self.players.values()
        ]

    def set_ready(self, player_id: str) -> bool:
        """Mark ready. Return True if the race should now start."""
        if player_id in self.players:
            self.players[player_id].ready = True
        return self.should_start()

    def should_start(self) -> bool:
        return (
            self.phase is Phase.LOBBY
            and len(self.players) >= 2
            and all(p.ready for p in self.players.values())
        )

    def start(self) -> None:
        self.phase = Phase.RACING

    def record_progress(self, player_id: str, reached: int) -> None:
        if player_id in self.players:
            self.players[player_id].reached = reached

    def claim_win(self, player_id: str) -> bool:
        """First valid claim wins. Return True if this claim took the win."""
        if self.phase is Phase.RACING and player_id in self.players:
            self.phase = Phase.DONE
            self.winner = player_id
            return True
        return False

    def empty(self) -> bool:
        return not self.players
