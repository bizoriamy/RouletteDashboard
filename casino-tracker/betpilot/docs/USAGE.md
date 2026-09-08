# BetPilot Usage Guide

BetPilot-myMates is a **collector of roulette strategies**: use it to record, test, compare, and understand roulette systems under repeatable conditions. Results are analytical only; no strategy removes the European roulette house edge.

The current web application contains two built-in strategy modes:

- **Classic 4 Bettors**: two column-pair bettors and two dozen-pair bettors.
- **Absence Trigger 2 Bettors**: one column-pair bettor and one dozen-pair bettor using absence triggers.

## Python Command-Line Interface

### Basic Usage

```bash
python src/betpilot_myMates_simulator.py --numbers 7,0,19,32,14
```

### Options

```
--numbers NUMS      Comma-separated list of winning numbers (0-36)
--file FILE         Path to file with winning numbers (one per line or comma-separated)
--max-step N        Maximum step to progress to (1-6). Default: 6
--seed S            RNG seed for reproducibility
--quiet             Show summary only (no per-spin details)
```

### Examples

#### From Command Line (Inline)
```bash
python src/betpilot_myMates_simulator.py --numbers 1,2,3,0,10,20
```

#### From File
```bash
python src/betpilot_myMates_simulator.py --file data/spins.txt --max-step 4
```

#### Quiet Mode (Summary Only)
```bash
python src/betpilot_myMates_simulator.py --numbers 1,2,3 --quiet
```

#### Interactive Mode
```bash
python src/betpilot_myMates_simulator.py
# Paste numbers separated by commas:
# 7,19,32,0,14
# Then press Ctrl+D (Linux/Mac) or Ctrl+Z (Windows)
```

#### With Seed for Reproducibility
```bash
python src/betpilot_myMates_simulator.py --file data/spins.txt --seed 42
```

### Output

Per-spin output (default):
```
Spin 1: number=7
  Bettor A -> Col1+Col2, stake per bet=1 (total 2) -> WIN, net=1.00, next step=1
  Bettor B -> Col2+Col3, stake per bet=1 (total 2) -> LOSS, net=-2.00, next step=2

Spin 2: number=19
  Bettor A -> Col1+Col3, stake per bet=1 (total 2) -> WIN, net=1.00, next step=1
  Bettor B -> Col1+Col2, stake per bet=2 (total 4) -> WIN, net=2.00, next step=1

...

=== Simulation summary ===
Bettor A: spins=2, wins=2, losses=0, total_bet=4.00, total_return=6.00, net=2.00
Bettor A: max_step_hits=0, max_step_wins=0, max_step_losses=0
Bettor B: spins=2, wins=1, losses=1, total_bet=6.00, total_return=3.00, net=-3.00
Bettor B: max_step_hits=0, max_step_wins=0, max_step_losses=0
Session combined net: -1.00, max_drawdown: 3.00, largest_burst: 1.00 (spin 1)

Session saved as 000002-260824-001
Summary stored in: C:\Users\HP\PawWork\BetPilot\data\sessions.json
Per-spin details stored in: C:\Users\HP\PawWork\BetPilot\data\session_000002-260824-001_per_spin.json
```

## Web Frontend

### Opening the App

1. Navigate to `C:\Users\HP\PawWork\BetPilot\frontend\`
2. Right-click `betpilot_myMates_frontend.html`
3. Select "Open with" → Your preferred browser
4. Or simply double-click to open with default browser

### Using the Interface

#### Input Methods

**Method 1: Paste Numbers**
- Click in the textarea
- Paste comma-separated numbers: `7,0,19,32,14`
- Or paste newline-separated numbers

**Method 2: Upload File**
- Click "Or upload file"
- Select a text file containing numbers
- Supported formats:
  - Comma-separated: `1,2,3,0,10`
  - One per line:
    ```
    1
    2
    3
    0
    10
    ```

#### Configuration

- **Max Step**: Choose 1–6 (default: 6)
  - Step 1: Max bet = 1u (low risk)
  - Step 6: Max bet = 243u (high risk)

- **Quiet Output**: Check to hide per-spin table (faster)

#### Running the Simulation

1. Enter/upload numbers
2. Select max step
3. Click "Run Simulation"
4. Wait for results

#### Results Display

The page shows:
- **Per-spin table** (if not quiet mode):
  - Spin number, winning number, pairs, stakes, results, net profit per spin
  - Cumulative running total

- **Summary**: Win/loss records for both bettors

- **Max Step Stats**: Times reached max, wins at max, losses at max

- **Session ID**: Unique identifier for this session (saved to browser storage)

- **Lookup Box**: Retrieve previous sessions by Session ID

#### Downloading Results

1. Click "Download CSV" button
2. File saves as `betpilot_results_<SESSION_ID>.csv`
3. Open in Excel, Google Sheets, or any text editor

### Accessing Saved Sessions

Sessions are stored in your browser's localStorage under key `betpilot_sessions`.

To view a saved session:
1. Run a simulation (or use the lookup box)
2. Enter the Session ID in the "Lookup session ID" box
3. Click "Lookup"
4. Full session record displays as JSON

**Note**: Sessions persist until you clear your browser cache. For permanent storage, download CSV files.

## Data Files

### Input Format (spins.txt)

Plain text file with roulette numbers (0–36):

**Format 1: Comma-separated**
```
7,0,19,32,14,1,2,3,4,5
```

**Format 2: One per line**
```
7
0
19
32
14
1
2
```

**Format 3: Mixed**
```
7,0,19
32,14
1,2,3
```

### Output Files (Python)

After running the Python simulator:

1. **data/sessions.json** — Index of all sessions
   ```json
   {
     "000100-260824-001": {
       "session_id": "000100-260824-001",
       "timestamp": "2026-08-24T15:30:00.123456",
       "spins": 100,
       "max_step": 6,
       "summaryA": { ... },
       "summaryB": { ... },
       "session_metrics": { ... }
     }
   }
   ```

2. **data/session_<ID>_per_spin.json** — Detailed per-spin records
   ```json
   [
     {
       "spin_index": 1,
       "winning_number": 7,
       "pairA": [1, 2],
       "winA": true,
       "netA": 1.00,
       "...": "..."
     }
   ]
   ```

## Tips & Tricks

### Quick Testing
Create a small test file with 5–10 numbers to verify setup works correctly.

### Analyzing Results
- Export CSV and open in Excel for charting
- Sort by "A Net" or "B Net" to find biggest wins/losses
- Filter by "A Result" to see win/loss patterns

### Batch Processing (Python)
For very large datasets:
```bash
python src/betpilot_myMates_simulator.py --file large_dataset.txt --quiet
```

This shows only the summary, speeds up processing.

### Session Comparison
Run the same dataset multiple times with different `--max-step` values:
```bash
python src/betpilot_myMates_simulator.py --file data.txt --max-step 4
python src/betpilot_myMates_simulator.py --file data.txt --max-step 6
```

Compare the results in `data/sessions.json`.

## Common Questions

**Q: Can I run this offline?**
A: Yes. Python version has no dependencies. Web version runs entirely in-browser — no internet needed.

**Q: How many spins can I simulate?**
A: Hundreds of thousands. Performance depends on your machine. Python is faster for very large datasets; web is fine for <10K spins.

**Q: Can I export results from the web version?**
A: Yes — download as CSV. The CSV includes per-spin and session summary.

**Q: How long do sessions persist in the browser?**
A: Until you clear your cache/cookies. For permanent storage, download CSV files.

**Q: Can I run both Python and web version on the same dataset?**
A: Yes. They use identical logic and should produce identical results (given same max-step).

---

For more details, see BETTING_STRATEGY.md and SESSION_FORMAT.md.

---

## Web Reporting Workflow (v2.6.0+)

This section documents the latest web reporting flow.

### 1) Run a simulation

1. Open `frontend/betpilot_myMates_frontend.html`
2. Paste winning numbers (one per line)
3. Click **Run Simulation**

### Strategy selector

The web UI supports 2 modes:

1. **Classic 4 Bettors (Columns+Dozens)**
2. **Absence Trigger 2 Bettors (1 Column + 1 Dozen)**

For absence mode, set:

- **Absence Trigger X**: 3, 4, 5, or 6 (default 4)

### 2) Read the three report layers

After the run, the page shows:

1. **Session Metrics** (spins, drawdown, largest burst)
2. **Bettor Summary** (A/B/C/D individual stats)
3. **Summary of Summary — Max Step Comparison (Same Numbers)**
   This compares Max Step 4 vs 5 vs 6 using the same input dataset.

In absence mode, this section switches to:

- **Summary of Summary — Absence Trigger Comparison (Same Numbers)**
- rows: Trigger 3 / 4 / 5 / 6

Comparison table columns:

- `#`
- `Strategy`
- `Total Bankroll Change`
- `A`, `B`, `C`, `D`
- `Bettors Stopped`

### 3) Understand "Bettors Stopped"

- `None`: no bettor bursted at max step
- `💥A@23`: bettor A bursted and stopped at spin 23
- Multiple values can appear in one row (example: `💥A@23 💥C@36`)

### 4) Version trace

Check version in:

- Header subtitle badge (example: `v2.6.0`)
- Session footer line (example: `Session: 260827-001 | v2.6.0`)

Use this when reporting issues or comparing behavior between runs.

### 5) Export

- **Download Detailed CSV**: per-spin records
- **Download Summary CSV**: session-level report rows (includes `appVersion`)

### Troubleshooting

If report section does not appear:

1. Press **Ctrl+F5** to hard refresh
2. Verify version badge is current
3. Ensure at least one valid number exists (0–36)
4. Run again and look for section title:
   - `⚖️ Summary of Summary — Max Step Comparison (Same Numbers)`
