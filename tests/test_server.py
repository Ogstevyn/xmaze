"""End-to-end: start the server, connect two clients, run a full race.

Exercises create -> join -> ready -> start (seed sync) -> won -> over.
"""

import asyncio

import pytest
import websockets

from server import protocol, server
from server.room import Room, new_code


# -- unit: room state machine ---------------------------------------------

def test_new_code_shape():
    code = new_code()
    assert len(code) == 4
    assert all(c not in "O0I1" for c in code)


def test_room_start_requires_two_ready():
    room = Room.create("TEST")
    a = room.add_player("a")
    assert not room.set_ready(a.id)  # only one player
    b = room.add_player("b")
    assert not room.should_start()   # b not ready
    assert room.set_ready(b.id)      # both ready now


def test_room_first_win_locks():
    room = Room.create("TEST")
    a = room.add_player("a")
    b = room.add_player("b")
    room.start()
    assert room.claim_win(a.id)
    assert not room.claim_win(b.id)  # already decided
    assert room.winner == a.id


# -- integration over a real websocket -------------------------------------

async def _recv_until(ws, kind, timeout=2.0):
    async with asyncio.timeout(timeout):
        while True:
            msg = protocol.decode(await ws.recv())
            if msg["t"] == kind:
                return msg


@pytest.mark.asyncio
async def test_two_client_race():
    async with websockets.serve(server._handle, "localhost", 0) as srv:
        port = srv.sockets[0].getsockname()[1]
        url = f"ws://localhost:{port}"

        async with websockets.connect(url) as host, websockets.connect(url) as guest:
            # host creates, learns the code
            await host.send(protocol.encode("create", name="host"))
            room = await _recv_until(host, "room")
            code = room["code"]

            # guest joins by code
            await guest.send(protocol.encode("join", code=code, name="guest"))
            await _recv_until(guest, "room")

            # both ready -> both get identical start seed
            await host.send(protocol.encode("ready"))
            await guest.send(protocol.encode("ready"))
            s_host = await _recv_until(host, "start")
            s_guest = await _recv_until(guest, "start")
            assert s_host["seed"] == s_guest["seed"]

            # host wins; both see 'over' naming the host
            await host.send(protocol.encode("won"))
            over_host = await _recv_until(host, "over")
            over_guest = await _recv_until(guest, "over")
            assert over_host["name"] == "host"
            assert over_guest["winner"] == over_host["winner"]


@pytest.mark.asyncio
async def test_join_bad_code_errors():
    async with websockets.serve(server._handle, "localhost", 0) as srv:
        port = srv.sockets[0].getsockname()[1]
        async with websockets.connect(f"ws://localhost:{port}") as ws:
            await ws.send(protocol.encode("join", code="ZZZZ", name="x"))
            err = await _recv_until(ws, "error")
            assert "no room" in err["msg"]
