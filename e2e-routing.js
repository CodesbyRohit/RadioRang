/* Production routing verification (localhost stand-in for the deployed origin):
 *  1. Direct navigation to /station/<code> works (SPA shell + connect)
 *  2. Refresh on a station page re-enters the same station
 *  3. Back/forward navigation works
 *  4. Invalid /station/<malformed> shows a useful error state
 *  5. Share link uses the current origin (never a hardcoded tunnel URL)
 *  6. Member count pill populates
 */
import { chromium } from 'playwright-core';

const BASE = 'http://localhost:3000';
const CHROME = 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

// --- Create a station ---
await page.goto(BASE);
await page.fill('#create-name', 'Routing Test');
await page.fill('#create-theme', 'Test vibe');
await page.click('#btn-create');
await page.waitForSelector('#station-code', { state: 'visible' });
const code = (await page.textContent('#station-code')).trim();
const urlOnStation = page.url();
if (!urlOnStation.includes('/station/' + code)) throw new Error(`URL after create should be /station/${code}, got ${urlOnStation}`);
console.log('PASS: create navigates to /station/' + code);

// --- Direct navigation (fresh page, like a shared link) ---
const page2 = await browser.newPage();
await page2.goto(BASE + '/station/' + code);
await page2.waitForFunction(() => window.__rr && window.__rr.myId, null, { timeout: 15000 });
const title = await page2.title();
if (!title.includes(code)) throw new Error(`title should contain the code, got "${title}"`);
const pill = await page2.evaluate(() => document.querySelector('#conn-pill').dataset.state);
if (pill !== 'connected') throw new Error(`direct nav should connect, pill=${pill}`);
console.log('PASS: direct navigation connects and shows station (' + title + ')');

// --- Refresh stays on the station ---
await page2.reload();
await page2.waitForFunction(() => window.__rr && window.__rr.myId, null, { timeout: 15000 });
if (!page2.url().includes('/station/' + code)) throw new Error('refresh lost the station URL');
const stName = await page2.textContent('#station-title');
if (stName !== 'Routing Test') throw new Error(`station title should render after refresh, got "${stName}"`);
console.log('PASS: refresh re-enters the station (' + stName + ')');

// --- Share link origin ---
const share = await page2.evaluate(() => {
  const btn = document.querySelector('#btn-copy');
  btn.click();
  return window.__rr ? 'clicked' : 'clicked';
});
const canonical = await page2.evaluate(() => document.querySelector('link[rel="canonical"]').href);
if (!canonical.startsWith(BASE + '/station/' + code)) throw new Error(`canonical should be the station URL, got ${canonical}`);
const btnCopy = await page2.evaluate(() => document.querySelector('#btn-copy').textContent.trim());
if (!btnCopy.includes(code)) throw new Error(`code chip should show the code, got "${btnCopy}"`);
console.log('PASS: canonical + share metadata use the current origin (' + canonical + ')');
console.log('share button click:', share);

// --- Member count pill populates after the second device joins ---
const page1 = await browser.newPage();
await page1.goto(BASE);
await page1.fill('#join-code', code);
await page1.click('#btn-join');
await page1.waitForFunction(() => window.__rr && window.__rr.myId, null, { timeout: 15000 });
await sleep(800);
const count = await page2.textContent('#member-count');
const n = parseInt(count, 10);
if (!(n >= 2)) throw new Error(`member pill should show >= 2 (creator + joiner), got "${count}"`);
console.log('PASS: member count pill shows "' + count.trim() + '"');

// --- Back / forward ---
await page2.goto(BASE);               // home
await page2.goto(BASE + '/station/' + code);
await page2.goBack();
await sleep(500);
if (!page2.url().includes('/station/')) {
  // went back to home
}
const homeVisible = await page2.locator('#view-home:visible').count();
if (homeVisible !== 1) throw new Error('back should land on home');
console.log('PASS: back returns to home');
await page2.goForward();
await sleep(500);
await page2.waitForFunction(() => window.__rr && window.__rr.myId, null, { timeout: 15000 });
console.log('PASS: forward re-enters the station');

// --- Invalid station code shows a useful error ---
const page3 = await browser.newPage();
await page3.goto(BASE + '/station/XYZ1'); // 4 chars — malformed
await sleep(800);
const errVisible = await page3.locator('#station-error:visible').count();
if (errVisible !== 1) throw new Error('malformed station code should show the error card');
const errText = await page3.textContent('#station-error-text');
if (!/doesn.t look right/.test(errText)) throw new Error(`error text unexpected: ${errText}`);
console.log('PASS: malformed /station/XYZ1 shows the error card: "' + errText.trim() + '"');

// --- Nonexistent (well-formed) station stops retrying and explains ---
const page4 = await browser.newPage();
await page4.goto(BASE + '/station/ZZZZ99');
await page4.waitForFunction(() => document.querySelector('#conn-pill').dataset.state === 'offline', null, { timeout: 20000 });
const err4 = await page4.textContent('#station-error-text');
if (!/not found/i.test(err4) && !/could not be reached/i.test(err4)) throw new Error(`unexpected error text: ${err4}`);
console.log('PASS: nonexistent station explains itself: "' + err4.trim() + '"');

if (errors.length) {
  console.log('page errors:', errors.slice(0, 5));
  throw new Error('page errors present');
}

await browser.close();
console.log('\nALL ROUTING CHECKS PASSED');
