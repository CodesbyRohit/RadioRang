/**
 * lib/sync/clock.ts — the station clock.
 *
 * Two devices do not agree on `Date.now()`, so "start playing at time T" cannot
 * mean the same thing to both of them. The station keeps a single authoritative
 * clock on the server (an epoch-millisecond `startedAt`). This module is the
 * bridge between a device's local clock and that reference:
 *
 *  - `estimateOffset()`  — measure this device's offset from the reference
 *    clock using the same round-trip midpoint trick NTP uses. Call it with the
 *    local send/receive times of a ping and the server's echoed time.
 *  - `elapsedAt()`       — how far into the current track a joiner should
 *    start, given the reference's `startedAt` and the current synced time.
 *
 * All times are milliseconds. Local times must come from a single local clock
 * (the app uses `Date.now()`), and `serverTime` from the reference's clock.
 */

/** One clock-calibration sample (a ping/pong round trip). */
export interface OffsetSample {
  /** Local time (ms) when the ping was sent. */
  sendAt: number;
  /** Reference (server) time (ms) echoed back by the pong. */
  serverTime: number;
  /** Local time (ms) when the pong was received. */
  receiveAt: number;
}

/**
 * Estimate this device's offset from the station reference clock.
 *
 * offset = serverTime − localTime, so a positive result means the server clock
 * is ahead of this device (this device should ADD the offset to its local time
 * to get reference time). The midpoint of the round trip cancels out the
 * network latency, assuming symmetric delays — the same assumption NTP makes.
 *
 * Example: local clock is 50 ms ahead of the server. Ping leaves at local
 * 1020, the pong comes back at local 1080 (midpoint 1050), and the server
 * echoed `serverTime = 1000`. offset = 1000 − 1050 = −50. ✓
 */
export function estimateOffset({ sendAt, serverTime, receiveAt }: OffsetSample): number {
  const rtt = receiveAt - sendAt;
  const midpoint = sendAt + rtt / 2; // best guess of local time at the server's echo
  return serverTime - midpoint;
}

/**
 * How far into the current track a client should start (ms), given the
 * reference clock's `startedAt` (server epoch ms when playback began) and the
 * current synced time `now` (local time already corrected by `estimateOffset`).
 *
 * A client joining mid-track calls `elapsedAt(startedAt, now)` and seeks to
 * that position instead of restarting from zero.
 */
export function elapsedAt(startedAt: number, now: number): number {
  return Math.max(0, now - startedAt);
}
