# BETPILOT — BACARAT CHANGELOG

Format: newest release at the top. Dates are YYYY-MM-DD.
Every entry states what changed in plain language, what was verified, and what is still open.

---

## v2.5.2-20260928-Baccarat (2026-09-28) — CAPTURE A SAMPLE FROM THE MODULE ITSELF

Judging a calibration region needed a terminal command, which is the wrong ask for a non-programmer.
It is now a button.

### Added

- **"Save a screenshot sample" in the OCR panel.** One click captures what the reader would see and
  saves it into `data/samples/` — **without calling the model**, so it costs nothing and records
  nothing in the session. It reports the saved path in a toast and in the panel note, and says plainly
  whether the profile it used is calibrated. The path can be opened directly to check that the region
  really shows the hand result.
- The endpoint behind it (`POST /api/baccarat/ocr/sample`) accepts an optional `profileId` and falls
  back to the whole screen when no region is known; an unknown profile is refused by name, and a
  screen that cannot be captured is reported as such rather than as a saved file.

### Verified

- `powershell -ExecutionPolicy Bypass -File tests\run-all.ps1` — all seven steps pass. The HTTP suite
  now captures a real sample in the sandbox and checks that it lands in the data directory with a
  size and a signature (90 checks, up from 86; 56 UI checks, up from 55).

### Still open

- **A real screenshot of the casino display is still the missing piece.** The prompt reads every
  synthetic presentation correctly (9 of 9), but the crop, the real table's animation and how the
  result is actually displayed there need the user's screen. All 9 calibration profiles are still
  unmeasured.

---

## v2.5.1-20260928-Baccarat (2026-09-28) — PROMPT GENERALITY, PROVEN AND RE-RUNNABLE

The screen reader is still unvalidated against the real casino display, but its prompt has now been
tested against nine synthetic presentations of a result — and the small-text question the plan left
open is answered: no preprocessing is needed.

### Added

- **`tests/make_ocr_fixtures.py`** — draws nine synthetic Baccarat result displays into
  `data/samples-synthetic/`: bold text, 11px text, a single letter in a coloured circle, a strip of
  past results, a Chinese label (庄), a low-contrast dark-on-dark panel, a card-value mock
  (B 9 vs P 7), a plain worded result, and a busy table with six decoy markers plus a small newest
  one. Each filename ends `-expected-BANKER|PLAYER|TIE`, so a wrong reading is visible at a glance.
- **`--grade` on `ocr_check.py`** — reads a folder of fixtures, compares each reading with the result
  its filename declares, and exits non-zero on any mismatch. A prompt change can now be regression
  checked in one command instead of by eye:
  ```
  python app\tools\ocr_check.py --all --samples-dir data\samples-synthetic --grade
  ```

### Result: 9 of 9 correct

| Presentation | Reading | Confidence |
|---|---|---|
| Bold "BANKER" on a red panel | BANKER | 0.97 |
| 11px "PLAYER" on a blue panel | PLAYER | 0.95 |
| Green circle with a white "T" | TIE | 0.95 |
| Strip of eight dots, newest last (blue) | PLAYER | 0.95 |
| Chinese 庄 on a dark panel | BANKER | 0.95 |
| B 9 against P 7 | BANKER | 0.98 |
| Low-contrast dark-on-dark "PLAYER" | PLAYER | 0.85 |
| Plain green "TIE" on black | TIE | 0.98 |
| Busy table, six decoy dots, small newest red | BANKER | 0.80 |

**Decision recorded:** an 11px label read at 0.95 confidence, so upscaling/preprocessing is *not*
justified by the evidence and has deliberately not been added. Two runs produced identical results
with slightly different confidences (0.80–0.98), which is why the double-read agreement check
compares the *result* rather than the confidence.

### Fixed

- **A crash on non-Latin text.** The model quotes what it sees, so a Chinese-labelled table put 庄 in
  its evidence — and printing that on a CP1252 Windows console raised UnicodeEncodeError, killing the
  diagnostic tool exactly when it was needed. `ocr_check.py`, `provider_check.py` and the server now
  replace characters the console cannot encode instead of dying. Found by running the Chinese fixture.

### Verified

`powershell -ExecutionPolicy Bypass -File tests\run-all.ps1` — all seven steps pass (72 engine tests,
55 UI wiring checks, 86 HTTP checks, 55 OCR checks, the settlement agreement and the credential scan).

### Still open

- **A real screenshot of the casino display is still needed.** The prompt is general across every
  presentation tested, but the crop, the animation on the real table and the truth about how the
  result is displayed there all require the user's screen. All 9 calibration profiles remain
  unmeasured.

---

## v2.5.0-20260928-Baccarat (2026-09-28) — OCR EVIDENCE AND A WORKING SPOT-CHECK TOOL

Groundwork for the screen-reading phase. Nothing here claims the reader works on a real casino
display yet — it has still only been tested against synthetic images.

### Added

- **`app/tools/ocr_check.py`** — the tool for judging a region before trusting it:
  `--all` reads every PNG in `data/samples/` in one pass, `--image` reads one saved screenshot,
  `--region` / `--profile` read the live screen, `--full` reads the whole display, `--crop-only`
  captures and saves **without calling the model** (free sample collection), and `--repeat N` asks
  the same crop repeatedly to measure stability. Every run saves the exact crop that was sent, so
  what the model saw can be compared with what you see.
- **An OCR accuracy readout**, built from the audit log, shown in the module: readings taken, how many
  were accepted, how many you had to correct, how many were rejected, and the percentage that needed
  no correction — plus a plain verdict. It refuses to flatter: under 20 readings it says "too few to
  judge", and it recommends staying on Confirm mode unless the record is clean. This is the evidence
  needed before Automatic mode can be justified.

### Fixed

- **The Gemini provider had never actually run, and its model id was retired.** Google's API reported
  `gemini-1.5-flash` (and `gemini-2.5-flash`) as no longer served to this key and named
  `gemini-3.8-flash` as the replacement. Both `config/ocr.json` and the code default now use it. A
  retired id or a 429/503 now produces a plain-language message instead of raw JSON.
- **Session end no longer writes a phantom "stop" event.** Every session you ended logged a stop even
  though the reader had never been started, which pollutes the audit log — the very log the accuracy
  readout depends on. It now logs a stop only when the reader was genuinely running.

### Verified against your real data

- All six archived sessions from your evening's testing derive correctly under the current code —
  including the one written in the older single-wager format, which proves the legacy reader works on
  real files rather than only on constructed ones.
- Your 21:37 session contains a **PASS hand carrying the table result (`player`)**, so the v2.3.0
  pass behaviour is confirmed on a real table. The earlier sessions' pass hands have no result, as
  expected — PASS could not record one until v2.3.0.
- The accuracy readout reports "No readings yet" against your actual log, which is correct: the reader
  has never been started in a session. The six lines in it were the phantom stops, now fixed.

### Verified

`powershell -ExecutionPolicy Bypass -File tests\run-all.ps1` — 72 engine tests, 55 UI wiring checks,
86 end-to-end HTTP checks, 55 OCR checks (including the accuracy arithmetic and the verdict
thresholds), the settlement agreement and the credential scan all pass.

### Still open — the actual hard part

- **No real screenshot of the casino display has been read yet.** The prompt and the crop are
  unvalidated against the user's table, and calibration is still unmeasured (all 9 profiles are
  `"calibrated": false`). That is the next step, and it needs samples from the user.

---

## v2.4.0-20260928-Baccarat (2026-09-28) — THE TIE INSURANCE GETS ITS OWN STAKE

From your point that a Tie bet is insurance: "I bet 100 on Banker but feel a Tie would come, so I bet
10." The engine already recorded each wager with its own stake — what was missing was a way to *say*
so, because the single stake box drove whichever bet you placed next.

### Added

- **A dedicated Tie stake control**, sized independently of the main bet, with −1 / +1 nudges. Default
  1u, and it can be larger or smaller than the main stake.
- **Each bet button now shows the stake it will place** — Banker and Player show the main stake, Tie
  shows the insurance stake — so there is no ambiguity at the moment you click.
- The stake panel is retitled **"Main stake"** to make the distinction explicit.
- The Tie stake hint reads out its dollar value ("10u = $50.00 insurance") and notes when one is
  already placed.

### Behaviour, verified by test

Banker 100u + Tie 10u at $5/unit:

| Table shows | Banker wager | Tie insurance | Hand nets |
|---|---|---|---|
| Banker | win +$475.00 | lose −$50.00 | **+$425.00** |
| Tie | push $0.00 | win +$400.00 (8:1) | **+$400.00** |
| Player | lose −$500.00 | lose −$50.00 | **−$550.00** |

Without the insurance those would be +$475 / −$500 / −$500: the $50 converts a $500 loss into a $550
loss and pays $400 when the Tie lands, which is exactly what insurance is for.

Both stakes draw on the same bankroll, so together they still cannot exceed it (8u + 2u of a 10u
bankroll is allowed; 8u + 5u is refused).

### Added to the tests

- Four engine tests (independent stakes, insurance larger or smaller than the main bet, the shared
  bankroll cap, and the stakes surviving a save/reload).
- Five UI checks (the Tie has its own control, the Tie button uses it, the buttons display their
  stakes, the cap, and the nudges).
- Two HTTP checks covering the 100u + 10u case end to end through the server.

### Verified

`powershell -ExecutionPolicy Bypass -File tests\run-all.ps1` — 72 engine tests, 52 UI wiring checks,
84 end-to-end HTTP checks, the settlement agreement and the OCR suite all pass.

### Still open

- Capture-region calibration is still yours to run (all 9 profiles remain `"calibrated": false`).
- The superseded prototype files, the old 12 configs and `API/` await your archive decision.

---

## v2.3.0-20260928-Baccarat (2026-09-28) — PASS NOW RECORDS THE TABLE'S RESULT

From your question about sitting a hand out: a pass used to leave the hand invisible to Hand History
because it was logged with no result at all. A bead plate is a record of the *table*, not of your
bets, so a hand you sat out should still take its place in it.

### Changed

- **PASS opens the hand with nothing at risk instead of logging it immediately.** Press PASS and the
  hand waits, exactly like a bet hand, for you to record what the table showed. Pressing
  Banker / Player / Tie then files the result into Hand History and leaves the bankroll untouched.
  It works whether you press PASS before or after the result appears.
- A passed hand **never counts as a win, a loss or a wager**, and win rate stays about the hands you
  actually bet — while its result *does* feed the bead plate, the Banker/Player/Tie distribution and
  the streaks, which now follow the real table rather than only your bets.
- A pass and a bet cannot share one hand: place a bet and you must remove it before passing, and vice
  versa. The pass can be removed (or "Cancel all") at any point and **nothing is logged**.
- The open-hand panel says plainly that nothing is at risk, and the stake controls lock while a hand
  is passed.
- `recordPass` remains for the OCR observe path, where the result is already known when it is read.

### Added

- Nine engine tests, ten HTTP checks and five UI checks covering the pass flow, including that a
  passed hand records the result, moves no money, stays out of the win/loss counts, feeds the
  distribution and streaks, cannot be combined with a bet, cannot carry a stake, and undoes cleanly.

### Fixed

- A flaw in the test harness itself: `tests/server_smoke.py` used a local name that shadowed the
  passing-check counter, so the summary printed "24 passed" while 79 checks had actually run and
  passed. The count is now honest.

### Verified

`powershell -ExecutionPolicy Bypass -File tests\run-all.ps1` — 68 engine tests, 47 UI wiring checks,
79 end-to-end HTTP checks, the settlement agreement and the OCR suite all pass.

### Still open

- Capture-region calibration is still yours to run (all 9 profiles remain `"calibrated": false`).
- The superseded prototype files, the old 12 configs and `API/` await your archive decision.

---

## v2.2.1-20260928-Baccarat (2026-09-28) — BEAD SIZE AND FILL ORDER

Two corrections from your first look at v2.2.0.

### Fixed

- **The dots were far too big.** Cells are now 14px instead of 24px, so the Hand History box is a
  compact 172px square rather than a 281px block, and it sits centred in its panel.
- **The fill order was the wrong way round.** The plate now fills **top to bottom first, then left to
  right** — down each column before starting the next one (`grid-auto-flow: column`), which is what
  you meant. The earlier row-major arrangement was my misreading of "left to right, up to down".
- The panel hint and the accessible label now state the correct order.

### Verified

`powershell -ExecutionPolicy Bypass -File tests\run-all.ps1` — 42 UI wiring checks now, including
"the grid fills TOP TO BOTTOM first, then left to right", "the dots are small (14px, not 24px)" and
"the panel hint states the fill order the user asked for".

### Still open

- Capture-region calibration is still yours to run (all 9 profiles remain `"calibrated": false`).
- The superseded prototype files, the old 12 configs and `API/` await your archive decision.

---

## v2.2.0-20260928-Baccarat (2026-09-28) — SIDE-BY-SIDE LAYOUT AND THE 100-HAND GRID

Changes made from the second hands-on review, where the module is run at roughly half screen width
and full length beside the casino window.

### Changed

- **The secondary panels now sit beside the betting column instead of below it.** They previously
  stacked at anything under 900px wide, which is exactly the width you use to keep the casino visible,
  so Hand History, Statistics and Bankroll fell off the bottom of the screen. The two-column layout
  now holds down to 640px; only a window narrower than that stacks.
- **The bead plate is renamed "Hand History"**, and the table that holds the running bankroll is
  renamed **"Bankroll"**. Statistics is unchanged, as you asked.
- **The bead plate is now a fixed 10 × 10 box holding up to 100 hands**, filled left to right then top
  to bottom, newest last. Colour only — no letters. The box never grows or scrolls, so the layout
  stays put for a whole session; once 100 hands are recorded the oldest drop off the front (the
  Bankroll table still lists every hand, and both exports keep everything).
- The launcher opens a 960 × 1040 window by default — half of a 1920-wide screen — matching how you
  actually use it. Resizing is still fine: the layout just needs 640px.
- Statistics and panel spacing were tightened slightly so three panels plus the strip fit a
  full-length half-width window.

### Added

- The Hand History panel header shows the recorded hand count, and notes when it is showing only the
  last 100.
- Eleven new UI checks, including "the layout keeps two columns at half screen width", "it only
  stacks below 640px", "the bead grid is a fixed 10-column grid", "beads carry no letters" and
  "the bead box does not scroll or grow".

### Verified

`powershell -ExecutionPolicy Bypass -File tests\run-all.ps1` — 38 UI wiring checks now, plus the
engine, cross-language, OCR and end-to-end suites.

### Still open

- Capture-region calibration is still yours to run (all 9 profiles remain `"calibrated": false`).
- The superseded prototype files, the old 12 configs and `API/` await your archive decision.
- Not yet used for a full session in the new build; the first run of v2.2.0 is your visual check.

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
