// Multiplayer rooms over Supabase Realtime — no dedicated server.
//
// A room is a Realtime channel named `room:CODE`. Presence tracks the roster
// (who is here, ready state, progress). Broadcast carries game events (start,
// won). The room creator is the host and is the only one who picks the seed and
// fires `start`, so all clients build the identical maze.
//
// The caller passes an `on` map of callbacks: { roster, start, rival, over }.

import { supabase, configured } from "./config.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O0I1
const CODE_LEN = 4;
const MAZE_SIZE = 10;

export function newCode() {
  let s = "";
  const a = crypto.getRandomValues(new Uint32Array(CODE_LEN));
  for (let i = 0; i < CODE_LEN; i++) s += CODE_ALPHABET[a[i] % CODE_ALPHABET.length];
  return s;
}

export class Room {
  constructor({ name, code, isHost, on }) {
    this.name = name || "player";
    this.code = code;
    this.isHost = isHost;
    this.on = on; // { roster, start, rival, over }
    this.id = crypto.randomUUID();
    this.ready = false;
    this.channel = null;
    this.started = false;
    this.decided = false;
  }

  static async create(name, on) {
    const room = new Room({ name, code: newCode(), isHost: true, on });
    await room._subscribe();
    return room;
  }

  static async join(name, code, on) {
    const room = new Room({ name, code: code.toUpperCase(), isHost: false, on });
    await room._subscribe();
    return room;
  }

  async _subscribe() {
    if (!configured) {
      // Local-only fallback: no network. Report a solo roster so the UI works.
      this.on.roster?.([{ id: this.id, name: this.name, ready: false, reached: 0 }]);
      return;
    }
    this.channel = supabase.channel(`room:${this.code}`, {
      config: { presence: { key: this.id } },
    });

    this.channel
      .on("presence", { event: "sync" }, () => this._emitRoster())
      .on("broadcast", { event: "start" }, ({ payload }) => this._onStart(payload))
      .on("broadcast", { event: "rival" }, ({ payload }) => {
        if (payload.id !== this.id) this.on.rival?.(payload);
      })
      .on("broadcast", { event: "over" }, ({ payload }) => this._onOver(payload));

    await new Promise((resolve) => {
      this.channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await this.channel.track({
            id: this.id,
            name: this.name,
            ready: false,
            reached: 0,
          });
          resolve();
        }
      });
    });
  }

  _roster() {
    if (!this.channel) return [{ id: this.id, name: this.name, ready: this.ready, reached: 0 }];
    const state = this.channel.presenceState();
    // presenceState: key -> array of metas; take the latest meta per key
    return Object.values(state)
      .map((metas) => metas[metas.length - 1])
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  _emitRoster() {
    const roster = this._roster();
    this.on.roster?.(roster);
    // Host decides when to start: >=2 players and all ready.
    if (
      this.isHost &&
      !this.started &&
      roster.length >= 2 &&
      roster.every((p) => p.ready)
    ) {
      this._fireStart();
    }
  }

  async setReady() {
    this.ready = true;
    if (this.channel) {
      await this.channel.track({ id: this.id, name: this.name, ready: true, reached: 0 });
    } else {
      this.on.roster?.([{ id: this.id, name: this.name, ready: true, reached: 0 }]);
    }
  }

  async _fireStart() {
    this.started = true;
    const seed = Math.floor(Math.random() * 2 ** 31);
    const payload = { seed, size: MAZE_SIZE };
    await this.channel.send({ type: "broadcast", event: "start", payload });
    this._onStart(payload); // host also starts locally
  }

  _onStart(payload) {
    if (this.started && !this.isHost) return; // ignore dup
    this.started = true;
    this.on.start?.(payload);
  }

  async progress(reached) {
    if (!this.channel) return;
    await this.channel.send({
      type: "broadcast",
      event: "rival",
      payload: { id: this.id, name: this.name, reached },
    });
  }

  async claimWin(solveMs) {
    if (this.decided) return;
    const payload = { id: this.id, name: this.name, ms: solveMs };
    if (this.channel) {
      await this.channel.send({ type: "broadcast", event: "over", payload });
    }
    this._onOver(payload);
  }

  _onOver(payload) {
    if (this.decided) return; // first claim wins
    this.decided = true;
    this.on.over?.(payload);
  }

  async leave() {
    if (this.channel) await supabase.removeChannel(this.channel);
  }
}
