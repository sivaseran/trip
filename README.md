# 🏴 Scotland Family Road Trip — Trip Companion App

A mobile-first travel companion for the 5-family Scotland road trip (1–6 Aug 2026).
Plain HTML/CSS/JS — no build step, no framework — so it runs straight from GitHub Pages
and installs as a PWA on any phone, the same way the Shift Planner app did.

## Project structure

```
Scotland/
├── index.html          # App shell — all screens live here, toggled by app.js
├── style.css            # Design system ("single-track Highland road" theme)
├── app.js               # All logic: nav, rendering, localStorage persistence
├── manifest.json         # PWA manifest (installable on iPhone/Android)
├── sw.js                 # Service worker — caches the app shell for offline use
├── favicon.png
├── assets/
│   ├── icons/            # App icons (192px, 512px)
│   └── images/           # Drop real photos / logo here later
└── data/
    └── itinerary.json    # Single source of truth — everything renders from this
```

## Running it locally

Because the app fetches `data/itinerary.json`, opening `index.html` directly with
`file://` will fail in most browsers (CORS on fetch). Run a tiny local server instead:

```bash
cd Scotland
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploying to GitHub Pages

This repo includes `.github/workflows/deploy.yml`, so deployment is automatic:
every push to `main` rebuilds and republishes the site — no manual steps after
the one-time setup below.

**One-time setup:**
1. Push this folder to a new GitHub repo (e.g. `scotland-trip`).
2. Repo → **Settings → Pages** → under **Build and deployment → Source**,
   choose **GitHub Actions** (not "Deploy from a branch").
3. Push (or re-push) to `main` — the **Actions** tab will show the
   "Deploy to GitHub Pages" workflow running. Once it's green, your app is live at
   `https://<username>.github.io/scotland-trip/`.
4. Share that one URL with all five families. On iPhone: open the link in Safari →
   Share → **Add to Home Screen** to install it like a native app.

**From then on:** any edit you push to `main` — a data change in
`itinerary.json`, a style tweak, a new day — goes live automatically within
about a minute, with no need to touch Settings again.

## What's already working (Phase 1)

- **Home** — travel path (route progress), today's plan, countdown, weather card,
  tonight's accommodation, key stats.
- **Itinerary** — all 6 days as expandable cards with attractions and a
  "View Route" link that opens Google Maps with every stop plotted.
- **Families** — editable cards (name, adults, children, vehicle, driver, backup
  driver, postcode, phone) saved on-device; each has a **Navigate** button to
  Moto Knutsford.
- **Expenses** — log spend by category and family, automatic equal-split
  calculation showing who's owed what.
- **More** → Accommodation, Packing (interactive checklist with progress bar),
  Weather, Emergency numbers, Notes, Settings.
- Installable **PWA** with offline app-shell caching.

## Editing the trip data

Everything the app displays comes from `data/itinerary.json`. To update dates,
add a family, change accommodation, or add a day, edit that file — no code
changes needed. Personal edits people make in the app itself (packing ticks,
expenses, family details, notes) are stored in each browser's `localStorage`,
so they're per-device until v2's cloud sync lands.

## Roadmap

**Next layer of data** (makes the app behave more like Maps + TripAdvisor):
- GPS coordinates for every stop
- Estimated arrival/departure times & driving durations between stops
- Parking, toilets, fuel stations near each stop
- Restaurant/coffee recommendations
- Estimated costs & attraction ticket prices/opening hours
- Best photo spots
- Nearby hospitals, pharmacies, police stations
- Offline map references

**Version 2:**
- Shared cloud sync (so all 5 families see the same expenses/packing/notes)
- Photo gallery
- Live location sharing between families
- Group chat
- Notifications
- Full offline mode
- PDF travel memory book export

**Possible v3:** rebuild the UI in React/Next.js once the feature set outgrows
plain JS — the `data/itinerary.json` shape is designed to drop straight into
that migration without changes.
