import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateOffset, elapsedAt } from './clock.ts';

/* ------------------------------------------------------------------ *
 *  elapsedAt — where a joiner should start
 * ------------------------------------------------------------------ */

test('elapsedAt: joiner arriving mid-track resumes at the correct position', () => {
  // Playback started at reference time 1000; a device joins at reference time 13_000.
  assert.equal(elapsedAt(1000, 13_000), 12_000);
});

test('elapsedAt: joiner arriving exactly at start begins at zero', () => {
  assert.equal(elapsedAt(5000, 5000), 0);
});

test('elapsedAt: never negative (joiner before start / clock skew)', () => {
  assert.equal(elapsedAt(5000, 4000), 0);
});

test('elapsedAt: monotonic as time advances', () => {
  const startedAt = 0;
  assert.ok(elapsedAt(startedAt, 100) < elapsedAt(startedAt, 200));
});

/* ------------------------------------------------------------------ *
 *  estimateOffset — this device vs the station reference clock
 * ------------------------------------------------------------------ */

test('estimateOffset: local clock ahead of server by 50 ms', () => {
  // Server echoes serverTime = 1000; the local midpoint of the round trip = 1050.
  const offset = estimateOffset({ sendAt: 1020, serverTime: 1000, receiveAt: 1080 });
  assert.equal(offset, -50); // offset = serverTime − localTime
});

test('estimateOffset: local clock behind server by 120 ms', () => {
  // Server echoes serverTime = 10_000; the local midpoint of the round trip = 9880.
  const offset = estimateOffset({ sendAt: 9820, serverTime: 10_000, receiveAt: 9940 });
  assert.equal(offset, 120);
});

test('estimateOffset: identical clocks with symmetric RTT give zero offset', () => {
  const offset = estimateOffset({ sendAt: 1000, serverTime: 1060, receiveAt: 1120 });
  assert.equal(offset, 0);
});

test('estimateOffset: large RTT with symmetric latency still recovers the true offset', () => {
  // 200 ms round trip, clocks agree → midpoint == serverTime → offset 0.
  const offset = estimateOffset({ sendAt: 500, serverTime: 600, receiveAt: 700 });
  assert.equal(offset, 0);
});

test('estimateOffset + elapsedAt: end-to-end mid-track join', () => {
  // Device clock is 250 ms ahead of the server → offset −250.
  const offset = estimateOffset({ sendAt: 800, serverTime: 750, receiveAt: 1200 });
  assert.equal(offset, -250);

  // Server started the track at its time 20_000. The device reads its local
  // clock at 27_750 (250 ms ahead of the server), corrects by the offset, and
  // asks how far into the track it should start.
  const serverStartedAt = 20_000;
  const localNow = serverStartedAt + 250 + 7_500;
  const nowInServerTime = localNow + offset; // 27_750 − 250 = 27_500
  const position = elapsedAt(serverStartedAt, nowInServerTime);
  assert.equal(position, 7_500); // 7.5 s in, not from zero
});
