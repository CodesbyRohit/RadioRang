/* RadioRang — One Station, Any Vibe
 * Client: WebSocket relay + Web Audio API sync engine.
 * Sync model: the server owns the playback clock (startedAtEpochMs).
 * Each client calibrates its clock offset (ping/pong RTT), then schedules
 * the shared track with AudioContext at the exact target time. Reconnects
 * re-seek to the server timeline; a Service Worker caches the audio so
 * playback survives dropped networks.
 *
 * The clock math lives in the canonical module at lib/sync/clock.ts
 * (compiled to /lib/sync/clock.js) — see estimateOffset() and elapsedAt().
 */
'use strict';

import { estimateOffset, elapsedAt } from '/lib/sync/clock.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

/* ---------------------------------------------------------------- *
 *  Tiny router: #home | #station
 * ---------------------------------------------------------------- */
function show(view) {
  $$('.view').forEach((v) => v.classList.toggle('hidden', v.id !== 'view-' + view));
}

/* ---------------------------------------------------------------- *
 *  App state
 * ---------------------------------------------------------------- */
let station = null;       // latest publicState from server
let myId = null;
let myName = localStorage.getItem('rr-name') || '';
let ws = null;
let serverOffsetMs = 0;   // serverTime - localTime
let reconnectAttempt = 0;
let reconnectTimer = null;

/* ---------------------------------------------------------------- *
 *  Web Audio engine
 * ---------------------------------------------------------------- */
let audioCtx = null;
let currentBuffer = null;
let currentTrackUrl = null;
let srcNode = null;
let startedCtxTime = 0;   // AudioContext time when srcNode was started
let bufferOffsetAtStart = 0; // seconds into the buffer at start
let driftTimer = null;
let pendingTargetMs = 0;
let lastFlash = 0;
let audioReady = false; // true once the AudioContext is running (user gesture given)

async function ensureAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') {
    try { await audioCtx.resume(); } catch {}
  }
  if (audioCtx.state === 'running') audioReady = true;
  return audioCtx;
}

async function loadTrack(url) {
  if (currentTrackUrl === url && currentBuffer) return;
  currentTrackUrl = url;
  currentBuffer = null;
  setTrackLoading(true);
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const ab = await resp.arrayBuffer();
    const buf = await audioCtx.decodeAudioData(ab);
    currentBuffer = buf;
  } catch (e) {
    currentTrackUrl = null;
    toast('Could not load audio: ' + e.message);
  } finally {
    setTrackLoading(false);
  }
}

function stopNode() {
  if (srcNode) {
    try { srcNode.stop(); } catch {}
    try { srcNode.disconnect(); } catch {}
    srcNode = null;
  }
}

function playAt(elapsedMs) {
  if (!currentBuffer) return;
  stopNode();
  const lead = 0.08; // 80ms lookahead lets every device fire on the same tick
  const when = audioCtx.currentTime + lead;
  const offsetSec = Math.max(0, elapsedMs / 1000);
  if (offsetSec >= currentBuffer.duration - 0.05) return; // track ended; server will advance
  srcNode = audioCtx.createBufferSource();
  srcNode.buffer = currentBuffer;
  srcNode.connect(audioCtx.destination);
  srcNode.start(when, offsetSec);
  startedCtxTime = when;
  bufferOffsetAtStart = offsetSec;
}

function stopPlayback() {
  stopNode();
  if (driftTimer) { clearInterval(driftTimer); driftTimer = null; }
}

function startDriftMonitor() {
  if (driftTimer) clearInterval(driftTimer);
  driftTimer = setInterval(() => {
    if (!station || !station.playing) return;
    const expectedMs = Math.max(0, Date.now() + serverOffsetMs - station.startedAtEpochMs);
    const actualMs = bufferOffsetAtStart * 1000 + (audioCtx.currentTime - startedCtxTime) * 1000;
    if (Math.abs(expectedMs - actualMs) > 150 && currentBuffer) {
      playAt(expectedMs); // re-align to the station clock
      flashSync();
    }
    updatePositionUI(expectedMs);
  }, 1000);
}

/* ---------------------------------------------------------------- *
 *  State application
 * ---------------------------------------------------------------- */
async function applyState(s) {
  station = s;
  const current = s.queue[s.queueIndex] || null;
  renderQueue(s.queue, s.queueIndex);
  renderNowPlaying(current, s.playing, s.theme);
  renderStatus(s);

  if (!current) {
    stopPlayback();
    updatePositionUI(0);
    return;
  }

  const targetMs = s.playing
    ? elapsedAt(s.startedAtEpochMs, Date.now() + serverOffsetMs)
    : s.positionMs;

  await ensureAudioCtx();
  if (currentTrackUrl !== current.url) await loadTrack(current.url);

  if (s.playing) {
    if (!audioReady) {
      // Browser blocks audio until a user gesture — show the unmute overlay.
      const ov = $('#unmute-overlay');
      if (ov) ov.classList.remove('hidden');
      updatePositionUI(targetMs);
    } else {
      playAt(targetMs);
      startDriftMonitor();
      updatePositionUI(targetMs);
    }
  } else {
    const ov = $('#unmute-overlay');
    if (ov) ov.classList.add('hidden');
    stopPlayback();
    updatePositionUI(targetMs);
  }
}

/* ---------------------------------------------------------------- *
 *  Clock calibration (serverTime vs localTime)
 * ---------------------------------------------------------------- */
function calibrate() {
  return new Promise((resolve) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return resolve();
    const t0 = Date.now();
    const onMsg = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'pong') {
        ws.removeEventListener('message', onMsg);
        serverOffsetMs = estimateOffset({ sendAt: t0, serverTime: m.serverTime, receiveAt: Date.now() });
        resolve();
      }
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ type: 'ping' }));
    setTimeout(() => { ws.removeEventListener('message', onMsg); resolve(); }, 2000);
  });
}

/* ---------------------------------------------------------------- *
 *  WebSocket: connect / reconnect with backoff
 * ---------------------------------------------------------------- */
function connect(code) {
  clearTimeout(reconnectTimer);
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws?code=${encodeURIComponent(code)}&name=${encodeURIComponent(myName)}`);

  ws.onopen = async () => {
    reconnectAttempt = 0;
    setConn('connected');
    await calibrate();
    applyState(station); // if we already have state cached, re-align now
  };
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    handleMessage(m);
  };
  ws.onclose = () => {
    // Keep playing! The station clock is absolute (server epoch), so the drift
    // monitor stays correct without the socket — playback survives the drop and
    // the next successful join re-seeks us to the station timeline.
    setConn('reconnecting');
    const delay = Math.min(8000, 500 * Math.pow(2, reconnectAttempt++));
    reconnectTimer = setTimeout(() => connect(code), delay);
  };
  ws.onerror = () => { try { ws.close(); } catch {} };
}

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function handleMessage(m) {
  switch (m.type) {
    case 'welcome':
      myId = m.yourId;
      if (!myName) { myName = m.yourName; localStorage.setItem('rr-name', myName); }
      renderMembers(m.members);
      if (m.station) applyState(m.station);
      break;
    case 'state':
      applyState(m.station);
      break;
    case 'members':
      renderMembers(m.members);
      break;
    case 'trackAdded':
      if (m.queue) renderQueue(m.queue, station ? station.queueIndex : 0);
      break;
    case 'error':
      toast(m.message);
      break;
    case 'pong': /* handled by calibrate() */
      break;
  }
}

/* ---------------------------------------------------------------- *
 *  Landing: create / join
 * ---------------------------------------------------------------- */
async function createStation() {
  const name = $('#create-name').value.trim() || 'Untitled Station';
  const theme = $('#create-theme').value.trim() || 'Any vibe';
  const res = await fetch('/api/stations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, theme }),
  });
  if (!res.ok) return toast('Could not create station');
  const data = await res.json();
  enterStation(data.code);
}

function enterStation(code) {
  history.replaceState(null, '', `/?code=${encodeURIComponent(code)}`);
  show('station');
  $('#station-code').textContent = code;
  station = null;
  connect(code);
}

function joinStation() {
  const code = $('#join-code').value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return toast('That code does not look right (6 letters/numbers).');
  enterStation(code);
}

function saveName() {
  const name = $('#your-name').value.trim();
  if (name) { myName = name; localStorage.setItem('rr-name', name); }
  send({ type: 'hello', name: myName });
  renderMembersFromName();
  toast('Name updated');
}

function pickTheme(chip) {
  $('#create-theme').value = chip.dataset.vibe;
}

/* ---------------------------------------------------------------- *
 *  Station controls
 * ---------------------------------------------------------------- */
function addTrack() {
  const url = $('#track-url').value.trim();
  const title = $('#track-title').value.trim();
  const artist = $('#track-artist').value.trim();
  if (!url) return toast('Paste a direct audio link first (mp3/ogg/m4a/webm/wav).');
  send({ type: 'addTrack', url, title, artist, vibe: station ? station.theme : '' });
  $('#track-url').value = ''; $('#track-title').value = ''; $('#track-artist').value = '';
}

function addCurated(url, title, artist, vibe) {
  send({ type: 'addTrack', url, title, artist, vibe });
  toast(`"${title}" added to the queue`);
}

/* ---------------------------------------------------------------- *
 *  Rendering
 * ---------------------------------------------------------------- */
function renderQueue(queue, index) {
  const list = $('#queue-list');
  const empty = $('#queue-empty');
  if (!queue || queue.length === 0) {
    list.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');
  list.innerHTML = queue.map((t, i) => `
    <li class="track ${i === index ? 'track--current' : ''}" data-id="${t.id}">
      <span class="track__idx">${i === index ? '▶' : String(i + 1).padStart(2, '0')}</span>
      <div class="track__meta">
        <span class="track__title">${esc(t.title)}</span>
        <span class="track__sub">${esc(t.artist)} · ${esc(t.vibe || '')}</span>
      </div>
      <button class="btn btn--ghost btn--sm" data-play="${t.id}" title="Play now">Play</button>
    </li>`).join('');

  list.querySelectorAll('[data-play]').forEach((btn) => {
    btn.addEventListener('click', () => send({ type: 'play', trackId: btn.dataset.play }));
  });
}

function renderNowPlaying(current, playing, theme) {
  const np = $('#now-playing');
  if (!current) {
    np.querySelector('.np__title').textContent = 'Nothing on the air';
    np.querySelector('.np__sub').textContent = 'Add a track to start the vibe';
    np.querySelector('.np__elapsed').textContent = '--:--';
    $('#vinyl').classList.toggle('spin', false);
    $('#btn-play').disabled = true;
    $('#btn-next').disabled = true;
    $('#btn-prev').disabled = true;
    return;
  }
  np.querySelector('.np__title').textContent = current.title;
  np.querySelector('.np__sub').textContent = `${current.artist} — ${current.vibe || theme}`;
  $('#vinyl').classList.toggle('spin', playing);
  $('#btn-play').disabled = false;
  $('#btn-next').disabled = false;
  $('#btn-prev').disabled = false;
  $('#btn-play').innerHTML = playing ? '❚❚ Pause' : '▶ Play';
}

function updatePositionUI(ms) {
  const el = $('#elapsed');
  if (el) el.textContent = fmtTime(ms);
  const bar = $('#progress');
  if (bar && currentBuffer && currentBuffer.duration) {
    bar.style.width = Math.min(100, (ms / 1000 / currentBuffer.duration) * 100) + '%';
  }
}

function renderStatus(s) {
  const members = $('#member-count');
  if (members) members.textContent = (s && s.members && s.members.length != null)
    ? s.members.length
    : (station && station.memberCount != null ? station.memberCount : '—');
}

function renderMembers(members) {
  const list = $('#members-list');
  if (!list) return;
  if (!members || members.length === 0) { list.innerHTML = '<li class="member member--empty">No one else here yet — share the code!</li>'; return; }
  list.innerHTML = members.map((m) => `
    <li class="member${m.id === myId ? ' member--me' : ''}">
      <span class="member__dot"></span>${esc(m.name)}${m.id === myId ? ' <em>(you)</em>' : ''}
    </li>`).join('');
}

function renderMembersFromName() {
  // no-op; server pushes authoritative list
}

function setConn(state) {
  const pill = $('#conn-pill');
  if (!pill) return;
  pill.dataset.state = state;
  const labels = { connected: '● Live', reconnecting: '↻ Reconnecting…', offline: '○ Offline' };
  pill.textContent = labels[state] || state;
}

function setTrackLoading(on) {
  const el = $('#track-loading');
  if (el) el.classList.toggle('hidden', !on);
}

function flashSync() {
  const now = Date.now();
  if (now - lastFlash < 1500) return;
  lastFlash = now;
  const el = $('#sync-badge');
  if (!el) return;
  el.classList.remove('hidden');
  el.textContent = '⇄ Re-synced to station clock';
  setTimeout(() => el.classList.add('hidden'), 2000);
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3500);
}

/* ---------------------------------------------------------------- *
 *  Boot
 * ---------------------------------------------------------------- */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtTime(ms) {
  const total = Math.floor((ms || 0) / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

async function boot() {
  // your display name
  $('#your-name').value = myName;

  // wire up landing
  $('#btn-create').addEventListener('click', createStation);
  $('#btn-join').addEventListener('click', joinStation);
  $('#join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinStation(); });
  $('#btn-save-name').addEventListener('click', saveName);
  $$('.vibe-chip').forEach((c) => c.addEventListener('click', () => pickTheme(c)));

  // wire up station
  $('#btn-play').addEventListener('click', () => {
    const playing = station && station.playing;
    send({ type: playing ? 'pause' : 'play' });
  });
  $('#btn-next').addEventListener('click', () => send({ type: 'next' }));
  $('#btn-prev').addEventListener('click', () => send({ type: 'prev' }));
  $('#btn-bump').addEventListener('click', () => send({ type: 'bump', seconds: 10 }));
  $('#btn-copy').addEventListener('click', async () => {
    const code = $('#station-code').textContent;
    const link = `${location.origin}/?code=${code}`;
    try {
      await navigator.clipboard.writeText(link);
      toast('Share link copied');
    } catch {
      toast('Link: ' + link);
    }
  });
  $('#btn-add-track').addEventListener('click', addTrack);
  $('#track-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') addTrack(); });
  $('#btn-back').addEventListener('click', () => { location.href = '/'; });

  // curated shelf
  const res = await fetch('/api/tracks');
  const tracks = await res.json();
  $('#curated-list').innerHTML = tracks.map((t) => `
    <button class="curated" data-url="${esc(t.url)}" data-title="${esc(t.title)}" data-artist="${esc(t.artist)}" data-vibe="${esc(t.vibe)}">
      <span class="curated__vibe">${esc(t.vibe)}</span>
      <span class="curated__title">${esc(t.title)}</span>
      <span class="curated__artist">${esc(t.artist)}</span>
    </button>`).join('');
  $$('.curated').forEach((b) => b.addEventListener('click', () => {
    addCurated(b.dataset.url, b.dataset.title, b.dataset.artist, b.dataset.vibe);
  }));

  // auto-join when arriving with ?code=
  const params = new URLSearchParams(location.search);
  const code = (params.get('code') || '').toUpperCase();
  if (code) {
    enterStation(code);
  } else {
    show('home');
  }

  // service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // presence heartbeat + keep clock honest
  setInterval(() => send({ type: 'ping' }), 15000);

  // unmute overlay: browsers need a gesture to start audio
  $('#btn-unmute').addEventListener('click', async () => {
    await ensureAudioCtx();
    $('#unmute-overlay').classList.add('hidden');
    if (station) applyState(station);
  });

  // Debug hook for e2e/console verification
  window.__rr = {
    get station() { return station; },
    get myId() { return myId; },
    get audioReady() { return audioReady; },
    get ctxTime() { return audioCtx ? audioCtx.currentTime : 0; },
    actualMs: () => (currentBuffer && srcNode)
      ? bufferOffsetAtStart * 1000 + (audioCtx.currentTime - startedCtxTime) * 1000
      : null,
    reconnectNow: () => { if (ws) { try { ws.close(); } catch {} } },
  };
}

document.addEventListener('DOMContentLoaded', boot);
