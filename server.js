import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

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
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));
// The canonical station-clock module lives in lib/sync (clock.ts + compiled clock.js).
app.use('/lib', express.static(path.join(__dirname, 'lib')));

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
  const url = new URL(req.url, 'http://localhost');
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
