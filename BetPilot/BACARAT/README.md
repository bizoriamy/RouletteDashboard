# BetPilot — Baccarat (rebuilt)

Version: **v2.9.2-20260928-Baccarat** (see `VERSION`)
Status: **the reader reads the live casino display correctly through a calibrated region (verified on your real table, including a Tie); Automatic still awaits a clean accuracy record**

This is a rebuild of the Baccarat module after the review in
[REVIEW_Baccarat_v1.0.0-20260928.md](REVIEW_Baccarat_v1.0.0-20260928.md). The old module was five
loose HTML files opened with `window.open`, and its numbers were wrong in eight reproducible ways.
This one is a real local application: a small Python server owns the session, the browser is a view,
and the money rules live in one place that is tested from both sides. See
[CHANGELOG.md](CHANGELOG.md) for the item-by-item record.

---

## Run it

Double-click **`launcher\Start Baccarat.bat`**.

That starts the server on `http://127.0.0.1:8766`, opens the module in a Chrome app window, and turns
on always-on-top so it sits above your casino window. Press the **Always on top** button in the header
to turn that off.

Requirements: Windows, Python 3 in `PATH`, and Node only if you want to run the tests.

---

## The one rule that shapes everything

You record exactly **two inputs**: the bet side and the casino result. Everything else is derived —
win/lose/push, the 5% Banker commission, the bankroll, the P&L, the statistics.

| Your bet | Banker result | Player result | Tie result |
|---|---|---|---|
| **Banker** | win, pays 0.95:1 | lose | **push** (stake returned) |
| **Player** | lose | win, pays 1:1 | **push** (stake returned) |
| **Tie** | lose | lose | win, pays 8:1 (9:1 configurable) |
| **Pass** | no money moves | no money moves | no money moves |

A hand may carry a **Tie bet alongside Banker or Player**, and **the Tie has its own stake** — set it
in the Tie stake box (default 1u, with −1/+1 nudges) and every button shows the stake it will place.
That makes the hedge explicit: Banker 100u with a 10u Tie insurance at $5/unit nets **+$425** when
Banker wins (the $50 insurance is lost), **+$400** when the Tie lands (the Banker stake is pushed and
the insurance pays 8:1), and **−$550** when Player wins. Both stakes draw on the same bankroll, so
they can never commit more between them than you have. The history shows each wager and its own
outcome.

**PASS records the table, not your wallet.** Pressing PASS opens the hand with nothing at risk; when
the hand settles you record what the table showed, and that result goes into Hand History, the
Banker/Player/Tie distribution and the streaks — while the bankroll stays untouched and the hand is
never counted as a win, a loss or a wager. Win rate therefore still describes the hands you actually
bet. A pass and a bet cannot share a hand, and removing the pass logs nothing.

There is no "WIN / LOSE" button anywhere, because a win/loss button is how the old build paid out
bets that had actually lost. The bankroll is never stored either — it is recalculated from the
recorded hands on every read, so undo and reload can never leave the totals out of step.

Guards the server enforces (each one was a defect in the old build):

* **one wager per side** — you cannot put two Banker bets on one hand;
* **Banker and Player cannot both be bet on one hand** — they are mutually exclusive, as at a real
  table, but **Tie can be added on top of either** (the common hedge). One result then settles every
  open wager, and the hand's win/loss is the net;
* **a pass and a bet cannot share a hand** — remove one before placing the other;
* a hand settles exactly once — a repeat is refused, so a double click cannot pay twice;
* a stake larger than the bankroll is refused, counting every wager already open, and `×2` cannot
  run away;
* Banker and Player bets push on a Tie instead of "winning" the stake twice;
* the commission is taken to the cent ($4.75 profit on a 1-unit Banker win at $5/unit, not $5.00);
* an ended session refuses further bets.

The interface is built for the way it is actually used: a narrow, full-length window sitting beside
the casino. The betting column is on the left; **Hand History**, **Statistics** and **Bankroll** stay
beside it rather than dropping below, down to a 640px-wide window. Hand History is a fixed 10 × 10
box holding up to **100 hands**, filled **top to bottom first, then left to right**, with small
colour-only dots (red Banker, blue Player, green Tie) — it never grows or scrolls, so the layout
stays put. Bankroll lists every hand with its running total and scrolls internally. The required
disclaimer is pinned along the bottom of the window.

---

## Where things live

```
BACARAT/
  VERSION                     single line, read by the server and the launcher
  app/
    server.py                 local server: state, rules, exports, always-on-top (127.0.0.1 only)
    settlement.py             the money rules, server side
    ocr.py                    screen reading: capture, provider call, signature, duplicate guard
    tools/calibrate.py        measures your capture region and writes it into a profile
    web/
      index.html              the ONE entry screen (setup + table + summary in one page)
      engine.js               the money rules, browser side (pure, no DOM)
      ui.js                   rendering and actions — computes no money at all
      baccarat.css            the theme (gold / red Banker / blue Player / green Tie)
  config/                     9 calibration profiles + ocr.json (the provider switch)
  launcher/                   Start Baccarat.bat + baccarat-launcher.ps1
  tests/                      see below
  data/                       created at runtime: current-session.json, sessions/, calibration/
```

Session state is written to `data/current-session.json` after every change and archived to
`data/sessions/` when you end a session, so a refresh or a crash cannot lose a session. Export works:
**Export CSV** and **Export JSON** both download the current session.

---

## Verify it yourself

```
powershell -ExecutionPolicy Bypass -File tests\run-all.ps1
```

| Step | What it proves |
|---|---|
| `node tests\engine.test.js` | 72 unit tests: one per review defect, plus the multi-wager rules, the independent Tie insurance stake and the pass flow |
| `node tests\generate-vectors.js` | emits 576 settlement cases + 4 session derivations from the browser rules |
| `python tests\settlement_test.py` | recomputes every vector with the server rules — the two implementations must agree, including the hedged-hand vector |
| `python tests\ui_wiring_test.py` | 81 static checks on the UI: no id used but absent from the HTML, no undefined handler, no unstyled class, disclaimer at the bottom, page does not scroll, two columns at half screen width, fixed 10 × 10 bead box, PASS records the result, the Tie has its own stake, the OCR accuracy line, the sample button, the find-my-table button and its self-reading verdict |
| `python tests\ocr_test.py` | 132 checks on the OCR reader, the observe/confirm/auto rules, the accuracy arithmetic, the confidence gate that Automatic must clear, and the handling of truncated, empty and unparseable model replies |
| `python tests\ocr_live_test.py` | 42 checks running the **real live loop** — monitor thread, controller, store and statistics — against a fake screen and a fake model: a hand confirmed end to end with the right money, duplicates never re-recorded, a wrong reading corrected before it is stored, Automatic settling only what it is sure of and deferring what it is not, observe mode recording no-bet hands, the accuracy readout reflecting what happened, and an off-screen region refused at start |
| `python tests\server_smoke.py` | 104 checks driving the real server over HTTP — most of them about what must be **refused**, including a real captured sample and a refused region locate |
| `python tests\provider_check.py` | one real call to the configured provider, to prove the key, endpoint, model and parser work together (run manually; it costs a fraction of a cent) |
| `python app\tools\ocr_check.py --all` | reads every saved sample in `data\samples\` and prints what the model made of each (manual, and the tool for judging a region) |
| `python tests\locate_region_test.py` | 19 checks that the table can be found on screen from a saved sample: the right position at the same scale and at 80% scale, a refusal when it is absent, and the region round-tripping into a profile with its provenance |
| hygiene check | fails the run if a real-looking credential ever appears in the module |

The rules exist twice on purpose (browser and server). The vector test is what stops the two copies
from drifting apart.

---

## Screen reading (OCR)

OCR is implemented and off by default. It reads the result from a region of your screen and produces
the same two inputs you would otherwise type — the bet side still comes from you.

**Before it can run, two things must be true:**

1. **You calibrate the region — but you no longer have to drag a box.** In the OCR panel, save a
   sample of your table, then press **"Find my table"**: the module finds your saved screenshot on the
   live screen, reports the match score, and writes the region into the selected profile. It refuses
   rather than guesses — below a 0.60 match it says the table does not appear to be on screen and
   writes nothing, and it saves the matched area to `data\calibration\` so you can check it by eye.
   If you prefer to do it by hand, calibration still works the old way:
   ```
   python app\tools\calibrate.py --list
   python app\tools\calibrate.py --profile baccarat-pragmatic-half-width-full-length
   ```
   Drag a box around the part of the screen showing the hand result, press ENTER, then **open the
   preview PNG it saves** (`data/calibration/…-preview.png`) and confirm it clearly shows the result.
   The same search from the command line:
   ```
   python app\tools\locate_region.py --all --write-profile baccarat-pragmatic-half-width-full-length
   ```
2. **A key must be present** in `casino-tracker/.secrets/ocr.env`. The provider is chosen in
   `config/ocr.json` (default `deepseek`). The module reports honestly what is missing instead of
   pretending to read.

**Judging a region before you trust it — `app/tools/ocr_check.py`:**

```
python app\tools\ocr_check.py --full --crop-only        capture a sample and call nothing (free)
python app\tools\ocr_check.py --all                     read every PNG in data\samples\
python app\tools\ocr_check.py --profile <id>            read your calibrated region now
python app\tools\ocr_check.py --image path\to\shot.png  read a saved screenshot
python app\tools\ocr_check.py --profile <id> --repeat 3 ask the same crop three times
```

**Or just press the button.** The OCR panel has **"Save a screenshot sample"**: one click captures what
the reader would see and drops the picture into `data\samples\`, with no model call and no cost. It
tells you the saved path and whether the profile it used is calibrated. Open the picture — if it does
not clearly show the hand result, the region is wrong, and no prompt can save it.

Each run saves the exact crop that was sent to the model, so what the model saw can be compared with
what you see. Drop screenshots into `data\samples\` and `--all` reads the whole batch at once.

**The prompt is regression-checked against both synthetic displays and the real table.** Synthetic
fixtures cover bold text, 11px text, a single letter, a strip of past results, a Chinese label (庄), a
low-contrast panel, a card-value mock, a Tie with equal totals, and a hand still being dealt; the four
real screenshots in `data\samples\` cover the actual casino layout:

```
python tests\make_ocr_fixtures.py
python app\tools\ocr_check.py --all --samples-dir data\samples-synthetic --grade
python app\tools\ocr_check.py --all --samples-dir data\samples --grade
```

Each fixture's filename ends `-expected-BANKER|PLAYER|TIE|NONE`, so `--grade` reports CORRECT or WRONG
and exits non-zero on a regression. All 10 graded synthetic fixtures and all 4 real screens read
correctly. An 11px label read at 0.95 confidence, which is why no image preprocessing was added: the
evidence did not call for it.

**What to put in the region — this matters more than anything else.** Include the **hand totals** (the
coloured boxes above the panels: blue for Player, red for Banker, and **both green on a Tie**) and the
**panels that light up**. Leave out:

* the **history grid** of coloured circles on the left — it is past hands, not this one;
* the **balance row** along the bottom;
* the betting amounts and percentages under the panels.

Measured on the real table: a region including the history grid and the balance row made the reader
spend its whole token budget deliberating and answer **nothing** — and raising the token budget to
6000 changed that not at all. Cropping those two things out turned the same content into a 3.4-second
reading at 0.95 confidence. If you see "the reader spent its whole budget deliberating", the region is
too busy — tighten it.

**Do not trust Automatic mode until the readout says so.** The module shows an accuracy line built
from its own audit log: readings taken, accepted, how many you had to correct, rejected, and the
percentage that needed no correction. Under 20 readings it says "too few to judge"; it only calls
Automatic reasonable after a clean record. DeepSeek is the default provider; Gemini is a one-line
switch and its model id is pinned to `gemini-3.8-flash` (the older ids are no longer served).

**The three modes**, exactly as `casino-tracker/roulette/AGENTS.md` defines them:

| Mode | What it does |
|---|---|
| **Observe** | Records every result as a *no-bet* hand: money-neutral, builds the bead plate, never places a bet |
| **Confirm** | Shows what it read, lets you correct the result, and records nothing until you approve |
| **Automatic** | Settles your **open bet** from the screen — only for a doubled-read, signature-validated result that has not been seen before, **and only at 0.9 confidence or better**; anything less certain is handed to you to confirm |

Duplicate safety is by design, not by luck. Each reading carries a signature of the region, stored
with the hand, so the same hand cannot be recorded twice — even after a restart. A result arriving
late (you settled by hand already) finds no open bet and is recorded as a no-bet observation; OCR
never invents a bet. When OCR is unsure it says so and records nothing: a missed hand is safe, a
duplicated one is not.

**Automatic mode holds a higher bar than a suggestion.** It settles a bet with nobody looking, so it
demands 0.9 confidence (`autoMinConfidence` in `config/ocr.json`) against the 0.5 that merely shows a
reading for confirmation. Below that bar it does not act — it puts the reading in front of you to
confirm, exactly as Confirm mode would. A reading with no confidence at all is never acted on.

### Running it live, step by step

1. Open your Baccarat table and leave the window where it was when you calibrated. Moving or resizing
   it invalidates the region — press **Find my table** again, or re-run `calibrate.py`.
2. In the module's **OCR panel**, pick your profile and set the mode to **Confirm** (not Automatic —
   not yet).
3. Press **Start reading**. The panel shows scans, candidates and duplicates as they happen. The region is captured at that moment: if you change or re-calibrate the profile later, press **Stop** and start again, or the reader keeps watching the old area.
4. **Watch the picture in the panel** — it shows exactly what the reader sees, so a wrong region is visible instead of a mystery. When a hand is read, the panel shows what it saw. Press **Confirm** (or Enter) if it matches the
   table; correct the result from the dropdown first if it does not; **Reject** (Backspace) if it is
   wrong. Nothing is recorded until you decide.
5. Watch the **accuracy line**. Under 20 readings it says "too few to judge". Once it has a clean
   record, Automatic becomes a reasonable choice — and even then it will hand you anything it is not
   sure about.
6. If nothing is ever detected: check the profile says calibrated, press **Save a screenshot sample**
   and open the picture it saves. If the picture does not clearly show the hand result, the region is
   wrong and no prompt can save it — recalibrate.

The counters tell you which of these is happening: **duplicates** climbing means the hand was already
recorded (correct behaviour, not an error); **candidates** climbing means it is reading fine;
**scans** climbing with neither means it is watching but the region has not changed.

**Place your bet before the hand resolves.** A result that arrives with no open bet is recorded as a
no-bet hand (money-neutral, and it fills the bead plate) — because the reader must never invent a bet.
That is the right behaviour, but it does mean a bet placed *after* the result appeared has nothing left
to settle it, and would sit open until the next hand. Bet first, then read.

---

## Not done yet

* **Region calibration is yours to run** — see above. The module will not pretend to read a screen it
  has not been pointed at, and every profile says `calibrated: false` until you measure it.
* **No shoe-level statistics**, and no colouring of the bead plate by table position. Session
  statistics, streaks and drawdown are in.
* **`BetPilot/VERSION`, `BetPilot/CHANGELOG.md` and `BetPilot/README.step-by-step.md`** — the files
  one level up, outside this module folder — still describe v1.0.0 and need the same treatment.

---

## Superseded — nothing deleted

These are still on disk and are now out of date. They can be moved to `BetPilot/ARCHIVE/` whenever you
say so; nothing moves without your approval:

* `SOURCE/Baccarat/` — the five original files (`baccarat_app.js`, `baccarat_module.html`,
  `baccarat_launcher.html`, `entry.html`, `baccarat_styles.css`). The theme was carried over.
* `config_baccarat_*.json` in this folder — 12 files with contradictory region conventions, replaced
  by the 9 profiles in `config/`.
* `API/` — the old Baccarat API scaffolding. The credential that was published in
  `API/switch_deepseek_gemini.md` has been removed; rotate that DeepSeek key when convenient.

---

## Testing note

`tests/server_smoke.py` starts the real server on port 8791 with a scratch data directory inside
`tests/`, and removes it afterwards. It never touches `data/` or `config/`.
