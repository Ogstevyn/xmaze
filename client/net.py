"""Threaded WebSocket client bridge for the pygame (synchronous) loop.

The asyncio websocket runs on its own thread. The pygame loop talks to it
through two thread-safe queues: ``inbox`` (decoded server messages) and an
internal send queue. Poll ``poll()`` each frame; call ``send()`` to transmit.
"""

from __future__ import annotations

import asyncio
import queue
import threading

import websockets

from server import protocol


class NetClient:
    def __init__(self, url: str):
        self.url = url
        self.inbox: "queue.Queue[dict]" = queue.Queue()
        self._outbox: "queue.Queue[str]" = queue.Queue()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._ws = None
        self.connected = threading.Event()
        self.failed: str | None = None
        self._thread = threading.Thread(target=self._run, daemon=True)

    def start(self) -> None:
        self._thread.start()

    def send(self, msg_type: str, **fields) -> None:
        self._outbox.put(protocol.encode(msg_type, **fields))

    def poll(self) -> list[dict]:
        """Return all messages received since the last poll."""
        out = []
        try:
            while True:
                out.append(self.inbox.get_nowait())
        except queue.Empty:
            pass
        return out

    # -- background thread --------------------------------------------------

    def _run(self) -> None:
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        try:
            self._loop.run_until_complete(self._main())
        except Exception as exc:  # surface connection errors to the UI
            self.failed = str(exc)
            self.inbox.put({"t": "error", "msg": f"connection failed: {exc}"})

    async def _main(self) -> None:
        async with websockets.connect(self.url) as ws:
            self._ws = ws
            self.connected.set()
            await asyncio.gather(self._reader(ws), self._writer(ws))

    async def _reader(self, ws) -> None:
        async for raw in ws:
            try:
                self.inbox.put(protocol.decode(raw))
            except ValueError:
                pass

    async def _writer(self, ws) -> None:
        while True:
            # drain the thread-safe outbox without blocking the event loop
            try:
                payload = self._outbox.get_nowait()
            except queue.Empty:
                await asyncio.sleep(0.02)
                continue
            await ws.send(payload)
