"""Background music and sound effects.

If ``assets/music.*`` exists it is used. Otherwise a calm looping melody is
synthesised once into ``assets/music.wav`` so the game ships with music and no
binary asset in the repo. Audio is best-effort: if the mixer cannot init
(headless/CI), every call is a safe no-op.
"""

from __future__ import annotations

import math
import os
import struct
import wave

import pygame

_ASSET_DIR = os.path.join(os.path.dirname(__file__), "..", "assets")
_MUSIC_NAMES = ("music.ogg", "music.mp3", "music.wav")

_SAMPLE_RATE = 44100
_enabled = False


def init() -> bool:
    """Init the mixer and start looping background music. Returns success."""
    global _enabled
    try:
        pygame.mixer.init(frequency=_SAMPLE_RATE)
    except pygame.error:
        _enabled = False
        return False
    _enabled = True
    path = _find_or_make_music()
    try:
        pygame.mixer.music.load(path)
        pygame.mixer.music.set_volume(0.4)
        pygame.mixer.music.play(loops=-1)
    except pygame.error:
        pass
    return True


def toggle() -> None:
    """Pause/unpause music (e.g. bound to the M key)."""
    if not _enabled:
        return
    if pygame.mixer.music.get_busy():
        pygame.mixer.music.pause()
    else:
        pygame.mixer.music.unpause()


def _find_or_make_music() -> str:
    os.makedirs(_ASSET_DIR, exist_ok=True)
    for name in _MUSIC_NAMES:
        path = os.path.join(_ASSET_DIR, name)
        if os.path.exists(path):
            return path
    path = os.path.join(_ASSET_DIR, "music.wav")
    _synthesize_loop(path)
    return path


# A gentle 8-note pentatonic phrase (C major pentatonic), two octaves of calm.
_MELODY_HZ = [261.63, 329.63, 392.00, 440.00, 392.00, 329.63, 293.66, 261.63]
_NOTE_SECS = 0.5


def _synthesize_loop(path: str) -> None:
    """Write a short, seamlessly loopable WAV: a soft sine melody with a pad."""
    frames = bytearray()
    for note_hz in _MELODY_HZ:
        n = int(_SAMPLE_RATE * _NOTE_SECS)
        for i in range(n):
            t = i / _SAMPLE_RATE
            # envelope: fade in/out each note so the loop has no clicks
            env = math.sin(math.pi * i / n) ** 0.5
            melody = math.sin(2 * math.pi * note_hz * t)
            pad = 0.3 * math.sin(2 * math.pi * (note_hz / 2) * t)
            sample = 0.35 * env * (melody + pad)
            value = int(max(-1.0, min(1.0, sample)) * 32767)
            frames += struct.pack("<h", value)

    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(_SAMPLE_RATE)
        w.writeframes(bytes(frames))
