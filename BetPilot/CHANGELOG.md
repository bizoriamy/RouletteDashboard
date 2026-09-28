# BETPILOT CHANGELOG
Version tracking: v2.8.0-20260928-Baccarat
Format: NEWEST RELEASE AT THE TOP
Date format: YYYY-MM-DD

---

## v2.8.0-20260928-Baccarat (2026-09-28) — THE READER READS THE LIVE TABLE

The milestone this phase was for: **the reader read the user's live casino display through their own
calibrated region**, and got it right.

### The verified result
- **PLAYER 0.95 in 3.4 s** — "Player total 9 is higher than Banker total 7; PLAYER panel is
  highlighted" — and the saved picture confirms it: blue box 9, red box 7, PLAYER panel bright.
- Correct PLAYER and BANKER readings throughout, e.g. "Player total 9 (8+A) beats Banker total 8
  (9+9)".
- **TIE 0.95**, verified against the picture: both totals green at **7**, TIE panel bright, both sides
  dimmed. (A real Tie on the live table — previously only verified on a mock.)
- **NONE** promptly during betting phases, with no false readings.
- 22 live readings: 12 decisive, all correct, and **no empty replies at all** with the tightened region.

### Fixed — the region was too busy, and a bigger token budget would not have helped
- The first live read of the calibrated region **failed outright**: the model spent its whole token
  budget deliberating and answered nothing. Raising the budget to 6000, downscaling, and retrying all
  changed **nothing**. Cropping out the **history grid on the left** and the **balance row at the
  bottom** fixed it instantly — 3.4 s at 0.95.
- The profile is tightened to `1220,840,437x135` with provenance recorded. The advice is now in the
  error message itself, in the Draw-the-region overlay, and in the README.

### Added — draw the region by hand
- A **"Draw the region"** button: your screen opens *inside the module*, you drag a box, and it saves
  the region, writes a picture of it to `data/calibration/`, and reads it once so you are told what
  the reader sees. Display pixels are converted back to screen pixels by the scale sent with the
  picture. The picture stays on this machine.

### Fixed — a self-captured sample could not really calibrate
- "Find my table" was being run on a sample the module had itself captured from the **region already in
  use** and reporting a 0.787 match — circular: it only confirms the region it came from. User-snipped
  samples now take priority; a self-captured one is reported as circular with an explanation, writes
  nothing, and never sets `calibrated`.

### Changed
- Profiles now serve their calibration **provenance**, and the panel shows it in green ("Calibrated
  from real-02-expected-PLAYER.png (0.95 match)") or amber ("NOT calibrated yet — still pointed at a
  guess").
- A reading's note is labelled **"reader's note (may be imprecise)"** — measured reason: the Tie was
  read correctly while its note said "5 equals 5", the boxes reading 7 and 7.

### Verified
- `powershell -ExecutionPolicy Bypass -File BACARAT\tests\run-all.ps1` — all **nine** steps pass
  (100 OCR, 69 UI wiring, 100 HTTP, 42 live-loop, 19 locator).
- Two tests that assumed no profile is ever calibrated were rewritten to the properties that matter: a
  refused action leaves a profile unchanged, and no profile claims calibration without provenance.

---

## v2.7.2-20260928-Baccarat (2026-09-28) — THE LIVE LOOP, PROVEN END TO END

The parts were each tested; the loop they form had never been run as a whole. It has now — and the run
found the window-moved failure mode on the way.

### Added — a real end-to-end run of the live loop
- `BACARAT/tests/ocr_live_test.py` drives the **real** monitor thread, OCR controller, session store,
  derived statistics and accuracy readout against a fake screen and a fake model: **42 checks**, no API
  call, and it runs as part of the suite.
- It proves in one run: a hand confirmed end to end with the right money; the same screen never
  recorded twice; a second hand recorded with its own signature and the running total still right; a
  misread corrected before it is stored; a rejection recording nothing and leaving the bet open;
  Automatic settling a 0.97 reading but refusing a 0.60 one; Observe mode filing no-bet hands with the
  money untouched; the accuracy readout reflecting all of it; and a reading with no session ignored.

### Fixed — a region that cannot be captured now says so
- A region measured against a window that later moved used to produce a capture error every 1.5
  seconds while the reader watched nothing. It is now validated up front and refused with a plain
  reason naming the screen size and suggesting **Find my table** again. Malformed, negative and
  zero-sized regions are refused too, and starting OCR with one returns `bad-region`.

### Documented — bet first, then read
- A result arriving with no open bet is recorded as a money-neutral no-bet hand (the reader must never
  invent a bet), so a bet placed *after* the result appeared has nothing left to settle it. The README
  now says so.

### Verified
- `powershell -ExecutionPolicy Bypass -File BACARAT\tests\run-all.ps1` — all **nine** steps pass.

### Still open
- **The region is locate-able but not yet written**: the table was not on screen when the locator ran,
  and it refused all four samples (0.23–0.42 against the 0.60 bar) rather than guessing.
- No real **Tie** has been seen on this table yet.

---

## v2.7.1-20260928-Baccarat (2026-09-28) — AUTOMATIC MODE EARNS ITS TRUST

Two changes while the reader waits for its calibration, both about the one path that acts without the
user watching.

### Safety — Automatic holds a higher bar than a suggestion
- Automatic settles a bet with nobody looking, so it demands **0.9 confidence** against the **0.5**
  that merely shows a reading for confirmation (`autoMinConfidence` in `config/ocr.json`).
- **Below that bar it does not act**: the reading is put in front of the user to confirm or correct,
  exactly as Confirm mode would. An uncertain hand costs a click, never a silently wrong settlement.
- A reading with no confidence, or a nonsense value, is never acted on — the rule fails safe.

### Added — calibration that proves itself
- After **Find my table** locates the region it reads it once and reports what it saw: *"It reads:
  BANKER at 0.98 confidence"*. If the test read finds nothing it says so, which is exactly the case
  where recalibrating is the fix. A failed test read never invalidates the located region.
- A plain-language operating checklist in `BACARAT/README.md`: don't move the window, run Confirm,
  confirm or correct each hand, watch the accuracy line, and how to read the counters when nothing
  appears.

### Verified
- **88 OCR checks** (up from 72), including the confidence gate's edge cases and an end-to-end proof
  through the real controller that a 0.62 reading leaves the bet open while a 0.97 reading settles it.
- `powershell -ExecutionPolicy Bypass -File BACARAT\tests\run-all.ps1` — all **eight** steps pass.

### Still open
- **The region is locate-able but not yet written**: the table was not on screen when the locator ran,
  and it refused all four samples (0.23–0.42 against the 0.60 bar) rather than guessing.
- No real **Tie** has been seen on this table yet.

---

## v2.7.0-20260928-Baccarat (2026-09-28) — CALIBRATION WITHOUT DRAGGING A BOX

The last unmeasured step was the capture region: where on the screen to look. That needed a
hand-dragged box or a terminal command, so it is now a button.

### Added
- **"Find my table" in the OCR panel.** Using a screenshot the user already saved, the module finds
  that exact patch on the live screen, reports the region, the match score and the scale, and writes
  the region into the selected profile — marked calibrated with the sample it came from and the score.
  The matched area is saved to `data/calibration/` so it can be checked by eye first.
- **`BACARAT/app/tools/locate_region.py`** — the same matching from the command line, with `--all` to
  try every sample in `data\samples\`.
- Matching is scale-aware (0.55–1.6), so it still finds the table after the window has been resized
  since the sample was taken.

### Safety
- **A poor match is refused, never written.** Below a 0.60 score it reports that the table does not
  appear to be on screen, says what it actually scored, and writes nothing. Malformed regions are
  refused outright, and a flat single-colour sample is flagged as unusable.
- Nothing is written if no profile is selected; the region is still reported.

### Verified
- New suite step: **19 offline checks** on the locator — recovers a table's position from its
  screenshot alone at the same scale and at 80% scale, refuses an absent table, refuses with no
  samples, refuses malformed regions, and round-trips a region into a profile with provenance.
- `powershell -ExecutionPolicy Bypass -File BACARAT\tests\run-all.ps1` — all **eight** steps pass.

### Still open
- **The region is locatable but not yet written**: when tried, the table was not on screen and the
  locator correctly refused all four samples (scores 0.23–0.42 against the 0.60 bar). Opening the table
  and pressing the button finishes the calibration.
- No real **Tie** has been seen on this table yet.

---

## v2.6.0-20260928-Baccarat (2026-09-28) — THE READER MEETS THE REAL TABLE

The user supplied four real screenshots of their casino table. **The reader got every one of them
right**, and the exercise exposed three genuine defects that synthetic images had hidden.

### Result on the real table
| Sample | Shown | Reader | Confidence |
|---|---|---|---|
| real-01 | Player 7, Banker 8 | BANKER | 0.99 |
| real-02 | Player 9, Banker 2 (full layout, history grid visible) | PLAYER | 1.00 |
| real-03 | Player 6, Banker 7 | BANKER | 0.99 |
| real-04 | the first hand, cropped to include the cards | BANKER | 0.98 |

Correct on every run (12 of 12 across three passes), with evidence showing real reasoning: *"Player
shows 7, Banker shows 8; red Banker totals 8 over blue Player 7"*.

**Why the layout mattered:** the result is never written as a word. It is shown by the hand totals in
coloured boxes (blue = Player, red = Banker) plus the brightening of the winning side's panel, while
the panels are permanently labelled PLAYER / BANKER / TIE with their odds. A reader that just looked
for the word "BANKER" would be right by accident half the time.

### Fixed — three defects only a real screen exposed
1. **Truncated replies were discarded.** No `max_tokens` was sent, so the provider's small default cut
   the JSON off before its closing brace and a good reading was thrown away as unparseable. An
   explicit budget is sent, and a reply whose `result` value is complete is now salvaged; a
   half-written result is still refused.
2. **A cluttered image could return nothing.** The vision model is a reasoning model: on a hard image
   it spends its budget before writing the JSON (measured at 2400 tokens and 18 seconds). The reader
   now detects `finish_reason=length`, retries once with double the budget, and then reports "no
   result" rather than stalling. A 30-second client timeout bounds the worst case.
3. **Empty replies were dropped.** Measured at roughly one call in fifteen; the reader now asks once
   more for the same picture before giving up.

### Security
- **A private file was accidentally published and has been removed.** A GitHub billing receipt (email
  address, transaction id, card last four) had been saved into `BetPilot\SOURCE\OCR\`, an automatically
  synced folder, and was pushed to the **public** repository on the `local-sync` branch for about two
  minutes. It was moved into `BACARAT\data\private\` (never synced), stripped from the commit and
  force-pushed away; `main` never contained it. The sync script now **refuses any image or PDF** unless
  it is one of four allowlisted project assets, verified by reproducing the mistake.
- Residual: GitHub retains unreachable objects, so the old commit and blob remain fetchable by SHA.
  A support request can purge them; the practical exposure is the email address.

### Verified
- `powershell -ExecutionPolicy Bypass -File BACARAT\tests\run-all.ps1` — all seven steps pass
  (72 OCR checks now, including truncated/empty reply handling).
- Graded fixtures: 10 of 10 correct, including a Tie with equal totals (0.99) and a hand in progress
  (correctly refused). Real screenshots: 4 of 4.
- Gemini reaches the API with a valid model id but returns **HTTP 503** on every call for this key.
- The configured DeepSeek model `deepseek-v4-flash-vision-exp` is not listed by `/models` for this key
  (which offers `deepseek-flash` and `deepseek-v4-pro`); it works, but expect that id to move.

### Still open
- **The capture region is still unmeasured** — all 9 profiles are `"calibrated": false`, so the module
  is not yet reading the live screen end to end.
- No real **Tie** has been seen on this table; the Tie rule is verified on a matching mock only.

---

## v2.5.2-20260928-Baccarat (2026-09-28) — CAPTURE A SAMPLE FROM THE MODULE ITSELF

Judging a calibration region needed a terminal command, which is the wrong ask for a non-programmer.
It is now a button.

### Added
- **"Save a screenshot sample" in the OCR panel.** One click captures what the reader would see and
  saves it into `data/samples/`, **without calling the model** — no cost, nothing recorded in the
  session. It reports the saved path and whether the profile used is calibrated, so the picture can be
  opened and checked before any calibration is trusted.
- The endpoint behind it (`POST /api/baccarat/ocr/sample`) takes an optional `profileId` and falls back
  to the whole screen when no region is known; an unknown profile is refused by name and an
  uncapturable screen is reported as such rather than as a saved file.

### Verified
- `powershell -ExecutionPolicy Bypass -File BACARAT\tests\run-all.ps1` — all seven steps pass. The HTTP
  suite now captures a real sample and checks it lands in the data directory with a size and signature
  (90 checks, up from 86; 56 UI checks, up from 55).

### Still open
- **A real screenshot of the casino display is still the missing piece.** The prompt reads every
  synthetic presentation correctly (9 of 9), but the crop, the real table's animation and the display
  itself need the user's screen. All 9 calibration profiles remain unmeasured.

---

## v2.5.1-20260928-Baccarat (2026-09-28) — PROMPT GENERALITY, PROVEN AND RE-RUNNABLE

The screen reader is still unvalidated against the real casino display, but its prompt has now been
tested against nine synthetic presentations of a result, and the open small-text question is answered:
no preprocessing is needed.

### Added
- **`BACARAT/tests/make_ocr_fixtures.py`** — draws nine synthetic Baccarat displays into
  `data/samples-synthetic/`: bold text, 11px text, a single letter in a coloured circle, a strip of
  past results, a Chinese label (庄), a low-contrast panel, a card-value mock, a plain worded result,
  and a busy table with six decoy markers plus a small newest one. Filenames end
  `-expected-BANKER|PLAYER|TIE` so a wrong reading is obvious.
- **`--grade` on `ocr_check.py`** — compares each reading with the result its filename declares and
  exits non-zero on any mismatch, turning a prompt change into a one-command regression check.

### Result: 9 of 9 correct
Including 11px text (PLAYER, 0.95), Chinese 庄 (BANKER, 0.95), a strip where the newest dot must be
chosen (PLAYER, 0.95) and a busy table with decoys (BANKER, 0.80).

**Decision recorded:** 11px read at 0.95 confidence, so image preprocessing was deliberately not
added. Two runs gave identical results with slightly different confidences, which is why the
double-read agreement check compares the result rather than the confidence.

### Fixed
- **A crash on non-Latin text.** The model quotes what it sees, so a Chinese-labelled table put 庄 in
  its evidence, and printing that on a CP1252 console raised UnicodeEncodeError — killing the
  diagnostic tool exactly when it was needed. `ocr_check.py`, `provider_check.py` and the server now
  replace characters the console cannot encode instead of dying.

### Verified
- `powershell -ExecutionPolicy Bypass -File BACARAT\tests\run-all.ps1` — all seven steps pass.

### Still open
- **A real screenshot of the casino display is still needed.** The prompt is general across every
  presentation tested, but the crop, the real table's animation and the truth about its result display
  all require the user's screen. All 9 calibration profiles remain unmeasured.

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
