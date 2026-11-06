"""WebSocket server: invite-code rooms, seed-synced races.

Run: ``python -m server.server [host] [port]``  (default 0.0.0.0:8765)

One asyncio event loop. Each connection runs ``_handle`` which reads messages
and mutates the player's room. Rooms live in a process-wide dict keyed by code.
No threads, no locks — all mutation happens on the single loop.
"""

from __future__ import annotations

import asyncio
import sys

import websockets

from . import protocol
from .room import Room, new_code

# code -> Room, and websocket -> (room_code, player_id)
_rooms: dict[str, Room] = {}
_conns: dict[object, tuple[str, str]] = {}
# room_code -> set of websockets, so we can broadcast to a room
_members: dict[str, set] = {}


async def _send(ws, msg_type: str, **fields) -> None:
    try:
        await ws.send(protocol.encode(msg_type, **fields))
    except websockets.ConnectionClosed:
        pass


async def _broadcast(code: str, msg_type: str, **fields) -> None:
    for ws in list(_members.get(code, ())):
        await _send(ws, msg_type, **fields)


async def _handle(ws) -> None:
    try:
        async for raw in ws:
            try:
                msg = protocol.decode(raw)
            except ValueError:
                await _send(ws, "error", msg="malformed message")
                continue
            await _dispatch(ws, msg)
    finally:
        await _leave(ws)


async def _dispatch(ws, msg: dict) -> None:
    kind = msg["t"]
    if kind == "create":
        await _create(ws, msg.get("name", ""))
    elif kind == "join":
        await _join(ws, msg.get("code", "").upper(), msg.get("name", ""))
    elif kind == "ready":
        await _ready(ws)
    elif kind == "progress":
        await _progress(ws, int(msg.get("reached", 0)))
    elif kind == "won":
        await _won(ws)
    else:
        await _send(ws, "error", msg=f"unknown type {kind}")


async def _create(ws, name: str) -> None:
    code = new_code()
    while code in _rooms:  # astronomically unlikely, but cheap to guard
        code = new_code()
    room = Room.create(code)
    _rooms[code] = room
    _members[code] = set()
    await _attach(ws, room, name)


async def _join(ws, code: str, name: str) -> None:
    room = _rooms.get(code)
    if room is None:
        await _send(ws, "error", msg="no room with that code")
        return
    if room.phase.value != "lobby":
        await _send(ws, "error", msg="race already started")
        return
    await _attach(ws, room, name)


async def _attach(ws, room: Room, name: str) -> None:
    player = room.add_player(name)
    _conns[ws] = (room.code, player.id)
    _members[room.code].add(ws)
    await _send(ws, "room", code=room.code, you=player.id, players=room.roster())
    await _broadcast(room.code, "lobby", players=room.roster())


async def _ready(ws) -> None:
    ref = _conns.get(ws)
    if not ref:
        return
    code, player_id = ref
    room = _rooms.get(code)
    if room is None:
        return
    start_now = room.set_ready(player_id)
    await _broadcast(code, "lobby", players=room.roster())
    if start_now:
        room.start()
        await _broadcast(code, "start", seed=room.seed, size=room.size)


async def _progress(ws, reached: int) -> None:
    ref = _conns.get(ws)
    if not ref:
        return
    code, player_id = ref
    room = _rooms.get(code)
    if room is None:
        return
    room.record_progress(player_id, reached)
    await _broadcast(code, "rival", player=player_id, reached=reached)


async def _won(ws) -> None:
    ref = _conns.get(ws)
    if not ref:
        return
    code, player_id = ref
    room = _rooms.get(code)
    if room is None:
        return
    if room.claim_win(player_id):
        name = room.players[player_id].name
        await _broadcast(code, "over", winner=player_id, name=name)


async def _leave(ws) -> None:
    ref = _conns.pop(ws, None)
    if not ref:
        return
    code, player_id = ref
    _members.get(code, set()).discard(ws)
    room = _rooms.get(code)
    if room is None:
        return
    room.remove_player(player_id)
    if room.empty():
        _rooms.pop(code, None)
        _members.pop(code, None)
    else:
        await _broadcast(code, "lobby", players=room.roster())


async def serve(host: str = "0.0.0.0", port: int = 8765) -> None:
    async with websockets.serve(_handle, host, port):
        print(f"xmaze server on ws://{host}:{port}")
        await asyncio.Future()  # run forever


def main() -> None:
    host = sys.argv[1] if len(sys.argv) > 1 else "0.0.0.0"
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8765
    try:
        asyncio.run(serve(host, port))
    except KeyboardInterrupt:
        print("\nshutting down")


if __name__ == "__main__":
    main()
