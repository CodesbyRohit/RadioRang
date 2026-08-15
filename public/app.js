/* 80 Years of Freedom — a static, self-contained tribute page.
 * Renders the timeline, freedom fighters, verified quotes, the Tryst with
 * Destiny excerpts, and the Sounds of Azaadi shelf (platform links + official
 * Spotify embeds — no audio is hosted here). Plus a shareable, personalized
 * Independence Day tribute card.
 */
'use strict';

import { TIMELINE, FIGHTERS, QUOTES, TRYST } from '/data/freedom.js';
import { AZAADI } from '/data/azaadi.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------------------------------------------------------- *
 *  Scroll reveal — adds .in-view when sections enter the viewport
 * ---------------------------------------------------------------- */
function initReveal() {
  const items = $$('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('in-view'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in-view');
        io.unobserve(e.target);
      }
    }
  }, { threshold: 0.12 });
  items.forEach((el, i) => {
    // Stagger cards slightly, but never let the page feel sluggish.
    el.style.transitionDelay = Math.min(i % 6, 3) * 60 + 'ms';
    io.observe(el);
  });
}

/* ---------------------------------------------------------------- *
 *  Tryst with Destiny
 * ---------------------------------------------------------------- */
function renderTryst() {
  const body = $('#tryst-body');
  if (!body) return;
  body.innerHTML = TRYST.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('');
}

/* ---------------------------------------------------------------- *
 *  Timeline
 * ---------------------------------------------------------------- */
function renderTimeline() {
  const list = $('#timeline');
  if (!list) return;
  list.innerHTML = TIMELINE.map((t, i) => `
    <li class="reveal">
      <span class="timeline__year">${esc(t.year)}</span>
      <p class="timeline__title">${esc(t.title)}</p>
      <p class="timeline__text">${esc(t.text)}</p>
    </li>`).join('');
}

/* ---------------------------------------------------------------- *
 *  Freedom fighters
 * ---------------------------------------------------------------- */
function renderFighters() {
  const grid = $('#fighters');
  if (!grid) return;
  grid.innerHTML = FIGHTERS.map((f, i) => `
    <article class="fighter reveal">
      <div class="fighter__head">
        <span class="fighter__monogram" aria-hidden="true">${esc(f.monogram)}</span>
        <div>
          <p class="fighter__name">${esc(f.name)}</p>
          <p class="fighter__meta">${esc(f.years)}</p>
        </div>
      </div>
      <p class="fighter__role">${esc(f.role)}</p>
      <p class="fighter__text">${esc(f.text)}</p>
    </article>`).join('');
}

/* ---------------------------------------------------------------- *
 *  Quotes
 * ---------------------------------------------------------------- */
function renderQuotes() {
  const wrap = $('#quotes');
  if (!wrap) return;
  wrap.innerHTML = QUOTES.map((q, i) => `
    <figure class="quote reveal">
      <blockquote>“${esc(q.text)}”</blockquote>
      <cite>— ${esc(q.source)}</cite>
    </figure>`).join('');
}

/* ---------------------------------------------------------------- *
 *  Sounds of Azaadi — platform links + official Spotify embeds
 *  (identical markup contract to before: .song, .pl--*, .azaadi__embed)
 * ---------------------------------------------------------------- */
function renderAzaadi() {
  const list = $('#azaadi-list');
  if (!list) return;
  list.innerHTML = AZAADI.map((s, i) => {
    const actions = [];
    if (s.spotifyTrackId) {
      actions.push(`<a class="pl pl--spotify" href="https://open.spotify.com/track/${s.spotifyTrackId}" target="_blank" rel="noopener">▶ Spotify</a>`);
    }
    if (s.jiosaavn) {
      actions.push(`<a class="pl pl--jiosaavn" href="${esc(s.jiosaavn)}" target="_blank" rel="noopener">♪ JioSaavn</a>`);
    }
    if (s.gaana) {
      actions.push(`<a class="pl pl--gaana" href="${esc(s.gaana)}" target="_blank" rel="noopener">♫ Gaana</a>`);
    }
    const embed = s.spotifyTrackId
      ? `<iframe class="azaadi__embed" src="https://open.spotify.com/embed/track/${s.spotifyTrackId}?utm_source=generator&theme=0" width="100%" height="80" frameBorder="0" loading="lazy" title="${esc(s.title)} — listen on Spotify" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>`
      : '';
    return `<article class="song reveal">
      <div class="song__head">
        <div class="song__titles">
          <h3>${esc(s.title)}</h3>
          <p class="song__artist">${esc(s.artist)} · ${esc(s.year)}</p>
        </div>
        <span class="song__era">${esc(s.era)}</span>
      </div>
      <p class="song__context">${esc(s.context)}</p>
      <div class="song__actions">${actions.join('')}</div>
      ${embed}
    </article>`;
  }).join('');
}

/* ---------------------------------------------------------------- *
 *  Tribute card
 * ---------------------------------------------------------------- */
function tributeMessage(name, note) {
  const lines = [
    `🇮🇳 On the 80th Independence Day of India (15 August 2026),`,
    `${name || 'a proud Indian'} salutes the spirit of a free India.`,
    note ? `"${note}"` : null,
    'Jai Hind!',
  ].filter(Boolean);
  return lines.join('\n');
}

function initTribute() {
  const form = $('#tribute-form');
  const nameInput = $('#tribute-name');
  const noteInput = $('#tribute-note');
  if (!form) return;

  const update = () => {
    const name = nameInput.value.trim();
    const note = noteInput.value.trim();
    $('#tribute-card-name').textContent = name || 'Your name';
    $('#tribute-card-note').textContent = note || 'Your wish for India appears here.';
    // Keep the WhatsApp link live so it works with a plain click, middle-click,
    // or long-press — not just through the JS handler.
    $('#btn-whatsapp').href = 'https://wa.me/?text=' + encodeURIComponent(tributeMessage(name, note));
  };
  nameInput.addEventListener('input', update);
  noteInput.addEventListener('input', update);
  update();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) {
      toast('Please enter your name first.');
      nameInput.focus();
      return;
    }
    $('#tribute-actions').classList.remove('hidden');
    $('#tribute-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast('Your tribute card is ready — share it!');
  });

  const message = () => tributeMessage(nameInput.value.trim(), noteInput.value.trim());

  $('#btn-share').addEventListener('click', async () => {
    const text = message();
    if (navigator.share) {
      try {
        await navigator.share({ title: '80 Years of Freedom', text });
        return;
      } catch {}
    }
    await copyText(text);
  });

  $('#btn-copy').addEventListener('click', () => copyText(message()));

  $('#btn-whatsapp').addEventListener('click', (e) => {
    e.preventDefault();
    window.open('https://wa.me/?text=' + encodeURIComponent(message()), '_blank', 'noopener');
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Message copied — paste it anywhere. Jai Hind! 🇮🇳');
  } catch {
    toast('Could not copy automatically. Select the text and copy manually.');
  }
}

/* ---------------------------------------------------------------- *
 *  Toast
 * ---------------------------------------------------------------- */
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
}

/* ---------------------------------------------------------------- *
 *  Boot
 * ---------------------------------------------------------------- */
function boot() {
  renderTryst();
  renderTimeline();
  renderFighters();
  renderQuotes();
  renderAzaadi();
  initReveal();
  initTribute();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Debug/verification hook for e2e + console inspection
  window.__rr = {
    songs: () => $$('.song').length,
    quotes: () => $$('.quote').length,
    timeline: () => $$('.timeline li').length,
    fighters: () => $$('.fighter').length,
  };
}

document.addEventListener('DOMContentLoaded', boot);
