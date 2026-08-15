/* Smoke test: simulates two devices in one station to verify the sync protocol. */
import WebSocket from 'ws';

const BASE = 'ws://localhost:3000/ws';

function client(name, code, log) {
  const ws = new WebSocket(`${BASE}?code=${code}&name=${name}`);
  const inbox = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    inbox.push(m);
    log.push({ name, m });
  });
  return new Promise((resolve) => {
    ws.on('open', () => resolve(ws));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const log = [];
const code = process.argv[2] || '6CC37F';

const a = await client('Dev A', code, log);
await sleep(300);
const b = await client('Dev B', code, log);
await sleep(300);

// A adds a curated track and plays it
a.send(JSON.stringify({ type: 'addTrack', url: 'https://mdn.github.io/webaudio-examples/audio-basics/outfoxing.mp3', title: 'Song 1', artist: 'Demo audio', vibe: 'Test' }));
await sleep(200);
a.send(JSON.stringify({ type: 'play' }));
await sleep(500);

// B bumps +10s
b.send(JSON.stringify({ type: 'bump', seconds: 10 }));
await sleep(300);

// heartbeat / clock calibration
a.send(JSON.stringify({ type: 'ping' }));
await sleep(400);

a.close(); b.close();

// Summarize
const lastStates = log.filter((l) => l.m.type === 'state').map((l) => ({
  from: l.name,
  playing: l.m.station.playing,
  pos: Math.round(l.m.station.positionMs / 1000),
  queueLen: l.m.station.queue.length,
}));
const welcomes = log.filter((l) => l.m.type === 'welcome').map((l) => ({ from: l.name, members: l.m.members.length }));
const pongs = log.filter((l) => l.m.type === 'pong').length;
const errors = log.filter((l) => l.m.type === 'error').map((l) => l.m.message);

console.log(JSON.stringify({ welcomes, lastStates: lastStates.slice(-6), pongs, errors }, null, 2));

const finalState = lastStates[lastStates.length - 1];
if (!finalState || finalState.playing !== true || finalState.queueLen !== 1) {
  console.error('FAIL: expected a single-track, playing station');
  process.exit(1);
}
if (finalState.pos < 10) {
  console.error(`FAIL: bump not applied (pos=${finalState.pos}s)`);
  process.exit(1);
}
if (pongs < 1) {
  console.error('FAIL: no pong received');
  process.exit(1);
}
console.log('PASS: two clients synced on one station, playback started, bump applied, clock calibration works');
