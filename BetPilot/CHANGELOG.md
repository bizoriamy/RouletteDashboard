# BETPILOT CHANGELOG
Version tracking: v2.0.0-20260928-Baccarat
Format: NEWEST RELEASE AT THE TOP
Date format: YYYY-MM-DD

---

## v2.0.0-20260928-Baccarat (2026-09-28) — REBUILD (CURRENT)

The module below is no longer a five-file browser prototype. It is a local Python server
application. Full detail, including the review item each fix answers, is in
`BACARAT/CHANGELOG.md`; the review itself is `BACARAT/REVIEW_Baccarat_v1.0.0-20260928.md`.

### Added — a real application
- `BACARAT/app/server.py` — local server owning the session, the settlement rules and the saved
  state; binds to `127.0.0.1` only
- `BACARAT/app/settlement.py` and `BACARAT/app/web/engine.js` — the money rules, server side and
  browser side, held in agreement by a vector test
- `BACARAT/app/web/` — **one** entry screen (setup, table, statistics, history, summary in a single
  page), on the existing gold/red/blue/green theme
- `BACARAT/app/ocr.py` — screen reading with a colour-aware region signature, double-read
  confirmation and duplicate suppression, behind Observe / Confirm / Automatic
- `BACARAT/app/tools/calibrate.py` — capture-region calibration with a preview of what OCR will see
- `BACARAT/config/` — the 9 provider × layout profiles, one region convention, `calibrated: false`
  until measured, plus `ocr.json` as the single provider switch
- `BACARAT/launcher/` — health-checked launcher that also sets always-on-top through the Win32 API
- `BACARAT/tests/` — 457 automated checks and `run-all.ps1` to run them, including a credential scan
- `BACARAT/README.md`, `BACARAT/CHANGELOG.md`, `BACARAT/VERSION` (v2.0.0)

### Fixed — every defect found in the v1.0.0 review
- Outcomes are now **derived** from bet side + casino result; there is no WIN/LOSE lever, which is
  what let the old build pay out a losing bet
- A push is money-neutral; Banker and Player bets push on a Tie
- A hand settles exactly once; a second bet cannot be placed while one is open
- Stakes are bounded by the bankroll, and Banker commission is cent-accurate
- One entry screen, so the values typed at entry can no longer be discarded
- P&L is derived from the session, never from a form field (no more fabricated −1000)
- History survives a refresh; CSV and JSON export work
- The UI no longer advertises OCR features that do not exist

### Security
- Removed a real-looking `DEEPSEEK_API_KEY` value published in
  `BACARAT/API/switch_deepseek_gemini.md`; its first 24 of 35 characters matched the live key, so
  **that key should still be rotated**
- `BACARAT/tests/run-all.ps1` fails the build if a credential-shaped string appears in the module
- Keys remain only in `casino-tracker/.secrets/ocr.env`

### Verified
- `powershell -ExecutionPolicy Bypass -File BACARAT\tests\run-all.ps1` — all seven steps pass

### Superseded (nothing deleted, nothing moved)
- `BACARAT/SOURCE/Baccarat/` — the five prototype files (theme carried over)
- `BACARAT/config_baccarat_*.json` — the old 12 profiles
- `BACARAT/API/` — the old API scaffolding
- `BACARAT/Baccarat_Module_Overview.md`, `Baccarat_Capture_Configuration_Guide.md`,
  `Baccarat_OCR_Integration_Plan.md` — each now carries a banner saying what replaced it
- Awaiting your explicit approval before anything moves to `ARCHIVE/`

### Still open
- Capture-region calibration has to be run on the user's own screen
- `README.step-by-step.md` and `DOCUMENTS/DOCUMENT.md` still describe the v1.0.0 prototype
- Blackjack module, build pipeline, marketing site, accessibility audit — unchanged from v1.0.0

---

## v1.0.0-20260928-Baccarat (2026-09-28) — SUPERSEDED PROTOTYPE

Kept for the audit trail. Do not use it as a description of the current product.

### What was created
- BetPilot root folder, `VERSION`, 5 role definitions (`ROLES/`), `DISCLAIMER.md`, `LICENSE.md`
  (proposal), `DOCUMENTS/DOCUMENT.md` index, `README.step-by-step.md`
- Baccarat documentation: module overview, OCR integration plan, capture-region configuration guide
- `SOURCE/Baccarat/` — five browser files: `baccarat_module.html`, `baccarat_styles.css`,
  `baccarat_app.js`, `baccarat_launcher.html`, `entry.html`
- `BACARAT/API/` — Baccarat-only API folder (`README.md`, `baccarat_ocr_client.py` as a
  comments-only placeholder, `baccarat_api_config.json`)
- `BACARAT/config_baccarat_*.json` — 12 calibration profiles (documented as 9)
- Confirmed at the time: Roulette (`OCR/`) = DeepSeek, Baccarat = Gemini

### What the review found afterwards
Eight reproduced functional defects (including a losing bet paid as a winner, a push that credited
the stake twice, and a hand that could be settled repeatedly), an entry screen whose values never
reached the table, an interface advertising OCR and four modes with no OCR code behind it, 12
profiles with three naming schemes and two contradictory region conventions, and an API key
published in a document. All of it is addressed in v2.0.0 above.

---

## How to Read This
- `NEWEST AT TOP` = the first entry is the most recent
- Each entry lists `Added` / `Changed` / `Fixed` / `Removed`
- Before any public release, add an entry describing what changed
