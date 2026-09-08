# BetPilot-myMates — Collector of Roulette Strategies

BetPilot is a systematic collection, testing, comparison, and documentation tool for roulette strategies. It is designed to help bettors study variance, progression risk, drawdowns, and the permanent house edge—not to claim a guaranteed way to beat roulette.

A professional-grade **European roulette simulator** currently includes two built-in strategies:
- **Bettors A & B**: Betting on **Column pairs** (Col1, Col2, Col3)
- **Bettors C & D**: Betting on **Dozen pairs** (D1=1-12, D2=13-24, D3=25-36)

Each bettor uses a **6-step Martingale progression** (`1u -> 3u -> 9u -> 27u -> 81u -> 243u`), with individual reset-on-win mechanics and comprehensive session tracking.

---

## Features

### Built-in Strategy Collection
- Column betting (2 bettors: A, B)
- Dozen betting (2 bettors: C, D)
- Non-overlapping pair validation
- Strategy selector in web UI:
  - Classic 4-bettor mode
  - Absence-trigger 2-bettor mode (1 column bettor + 1 dozen bettor)
- Strategy definitions and results are documented for repeatable comparison

### Intelligent Betting Logic
- Deterministic pair rotation (not random)
- Individual step progression per bettor
- Automatic reset on any win
- Automatic stop for each bettor after a loss at max step (others continue)
- Max step tracking (hits, wins, losses)

### Comprehensive Metrics
- Session summary with combined net
- Per-bettor statistics
- Max drawdown calculation
- Largest burst analysis
- Win/loss distribution

### Multiple Interfaces
- **Web Interface** (HTML/JS): Browser-based, localStorage persistence
- **Python CLI**: Advanced users, JSON export, batch processing

### Data Management
- Automatic session ID generation (yymmdd-seq)
- JSON export for per-spin records
- CSV download from web interface
- Spreadsheet-friendly summary CSV for session comparisons (max-step 4/5/6)
- Persistent session history

---

## Quick Start

### Web Interface (Easiest)
1. Double-click `BetPilot-myMates.bat` on the desktop
2. Press **1** for Web Interface
3. Paste your roulette numbers (one per line)
4. Click **Run Simulation**
5. View results and download CSV

### Python CLI
1. Double-click `BetPilot-myMates.bat` on the desktop
2. Press **2** for Python CLI
3. Follow prompts or use command-line args:
   ```bash
   python betpilot_myMates_simulator.py --numbers 1,5,17,0,32
   python betpilot_myMates_simulator.py --file spins.txt --max-step 4
   ```

---

## Bettor Configuration

### Column Bettors (A & B)
**Betting Space**: Columns 1, 2, 3 (standard roulette table layout)
- **Col 1**: 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34
- **Col 2**: 2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35
- **Col 3**: 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36

**Bettor A Rotation**: [1,2] -> [1,3] -> [2,3] -> [1,2] -> ...
**Bettor B Rotation**: [2,3] -> [1,2] -> [1,3] -> [2,3] -> ...

### Dozen Bettors (C & D)
**Betting Space**: Dozens 1, 2, 3
- **D1**: 1-12
- **D2**: 13-24
- **D3**: 25-36

**Bettor C Rotation**: [1,2] -> [1,3] -> [2,3] -> [1,2] -> ...
**Bettor D Rotation**: [2,3] -> [1,2] -> [1,3] -> [2,3] -> ...

---

## Payout Structure

**Columns**: 2:1 (bet 1u, win 3u)
**Dozens**: 2:1 (bet 1u, win 3u)

Each bettor places **2 identical bets** on the same pair per spin:
- Total stake per bettor = `stake x 2`
- Total payout (if win) = `stake x 3` (one winning pair unit returns 3u per 1u stake)

---

## Reset Logic

- **On Win** (any step): Reset to Step 1 immediately
- **On Loss** (steps 1-5): Advance to next step
- **On Loss** (max selected step): That bettor is stopped for the rest of the session
  - Other bettors continue until session end
  - This max-step burst is tracked for analysis

---

## Documentation

- **[SETUP.md](docs/SETUP.md)**: Installation, folder structure, troubleshooting
- **[USAGE.md](docs/USAGE.md)**: Step-by-step CLI and web UI examples
- **[BETTING_STRATEGY.md](docs/BETTING_STRATEGY.md)**: Betting logic, probability analysis, risk considerations
- **[SESSION_FORMAT.md](docs/SESSION_FORMAT.md)**: Data format reference, field descriptions

---

## How to Use

### Scenario 1: Quick Test (Web)
```
1. Double-click BetPilot-myMates.bat
2. Choose option 1 (Web Interface)
3. Paste: 1, 5, 17, 0, 32, 14 (or any numbers)
4. Click Run Simulation
5. Download CSV (optional)
```

### Scenario 2: Batch Analysis (Python)
```bash
cd C:\\Users\\HP\\PawWork\\casino-tracker\\betpilot\\src
python betpilot_myMates_simulator.py --file mydata.txt --max-step 6
```

---

## License

MIT License - see [LICENSE](LICENSE) for details

---

## GitHub

Repository: https://github.com/bizoriamy/BetPilot-myMates

**BetPilot-myMates v2.6.0** | Collector of Roulette Strategies | European Roulette

---

## Reporting & Versioning (Web UI v2.6.0+)

The web frontend now includes a dedicated comparison report section:

### "Summary of Summary — Max Step Comparison (Same Numbers)"

After each run, the simulator automatically compares the same input numbers with:

- Max Step 4
- Max Step 5
- Max Step 6

It displays this one-glance table:

`# | Strategy | Total Bankroll Change | A | B | C | D | Bettors Stopped`

### What each column means

- **#**: report row order (1/2/3)
- **Strategy**: Max Step setting used for that row
- **Total Bankroll Change**: combined net of A+B+C+D
- **A/B/C/D**: individual bettor net for that strategy
- **Bettors Stopped**: bettors who burst at max step, with spin index (example: `💥A@23`)

### Visibility behavior

- The report appears after clicking **Run Simulation**
- The app auto-scrolls to this section after each run
- The section is placed above per-spin detail cards for easier viewing

### Version tracing

To help trace behavior across updates, version is shown in two places:

1. Header subtitle badge (for example `v2.6.0`)
2. Session line at the bottom of results:
   - `Session: YYMMDD-SSS | v2.6.0`

The version is also included in saved web session records and summary CSV exports as `appVersion`.

### Troubleshooting: comparison report not visible

If you cannot see the report:

1. Hard refresh the page with **Ctrl+F5**
2. Confirm the header version badge shows the latest version
3. Re-run simulation with valid numbers (one per line, 0–36)
4. Scroll to the section titled:
   - **"⚖️ Summary of Summary — Max Step Comparison (Same Numbers)"**

---

## Absence-Trigger Strategy Mode (Web UI v2.6.0+)

This mode runs 2 bettors:

- **COL bettor** (column pair betting)
- **DOZ bettor** (dozen pair betting)

### Trigger logic

1. Track absence counts for each column (or dozen): 1, 2, 3
2. Pick the most-absent target
3. When absence count reaches trigger `X` (3/4/5/6), place bets on the other two sides
   - Example: Col2 absent at trigger -> bet Col1+Col3

### Step sequence

- Sequence per bettor: **1, 3, 9**
- Win: reset to step 1
- Loss: advance step
- Step 3 loss: treated as burst-hit and reset to step 1 (no forced stop)

### Summary of Summary for this mode

The comparison table switches automatically to:

- Trigger 3
- Trigger 4
- Trigger 5
- Trigger 6

using the same number set in one run.
