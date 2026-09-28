# BETPILOT — BACARAT CHANGELOG

Format: newest release at the top. Dates are YYYY-MM-DD.
Every entry states what changed in plain language, what was verified, and what is still open.

---

## v2.9.1-20260928-Baccarat (2026-09-28) — THE READING ARRIVES BEFORE THE NEXT HAND

Reported: *"the refresh time is too slow, i watch for 5 hands, all show the result after 10 sec which is
next hand already started"*. Correct. The reader made two model calls per hand, so the answer landed
~5–16 seconds after the hand settled — on a table that clears fast, that is after the next one had
started.

### Fixed — a clear reading now costs one model call, not two

The agreement check stays, but only where it earns its latency:

- **At 0.93 confidence or above, the first reading is accepted on its own** — one model call, ~2–4 s
  instead of ~5–16 s. Below that, the second confirming read still happens, because that is where an
  independent check protects the money.
- The loop interval went **1.5 s → 0.6 s** (a look is a screenshot, not an API call, so it costs
  nothing and notices the settle sooner).
- The provider timeout went **30 s → 15 s**: a read slower than that cannot help a live hand anyway,
  and the next scan retries.
- A doubled-token-budget escalation was already dropped in v2.9.0; the fallback model is tried once
  after the primary fails, one budget each.

### Added — the panel shows how long a reading takes

The OCR counters now include *"last reading took 3.2s (avg 2.9s), one model call"* — the number that
says whether the reader is keeping up with the table. A reading that arrives after the next hand has
started is not useful, and now that is visible instead of guessed.

### Verified

- `powershell -ExecutionPolicy Bypass -File tests\run-all.ps1` — all **nine** steps pass, now with
  **130** OCR checks. The new latency checks pin the behaviour: a confident reading is one model call
  and is flagged `singleRead`; an uncertain one is still checked twice; disagreement is still refused,
  never averaged.
- A two-minute live run caught no hands **because the table was between hands the whole time** (172
  scans, one model read, and a direct read said "no clear result" in 1.9 s) — the reader was watching
  correctly; there was simply nothing to read. The earlier live proof (BANKER recorded from the live
  screen) stands.

### Still open

- A clean accuracy record before Automatic mode is justified.

---

## v2.9.0-20260928-Baccarat (2026-09-28) — THE READER NOW READS THE LIVE TABLE (AND YOU CAN SEE WHAT IT SEES)

Asked: *"where do you show the OCR capture? no result"*. Both halves were fair, and the answer to the
first was "nowhere" — which is why the second was a mystery for so long.

### Added — the panel shows what the reader is looking at

A live picture of the capture region sits in the OCR panel, refreshed with the status and whenever the
panel is opened, with a caption saying whether it is the last frame the reader looked at or a fresh
capture, and when. **This is the answer to "why is there no result?"**: if the picture is not your
table's totals and panels, that is why — visible, instead of a mystery. It is served by
`GET /api/baccarat/ocr/preview`, which returns the reader's own last frame; when the reader is not
running it captures the profile's region fresh. The same contract as starting: a profile you name must
exist, or you are told.

### Fixed — three more reasons the live reader produced nothing

Measured by running the real reader against the real screen, which is how each one surfaced:

1. **The double-read rule cancelled every hand.** It required the two pictures to be *pixel-identical*
   1.5 s apart. A real table's bet amounts, countdowns and timers move within that gap, so the reader
   threw away every reading — 0 candidates in 25 scans while direct reads of the same region read the
   hand fine. The rule is now about the two **readings** agreeing, which is what actually protects the
   money. Disagreement is still refused, never averaged.
2. **One unreadable reply froze the reader.** A reply that was not JSON raised out of the scan, so the
   frame's signature was never recorded and the reader retried the same frame **forever** (scans stuck
   at 1 while the table played on). Such a reply is now this frame's answer — reported, with the loop
   moving on.
3. **The gap between reads straddled the settle moment.** On a fast table, 1.5 s was long enough that
   one read saw the settled hand and the other saw nothing, so hands were cancelled. Measured at 0.4 s
   and changed to it: the reader then read hands live.

The escalation to a doubled token budget was also dropped: it made a bad frame take ~30 seconds before
the fallback model was even tried, by which time the hand was gone. Primary, then fallback, one budget
each.

### Verified — the real reader reading the real table

A 90-second run of the actual monitor against the actual screen region recorded **BANKER** from the
live table, with two agreeing reads, as a no-bet hand. Scans advanced steadily (1, 2, 3, 4, 5, 6) with
no stalls and no errors; before these fixes it sat at 1 scan with an error.

### Also

- The panel labels a reading's note as **"reader's note (may be imprecise)"** — a note can misquote
  while the result is right (measured: a Tie read correctly with a note saying "5 equals 5" where the
  boxes read 7 and 7).

### Verified

- `powershell -ExecutionPolicy Bypass -File tests\run-all.ps1` — all **nine** steps pass: **121** OCR
  checks, **81** UI wiring checks, **104** HTTP checks, 42 live-loop, 19 locator.

---

## v2.8.3-20260928-Baccarat (2026-09-28) — THE DRAWING BUG WAS MINE, NOT YOURS

The user reported still seeing no OCR result and said the layout is fixed for Pragmatic Half Width /
Full Length, so calibration should not be needed repeatedly. Both were right, and the cause was a bug
of mine that I had twice blamed on their drawing.

### The bug

When you drag a box on the drawing screen, the box must be converted from the picture's pixels back to
screen pixels. It divided by the server's scale factor — which is only correct if the picture is shown
at its natural size. It never is: the picture is 1100px wide and CSS shrinks it to fit the panel, so
the conversion moved every box **up and to the left**, roughly onto the chat panel.

Measured by simulating a ~700px-wide module window: a box drawn around the table at
`1220,840,437x135` was saved as **`754,519,270x83`** — and the user's own logs show
**`789,527,302x140`**, the same mis-mapping. **They had drawn the table correctly, twice.**

### Fixed

- The conversion now maps by proportion — rendered size to screen size — which needs no scale factor at
  all and is exact at any window width. Verified by simulation at three window widths; the old method
  fails two of the three.
- A suggested box now waits for the picture to finish loading before it is positioned (it was drawn
  against a zero-sized element, so the dashed box could fail to appear).
- The Pragmatic Half Width / Full Length profile is **pre-measured** at `1220,840,437x135` for a
  1920x1080 screen, with the measurement recorded as its provenance. That layout is fixed, so no
  calibration is needed for it — the region is simply there.

### Verified

- `powershell -ExecutionPolicy Bypass -File tests\run-all.ps1` — all **nine** steps pass, with **78**
  UI wiring checks including four new ones that pin the conversion: it must use the rendered size, and
  the old divide-by-scale form must not come back.

### Still open

- The reader is pointed at the right place again; the user needs to relaunch, press Stop, then Start
  reading.
- Automatic mode awaits a clean accuracy record.

---

## v2.8.2-20260928-Baccarat (2026-09-28) — SETUP AND READER NOW AGREE, AND DRAWING STARTS FROM THE TABLE

Reported: *"the setting page (1st screen) change to Pragmatic Half width/Full length — when start
session, it doesn't change to Pragmatic Half width/Full length."* Correct, and it was the root cause of
the silent no-results: the setup screen and the OCR profile dropdown were two unconnected selectors, so
a Pragmatic session could be read through an Evolution profile pointed at the whole screen.

### Fixed — the OCR profile follows the session

- **Starting a session now selects the calibration profile matching that session's provider and
  layout**, so "Pragmatic — Half Width / Full Length" at setup is the profile the reader uses.
- **The setup screen drives it before you even start**: changing the layout selection moves the OCR
  profile to match.
- **Starting OCR with no profile named takes it from the session** (server-side too), so the two can no
  longer disagree. Naming a profile that does not exist is still refused rather than silently swapped.
- **A session whose provider and layout have no matching profile is refused by name**, with the session
  quoted back ("Your session is Pragmatic — Min Width / Full Length, but no calibration profile matches
  it"), rather than reading an unrelated table.
- The panel says when it is following the session: *"Calibrated … Follows your session (Pragmatic —
  Half Width / Full Length)."* A manual choice in the dropdown sticks for that session.

### Added — the drawing screen starts from the table

Drawing a region by hand meant finding the casino table inside a scaled-down picture of the whole
screen, and a box landed on the **chat panel** twice instead (verified by looking at what it captured:
"Let me see", usernames and bet amounts). Now, when **Draw the region** opens, it first looks for a
screenshot the user snipped and **pre-draws that box in green dashes** — press *Use this region*, or
drag to adjust. Dragging replaces the suggestion. The box it suggests is the table; the box it drew was
not.

### Added — a fallback model for busy frames

The fast vision model occasionally spends its whole budget deliberating on a frame that has the dealt
cards on it and answers nothing (measured once in about twenty live readings of the same region). A
fallback model (`deepseek-v4-pro`, which read that frame) is now tried once after the primary fails, so
a busy frame costs a slower read instead of a missed hand.

### Verified

- `powershell -ExecutionPolicy Bypass -File tests\run-all.ps1` — all **nine** steps pass: **113** OCR
  checks, **75** UI wiring checks, **102** HTTP checks, 42 live-loop, 19 locator.
- The live-loop test's waits were widened from 6 s to 15 s: it drives real threads, and a tight timeout
  made the suite fail for being busy rather than for being wrong.

### Still open

- The user's Evolution profile is drawn over the chat panel too; it needs *Draw the region* again
  (which will now suggest the table) or a table that matches it.
- Automatic mode still awaits a clean accuracy record.

---

## v2.8.1-20260928-Baccarat (2026-09-28) — "WHY IS NO RESULT SHOWING?"

Asked verbatim while a reader was running and producing nothing. The answer was two traps, both now
closed.

### The two traps

1. **The reader was watching the whole screen.** The Evolution profile still held the shipped
   `0,0,1920,1080` default — the entire desktop, including the module itself. Measured, that much
   clutter makes the model spend its whole token budget and answer nothing, so the reader sat in an
   error loop with no result and no clear reason.
2. **The region is captured when Start is pressed and does not follow the profile.** The user then
   drew a proper region for that same profile (the new Draw-the-region button working correctly,
   `791,548,293x127` at 23:33:30) — but the running reader kept watching the old whole-screen area.

### Fixed

- **A whole-screen region is now refused at Start**, by name, with a plain explanation and what to do
  instead ("press Draw the region, or Find my table with a screenshot you snipped yourself"), rather
  than starting and failing every scan. Detection is by area (95% of the screen or more), so it holds
  on any monitor size.
- **Changing the profile while running is now explained in the panel**: *"the reader is watching
  0,0,1920,1080 from when you pressed Start, but this profile now says 791,548,293,127. Press Stop,
  then Start reading, to make it use the new region."*
- **The panel calls out a whole-screen profile before you start it**: *"NOT usable as it stands — this
  profile is pointed at your whole screen."*
- **A hand-drawn region no longer inherits a stale match score.** Drawing by hand writes "drawn by
  hand" as its provenance and clears any `matchScore` left over from an earlier automatic match, which
  had been misreporting a drawn region as a 0.828 match.

### Verified

- `powershell -ExecutionPolicy Bypass -File tests\run-all.ps1` — all **nine** steps pass (**102** HTTP
  checks now, **72** UI wiring checks, up from 69).
- The HTTP check computes whether the shipped full-width region is whole-screen **from the screen the
  server reports**, rather than assuming this machine's resolution — the assumption that made the
  first version of that test wrong.

### Still open

- Automatic mode awaits a clean accuracy record. The reader has been right on 12 of 12 decisive live
  readings so far.

---

## v2.8.0-20260928-Baccarat (2026-09-28) — THE READER READS THE LIVE TABLE

The milestone the phase was for: **the reader read the user's live casino display through their own
calibrated region**, and got it right. Everything below came out of that session.

### The verified result

| Reading | Evidence the reader gave | Checked |
|---|---|---|
| PLAYER 0.95 (3.4s) | "Player total 9 is higher than Banker total 7; PLAYER panel is highlighted" | **picture confirmed**: blue box 9, red box 7, PLAYER panel bright |
| PLAYER 0.98–1.00 | "Player total 9 is higher than Banker total 6" / "7 vs 0" / "9 (8+A) beats 8 (9+9)" | reasoning matches the region |
| BANKER 0.99–1.00 | read from the totals and the highlighted panel | reasoning matches |
| **TIE 0.95** | "Player total 5 (blue box) equals Banker total 5 (red box)" | **picture confirmed as a Tie** — both totals green at **7**, TIE panel bright, both sides dimmed |
| NONE | "no settled hand or result marker visible" during betting phases | correct and prompt, no false readings |

Across 22 live readings: 12 decisive, all correct; 10 refusals during betting; **no empty replies at
all** once the region was tightened. Latency 1.9–7.8 s, mostly 2–4 s.

### Fixed — the finding that mattered most: the region was too busy

The first live read of the calibrated region **failed outright**: the model spent its whole token
budget deliberating and answered nothing. Raising the budget to 6000, downscaling the image and
re-trying all changed **nothing**. Cropping out the **history grid of coloured circles on the left and
the balance row along the bottom** fixed it instantly — the same content then read in 3.4 s at 0.95.

- The profile is now tightened to `1220,840,437x135` (from `965,840,692x157`), keeping the hand totals
  and the panels and dropping the clutter, with the provenance recorded in the profile.
- **The advice is in the error itself**: an empty reply now says a bigger budget does not help and
  tells you to leave out the grid and the balance row, and that `deepseek-v4-pro` read the busy image
  where the flash model would not (measured).
- The **Draw the region** overlay says the same thing where you drag the box.

### Added — draw the region by hand

A **"Draw the region"** button in the OCR panel: a picture of your screen opens *inside the module*,
you drag a box on the casino table with the mouse, and it saves that region into the selected profile,
writes a picture of it to `data/calibration/`, and **reads it once** so you are told what the reader
sees. The picture is scaled to fit, so display pixels are converted back to screen pixels by the scale
the server sends with it, and a box too small to be meant is ignored. The picture never leaves this
machine.

### Fixed — a sample the module captured itself cannot calibrate

Found by reading the user's own event log: "Find my table" was run on a sample the module had just
captured **from the region already in use**, and reported a 0.787 match — but that match only confirms
the region it came from. It is circular, and it was marking profiles `calibrated: true` on that basis.
Now: samples the user snipped take priority, a self-captured sample is reported as circular with a
plain explanation, **nothing is written**, and `calibrated` is never set from a circular match.

### Changed

- The API now serves a profile's calibration **provenance** (`calibratedAt`, `calibratedFrom`,
  `matchScore`), and the panel shows it: *"Calibrated from real-02-expected-PLAYER.png (0.95 match) —
  capturing 1220,840,437,135"*, or in amber *"NOT calibrated yet — it is still pointed at a guess"*.
- A reading's note is labelled **"reader's note (may be imprecise)"**. Measured reason: the Tie above
  was read correctly but its note said "5 equals 5" while the boxes read 7 and 7. The result is what
  gets recorded; the note is a hint to check against the table. The prompt now asks for the signal
  rather than numbers the model is unsure of.

### Verified

- `powershell -ExecutionPolicy Bypass -File tests\run-all.ps1` — all **nine** steps pass, now with
  **100** OCR checks, **69** UI wiring checks, **100** HTTP checks, **42** live-loop checks and **19**
  locator checks.
- Two tests that assumed no profile is ever calibrated were rewritten to the property that matters: a
  refused action must leave the profile **byte-for-byte unchanged**, and no profile may claim
  calibration without provenance. The user's real calibration broke the old assumptions and they were
  wrong to hold them.

### Still open

- The user's module is on an older build; the new button appears after relaunching.
- Automatic mode still needs a clean accuracy record before it is justified — the evidence machinery
  is in place and the reader has now been right on 12 of 12 decisive live readings.

---

## v2.7.2-20260928-Baccarat (2026-09-28) — THE LIVE LOOP, PROVEN END TO END

The parts were each tested; the loop they form had never been run as a whole. It has now — and the run
found the window-moved failure mode on the way.

### Added — a real end-to-end run of the live loop

`tests/ocr_live_test.py` drives the **real** monitor thread, the real OCR controller, the real session
store, the real derived statistics and the real accuracy readout, against a fake screen and a fake
vision model. No API call, no casino: **42 checks**, and the whole thing runs in the suite.

It proves, in one run: a hand read and confirmed end to end with the right money ($4.75 profit on a 1u
Banker bet at $5 after commission); **the same screen never recorded twice**; a second hand on the same
screen recorded with its own signature and the running total still right; **a misread corrected before
it is stored** (and logged as corrected); a rejection recording nothing and leaving the bet open;
**Automatic settling a 0.97 reading by itself but refusing a 0.60 one** and handing it back for
confirmation; Observe mode filing no-bet hands in the same zero-stake shape manual PASS uses, money
untouched; the accuracy readout reflecting all of it; and a reading with no session recorded as
ignored.

### Fixed — a region that cannot be captured now says so

A calibrated region is measured against a window that can later move or be resized. Before, that
surfaced as a capture error repeating every 1.5 seconds while the reader watched nothing. Now the
region is validated up front and refused with a plain reason: *"the region 1500,900 900x680 runs past
the edge of the 1920x1080 screen — the table window has probably moved or been resized since
calibration, so press Find my table again."* Regions that are malformed, negative, or zero-sized are
refused too, and starting OCR with one returns `bad-region` rather than an error loop.

### Documented — bet first, then read

The live run surfaced an ordering rule worth stating: a result that arrives with no open bet is
recorded as a money-neutral no-bet hand, because the reader must never invent a bet — so a bet placed
*after* the result appeared has nothing left to settle it. The README now says so plainly.

### Verified

`powershell -ExecutionPolicy Bypass -File tests\run-all.ps1` — all **nine** steps pass (72 engine,
60 UI wiring, 88 OCR, 42 live loop, 19 locator, 93 HTTP, the settlement agreement and the credential
scan).

### Still open

- **The region is locate-able but not yet written**: the table was not on screen when the locator ran,
  and it refused all four samples (0.23–0.42 against the 0.60 bar) rather than guessing.
- No real **Tie** has been seen on this table yet.

---

## v2.7.1-20260928-Baccarat (2026-09-28) — AUTOMATIC MODE EARNS ITS TRUST

Two changes while the reader waits for its calibration, both about the one path that acts without you
watching.

### Safety — Automatic now holds a higher bar than a suggestion

- Automatic settles a bet with nobody looking, so it demands **0.9 confidence** against the **0.5** that
  merely *shows* you a reading to confirm (`autoMinConfidence` in `config/ocr.json`).
- **Below that bar it does not act.** The reading is put in front of you to confirm or correct, exactly
  as Confirm mode would — so an uncertain hand costs you a click, never a silently wrong settlement.
- A reading with no confidence, or a nonsense value, is never acted on: the rule fails safe.
- The bar is one function (`ocr.auto_is_confident_enough`) rather than logic buried in the controller,
  which is why it can be tested directly.

### Added — calibration that proves itself

- After **Find my table** locates the region, it now **reads it once** and reports what it saw:
  *"It reads: BANKER at 0.98 confidence"*. A location is geometry; whether the reader can actually make
  sense of that crop is the thing you want to know, and now one click answers both.
- If the test read finds nothing, it says so plainly — "it saw no clear result, check the saved crop" —
  which is exactly the case where recalibrating is the fix. A failed test read never invalidates the
  located region; the location and the reading are reported separately.

### Added — a plain-language operating checklist

The README now walks through running it live: open the table and don't move the window, choose
Confirm, start, confirm or correct each hand, watch the accuracy line, and — the useful part — how to
read the counters when nothing appears (duplicates climbing means it was already recorded, candidates
climbing means it is reading fine, scans alone means it is watching an unchanged region).

### Verified

- **88 OCR checks** (up from 72) including the confidence gate's edge cases and an end-to-end proof
  through the real controller that a 0.62 reading leaves the bet open and a 0.97 reading settles it.
- `powershell -ExecutionPolicy Bypass -File tests\run-all.ps1` — all **eight** steps pass (72 engine,
  60 UI wiring, 88 OCR, 19 locator, 93 HTTP, the settlement agreement and the credential scan).

### Still open

- **The region is locate-able but not yet written**: the table was not on screen when the locator ran,
  and it refused all four samples (0.23–0.42 against the 0.60 bar) rather than guessing.
- No real **Tie** has been seen on this table yet.

---

## v2.7.0-20260928-Baccarat (2026-09-28) — CALIBRATION WITHOUT DRAGGING A BOX

The last unmeasured step was the capture region: where on the screen to look. That needed either a
hand-dragged box or a terminal command, so it is now a button instead.

### Added

- **"Find my table" in the OCR panel.** Using a screenshot you already saved (the sample button, or any
  snip in `data\samples\`), the module finds that exact patch on the live screen, reports the region,
  its match score and the scale it matched at, and **writes the region into the selected profile** —
  marking it calibrated with the sample it came from and the score. The matched area is saved to
  `data\calibration\` so it can be checked by eye before anything is trusted.
- **`app/tools/locate_region.py`** — the same matching from the command line, against the live screen
  or a saved screenshot, with `--all` to try every sample in `data\samples\`.
- Matching is scale-aware (0.55–1.6), so it still finds the table after the window has been resized
  since the sample was taken, and it reports the scale it found.

### Safety

- **A poor match is refused, never written.** Below a 0.60 score the tool says the table does not
  appear to be on screen, reports what it actually scored, and writes nothing — because a wrong region
  makes the reader read the wrong thing. A malformed region is refused outright, and a flat, nearly
  single-colour sample is flagged as unusable before it is trusted.
- Nothing is written when no profile is selected; the region is still reported.

### Verified

- New suite step: **19 checks** on the locator, offline and deterministic — it recovers a table's
  position from its screenshot alone at the same scale and at 80% scale, refuses an absent table,
  refuses with no samples, refuses malformed regions, and confirms a located region round-trips into a
  profile with its provenance.
- `powershell -ExecutionPolicy Bypass -File tests\run-all.ps1` — all **eight** steps pass (72 engine,
  58 UI wiring, 72 OCR, 19 locator, 93 HTTP, the settlement agreement and the credential scan).
- HTTP: an unknown profile and a missing sample are both refused by name, and a refused locate is
  confirmed to write nothing into a shipped profile.

### Still open

- **The region is located but not yet written**, because the table was not on screen when I tried: the
  locator scored 0.23–0.42 against the 0.60 bar and correctly refused all four samples rather than
  guessing. Open the Baccarat table so the result is visible and press **"Find my table"** with a
  Pragmatic profile selected.
- No real **Tie** has been seen on this table yet.

---

## v2.6.0-20260928-Baccarat (2026-09-28) — THE READER MEETS THE REAL TABLE

The user supplied four real screenshots of their casino table. **The reader got every one of them
right**, and the exercise exposed three genuine defects that synthetic images had hidden.

### Result on the real table

| Sample | Shown | Reader | Confidence |
|---|---|---|---|
| real-01 | Player 7, Banker 8 (cards 7♣ J♦ / A♦ 7♣) | BANKER | 0.99 |
| real-02 | Player 9, Banker 2 (2♣ 7♥ / K♣ 2♠), full layout with the history grid visible | PLAYER | 1.00 |
| real-03 | Player 6, Banker 7 (3♥ 3♦ / 4♥ 3♠) | BANKER | 0.99 |
| real-04 | the first hand again, cropped taller to include the dealt cards | BANKER | 0.98 |

Every reading has been correct on every run (12 of 12 across three passes). The evidence shows real
reasoning rather than luck: *"Player shows 7, Banker shows 8; red Banker totals 8 over blue Player 7"*
and *"Player cards 2+7=9; Banker K+2=2"*.

**What the table actually looks like, and why that mattered:** the result is never written as a word.
The winner is shown by the hand totals in coloured boxes (blue = Player, red = Banker) plus the
brightening of the winning side's panel — while the panels are *permanently* labelled PLAYER, BANKER
and TIE with their odds. A reader that merely looks for the word "BANKER" would be right half the time
by accident. It is not; it compares totals. A history grid of B/P/T markers sits beside the live hand
and is correctly ignored.

### Fixed — three defects that only a real screen exposed

1. **Replies were being truncated and thrown away.** No `max_tokens` was sent, so the provider's small
   default cut a reply off before its closing brace and a perfectly good reading was discarded as
   unparseable — a silently missed hand. An explicit budget is now sent, and `parse_result_json`
   salvages a reply whose `result` value is complete instead of discarding it. A half-written result
   is still refused, never guessed.
2. **A cluttered image could return nothing at all.** The vision model is a reasoning model: on a hard
   image it spends its output budget before writing the JSON, returning empty with
   `finish_reason=length` — measured at 2400 tokens and 18 seconds. The reader now notices *why* it
   stopped, retries once with double the budget, and if that fails reports "no result" (which is safe:
   the hand is recorded by hand) rather than stalling the scan loop. A 30-second client timeout bounds
   the worst case.
3. **An empty reply was dropped instead of retried.** Measured at roughly one call in fifteen. The
   reader now asks once more for the same picture before giving up — free of risk, since the read is
   stateless and the image has not changed. Transport errors still surface immediately.

### Changed

- The prompt now covers **both** presentation styles: a real table's totals-and-highlight layout *and*
  the simpler word, letter, marker or strip forms. It states that on a full layout the panel words are
  decoration, that equal totals mean a Tie, and that a lone word or marker *is* the result. Two new
  fixtures cover the Tie (equal totals, bright green panel — read correctly at 0.99) and a hand still
  being dealt (correctly refused).
- `ocr_check.py` no longer copies an already-saved image back into `data\samples` when reading it,
  which was polluting the folder for the next `--all` run. A deliberately ambiguous stress fixture is
  reported as unreadable without failing the run, so a real regression stays visible.

### Verified

- `powershell -ExecutionPolicy Bypass -File tests\run-all.ps1` — all seven steps pass.
- The graded fixture set: **10 of 10 correct** including the new Tie and dealing cases; your real
  table **4 of 4**.
- Gemini: the branch now reaches the API with a valid model id (`gemini-3.8-flash`) and returns a
  clear message, but Google is answering **HTTP 503** for this key on every call, so it remains
  unusable for the moment. DeepSeek is the working provider.
- Note: the configured DeepSeek model, `deepseek-v4-flash-vision-exp`, is not even listed by
  `/models` for this key (which offers `deepseek-flash` and `deepseek-v4-pro`). It works, but it is an
  experimental id, so a future change there should be expected.

### Still open

- **The capture region is still unmeasured.** The crop is what the reader sees, and it must be
  expressed in screen coordinates. All 9 calibration profiles remain `"calibrated": false`.
- A real **Tie** on this table has not been seen: the Tie rule is verified only on a mock built to
  match the layout.

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
