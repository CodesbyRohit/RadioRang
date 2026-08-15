/* End-to-end browser test with the locally installed Chrome.
 * Verifies the actual success criteria:
 *   1. two devices (browser contexts) join one station
 *   2. both hear the same track, in sync (cross-device drift measured)
 *   3. flaky-wifi resilience: device B drops its socket mid-track, keeps
 *      playing from its buffered audio, reconnects, and re-seeks cleanly
 *      to the station clock.
 */
import { chromium } from 'playwright-core';

const BASE = 'http://localhost:3000';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();

  // --- Device A: create a station ---------------------------------
  const pageA = await ctxA.newPage();
  await pageA.goto(BASE);
  await pageA.fill('#create-name', 'Dhaba Nights');
  await pageA.fill('#create-theme', 'Highway nights');
  await pageA.click('#btn-create');
  await pageA.waitForSelector('#station-code', { state: 'visible' });
  const code = (await pageA.textContent('#station-code')).trim();
  console.log('Station created:', code);

  // --- Device B: join via code ------------------------------------
  const pageB = await ctxB.newPage();
  await pageB.goto(BASE);
  await pageB.fill('#join-code', code);
  await pageB.click('#btn-join');
  await pageB.waitForSelector('#station-code', { state: 'visible' });

  // Give both time to connect
  await pageA.waitForFunction(() => window.__rr && window.__rr.myId);
  await pageB.waitForFunction(() => window.__rr && window.__rr.myId);

  // --- A adds the first curated track and plays --------------------
  await pageA.click('.curated >> nth=0');
  await sleep(300);
  await pageA.click('#btn-play');

  // Headless Chrome sometimes auto-runs the AudioContext; click when visible.
  async function unmuteIfNeeded(page) {
    if (await page.locator('#unmute-overlay:visible').count()) {
      await page.click('#btn-unmute');
    }
  }
  await unmuteIfNeeded(pageA);
  await unmuteIfNeeded(pageB);

  // Wait for playback on both
  await pageA.waitForFunction(() => window.__rr.station && window.__rr.station.playing && window.__rr.audioReady, null, { timeout: 20000 });
  await pageB.waitForFunction(() => window.__rr.station && window.__rr.station.playing && window.__rr.audioReady, null, { timeout: 20000 });

  // Audio buffer must be decoded on both
  await pageA.waitForFunction(() => window.__rr.actualMs() != null, null, { timeout: 30000 });
  await pageB.waitForFunction(() => window.__rr.actualMs() != null, null, { timeout: 30000 });

  // --- Measure sync: sample both playback positions at the same wall time ----
  await sleep(1500);
  async function sample(page) {
    const snap = await page.evaluate(() => {
      const t0 = Date.now();
      const actual = window.__rr.actualMs();
      const wall = Date.now() - t0;
      return { actual, wall };
    });
    return snap.actual - snap.wall; // normalize away eval latency
  }
  async function drift() {
    const [pa, pb] = await Promise.all([sample(pageA), sample(pageB)]);
    return { pa, pb, d: Math.abs(pa - pb) };
  }
  const samples = [];
  for (let i = 0; i < 3; i++) {
    const s = await drift();
    samples.push(s);
    await sleep(800);
  }
  console.log('Sync samples (ms, normalized):', JSON.stringify(samples.map((s) => ({ pa: s.pa.toFixed(1), pb: s.pb.toFixed(1), drift: s.d.toFixed(1) }))));
  const maxDrift = Math.max(...samples.map((s) => s.d));
  if (maxDrift > 400) throw new Error(`FAIL: cross-device drift too high (${maxDrift}ms)`);
  console.log(`PASS: both devices in sync (max drift ${maxDrift.toFixed(1)}ms)`);

  // --- Resilience: device B's socket dies mid-track (phone walks away) ---
  const posBefore = (await pageB.evaluate(() => window.__rr.actualMs())).toFixed(0);
  await pageB.evaluate(() => window.__rr.reconnectNow()); // kill the socket while online
  await sleep(300);                          // within the 500ms reconnect backoff
  const pillDuringDrop = await pageB.evaluate(() => document.querySelector('#conn-pill').dataset.state);
  console.log('Pill during drop:', pillDuringDrop);
  if (pillDuringDrop !== 'reconnecting') {
    throw new Error(`FAIL: drop was not detected (pill=${pillDuringDrop})`);
  }
  console.log('PASS: device B detected the drop and entered reconnect backoff');

  await ctxB.setOffline(true);               // cut the network during the backoff window
  await sleep(1500);                          // keep playing from buffered audio
  const posWhileOffline = await pageB.evaluate(() => window.__rr.actualMs());
  console.log(`Playback through the drop: ${posBefore}ms -> ${posWhileOffline.toFixed(0)}ms`);
  if (!posWhileOffline || posWhileOffline <= Number(posBefore)) {
    throw new Error('FAIL: playback did not continue while the socket was down');
  }
  console.log('PASS: playback continued through the drop (buffered audio kept playing)');

  // --- Bring B back: must reconnect and re-seek to the station clock ---
  await ctxB.setOffline(false);
  await pageB.waitForFunction(() => document.querySelector('#conn-pill').dataset.state === 'connected', null, { timeout: 25000 });
  await pageB.waitForFunction(() => window.__rr.station && window.__rr.station.playing, null, { timeout: 15000 });
  await sleep(2000); // let the drift monitor re-align

  const after = await drift();
  console.log(`After reconnect: A=${after.pa.toFixed(1)}ms B=${after.pb.toFixed(1)}ms drift=${after.d.toFixed(1)}ms`);
  if (after.d > 400) throw new Error(`FAIL: re-seek left devices out of sync (${after.d.toFixed(1)}ms)`);
  console.log('PASS: device B reconnected and re-seeked cleanly to the station clock');

  await browser.close();
  console.log('\nALL E2E CHECKS PASSED');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
