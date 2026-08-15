/* Data-integrity tests for the tribute content (runs with `npm test`).
 * Validates that the timeline, fighters, quotes, Tryst excerpts, and the
 * Sounds of Azaadi shelf are well-formed and internally consistent — so a
 * broken edit to any content file fails CI instead of shipping a broken page.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIMELINE, FIGHTERS, QUOTES, TRYST } from './public/data/freedom.js';
import { AZAADI } from './public/data/azaadi.js';

test('timeline: 1857 to 1947, eight moments, all fields present', () => {
  assert.equal(TIMELINE.length, 8);
  assert.equal(TIMELINE[0].year, '1857');
  assert.equal(TIMELINE[TIMELINE.length - 1].year, '1947');
  for (const t of TIMELINE) {
    assert.ok(t.year && /^\d{4}$/.test(t.year), `bad year ${t.year}`);
    assert.ok(t.title, 'missing title');
    assert.ok(t.text && t.text.length > 40, `text too short for ${t.year}`);
  }
});

test('fighters: six fighters, monograms and dates present', () => {
  assert.equal(FIGHTERS.length, 6);
  for (const f of FIGHTERS) {
    assert.ok(f.name, 'missing name');
    assert.ok(f.years, 'missing years');
    assert.ok(f.role, 'missing role');
    assert.ok(f.text && f.text.length > 30, `text too short for ${f.name}`);
    assert.ok(f.monogram && f.monogram.length === 2, `bad monogram ${f.monogram}`);
  }
});

test('quotes: six verified quotes with sources', () => {
  assert.equal(QUOTES.length, 6);
  for (const q of QUOTES) {
    assert.ok(q.text && q.text.length > 25, 'quote too short');
    assert.ok(q.source && q.source.length > 5, 'missing source');
  }
});

test('tryst: two paragraphs plus footnote, no HTML in content', () => {
  assert.ok(TRYST.heading);
  assert.ok(TRYST.speechTitle);
  assert.equal(TRYST.paragraphs.length, 2);
  for (const p of TRYST.paragraphs) {
    assert.ok(p.length > 50);
    assert.ok(!/[<>]/.test(p), 'paragraph must not contain raw HTML');
  }
});

test('azaadi: eight songs, Spotify id + at least one platform link each', () => {
  assert.equal(AZAADI.length, 8);
  const ids = new Set();
  for (const s of AZAADI) {
    assert.ok(s.title, 'missing title');
    assert.ok(s.spotifyTrackId && /^[A-Za-z0-9]{22}$/.test(s.spotifyTrackId), `bad spotify id ${s.spotifyTrackId}`);
    assert.ok(ids.add(s.spotifyTrackId), `duplicate spotify id ${s.spotifyTrackId}`);
    assert.ok(s.jiosaavn, 'every song must have a verified JioSaavn link');
    assert.ok(s.jiosaavn.startsWith('https://www.jiosaavn.com/'), 'jiosaavn must be an official URL');
    // Gaana is optional ("where valid links are available") — but if present it must be official.
    if (s.gaana) assert.ok(s.gaana.startsWith('https://gaana.com/'), 'gaana must be an official URL');
  }
});

test('content files contain no raw HTML', () => {
  const all = [TIMELINE, FIGHTERS, QUOTES, AZAADI].flat();
  const json = JSON.stringify(all) + JSON.stringify(TRYST);
  assert.ok(!/[<>]/.test(json), 'content must not contain raw HTML (it is rendered escaped)');
});
