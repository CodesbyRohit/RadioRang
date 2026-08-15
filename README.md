# RadioRang — One Station, Any Vibe

A dhaba on a hill road, a tea stall off the highway, a trucker's cab — different
places, same old craving: everyone picks a vibe and, for a while, hears the
exact same song at the exact same moment.

RadioRang lets anyone spin up a station under **any name or theme**, and every
device that joins hears the **same track, in sync** — even on patchy wifi, and
pulling back in cleanly after a drop. There is no fixed list of venues or
themes; the platform is whatever you name it.

Built for **The Nostalgic Jukebox Hack** (problem: *One Station, Any Vibe*).

---

## Core synchronization architecture

The server owns an **authoritative playback clock**. Clients never drift
independently — they schedule playback against the server's timeline:

1. **Station state lives on the server** (in-memory): queue, queue index,
   `playing`, and `startedAtEpochMs` (server epoch when the current track
   began). Every client receives `state` pushes whenever anything changes.

2. **Clock calibration** (`lib/sync/clock.ts`, the canonical module):
   - `estimateOffset()` computes the client↔server clock offset from a
     ping/pong RTT pair, halving the round-trip to cancel latency.
   - `elapsedAt(startedAtEpochMs, nowMs)` turns the server timeline into
     "seconds into the current track" on this device.
   - Unit tests: `lib/sync/clock.test.ts` (`npm test`).

3. **Web Audio API scheduling**: each client decodes the track and starts its
   `AudioBufferSourceNode` at an **80 ms lookahead**, offset to the server
   timeline position. A drift monitor re-checks every second and re-seeks when
   a device falls more than ~150 ms off the station clock.

4. **Transport**: WebSocket relay (`ws`) for station state + clock pings. A
   Service Worker + Cache API cache the audio, so when the socket (or the
   whole network) drops, **playback continues from the buffer**; on reconnect
   the client re-seeks to the station clock. The clock is absolute epoch time,
   so playback never depends on a live socket.

5. **Presence**: members are tracked server-side with heartbeats; the member
   list and count update for everyone.

### Files

| Path | Role |
|---|---|
| `server.js` | Node HTTP + WebSocket server, station store, curated playlist API |
| `lib/sync/clock.ts` | Clock offset estimation + elapsed-time math (judge-fixed path) |
| `lib/sync/clock.test.ts` | Unit tests for the clock module |
| `public/app.js` | Client: sync engine, router (`/station/<code>`), UI |
| `public/sw.js` | Service worker: shell + audio caching, offline resilience |
| `public/data/azaadi.js` | "Sounds of Azaadi" song data (links only — no audio) |
| `scripts/gen-config.js` | Build-time config generator (env → `public/rr-config.js`) |

---

## Run locally

```bash
npm install
npm run build     # compiles clock.ts + generates public/rr-config.js
npm start         # http://localhost:3000
```

Same-origin mode needs **no environment variables** — the Node server serves
the frontend and the WebSocket on one port.

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `PORT` | Node server | Listen port (default `3000`) |
| `RR_ALLOWED_ORIGINS` | Node server | Comma-separated origins allowed cross-origin (set when the frontend is hosted separately) |
| `RR_CSP` | Node server | Override the Content-Security-Policy header |
| `RR_API_BASE` | Build-time (frontend) | Base URL of the realtime server's HTTP API; empty = same origin |
| `RR_WS_BASE` | Build-time (frontend) | Base URL of the WebSocket relay (`wss://…`); empty = same origin |
| `PUBLIC_ORIGIN` | Build-time (frontend) | Public origin of the frontend, used for canonical/share metadata; falls back to the browser's origin |

None of these are secrets. `RR_API_BASE`/`RR_WS_BASE`/`PUBLIC_ORIGIN` are
injected into `public/rr-config.js` (`window.RR_CONFIG`) at build time by
`scripts/gen-config.js` — never put API keys in them. See `.env.example`.

## Tests & build

```bash
npm test          # clock module unit tests (node --test)
npm run build     # tsc clock.ts + gen-config (rr-config.js + public/lib copy)
npm run e2e       # browser E2E: cross-device sync + Sounds of Azaadi (needs local Chrome)
```

E2E details:
- `e2e-sync.js` — two browser contexts join one station; measures cross-device
  drift, kills one device's socket mid-track (playback must continue), then
  brings it back (must reconnect + re-seek). Measured drift: **1–9 ms** steady
  state, ~1 ms after re-seek.
- `e2e-azaadi.js` — all 8 song cards render, platform actions present, official
  Spotify embeds load, zero console errors.
- `e2e-links.js` — verifies every JioSaavn/Gaana URL resolves to the real song
  page (Spotify IDs are verified via the official oEmbed endpoint).
- `e2e-routing.js` — direct navigation, refresh, back/forward, malformed and
  nonexistent station codes, share-link origin, member-count pill.

## Deployment architecture (important)

**Vercel cannot run this WebSocket server.** RadioRang's realtime component is
a long-lived Node process with a server-authoritative clock; Vercel is
serverless and does not host persistent WebSocket servers. This is an
architectural fact, not a configuration gap.

The supported production split:

| Component | Where it runs |
|---|---|
| **Static frontend** (`public/`) | **Vercel** — `vercel.json` (build `npm run build`, output `public/`, rewrites for `/station/<code>`, security headers) |
| **Realtime server** (`server.js`) | An always-on WebSocket-capable host — a small VPS, Fly.io, Railway, Render, or a DigitalOcean droplet |

To wire them together, set Vercel project env vars so the build injects them
into `rr-config.js`:

```
RR_API_BASE = https://rr-api.yourhost.com
RR_WS_BASE  = wss://rr-api.yourhost.com
PUBLIC_ORIGIN = https://your-app.vercel.app
```

…and on the realtime host, allowlist the frontend origin:

```
RR_ALLOWED_ORIGINS = https://your-app.vercel.app
```

**Same-origin alternative**: skip Vercel and run the whole app on a single
always-on host (`npm run build && npm start`) — the Node server serves the
frontend and socket on one port. That is exactly how the live demo runs.

`vercel.json` is included so the static side is one `vercel` command away, but
deploying only the static half **without a realtime server leaves the app
non-functional** (create/join and playback need the WebSocket relay). Verify
your realtime endpoint with the E2E suite before calling a split deployment
done.

## Sounds of Azaadi

A curated shelf of 8 historically and culturally significant Indian patriotic
songs (Vande Mataram, Maa Tujhe Salaam, Bharat Humko Jaan Se Pyara Hai, Yeh Jo
Des Hai Tera, Aye Mere Watan Ke Logo, Sandese Aate Hain, Mera Rang De Basanti,
Ae Watan). Copyright-safe by design:

- **No audio is downloaded, rehosted, or redistributed** — no audio files in
  the repo.
- Spotify playback uses **Spotify's official embed mechanism**
  (`open.spotify.com/embed/track/<id>`), lazy-loaded; every track ID was
  verified against Spotify's public oEmbed endpoint.
- JioSaavn/Gaana buttons link to the official song pages (verified in a
  browser). Where no valid link exists, the button is **omitted** — never
  replaced with a guessed URL.
- Playback is always user-initiated and platform-controlled.

## Known limitations

- **Stations are in-memory**: a server restart wipes all stations, queues, and
  members. Fine for the demo window; a production version would add persistence
  (and, if desired, per-station auth).
- The **tunnel URL** used for live demos is temporary and changes — never
  hardcode it; `rr-config.js` is generated from env vars.
- The CSP allows arbitrary `https` audio/WebSocket endpoints by design, because
  station creators may paste any direct audio URL. Tighten with `RR_CSP` if you
  want to restrict it.
- Audio is fetched with `fetch()` (needs CORS on the audio host). The curated
  demo tracks all send `Access-Control-Allow-Origin: *`.

## Security notes

- No secrets in client code; config file is public URLs only.
- All user input (station names, themes, track titles, member names) is escaped
  or set via `textContent` before rendering — no HTML injection.
- Station codes are validated client- and server-side (6 chars, `[A-Z0-9]`).
- Track URLs are validated server-side against an allowlist of audio
  extensions.
- WebSocket connections are origin-checked when `RR_ALLOWED_ORIGINS` is set.
