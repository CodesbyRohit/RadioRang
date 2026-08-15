# 80 Years of Freedom — India at 80 🇮🇳

An Independence Day tribute for **15 August 2026 — the 80th Independence Day of
India**. A premium, fully static tribute to the freedom movement and the people
who made it:

- **Hero** — tricolor motion, the Ashoka Chakra, and a cinematic opening.
- **The Tryst with Destiny** — excerpts from Nehru's midnight address of
  15 August 1947 (public domain in India).
- **The journey in eight moments** — a timeline from the 1857 Revolt to
  Independence, with historically accurate dates and context.
- **The people who made it** — profiles of Gandhi, Nehru, Patel, Bose, Bhagat
  Singh, and Sarojini Naidu.
- **Words that carried a nation** — six documented quotes with sources.
- **Sounds of Azaadi** — eight historically significant patriotic songs, each
  with official Spotify / JioSaavn / Gaana links and Spotify's official embed.
  **No audio is hosted, downloaded, or redistributed** — playback is always
  user-initiated and platform-controlled.
- **Send your tribute** — a shareable, personalized Independence Day card
  (Web Share / copy / WhatsApp).

The site is **fully static** — no server state, no WebSocket, no build step —
which makes it a perfect fit for Vercel (or any static host).

## Run locally

```bash
npm install
npm start        # http://localhost:3000  (minimal static file server)
```

No environment variables are required. There is nothing to build — `public/`
is served as-is.

## Tests

```bash
npm test         # data-integrity tests for the content files (timeline,
                 # fighters, quotes, Tryst excerpts, Sounds of Azaadi)
npm run e2e      # browser E2E (needs local Chrome):
                 #  - e2e-azaadi.js — 8 songs render, platform actions present,
                 #    official Spotify embeds load, zero console errors
                 #  - e2e-links.js  — every JioSaavn/Gaana URL resolves to a
                 #    real song page (Spotify IDs are verified via oEmbed)
```

## Deploy

The app is a plain static site. Point any static host at `public/`:

**Vercel** — the included `vercel.json` is already configured
(`outputDirectory: public`, security headers, no build command):

```bash
vercel --prod
```

That's the whole deployment: no API, no WebSocket, no environment variables.

## Sounds of Azaadi — copyright compliance

- The repository contains **zero audio files**.
- Spotify playback uses **Spotify's official embed mechanism**
  (`open.spotify.com/embed/track/<id>`); every track ID was verified against
  Spotify's public oEmbed endpoint.
- JioSaavn/Gaana buttons link to the official song pages (verified in a
  browser). Where no valid link exists, the button is **omitted** — never
  replaced with a guessed URL.
- Playback is always user-initiated and platform-controlled.

## Historical notes

Timeline dates and events follow standard historical reference accounts of the
Indian freedom movement. Quotes are drawn from documented primary sources:
Nehru's *Tryst with Destiny* (1947, public domain in India), Gandhi's writings,
Bose's Indian National Army address (1944), Patel's speeches, Bhagat Singh's
writings, and Sarojini Naidu's speeches. Content is educational; no endorsement
of any political party is intended.

## Accessibility

Semantic landmarks and headings, visible keyboard focus, a skip link,
`prefers-reduced-motion` support (hero motion, chakra spin, and scroll reveals
all disable), and touch-friendly targets. The design favors readability and
contrast over flashiness.
