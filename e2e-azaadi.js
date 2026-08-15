import { chromium } from 'playwright-core';
const BASE = 'http://localhost:3000';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(BASE);
await page.waitForSelector('.song');

const count = await page.locator('.song').count();
console.log('song cards:', count);
if (count !== 8) throw new Error(`expected 8 songs, got ${count}`);

const first = await page.locator('.song').first().evaluate((el) => ({
  title: el.querySelector('h3').textContent,
  era: el.querySelector('.song__era').textContent,
  spotifyBtn: !!el.querySelector('.pl--spotify'),
  jiosaavnBtn: !!el.querySelector('.pl--jiosaavn'),
  gaanaBtn: !!el.querySelector('.pl--gaana'),
  embedSrc: el.querySelector('iframe')?.src || null,
}));
console.log('first song:', JSON.stringify(first));

// Every song must have at least a Spotify action (all 8 have verified ids)
const missingSpotify = await page.locator('.song').evaluateAll((els) =>
  els.filter((el) => !el.querySelector('.pl--spotify')).length
);
if (missingSpotify > 0) throw new Error(`${missingSpotify} songs missing a Spotify action`);

// Scroll to the bottom so lazy iframes load, then count embeds with the official src pattern
await page.locator('.azaadi').scrollIntoViewIfNeeded();
await page.waitForTimeout(1500);
const embeds = await page.locator('.azaadi__embed').evaluateAll((els) =>
  els.map((el) => ({ src: el.src, w: el.clientWidth, h: el.clientHeight }))
);
console.log('embeds (scrolled into view):', embeds.length);
const badEmbeds = embeds.filter((e) => !e.src.includes('open.spotify.com/embed/track/') || e.w === 0);
if (badEmbeds.length) throw new Error(`embed problems: ${JSON.stringify(badEmbeds.slice(0, 3))}`);

const notes = await page.locator('.song__context').count();
console.log('context notes:', notes);

if (errors.length) {
  console.log('console/page errors:', errors.slice(0, 5));
  throw new Error('page errors present');
}

await browser.close();
console.log('\nAZAADI SECTION OK: 8 songs, platform actions, official Spotify embeds, no errors');
