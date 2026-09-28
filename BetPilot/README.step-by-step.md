# BETPILOT — STEP-BY-STEP GUIDE

Version: v2.0.0-20260928-Baccarat
For: you — no programming knowledge needed. Every step is something to click or type.
Fuller detail: `BACARAT/README.md`. What changed and why: `BACARAT/CHANGELOG.md`.

---

## WHAT BETPILOT BACCARAT IS

A record-keeping assistant that sits beside your casino window. You tell it what you bet and what the
table showed; it does the arithmetic, keeps the history and shows the statistics.

**It does not predict anything and it cannot win for you. Every hand is random and the house has an
edge.** Read that again before you use it, and only bet money you can afford to lose. 18+ (or the
legal age where you are). Check your local gambling laws.

---

## STARTING IT

Double-click:

```
BACARAT\launcher\Start Baccarat.bat
```

A black window appears briefly (that is the server starting — leave it open), then the module opens
in its own Chrome window and is set to stay above your casino window.

If Windows asks about running a script, allow it. If nothing opens, jump to **IF SOMETHING GOES
WRONG** at the bottom.

**To stop it:** close the module window, then close the black server window.

---

## YOUR FIRST SESSION (5 steps)

### Step 1 — Fill in the setup card

| Field | What to put |
|---|---|
| Casino / table name | Anything you will recognise later, e.g. "Pragmatic Table 3" |
| Total capital ($) | What you are sitting down with, e.g. `1000` |
| 1 unit = ($) | Your minimum bet at that table, e.g. `5` |
| Starting units | Calculated for you: `$1000 ÷ $5 = 200 units` |
| Table provider / layout | Pick your casino's table from the list |
| Entry mode | Leave it on **Manual entry** for now |

Press **Start session**.

### Step 2 — Set your stake

Use `−5 −1 +1 +5`, `×2`, `÷2`, or the **Clear** button. The stake is in *units*, and the module shows
the dollar value underneath. You cannot stake more than your bankroll — the server refuses it.

### Step 3 — Place your bet

Click **Banker**, **Player** or **Tie** *after* you have placed that bet at the casino. Or click
**PASS** if you are sitting a hand out. Only one bet can be open at a time, on purpose: you cannot
accidentally leave a hand behind.

### Step 4 — Record what the table actually showed

An **Open bet** panel appears with **Banker / Player / Tie**. Click what the casino displayed.

This is the important part: **you record the table's result, not whether you won.** The module works
out win, lose or push from your bet and the result. That means it is impossible to record a loss as a
win — which the old version let you do.

Reminder of the rules it applies: Banker and Player bets **push** (stake returned) on a Tie; a Tie bet
wins only on a Tie and loses otherwise.

### Step 5 — Read your session

- **Bankroll** and **Net P&L**: units and dollars, always derived from the hands you recorded
- **Statistics**: hands, wins/losses/pushes, no-bet hands, win rate, current streak, longest streaks, max drawdown
- **Bead plate**: the Banker/Player/Tie sequence you have recorded
- **Hand history**: every hand, newest first, with running bankroll

Buttons you will use: **Undo last hand** (fixes a mistake — the numbers recalculate), **Export CSV**
and **Export JSON** (save a copy), **End session** (archives it to `BACARAT\data\sessions\`).

---

## OPTIONAL — LET IT READ THE SCREEN (OCR)

You can have BetPilot read the result off the screen instead of clicking it. This is optional, and it
does not work until you do two things:

### First — calibrate (once per table layout)

Open a Command Prompt in `BACARAT` and run:

```
python app\tools\calibrate.py --list
python app\tools\calibrate.py --profile baccarat-pragmatic-half-width-full-length
```

Drag a box around the part of your casino screen that shows the hand result, press **ENTER**.

Then **open the preview picture it tells you about** (`BACARAT\data\calibration\…-preview.png`) and
check it shows the result clearly. If it does not, run the command again. This has to be you: the
region depends on your screen, your Windows display scale and where your casino window sits. Every
shipped region is a guess, and the module says so until you do this.

### Second — make sure the API key is there

The key lives in `casino-tracker\.secrets\ocr.env` and nowhere else. Never paste a key into
`BACARAT\`. The module tells you plainly if a key is missing.

### Then pick a mode

| Mode | What it does | When to use it |
|---|---|---|
| **Observe** | Records every result as a *no-bet* hand. Money never moves; you get the full bead plate | Watching a table, or testing the calibration |
| **Confirm** | Shows what it read and waits. You can correct the result before it counts | Safest way to use OCR while you build trust in it |
| **Automatic** | Settles your open bet from the screen | Once calibration and Confirm have both proved reliable |

Press **Start reading** and watch the status line. It tells you what it is doing, how many readings it
has taken and how many duplicates it ignored.

**It will not record the same hand twice.** Every reading carries a signature of the screen region and
is stored with the hand, so even a restart cannot duplicate it. If a result arrives after you already
settled the hand by hand, it is recorded as an observation and no bet is invented.

---

## EVERY TIME YOU USE IT — SAFETY REMINDERS

1. **The disclaimer stays visible.** It is at the top of the module. Do not cover it.
2. **No promises.** Never describe BetPilot as guaranteeing wins, beating the casino or predicting
   results — because it does none of those.
3. **Keys stay in `.secrets\ocr.env`.** Never in chat, documents, screenshots or this folder.
4. **Age and law.** 18+ (or your local legal age), and check your local gambling laws.
5. **Archive rule.** Nothing moves to `BetPilot\ARCHIVE\` without your explicit say-so.
6. **Bet only what you can afford to lose.**

---

## CHECKING IT IS HEALTHY (IF YOU WANT TO)

```
powershell -ExecutionPolicy Bypass -File BACARAT\tests\run-all.ps1
```

Everything should say PASS. This checks the arithmetic, the server's refusals, the screen-reading
logic and that no API key has crept into the module.

---

## IF SOMETHING GOES WRONG

| What you see | What it means |
|---|---|
| "server offline" in the module header | The black server window was closed. Run `Start Baccarat.bat` again |
| "Port 8766 is occupied by unverified PID(s)" | Something else is using the port; the launcher refuses to kill it. Close the other program or the old server window |
| "Python 3 was not found in PATH" | Python is not installed or not on PATH |
| A session already open, and you want a new one | It offers to archive the old one first — nothing is lost |
| "OCR cannot start yet. Missing: …" | Either the API key is absent from `.secrets\ocr.env`, or the region is not calibrated |
| Nothing is being read during play | Re-run calibration and inspect the preview image; the region is probably wrong |
| A wrong result was recorded | **Undo last hand**. Switch to Confirm mode so you approve each reading |

---

## WHERE YOUR DATA LIVES

| Path | What it is |
|---|---|
| `BACARAT\data\current-session.json` | The session in progress — saved after every hand |
| `BACARAT\data\sessions\` | Archived sessions, one file each |
| `BACARAT\data\calibration\` | The preview pictures from calibration |
| `BACARAT\data\ocr-events.jsonl` | An audit trail of every OCR reading and what was done with it |

Nothing is uploaded anywhere. The only network call the module ever makes is to the AI provider you
chose, and only when OCR is running.

---

## QUESTIONS YOU CAN ASK

- "What does this number mean?"
- "Why did it record that as a push?"
- "Is my calibration good enough?"
- "How do I switch between DeepSeek and Gemini?" → one line in `BACARAT\config\ocr.json`
- "Is the version number correct?" → `BACARAT\VERSION` should read `v2.0.0-20260928-Baccarat`
