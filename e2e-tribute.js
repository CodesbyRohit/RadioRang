/* Browser E2E for the 80 Years of Freedom tribute page.
 * Verifies: hero, Tryst excerpts, timeline (8), fighters (6), quotes (6),
 * Sounds of Azaadi (8 songs), the tribute card generator flow, and zero
 * console/page errors.
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

await page.goto(BASE);

// Hero
const title = await page.textContent('h1.hero__title');
if (!/80 Years of/.test(title)) throw new Error(`hero title wrong: ${title}`);
console.log('PASS: hero — "' + title.trim() + '"');

// Tryst
const trystParas = await page.locator('#tryst-body p').count();
if (trystParas !== 2) throw new Error(`expected 2 tryst paragraphs, got ${trystParas}`);
console.log('PASS: Tryst with Destiny excerpts (' + trystParas + ' paragraphs)');

// Timeline
const tl = await page.locator('#timeline li').count();
if (tl !== 8) throw new Error(`expected 8 timeline moments, got ${tl}`);
const firstYear = await page.locator('.timeline__year').first().textContent();
const lastYear = await page.locator('.timeline__year').last().textContent();
if (firstYear.trim() !== '1857' || lastYear.trim() !== '1947') throw new Error(`timeline endpoints ${firstYear}->${lastYear}`);
console.log('PASS: timeline 1857 -> 1947 (' + tl + ' moments)');

// Fighters
const fighters = await page.locator('.fighter').count();
if (fighters !== 6) throw new Error(`expected 6 fighters, got ${fighters}`);
console.log('PASS: freedom fighters (' + fighters + ')');

// Quotes
const quotes = await page.locator('.quote').count();
if (quotes !== 6) throw new Error(`expected 6 quotes, got ${quotes}`);
console.log('PASS: quotes (' + quotes + ')');

// Sounds of Azaadi
const songs = await page.locator('.song').count();
if (songs !== 8) throw new Error(`expected 8 songs, got ${songs}`);
const spotifyBtns = await page.locator('.pl--spotify').count();
if (spotifyBtns !== 8) throw new Error(`expected 8 Spotify actions, got ${spotifyBtns}`);
console.log('PASS: Sounds of Azaadi (' + songs + ' songs, ' + spotifyBtns + ' Spotify actions)');

// Tribute card flow
await page.fill('#tribute-name', 'Ananya Sharma');
await page.fill('#tribute-note', 'To the freedom that lets us dream — Jai Hind!');
await page.click('#tribute-form button[type=submit]');
const cardName = await page.textContent('#tribute-card-name');
if (cardName.trim() !== 'Ananya Sharma') throw new Error(`card name wrong: ${cardName}`);
const actionsVisible = await page.locator('#tribute-actions:visible').count();
if (actionsVisible !== 1) throw new Error('tribute actions should be visible after submit');
const waHref = await page.getAttribute('#btn-whatsapp', 'href');
if (!waHref || !waHref.startsWith('https://wa.me/?text=') || !decodeURIComponent(waHref).includes('Ananya Sharma')) {
  throw new Error(`whatsapp link wrong: ${waHref}`);
}
console.log('PASS: tribute card — personalized card + share actions + WhatsApp link');

// --- Mobile layout: no horizontal overflow at 375px ---
const mobile = await browser.newPage({ viewport: { width: 375, height: 700 } });
await mobile.goto(BASE);
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
if (overflow > 1) throw new Error(`mobile layout overflows by ${overflow}px`);
const songColsMobile = await mobile.evaluate(() => getComputedStyle(document.querySelector('.azaadi-list')).gridTemplateColumns.split(' ').length);
if (songColsMobile !== 1) throw new Error('azaadi list should be single column on mobile');
console.log('PASS: mobile 375px layout — no overflow, single-column sections');
await mobile.close();

// --- prefers-reduced-motion: content still fully visible, no animation needed ---
const reduced = await browser.newPage({ reducedMotion: 'reduce' });
await reduced.goto(BASE);
await reduced.waitForSelector('.song');
const revealVisible = await reduced.evaluate(() => {
  const el = document.querySelector('.timeline li');
  const cs = getComputedStyle(el);
  return { opacity: cs.opacity, transform: cs.transform };
});
if (revealVisible.opacity !== '1') throw new Error(`reduced-motion reveal should be visible, opacity=${revealVisible.opacity}`);
console.log('PASS: prefers-reduced-motion — content visible without animation');
await reduced.close();

// --- Keyboard navigation: skip link first, hero nav links focusable ---
// Fresh load (also re-verifies refresh) — Tab from the address bar must land on
// the skip link first, then the hero nav.
await page.goto(BASE);
await page.waitForSelector('.song');
await page.keyboard.press('Tab');
const focused = await page.evaluate(() => ({ tag: document.activeElement.tagName, cls: document.activeElement.className, href: document.activeElement.getAttribute('href') }));
if (focused.href !== '#main' && !(focused.cls || '').includes('skip-link')) throw new Error(`first Tab should focus the skip link, got ${JSON.stringify(focused)}`);
const navFocus = await page.evaluate(() => {
  const nav = document.querySelector('.hero__nav');
  const link = nav.querySelector('a');
  link.focus();
  return document.activeElement === link && getComputedStyle(link).outlineStyle !== 'none';
});
if (!navFocus) throw new Error('hero nav link should be keyboard-focusable with a visible outline');
console.log('PASS: keyboard navigation — skip link + visible focus on nav links');

if (errors.length) {
  console.log('page errors:', errors.slice(0, 5));
  throw new Error('page errors present');
}

await browser.close();
console.log('\nALL TRIBUTE CHECKS PASSED');
