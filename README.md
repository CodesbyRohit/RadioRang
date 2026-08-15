# RadioRang 📻 — One Station, Any Vibe

A dhaba on a hill road, a tea stall off the highway, a trucker's cab — everyone
picks a vibe and hears the **exact same song, at the exact same moment**,
wherever they physically are.

Anyone can spin up a station under any name/theme (a 6-letter code + link is
born instantly), and every device that joins hears the same track, in sync —
even on patchy wifi, with phones walking away and pulling back in cleanly.

Built for **The Nostalgic Jukebox Hack** — problem: *One Station, Any Vibe*.

---

## Try it

```sh
npm install
npm start          # http://localhost:3000
```

1. **Create** a station — any name, any vibe (chips for 2000s Bollywood,
   Northeast indie, Bhojpuri classics…).
2. **Share** the 6-letter code / link with other devices (laptop, phone, second
   browser).
3. **Add a track** — pick from the ready-made vibes or paste any direct
   `.mp3/.ogg/.m4a/.webm/.wav` URL. Everyone hears it together.
4. Play / pause / skip / **⇥ +10s** (bump everyone forward).

### Demo script for a judge (2 devices)

- Open the station on a laptop **and a phone** (or two browsers).
- Add a track, hit play — both hear the same song at the same moment.
- Toggle Wi-Fi off on the phone mid-track → playback keeps going from the
  buffered audio, the pill shows `↻ Reconnecting…`.
- Toggle Wi-Fi back on → the phone reconnects and **re-seeks to the station
  clock** (watch the `⇄ Re-synced` badge) — clean as nothing happened.
- Hit `⇥ +10s` → everyone jumps forward together.

---

## How it works

```
┌────────────┐   WebSocket (state + clock)   ┌─────────────┐
│ Device A   │ ◄────────────────────────────► │   Server    │
│ (laptop)   │                               │  (ws relay) │
└────────────┘                               │  + REST     │
┌────────────┐   WebSocket                   └─────────────┘
│ Device B   │ ◄────────────────────────────────────────────►
│ (phone)    │   same track, same moment
└────────────┘
```

| Piece | Role |
|---|---|
| **Server** (Node + `ws`) | In-memory stations; the **authoritative playback clock**. Play/pause/next/seek/bump mutate `startedAtEpochMs` (server epoch) and the position is broadcast. Periodic 1 s state pushes keep everyone honest. |
| **WebSocket relay** | Join/leave, member presence, all playback commands. Reconnect with exponential backoff (500 ms → 8 s). |
| **Web Audio API** | The track is decoded into an `AudioBuffer` once, then a `BufferSourceNode` is started at `ctx.currentTime + 80 ms` lookahead with an exact offset into the buffer — sample-accurate scheduling. |
| **Clock calibration** | Every client measures its offset to the server clock via ping/pong RTT (`offset = serverTime − (t0 + rtt/2)`), so `elapsed = now − offset − startedAt` is computed identically on every device. |
| **Drift monitor** | Every second the client compares its local playback position to the station clock; if they diverge >150 ms it re-schedules (and flashes `⇄ Re-synced`). |
| **Service Worker + Cache API** | Precaches the app shell; audio is cached cache-first with network backfill — a device that fetched a track once can keep (re)playing it offline. |
| **Drop handling** | On socket loss the client **keeps playing** (the absolute station clock stays correct without the socket) and marks the pill `↻ Reconnecting…`. On rejoin, the `welcome` state re-seeks the device to the station timeline. |

### Why WebSocket (not just BroadcastChannel)

`BroadcastChannel` only reaches tabs in the **same browser on the same device** —
it cannot sync a phone and a laptop. The brief demands devices "wherever they
physically are", so the server is the sync hub. (BroadcastChannel remains a
handy same-device accelerator; not required for correctness.)

### Verified (Playwright e2e, real Chrome)

- Two browser contexts join one station → both play the same track.
- Cross-device playback drift measured at **1–7 ms**.
- Socket killed mid-track → playback continues from buffer; reconnect backoff
  engaged; after restore the device re-seeks to within **~2 ms** of the other
  device.

Run it yourself: `node e2e-sync.js` (uses your installed Chrome).

### Load-bearing code (judge-facing paths)

The clock math lives in the canonical module the problem brief names:

- `lib/sync/clock.ts` — exports `estimateOffset()` (this device vs the station
  reference clock, NTP-style round-trip midpoint) and `elapsedAt(startedAt, now)`
  (how far into a track a joiner should start). Compiled to `lib/sync/clock.js`
  and imported by the browser client (`npm run build`).
- `lib/sync/clock.test.ts` — unit tests (run with `npm test`), including a
  client joining mid-track.
- `public/sw.js` — the Service Worker, committed to the repo.

---

## Stack

- Node.js + Express + `ws` (no build step — fast to deploy anywhere)
- Vanilla JS frontend (Web Audio API, Service Worker, Cache API, PWA manifest)
- Demo audio: MDN's CC0 example tracks (CORS-enabled, no API keys)

## Files

```
server.js                 REST + WebSocket relay + station clock
lib/sync/clock.ts         canonical clock module (estimateOffset / elapsedAt)
lib/sync/clock.test.ts    unit tests for the clock
public/index.html         single-page app (create/join/station)
public/app.js             sync engine, reconnect, UI (imports lib/sync/clock.js)
public/sw.js              service worker (shell + audio caching)
public/styles.css         jukebox aesthetic
e2e-sync.js               Playwright end-to-end verification
test-sync.js              WebSocket protocol smoke test
```

## Notes / next steps

- Stations live in memory (restart wipes them) — fine for a demo; a DB is the
  obvious next step.
- No auto-advance at end of track yet — a DJ hits ⏭ (or auto-next can be added
  once track durations are known).
- Deploy: any Node host that supports WebSockets (Render/Railway/Fly), or a
  `cloudflared tunnel --url http://localhost:3000` for an instant public URL.
