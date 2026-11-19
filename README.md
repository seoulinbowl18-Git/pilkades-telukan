# E-Pilkades Digital — Kelurahan Telukan, Grogol (Periode 2026–2034)

Static single-page web app (PWA) for a community polling simulation. The whole app is in a single file, `index.html`, with no build step.

> **Disclaimer:** This app is only a survey/poll for community entertainment. It is not an official election. All data is stored in the user's browser (`localStorage`).

## Features
- Voter registration with a WhatsApp number (1 number = 1 vote)
- Simulated OTP token (`KADES-XXXX`) with instant demo verification
- Digital voting booth with 3 village head candidates
- Live result statistics
- Committee panel (demo PIN: `1234`)
- Installable as a PWA (manifest generated inline)

## Structure
```
.
├── index.html   # the entire app (HTML + Tailwind CDN + JS)
└── README.md
```

## Deployment (Vercel)
- Project: `pilkades-telukan-grogol`, connected to this GitHub repository, branch `main`.
- Framework preset: **Other** (static), no build command, output directory: root (`.`).
- Every push to `main` triggers a new production deployment.

## Run locally
Open `index.html` directly in a browser, or:
```bash
python3 -m http.server 8080
```
