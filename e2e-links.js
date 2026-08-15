/* Verifies platform song URLs resolve to real song pages (not 404s).
 * JioSaavn/Gaana block plain curl, so we load them in a real browser. */
import { chromium } from 'playwright-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const URLS = {
  jiosaavn: [
    'https://www.jiosaavn.com/song/maa-tujhe-salaam-from-vande-mataram/Q18SRRtnB0U',
    'https://www.jiosaavn.com/song/yeh-jo-des-hai-tera/XTg-QBlFQ2k',
    'https://www.jiosaavn.com/song/aye-mere-watan-ke-logo-from-lata-mangeshkar-live-in-england/ER1ddRN-VWI',
    'https://www.jiosaavn.com/song/sandese-aate-hain/B1AnZUZaeUs',
    'https://www.jiosaavn.com/song/ae-watan-male/CTI5dThBf0U',
    'https://www.jiosaavn.com/song/mera-rang-de-basanti/RwEjBDhSWms',
    'https://www.jiosaavn.com/album/roja/VupdYyvfDlc_',
    'https://www.jiosaavn.com/album/vande-mataram-maa-tujhe-salaam/flO0xzAaIhg_',
  ],
  gaana: [
    'https://gaana.com/song/maa-tujhe-salaam-2',
    'https://gaana.com/song/yeh-jo-des-hai-tera',
    'https://gaana.com/song/bharathumkojaansepyarahai',
    'https://gaana.com/song/mera-rang-de-basanti-2',
    'https://gaana.com/song/ae-watan-male-3',
    'https://gaana.com/album/ae-mere-watan-ke-logo-remastered',
    'https://gaana.com/song/sandese-aate-hai',
  ],
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' });

let fail = 0;
for (const [platform, urls] of Object.entries(URLS)) {
  console.log(`\n== ${platform} ==`);
  for (const url of urls) {
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      const status = resp ? resp.status() : '—';
      const title = (await page.title()).replace(/\s+/g, ' ').slice(0, 80);
      const finalUrl = page.url();
      const looksGood = status < 400 && !/404|not found|page not found/i.test(title + ' ' + finalUrl);
      console.log(`${looksGood ? 'OK ' : 'BAD'} ${status} | ${title} | ${url}`);
      if (!looksGood) fail++;
    } catch (e) {
      console.log(`ERR ${url} — ${e.message.slice(0, 60)}`);
      fail++;
    }
  }
}
await browser.close();
console.log(fail === 0 ? '\nALL LINKS VERIFIED' : `\n${fail} LINK(S) NEED ATTENTION`);
process.exit(fail === 0 ? 0 : 1);
