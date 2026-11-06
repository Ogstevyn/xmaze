"""Wire protocol: JSON messages over a WebSocket text channel.

Every message is a JSON object with a ``t`` (type) field. Helpers below keep
type strings in one place so client and server never drift.

Client -> server
  {"t":"create", "name": str}                 make a new room, become host
  {"t":"join",   "code": str, "name": str}    join an existing room by invite code
  {"t":"ready"}                               mark yourself ready in the lobby
  {"t":"progress", "reached": int}            report cascade progress
  {"t":"won"}                                 claim you reached the exit

Server -> client
  {"t":"room",   "code": str, "you": id, "players": [...]}   joined/created
  {"t":"lobby",  "players": [...]}            lobby roster changed
  {"t":"start",  "seed": int, "size": int}    race begins (build maze from seed)
  {"t":"rival",  "player": id, "reached": int}  an opponent's progress
  {"t":"over",   "winner": id, "name": str}   someone won
  {"t":"error",  "msg": str}                  bad request (e.g. unknown code)
"""

from __future__ import annotations

import json


def encode(msg_type: str, **fields) -> str:
    fields["t"] = msg_type
    return json.dumps(fields)


def decode(raw: str | bytes) -> dict:
    data = json.loads(raw)
    if not isinstance(data, dict) or "t" not in data:
        raise ValueError("malformed message")
    return data
