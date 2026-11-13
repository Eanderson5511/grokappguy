# Dual Tube

A free, installable web app that plays **two YouTube videos at the same time** — one deck for an audiobook (or any long video), one for background music.

No account, no payment, no server of our own. Everything runs in your browser. Links, volumes, and your audiobook position are saved only on this device.

## Use it

Open the live site if you have one, or from this folder:

```bash
python3 -m http.server 4173
```

Then visit [http://127.0.0.1:4173/](http://127.0.0.1:4173/). Opening `index.html` as a file often fails because YouTube’s player needs a real origin (`http` or `https`).

On a phone or desktop, use **Install** / **Add to Home Screen** for a full-screen app icon.

## Features

- Two independent players with play/pause, seek, volume, and mute
- Audiobook skips (±15s / ±30s) and speed (0.75×–2×)
- Music loop
- Play both / pause both, plus a balance (crossfade) slider
- Remembers last links, volumes, and audiobook position
- Compact mode shrinks the videos without fully hiding them (so YouTube keeps playing)
- Optional **Keep screen on** (Wake Lock) for more reliable mobile listening
- Tries to resume both decks after a call or when you return to the app
- Works offline as a shell (the YouTube videos themselves still need a network)

## Phone limits (honest)

- **Desktop and Android Chrome:** both videos can play at once; per-deck volume usually works.
- **iPhone / iPad Safari:** typically only one unmuted video at a time, and per-player volume is usually ignored. Use the device volume, or mute one deck.
- **Calls, app switching, and screen lock:** phones pause browser audio during calls and usually when the screen locks. Dual Tube cannot reliably play YouTube with the screen off or through a call. It will try to resume when you come back. **Keep screen on** and leaving the app visible are the most reliable options.

## Host it for free

This folder is a static site. Any free static host works, for example [GitHub Pages](https://pages.github.com/) (upload this repo and enable Pages from the `main` branch, `/` root), [Cloudflare Pages](https://pages.cloudflare.com/), or [Netlify Drop](https://app.netlify.com/drop).

## Files

- `index.html` — app, styles, and player logic
- `yt-parse.js` — YouTube URL / ID parser
- `manifest.json` / `sw.js` / `icon.svg` / `icon-192.png` / `icon-512.png` — PWA shell
