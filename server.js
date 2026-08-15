import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
// Production config (all optional):
//   PORT               — listen port
//   RR_ALLOWED_ORIGINS — comma-separated origins allowed to call the API/WS
//                        cross-origin (used when the frontend is hosted
//                        separately, e.g. on Vercel). Empty = allow any origin
//                        (fine for a demo; tighten in production).
const ALLOWED_ORIGINS = (process.env.RR_ALLOWED_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

/* ------------------------------------------------------------------ *
 *  Curated demo playlist (public-domain / free-to-use audio).
 *  Station creators can also add any direct .mp3/.ogg URL.
 * ------------------------------------------------------------------ */
const CURATED_TRACKS = [
  { url: 'https://mdn.github.io/webaudio-examples/audio-basics/outfoxing.mp3', title: 'Outfoxing the Fox', artist: 'Free demo audio', vibe: 'Retro Swing' },
  { url: 'https://mdn.github.io/webaudio-examples/audio-buffer-source-node/loop/rnb-lofi-melody-loop.wav', title: 'Lofi Chai Loop', artist: 'Free demo audio', vibe: 'Chai Break' },
  { url: 'https://mdn.github.io/webaudio-examples/audio-analyser/viper.mp3', title: 'Viper Groove', artist: 'Free demo audio', vibe: 'Highway Nights' },
  { url: 'https://mdn.github.io/webaudio-examples/multi-track/drums.mp3', title: "Drummer's Den", artist: 'Free demo audio', vibe: 'Studio Jam' },
  { url: 'https://mdn.github.io/webaudio-examples/multi-track/leadguitar.mp3', title: 'Lead Guitar Riff', artist: 'Free demo audio', vibe: 'Dhaba Retro' },
  { url: 'https://mdn.github.io/webaudio-examples/multi-track/bassguitar.mp3', title: 'Bass Line', artist: 'Free demo audio', vibe: 'Late Night' },
  { url: 'https://mdn.github.io/webaudio-examples/multi-track/clav.mp3', title: 'Clav Stab', artist: 'Free demo audio', vibe: 'Funk Corner' },
  { url: 'https://mdn.github.io/webaudio-examples/multi-track/horns.mp3', title: 'Horn Section', artist: 'Free demo audio', vibe: 'Wedding Band' },
];

const id = (prefix = '') => prefix + crypto.randomBytes(4).toString('hex');

/* ------------------------------------------------------------------ *
 *  In-memory station store
 * ------------------------------------------------------------------ */
const stations = new Map(); // code -> station

function makeStation(name, theme) {
  const code = id('').toUpperCase().slice(0, 6);
  const station = {
    code,
    name: name || 'Untitled Station',
    theme: theme || 'Any vibe',
    createdAt: Date.now(),
    queue: [],
    queueIndex: 0,
    playing: false,
    startedAtEpochMs: 0, // server epoch ms when the current play began
    positionMs: 0,       // frozen position while paused
    members: new Map(),  // ws-connection id -> { id, name, joinedAt, lastSeen }
  };
  stations.set(code, station);
  return station;
}

function publicState(station, serverTime = Date.now()) {
  const current = station.queue[station.queueIndex] || null;
  const elapsedMs = station.playing
    ? Math.max(0, serverTime - station.startedAtEpochMs)
    : station.positionMs;
  return {
    code: station.code,
    name: station.name,
    theme: station.theme,
    queue: station.queue,
    queueIndex: station.queueIndex,
    playing: station.playing,
    startedAtEpochMs: station.startedAtEpochMs,
    positionMs: elapsedMs,
    serverTime,
    memberCount: station.members.size,
  };
}

function broadcast(station, msg, exceptId = null) {
  const data = JSON.stringify(msg);
  for (const conn of station.members.values()) {
    if (exceptId && conn.id === exceptId) continue;
    if (conn.ws.readyState === 1) conn.ws.send(data);
  }
}

function broadcastMembers(station) {
  const members = [...station.members.values()].map((m) => ({
    id: m.id,
    name: m.name,
    joinedAt: m.joinedAt,
  }));
  broadcast(station, { type: 'members', members });
}

function pruneMembers(station) {
  const now = Date.now();
  let changed = false;
  for (const [key, conn] of station.members) {
    if (now - conn.lastSeen > 30_000) {
      station.members.delete(key);
      changed = true;
    }
  }
  if (changed) broadcastMembers(station);
}

function pushState(station) {
  broadcast(station, { type: 'state', station: publicState(station) });
}

/* ------------------------------------------------------------------ *
 *  HTTP app
 * ------------------------------------------------------------------ */
const app = express();
app.disable('x-powered-by');
app.use(express.json());

// Minimal security headers. The CSP intentionally allows arbitrary https
// audio/WS endpoints because station creators may paste any direct audio URL
// and the realtime server may live on another host — override with RR_CSP.
const CSP = process.env.RR_CSP || [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "media-src 'self' blob: https: http:",
  "connect-src 'self' wss: ws: https: http:",
  "frame-src https://open.spotify.com",
  "font-src 'self' data:",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Content-Security-Policy', CSP);
  next();
});

// CORS — needed when the frontend is hosted separately from this server
// (e.g. static frontend on Vercel + this realtime server elsewhere).
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin))) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));
// The canonical station-clock module is compiled by `npm run build` (tsc -p
// tsconfig.json) into dist/lib/sync/clock.js and served here at the same
// public URL (/lib/sync/clock.js) the client imports. The build also copies it
// into public/lib for static-only hosts (e.g. Vercel) that have no /lib mount.
const compiledClock = path.join(__dirname, 'dist', 'lib', 'sync', 'clock.js');
if (!fs.existsSync(compiledClock)) {
  console.warn('[start] dist/lib/sync/clock.js not found — run `npm run build` before starting.');
}
app.use('/lib', express.static(path.join(__dirname, 'dist', 'lib')));

// SPA fallback: /station/<code> (and /station/) must serve the app shell so
// direct navigation, refresh, and share links all work.
app.get(['/station', '/station/'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/station/:code', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/tracks', (_req, res) => {
  res.json(CURATED_TRACKS.map((t, i) => ({ ...t, id: 'curated-' + i })));
});

app.post('/api/stations', (req, res) => {
  const { name, theme } = req.body || {};
  const station = makeStation(String(name || '').slice(0, 60), String(theme || '').slice(0, 60));
  res.json({ code: station.code, station: publicState(station) });
});

app.get('/api/stations/:code', (req, res) => {
  const station = stations.get(String(req.params.code).toUpperCase());
  if (!station) return res.status(404).json({ error: 'Station not found' });
  pruneMembers(station);
  res.json({ station: publicState(station), members: [...station.members.values()].map((m) => ({ id: m.id, name: m.name })) });
});

/* ------------------------------------------------------------------ *
 *  WebSocket
 * ------------------------------------------------------------------ */
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  // Mirror the HTTP origin allowlist on the socket. Requests with no Origin
  // header (non-browser clients) are permitted; a browser from a disallowed
  // origin is rejected.
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
    ws.close(1008, 'origin not allowed');
    return;
  }

  const url = new URL(req.url, 'http://internal');
  const code = (url.searchParams.get('code') || '').toUpperCase();
  const name = (url.searchParams.get('name') || '').slice(0, 30);

  const station = stations.get(code);
  if (!station) {
    ws.send(JSON.stringify({ type: 'error', message: 'Station not found. Check the code and try again.' }));
    ws.close();
    return;
  }

  const conn = { id: id('m'), name: name || 'Listener ' + station.members.size, joinedAt: Date.now(), lastSeen: Date.now(), ws };
  station.members.set(conn.id, conn);

  ws.send(JSON.stringify({
    type: 'welcome',
    code: station.code,
    yourId: conn.id,
    yourName: conn.name,
    station: publicState(station),
    members: [...station.members.values()].map((m) => ({ id: m.id, name: m.name, joinedAt: m.joinedAt })),
  }));
  broadcastMembers(station);
  pushState(station);

  ws.on('message', (raw) => {
    conn.lastSeen = Date.now();
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    switch (msg.type) {
      case 'hello':
        if (msg.name) conn.name = String(msg.name).slice(0, 30);
        broadcastMembers(station);
        break;

      case 'ping': // also acts as heartbeat; used for clock calibration
        ws.send(JSON.stringify({ type: 'pong', serverTime: Date.now() }));
        break;

      case 'addTrack': {
        const url = String(msg.url || '').trim();
        if (!/^https?:\/\/.+\.(mp3|ogg|m4a|webm|wav)(\?.*)?$/i.test(url)) {
          ws.send(JSON.stringify({ type: 'error', message: 'Please paste a direct link to an audio file (.mp3/.ogg/.m4a/.webm/.wav).' }));
          return;
        }
        const track = {
          id: id('t'),
          url,
          title: String(msg.title || 'Untitled track').slice(0, 80),
          artist: String(msg.artist || 'Unknown artist').slice(0, 60),
          vibe: String(msg.vibe || station.theme).slice(0, 40),
          addedBy: conn.name,
          addedAt: Date.now(),
        };
        station.queue.push(track);
        broadcast(station, { type: 'trackAdded', queue: station.queue, track });
        if (station.queue.length === 1 && !station.playing) {
          // first track ever added: cue it (paused)
          pushState(station);
        }
        break;
      }

      case 'play': {
        if (msg.trackId) {
          const idx = station.queue.findIndex((t) => t.id === msg.trackId);
          if (idx >= 0) station.queueIndex = idx;
        }
        if (!station.queue.length) {
          ws.send(JSON.stringify({ type: 'error', message: 'No tracks in the queue yet — add one first.' }));
          return;
        }
        if (!station.playing) {
          station.startedAtEpochMs = Date.now() - (station.positionMs || 0);
          station.playing = true;
        }
        pushState(station);
        break;
      }

      case 'pause': {
        if (station.playing) {
          station.positionMs = Math.max(0, Date.now() - station.startedAtEpochMs);
          station.playing = false;
        }
        pushState(station);
        break;
      }

      case 'next': {
        if (station.queue.length) {
          station.queueIndex = (station.queueIndex + 1) % station.queue.length;
          station.playing = true;
          station.positionMs = 0;
          station.startedAtEpochMs = Date.now();
          pushState(station);
        }
        break;
      }

      case 'prev': {
        if (station.queue.length) {
          station.queueIndex = (station.queueIndex - 1 + station.queue.length) % station.queue.length;
          station.playing = true;
          station.positionMs = 0;
          station.startedAtEpochMs = Date.now();
          pushState(station);
        }
        break;
      }

      case 'seek': {
        const pos = Math.max(0, Number(msg.positionMs) || 0);
        if (station.playing) station.startedAtEpochMs = Date.now() - pos;
        else station.positionMs = pos;
        pushState(station);
        break;
      }

      case 'bump': {
        // Skip everyone ahead by N seconds — a cheap, demo-friendly "re-sync".
        const secs = Math.max(0, Number(msg.seconds) || 0);
        const now = Date.now();
        const elapsed = station.playing ? now - station.startedAtEpochMs : station.positionMs;
        const next = elapsed + secs * 1000;
        if (station.playing) station.startedAtEpochMs = now - next;
        else station.positionMs = next;
        pushState(station);
        break;
      }
    }
  });

  ws.on('close', () => {
    station.members.delete(conn.id);
    broadcastMembers(station);
  });
});

// Periodic state + presence heartbeat
setInterval(() => {
  for (const station of stations.values()) {
    if (station.playing) pushState(station);
    pruneMembers(station);
  }
}, 1000);

server.listen(PORT, () => {
  console.log(`RadioRang running on http://localhost:${PORT}`);
});
