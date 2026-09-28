# BETPILOT CHANGELOG
Version tracking: v2.5.0-20260928-Baccarat
Format: NEWEST RELEASE AT THE TOP
Date format: YYYY-MM-DD

---

## v2.5.0-20260928-Baccarat (2026-09-28) — OCR EVIDENCE AND A WORKING SPOT-CHECK TOOL

Groundwork for the screen-reading phase. Nothing here claims the reader works on a real casino
display yet — it has still only been tested against synthetic images.

### Added
- **`BACARAT/app/tools/ocr_check.py`** — judge a capture region before trusting it. `--all` reads every
  PNG in `data/samples/` in one pass, `--image` reads a saved screenshot, `--region`/`--profile` read
  the live screen, `--full` reads the display, `--crop-only` saves a sample without calling the model,
  and `--repeat N` measures stability. Each run saves the exact crop that was sent.
- **An OCR accuracy readout** in the module, built from the audit log: readings, accepted, corrected,
  rejected, and the percentage needing no correction, with a plain verdict that recommends staying on
  Confirm mode until the record is clean. This is the evidence required before Automatic mode.

### Fixed
- **The Gemini provider had never run and its model id was retired.** Google's API reported
  `gemini-1.5-flash` (and `gemini-2.5-flash`) as no longer served to this key and named
  `gemini-3.8-flash`. Both the config and the code default now use it, and retired ids or 429/503
  responses produce plain-language messages instead of raw JSON.
- **Session end no longer writes a phantom "stop" event** into the audit log the accuracy readout
  depends on.

### Verified against real data
- All six archived sessions from the evening's testing derive correctly, including one written in the
  older single-wager format.
- The 21:37 session contains a PASS hand carrying its table result, confirming v2.3.0 on a real table.
- The accuracy readout reports "No readings yet" against the real log, correctly: the reader has never
  been started in a session.
- `powershell -ExecutionPolicy Bypass -File BACARAT\tests\run-all.ps1` — all seven steps pass
  (72 engine tests, 55 UI wiring checks, 86 HTTP checks, 55 OCR checks).

### Still open
- **No real screenshot of the casino display has been read yet.** The prompt and crop are unvalidated
  against the user's table and all 9 calibration profiles remain unmeasured. That is the next step and
  it needs samples.

---

## v2.4.0-20260928-Baccarat (2026-09-28) — THE TIE INSURANCE GETS ITS OWN STAKE

From the user's point that a Tie bet is insurance: "I bet 100 on Banker but feel a Tie would come, so
I bet 10." Each wager already carried its own stake internally; what was missing was a way to set it,
because one stake box drove whichever bet was placed next.

### Added
- A dedicated **Tie stake** control, sized independently of the main bet, with −1/+1 nudges (default
  1u). It may be larger or smaller than the main stake.
- **Every bet button now shows the stake it will place** — Banker and Player show the main stake, Tie
  shows the insurance stake. The stake panel is retitled "Main stake".
- Four engine tests, five UI checks and two HTTP checks, including the full 100u + 10u case.

### Verified behaviour (Banker 100u + Tie 10u at $5/unit)
- Banker wins: +$425.00 (banker +$475, insurance −$50)
- Tie lands: +$400.00 (banker stake pushed, insurance pays 8:1 on $50)
- Player wins: −$550.00 (banker −$500, insurance −$50)

Both stakes draw on the same bankroll and cannot exceed it between them.

### Verified
- `powershell -ExecutionPolicy Bypass -File BACARAT\tests\run-all.ps1` — all seven steps pass:
  72 engine tests, 52 UI wiring checks, 84 end-to-end HTTP checks, the settlement agreement and the
  OCR suite.

---

## v2.3.0-20260928-Baccarat (2026-09-28) — PASS NOW RECORDS THE TABLE'S RESULT

### Changed
- **PASS opens the hand with nothing at risk** instead of logging it immediately, so you can record
  what the table showed. That result feeds Hand History, the Banker/Player/Tie distribution and the
  streaks, while the bankroll never moves — a pass is never a win, a loss or a wager, and win rate
  stays about the hands actually bet.
- A pass and a bet cannot share a hand, and a pass cannot carry a stake. Removing it logs nothing.
- Nine engine tests, ten HTTP checks and five UI checks were added.

### Fixed
- A flaw in the test harness: `BACARAT/tests/server_smoke.py` shadowed its passing-check counter, so
  the summary printed "24 passed" while 79 checks had run and passed.

---

## v2.2.1-20260928-Baccarat (2026-09-28) — BEAD SIZE AND FILL ORDER

### Fixed
- The bead dots were far too big: 14px instead of 24px, so the Hand History box is a compact 172px
  square rather than a 281px block.
- The fill order was reversed: the plate now fills **top to bottom first, then left to right**.

---

## v2.2.0-20260928-Baccarat (2026-09-28) — SIDE-BY-SIDE LAYOUT AND THE 100-HAND GRID

Second round of hands-on feedback, gathered while running the module at roughly half screen width
and full length beside the casino window.

### Changed
- **Hand History, Statistics and Bankroll now sit BESIDE the betting column, not below it.** They used
  to stack below 900px — exactly the width used to keep the casino visible — so the panels fell off
  the bottom of the screen. Two columns now hold down to 640px.
- **The bead plate is renamed "Hand History"** and the running-balance table is renamed **"Bankroll"**.
  Statistics is unchanged.
- **The bead plate is a fixed 10 × 10 box holding up to 100 hands**, filled left to right then top to
  bottom, newest last, colour only (red Banker, blue Player, green Tie). It never grows or scrolls;
  past 100 hands the oldest drop off the front, while the Bankroll table and both exports keep
  everything.
- The launcher opens a 960 × 1040 window by default — half of a 1920-wide screen — matching how the
  module is actually used. It still works down to 640px.

### Added
- A hand count in the Hand History header, noting when it is showing only the last 100.
- Eleven new UI checks: two columns at half screen width, stacking only below 640px, a fixed
  10-column bead grid, colour-only beads, and a bead box that neither scrolls nor grows.

### Verified
- `powershell -ExecutionPolicy Bypass -File BACARAT\tests\run-all.ps1` — all seven steps pass
  (38 UI wiring checks, 59 engine tests, 576 settlement cases plus 4 session derivations agreed
  across both language implementations, 40 OCR checks, 68 HTTP checks, credential scan clean).

### Still open
- Capture-region calibration remains the user's step; all 9 profiles are still `"calibrated": false`.
- The superseded prototype files, the old 12 configs and `API/` await an archive decision.
- The first full session on v2.2.0 is the visual check.

---

## v2.1.0-20260928-Baccarat (2026-09-28) — LAYOUT AND MULTI-WAGER UPDATE

Changes made from the first hands-on review of the rebuilt module.

### Added
- **A Tie bet can now be placed alongside Banker or Player on the same hand**, as at a real table.
  One wager per side; Banker and Player remain mutually exclusive. One result settles every open
  wager, the hand's outcome is the net of them, and the history shows each wager with its own
  outcome. Individual wagers can be removed before the result is recorded.
- Wager count in the statistics block, separate from hand count.
- A `wagers` column in the CSV export (`banker:10;tie:1`) so hedged hands are analysable.

### Changed
- **The disclaimer moved to the bottom of the window** at the user's request. It remains always
  visible, full text, on a `<footer>` — the compliance requirement is unchanged.
- **The layout now fits one window with no page scrolling.** Header, content and a bottom disclaimer
  bar form a fixed-height column; only the betting column and the hand-history table scroll
  internally. The launcher opens a taller window (1240×900). The OCR panel is collapsible and opens
  itself when a reading is waiting for approval.
- The stake control stays live while a hand is open, so a Tie side bet can be added at its own stake.
- Stakes remain whole units with a 1-unit minimum; derived figures stay fractional and correct.
- The "one open bet at a time" guard becomes "one wager per side", matching the table's real rules.
- `VERSION` is now `v2.1.0-20260928-Baccarat`; module `VERSION`, page title, launcher and health
  endpoint all agree.

### Verified
- `powershell -ExecutionPolicy Bypass -File BACARAT\tests\run-all.ps1` — all seven steps pass:
  59 engine tests, 576 settlement cases and 4 session derivations agreed across both language
  implementations, 27 UI wiring checks (including "disclaimer is at the bottom" and "the page does
  not scroll"), 40 OCR checks, 68 end-to-end HTTP checks, and the credential scan.
- A real provider call through `BACARAT\tests\provider_check.py` confirmed the rotated DeepSeek key
  reads a synthetic result panel correctly.

### Still open
- Capture-region calibration remains the user's step; all 9 profiles are still `"calibrated": false`.
- The superseded prototype files, the old 12 configs and `API/` await an archive decision.
- The Baccarat module has not yet been used for a full session in the new build.

---

## v2.0.0-20260928-Baccarat (2026-09-28) — REBUILD

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
