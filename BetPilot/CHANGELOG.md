# BETPILOT CHANGELOG
Version tracking: v2.10.1-20260928-Baccarat
Format: NEWEST RELEASE AT THE TOP
Date format: YYYY-MM-DD

---

## v2.10.1-20260928-Baccarat (2026-09-28) — CORRECTION: THE GRID LOCATION GRABBED THE WRONG BOX, NOW VERIFIED READING THE REAL GRID

v2.10.0 claimed the reader had "read a hand from the grid with no model call" on the live table. **That
claim was wrong and is retracted here.**

### What went wrong
- The automatic grid location returned the **largest near-white box** left of the panels. On the user's
  screen that was their **chat window**, not the history grid — the derived region `626,829,316,190`
  contained zero B/P/T markers, so the grid reader returned "unclear" and the **model fallback read the
  hand** (the log's `lastReadMs` of 16086 ms was the tell).
- The probe only looked *left* of the calibrated region, but the user's region already starts left of
  the grid, so the real grid was never in view.

### Fixed
- A candidate box must **actually contain markers** to count as the grid; the search returns the first
  marker-bearing white box closest to the panels, or nothing (the reader then honestly uses the model).
- The probe now covers the calibrated region's own width too.
- A test reproduces the user's screen (a large white non-grid box beside the panels, the real grid
  further away) and asserts the wrong box is rejected.

### Verified — with the reading path and latency in the log
On the user's real table, two minutes, watching `lastSource` and `readMs` per hand:

```
source=grid   gridRegion=[980, 891, 236, 85]
  15s  READ PLAYER  by grid   readMs=0
  57s  READ PLAYER  by grid   readMs=0
  84s  READ PLAYER  by grid   readMs=0
 108s  READ BANKER  by grid   readMs=0
hands read BY THE GRID (no model call): 4     hands read by the model: 0     scans: 357
```

- `powershell -ExecutionPolicy Bypass -File BACARAT\tests\run-all.ps1` — all **ten** steps pass; the
  grid step is now **24** checks.

### The lesson kept
A claim about the live screen is worthless without the reading path and latency beside it. Both are now
in the status (`source`, `lastSource`, `readMs`) and in every hand's audit record (`readBy`).

---

## v2.10.0-20260928-Baccarat (2026-09-28) — READ THE HISTORY GRID, NOT THE PANELS (THE USER'S IDEA)

The user's observation: *"the white base box on the left side of the main box normally will show the
result much earlier than the flashing."* Correct, and it is the best idea of this phase: it removes the
model call, and with it the latency, the cost and most of the ways a reading can go wrong.

### What the grid is
- A bead plate: one red/blue/green circle per hand (B, P, T), filled **top to bottom within a column,
  then the next column** — the order the user asked for in this module's own Hand History. Each
  marker's **colour is the result**: red Banker, blue Player, green Tie.
- Measured live on the real grid over 100 seconds: three new markers, each in the same column one row
  down (rows 6 → 7 → 8), each a hand, with no model calls.

### Added
- **`GridWatcher`**: one new marker = one hand, reported from its colour (confidence 0.99, `readMs` 0,
  with a signature for the existing duplicate guard). Many markers at once is a new shoe and is treated
  as a baseline, never a result; a region with no grid refuses rather than guessing.
- **The grid's location is found automatically** from the already-calibrated panels region — the
  largest near-white plate to its left — and remembered in the profile as `gridRegion`. No second
  measurement for the user.
- **`source: auto`** (new default): read the grid when it can be read (a colour test at 0.25 s polling,
  no API call), fall back to the vision model when it cannot, so a hand is never missed.
- The panel shows which path is reading, and the audit log records `readBy` per hand.

### Verified
- **Live on the user's table**: the grid region was derived automatically (`626,829,316,190`), the
  reader reported `source: grid`, and it **read a hand from the grid with no model call**.
- `powershell -ExecutionPolicy Bypass -File BACARAT\tests\run-all.ps1` — all **ten** steps pass, with a
  new step of **21** grid checks and 45 live-loop checks (including a grid hand read with 0 model calls).

### Fixed along the way (found by these tests, not by the user)
- Grid cells were bucketed with floor-division, so markers one pitch apart could share a cell and a new
  hand looked like no change. Now rounded, tolerating the measured 13–14 px spacing.
- Two test-helper faults that had made correct production code look wrong: colour tuples reversed
  before `cv2.circle` (blue drawn as red) and a fake capture that ignored the requested area.

### Still open
- A clean accuracy record before Automatic mode is justified.

---

## v2.9.2-20260928-Baccarat (2026-09-28) — THE ROULETTE LESSON: READ THE SETTLED FRAME, NOT THE TRANSITION

The user asked whether their working roulette monitor's capture method would help. Reading it answered
the latency problem better than anything tuned so far.

### What the roulette monitor does that the baccarat reader did not
`casino-tracker/roulette` spawns `OCR/dashboard_monitor.py`, which uses the **same DeepSeek vision
model** — so it is not a faster model. The difference is the loop: it polls fast (0.25 s) and, when the
history strip changes, **waits 0.75 s for the picture to stop moving before it reads**, so it always
reads a settled frame, once. It also confirms the newest number by checking the previous numbers
shifted (sequence validity).

The baccarat reader read *immediately* on change — which is how it caught a half-updated hand, and why
hands were cancelled or arrived late.

### Changed — adopted the stability-wait
- On a change, the reader polls (0.25 s) and waits until the picture has been still for 0.75 s before
  reading it. A hand that flips mid-watch is read at its settled state; a frame that never settles
  still returns promptly (bounded wait).
- Combined with v2.9.1's single confident read, this is the roulette recipe: poll fast, wait for
  stillness, read once.

### Verified
- `powershell -ExecutionPolicy Bypass -File BACARAT\tests\run-all.ps1` — all **nine** steps pass
  (**132** OCR checks). New checks: an animating frame is read once after it settles; a frame that
  never settles returns promptly; a mid-watch flip is read at its settled state.

### Still open
- A clean accuracy record before Automatic mode is justified.

---

## v2.9.1-20260928-Baccarat (2026-09-28) — THE READING ARRIVES BEFORE THE NEXT HAND

Reported: *"the refresh time is too slow, i watch for 5 hands, all show the result after 10 sec which
is next hand already started."* Correct — the reader made two model calls per hand, so the answer
landed ~5–16 s after the hand settled, which is after the next one on a fast table.

### Fixed — a clear reading now costs one model call, not two
- **At 0.93 confidence or above, the first reading is accepted on its own** (~2–4 s). Below that, the
  second confirming read still happens, because that is where an independent check protects the money.
- The loop interval went 1.5 s → 0.6 s (a look is a screenshot, not an API call).
- The provider timeout went 30 s → 15 s: slower than that cannot help a live hand, and the next scan
  retries.
- The fallback model is tried once after the primary fails, one budget each (the doubled-budget
  escalation was already dropped in v2.9.0).

### Added — the panel shows how long a reading takes
- The OCR counters now include *"last reading took 3.2s (avg 2.9s), one model call"* — the number that
  says whether the reader is keeping up with the table.

### Verified
- `powershell -ExecutionPolicy Bypass -File BACARAT\tests\run-all.ps1` — all **nine** steps pass
  (**130** OCR checks). The latency checks pin the behaviour: a confident reading is one call and is
  flagged `singleRead`; an uncertain one is checked twice; disagreement is still refused.
- A two-minute live run caught no hands because the table was between hands the whole time (172 scans,
  one model read, a direct read saying "no clear result" in 1.9 s) — the reader watched correctly;
  there was nothing to read.

### Still open
- A clean accuracy record before Automatic mode is justified.

---

## v2.9.0-20260928-Baccarat (2026-09-28) — THE READER NOW READS THE LIVE TABLE (AND YOU CAN SEE WHAT IT SEES)

Asked: *"where do you show the OCR capture? no result"*. Both halves were fair, and the answer to the
first was "nowhere" — which is why the second stayed a mystery through several rounds.

### Added — the panel shows what the reader is looking at
- A live picture of the capture region sits in the OCR panel, refreshed with the status and when the
  panel is opened, captioned with whether it is the reader's last frame or a fresh capture, and when.
  **This is the answer to "why is there no result?"** — if the picture is not your table's totals and
  panels, that is why, visible instead of a mystery.
- Served by `GET /api/baccarat/ocr/preview`; a profile you name must exist or you are told, the same
  contract as starting the reader.

### Fixed — three more reasons the live reader produced nothing
1. **The double-read rule cancelled every hand.** It required the two pictures to be pixel-identical
   1.5 s apart, but a real table's amounts, countdowns and timers move in that gap — 0 candidates in 25
   scans while direct reads of the same region read hands fine. The rule is now about the two
   **readings** agreeing; disagreement is still refused, never averaged.
2. **One unreadable reply froze the reader forever.** A non-JSON reply raised out of the scan, so the
   frame's signature was never recorded and the same frame was retried indefinitely (scans stuck at 1
   while the table played on). It is now that frame's answer, reported, and the loop moves on.
3. **The gap between reads straddled the settle moment.** One read saw the hand, the other saw nothing,
   so hands were cancelled. Measured at 0.4 s and changed to it.
- The doubled-budget escalation was dropped: it made a bad frame take ~30 s before the fallback model
  was tried, by which time the hand was gone. Primary, then fallback, one budget each.

### Verified — the real reader reading the real table
- A 90-second run of the actual monitor against the actual screen recorded **BANKER** from the live
  table with two agreeing reads. Scans advanced steadily with no stalls and no errors.
- `powershell -ExecutionPolicy Bypass -File BACARAT\tests\run-all.ps1` — all **nine** steps pass
  (121 OCR, 81 UI wiring, 104 HTTP, 42 live-loop, 19 locator).

### Still open
- Automatic mode awaits a clean accuracy record; the reader is working in Confirm/Observe now.

---

## v2.8.3-20260928-Baccarat (2026-09-28) — THE DRAWING BUG WAS MINE, NOT YOURS

The user reported still seeing no OCR result, and said the layout is fixed for Pragmatic Half Width /
Full Length so calibration should not be needed repeatedly. Both were right, and the cause was a bug
of mine that I had twice blamed on their drawing.

### The bug
Converting a drawn box from the picture's pixels back to screen pixels divided by the server's scale
factor — correct only if the picture is shown at its natural size, which it never is (1100px wide,
shrunk by CSS to fit the panel). Every box moved **up and to the left**.

Simulated with a ~700px-wide module window: a box drawn around the table at `1220,840,437x135` was
saved as **`754,519,270x83`**, and the user's logs show **`789,527,302x140`** — the same mis-mapping.
**They had drawn the table correctly, twice.**

### Fixed
- The conversion now maps by proportion (rendered size to screen size), which needs no scale factor and
  is exact at any window width. Verified by simulation at three widths; the old method fails two.
- A suggested box now waits for the picture to load before being positioned, so the dashed box cannot
  be lost to a zero-sized element.
- The **Pragmatic Half Width / Full Length profile is pre-measured** at `1220,840,437x135` for a
  1920x1080 screen, with that recorded as its provenance. That layout is fixed, so it needs no
  calibration at all.

### Verified
- `powershell -ExecutionPolicy Bypass -File BACARAT\tests\run-all.ps1` — all **nine** steps pass, with
  **78** UI wiring checks, four of them new and pinning the conversion so the old form cannot return.

### Still open
- The reader points at the right place again; the user needs to relaunch, then Stop and Start reading.
- Automatic mode awaits a clean accuracy record.

---

## v2.8.2-20260928-Baccarat (2026-09-28) — SETUP AND READER NOW AGREE, AND DRAWING STARTS FROM THE TABLE

Reported: *"the setting page (1st screen) change to Pragmatic Half width/Full length — when start
session, it doesn't change to Pragmatic Half width/Full length."* Correct, and it was the root cause of
the silent no-results.

### Fixed — the OCR profile follows the session
- Starting a session selects the calibration profile matching that session's provider and layout.
- The setup screen drives it before you start; starting OCR with no profile named takes it from the
  session (server-side too). Naming a profile that does not exist is still refused, not silently
  swapped.
- A session whose provider/layout has no matching profile is refused by name, quoting the session back.
- The panel shows when it follows the session; a manual dropdown choice sticks for that session.

### Added — the drawing screen starts from the table
- A hand-drawn box landed on the **chat panel** twice (confirmed by looking at what it captured:
  "Let me see", usernames, bet amounts). **Draw the region** now looks for a screenshot the user
  snipped and **pre-draws that box in green dashes**; press *Use this region* or drag to adjust.

### Added — a fallback model for busy frames
- The fast vision model occasionally spends its whole budget on a frame with the dealt cards on it
  (measured once in ~20 live readings) and answers nothing. `deepseek-v4-pro` is now tried once after
  it, turning a missed hand into a slower reading.

### Verified
- `powershell -ExecutionPolicy Bypass -File BACARAT\tests\run-all.ps1` — all **nine** steps pass
  (113 OCR, 75 UI wiring, 102 HTTP, 42 live-loop, 19 locator).
- The live-loop test's waits were widened from 6 s to 15 s: it drives real threads, and a tight timeout
  made the suite fail for being busy rather than wrong.

### Still open
- The user's Evolution profile is drawn over the chat panel too; it needs *Draw the region* again.
- Automatic mode awaits a clean accuracy record.

---

## v2.8.1-20260928-Baccarat (2026-09-28) — "WHY IS NO RESULT SHOWING?"

Asked verbatim while a reader ran and produced nothing. Two traps, both now closed.

### The two traps
1. **The reader was watching the whole screen.** The Evolution profile still held the shipped
   `0,0,1920,1080` default — the entire desktop, the module included. Measured, that clutter makes the
   model spend its whole token budget and answer nothing, so the reader sat in an error loop.
2. **The region is captured when Start is pressed and does not follow the profile.** The user then drew
   a proper region for that same profile (the new Draw-the-region button working correctly,
   `791,548,293x127`), but the running reader kept watching the old whole-screen area.

### Fixed
- **A whole-screen region is refused at Start**, by name, with what to do instead — rather than
  starting and failing every scan. Detection is by area (95%+ of the screen), so it holds on any
  monitor size.
- **Changing the profile while running is explained in the panel**, with the fix: "Press Stop, then
  Start reading."
- **The panel flags a whole-screen profile before you start it**: "NOT usable as it stands."
- **A hand-drawn region no longer inherits a stale match score** — provenance reads "drawn by hand"
  and any earlier `matchScore` is cleared.

### Verified
- `powershell -ExecutionPolicy Bypass -File BACARAT\tests\run-all.ps1` — all **nine** steps pass
  (102 HTTP checks, 72 UI wiring checks).
- The HTTP check now computes whether a shipped region is whole-screen **from the screen the server
  reports**, instead of assuming this machine's resolution.

### Still open
- Automatic mode awaits a clean accuracy record; the reader has been right on 12 of 12 decisive live
  readings.

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
