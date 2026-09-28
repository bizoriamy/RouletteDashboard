# BETPILOT — BACARAT CHANGELOG

Format: newest release at the top. Dates are YYYY-MM-DD.
Every entry states what changed in plain language, what was verified, and what is still open.

---

## v2.1.0-20260928-Baccarat (2026-09-28) — LAYOUT AND MULTI-WAGER UPDATE

Changes made from your first hands-on review of the module.

### Added

- **A Tie bet can now be placed alongside Banker or Player**, as at a real table. A hand may carry
  one wager per side; Banker and Player stay mutually exclusive. One result settles every open wager,
  the hand's outcome is the net of them, and the history shows each wager with its own outcome.
  Each wager can also be removed on its own before the result is recorded.
- `stat-wagers` in the statistics block, so wager count is visible separately from hand count.
- CSV export gained a `wagers` column (`banker:10;tie:1`), so hedged hands are analysable in a
  spreadsheet. JSON export already carried the full detail.
- Nine new engine tests, four new HTTP checks, seven new UI checks, and a fourth cross-language
  session vector covering hedged hands.

### Changed

- **The disclaimer moved to the bottom of the window** at your request. It is still always visible,
  still the full text, and still carried on a `<footer>` — relocating it did not weaken the
  compliance requirement in `DISCLAIMER.md`.
- **The layout now fits one window with no page scrolling.** The page is a three-row flex column
  (header, content, disclaimer); the betting column and the hand-history table are the only regions
  that scroll internally when they must, and the launcher opens a taller window (1240×900).
  The OCR panel is collapsible, and expands by itself whenever a reading is waiting for approval.
- The stake control stays live while a hand is open, so a Tie side bet can be added at its own stake;
  the ceiling shrinks to whatever the open wagers have not already committed.
- Stakes remain whole units with a **1-unit minimum**; derived figures stay fractional and correct
  (0.95u, 1.5u, 1.75u) — confirmed with you as intended behaviour.
- The old "one open bet at a time" guard becomes "one wager per side", which is the rule your table
  actually plays. The orphaned-hand protection is preserved by that rule and by netting.
- `VERSION` is now `v2.1.0-20260928-Baccarat`; the page title, launcher and health endpoint follow it.

### Fixed

- Nothing was broken in v2.0.0 by this work; the money model was extended, not repaired. The
  previously fixed defects all still have tests guarding them.

### Verified

`powershell -ExecutionPolicy Bypass -File tests\run-all.ps1`, plus a real provider call through
`tests\provider_check.py`.

### Still open

- Capture-region calibration is still yours to run (all 9 profiles remain `"calibrated": false`).
- The superseded prototype files, the old 12 configs and `API/` are still awaiting your archive
  decision.
- `BetPilot/VERSION`, `BetPilot/CHANGELOG.md` and `BetPilot/README.step-by-step.md` need the same
  version bump and the new multi-wager instructions.

---

## v2.0.0-20260928-Baccarat (2026-09-28) — REBUILD

The v1.0.0 module was a five-file browser prototype. An independent review
([REVIEW_Baccarat_v1.0.0-20260928.md](REVIEW_Baccarat_v1.0.0-20260928.md)) reproduced eight
functional defects in it and one credential exposure. This release replaces the prototype rather
than patching it.

### Added — the application

- `app/server.py` — local server (127.0.0.1 only) that owns the session, the settlement rules and the
  saved state. Binds to loopback only, unlike the Roulette server which listens on every interface.
- `app/settlement.py` — the money rules, server side.
- `app/web/engine.js` — the money rules, browser side. Pure: no DOM, no network.
- `app/web/index.html`, `baccarat.css`, `ui.js` — **one** entry screen. Setup, table, statistics,
  history and the end-of-session summary are sections of a single page.
- `app/ocr.py` — screen reading: capture, DeepSeek or Gemini call, colour-aware region signature,
  double-read confirmation and duplicate suppression.
- `app/tools/calibrate.py` — capture-region calibration (OpenCV ROI, Tk fallback, or
  `--region x,y,w,h`), which writes the measured region into the chosen profile and saves a preview
  PNG of exactly what the OCR will see.
- `config/` — the 9 documented provider × layout profiles, every one with an explicit
  `"regionConvention": "x, y, width, height"` and `"calibrated": false` until a human measures it.
- `config/ocr.json` — the single provider switch the old documents promised but never delivered
  (`"provider": "deepseek"` or `"gemini"`; keys stay in `.secrets/ocr.env`).
- `launcher/Start Baccarat.bat` + `baccarat-launcher.ps1` — health-checked start, stale-server
  cleanup, port-ownership refusal, Chrome app window, and always-on-top applied through the Win32 API.
- `README.md` — what the module is, how to run it, and what is still open.
- Tests: `tests/engine.test.js` (47), `tests/generate-vectors.js` + `tests/settlement_test.py`
  (576 settlement cases and 3 session derivations agreed across both implementations),
  `tests/ui_wiring_test.py` (20), `tests/ocr_test.py` (40), `tests/server_smoke.py` (54),
  and `tests/run-all.ps1`, which runs all of it plus a credential scan.

### Fixed — every defect the review found

| Review item | What it was | What it is now |
|---|---|---|
| H2 | The outcome was typed by hand, so Banker + "Player result" + WIN paid out as a winner | Outcome is derived from bet side + casino result. There is no WIN/LOSE button |
| H3 | A push credited the stake a second time | Banker and Player bets push on a Tie, money-neutral, verified |
| H4 | A double click on WIN paid twice | A hand settles once; a repeat is refused |
| H7 | A second bet orphaned the first hand | One open bet at a time; a second bet is refused |
| H5 | The entry screen's values never reached the table | One page — there is nothing to hand off |
| H6 | Ending a session reported a fabricated −1000 | P&L is derived from the session, never from a form field |
| H1 | The in-table OCR buttons called an undefined function | No inline handlers at all; guarded by a test |
| H8 | The UI advertised OCR and four modes that did not exist | OCR is implemented; modes are enabled only when the stack and key are actually present |
| M1 | Banker commission rounded up to whole units | Cent-accurate: a 1-unit Banker win at $5 pays $4.75 |
| M2 | `×2` ran unbounded and stakes could exceed the bankroll | Stake ceiling plus a bankroll check, server-side |
| M3 | "Clear" reset the bet to 10 | It clears |
| M14 | A stale result panel showed the previous hand's outcome | The panel is rebuilt from state on every render |
| M15 | A negative starting bankroll was accepted | Refused at the server |
| M16 | The bankroll label and the real state diverged after a reset | The view holds no money state at all |
| M5 | History was lost on refresh and Export was a stub | Every change is written to `data/current-session.json`; CSV and JSON export work |
| M7 | Always-on-top used flags browsers ignore | Applied through `SetWindowPos` from the local server |
| D1 | Four documents disagreed about the default provider | One file, `config/ocr.json`, default `deepseek` (the key that demonstrably works) |
| D2/D15/D16 | 12 profiles, three naming schemes, mixed region conventions, dropped keys | 9 profiles, one convention, identical key set |
| D3 | The UI's table values matched no config file | The dropdown is built from the profile files themselves |
| D6 | The docs described a state before the code existed | This changelog and the README describe what exists |

### Security

- **Removed a published credential.** `API/switch_deepseek_gemini.md` printed a 35-character
  `DEEPSEEK_API_KEY` value whose first 24 characters matched the live key. The value is gone and the
  file now says the keys are already in place and must never be re-pasted. **The DeepSeek key should
  still be rotated**, because 24 of its 35 characters were written to disk.
- `tests/run-all.ps1` now fails the build if a real-looking credential appears anywhere in the module.
- The server binds to `127.0.0.1` and its write endpoints reject non-local callers.
- Keys continue to live only in `casino-tracker/.secrets/ocr.env`; the OCR module reads them at
  runtime and never returns them to the browser.

### Verified

`powershell -ExecutionPolicy Bypass -File tests\run-all.ps1` — all seven steps pass:
engine tests, settlement vector agreement, UI wiring, OCR logic and mode semantics, end-to-end HTTP
behaviour, and the credential scan.

### Superseded (nothing deleted)

Still on disk, awaiting your decision to archive:

- `SOURCE/Baccarat/` — the five prototype files. The theme was carried over.
- `config_baccarat_*.json` in this folder — the old 12 profiles with contradictory region semantics.
- `API/` — the old API scaffolding, including the document that leaked the key.

### Not done yet

- **Region calibration is yours to run.** All 9 profiles ship uncalibrated and the UI says so. The
  OCR region depends on your resolution, display scale and window position.
- No shoe-level statistics, and no colouring of the bead plate by table position.
- `BetPilot/VERSION`, `BetPilot/CHANGELOG.md` and `BetPilot/README.step-by-step.md` (outside this
  folder) still describe v1.0.0 and need the same treatment.

---

## v1.0.0-20260928-Baccarat (2026-09-28) — ORIGINAL PROTOTYPE

Documents plus a five-file browser prototype (`SOURCE/Baccarat/`): `baccarat_app.js`,
`baccarat_module.html`, `baccarat_launcher.html`, `entry.html`, `baccarat_styles.css`, together with
the `API/` scaffolding and 12 calibration profiles.

Reviewed on 2026-09-28 and found not releasable: eight reproduced functional defects, a lever that
paid out losing bets, a hand model that could not detect duplicates, and a credential published in a
document. Superseded by v2.0.0 above.
