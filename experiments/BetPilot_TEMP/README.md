# BetPilot-myMates

A sophisticated roulette betting simulator for analyzing the performance of two simultaneous bettors using a step progression strategy on European roulette.

## Overview

**BetPilot-myMates** simulates two bettors (A and B) placing sequential bets on column pairs in European roulette. The simulator includes:

- **Deterministic column rotation** for predictable betting patterns
- **Step progression** (S1: 1u, S2: 3u, S3: 9u, S4: 27u, S5: 81u, S6: 243u)
- **Individual reset logic** — each bettor resets to step 1 after any win or when reaching max step
- **Session tracking** with unique session IDs and persistent storage
- **Comprehensive metrics** including max drawdown, burst analysis, and max-step statistics
- **Dual interfaces** — Python CLI and HTML/JavaScript web frontend

## Project Structure

```
BetPilot/
├── src/                          # Python simulator
│   ├── betpilot_myMates_simulator.py
│   └── requirements.txt
├── frontend/                     # Web interface
│   └── betpilot_myMates_frontend.html
├── docs/                         # Documentation
│   ├── SETUP.md
│   ├── USAGE.md
│   ├── BETTING_STRATEGY.md
│   └── SESSION_FORMAT.md
├── data/                         # Session data storage (local)
│   └── sessions.json
├── samples/                      # Sample input files
│   └── sample_spins.txt
├── .gitignore
├── LICENSE
└── README.md
```

## Quick Start

### Python Version

```bash
cd C:\Users\HP\PawWork\BetPilot
python src/betpilot_myMates_simulator.py --numbers 7,0,19,32,14
```

### Web Version

1. Open `frontend/betpilot_myMates_frontend.html` in your browser
2. Paste roulette numbers or upload a text file
3. Select max step and click "Run Simulation"
4. View results and download CSV

## Features

### Betting Logic
- **Bettor A cycle**: Col1+Col2 → Col1+Col3 → Col2+Col3 (repeats)
- **Bettor B cycle**: Col2+Col3 → Col1+Col2 → Col1+Col3 (repeats)
- Each bettor places 2 identical bets per spin on their assigned pair
- Bets never overlap on the same spin

### Step Progression
- Start at Step 1 (1u stake per bet)
- After a loss, advance to next step (up to Step 6)
- After a win, reset to Step 1
- At Step 6 (243u): any outcome (win or loss) resets to Step 1

### Metrics Tracked
- **Per-bettor**: spins, wins, losses, total bet, total return, net profit
- **Max step metrics**: times at max, wins at max, losses at max
- **Session-level**: combined net, max drawdown, largest burst (swing)
- **Individual largest win/loss per bettor**

### Session Management
- Session ID format: `NNNNNN-YYMMDD-SSS`
  - NNNNNN: number of spins (6 digits)
  - YYMMDD: session date
  - SSS: sequence number (auto-incremented per date)
- Persistent storage in `data/sessions.json`
- Per-spin details in `data/session_<id>_per_spin.json`

## Input Format

Winning numbers (0–36) can be provided as:
- Comma-separated: `7,0,19,32,14`
- One per line in a file:
  ```
  7
  0
  19
  32
  14
  ```

## Output

### Console Summary (Python)
```
=== Simulation summary ===
Bettor A: spins=100, wins=45, losses=55, total_bet=10000.00, total_return=8500.00, net=-1500.00
Bettor A: max_step_hits=8, max_step_wins=3, max_step_losses=5
Bettor B: spins=100, wins=48, losses=52, total_bet=9800.00, total_return=9200.00, net=-600.00
Bettor B: max_step_hits=6, max_step_wins=2, max_step_losses=4
Session combined net: -2100.00, max_drawdown: 3200.00, largest_burst: -486.00 (spin 42)

Session saved as 000100-260824-001
```

### CSV Export
Includes per-spin detail and session summary metrics

### Browser Storage (Frontend)
Sessions saved to browser localStorage under key `betpilot_sessions`

## European Roulette Column Mapping

- **Column 1**: 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34
- **Column 2**: 2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35
- **Column 3**: 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36
- **Zero (0)**: No column (loss for all column bets)

## Configuration

### Max Step Selection
Before running a simulation, choose the maximum step to progress to (1–6):
- Step 1: Max stake = 1u (total 2u per bettor)
- Step 6: Max stake = 243u (total 486u per bettor)

Choose based on your risk tolerance and bankroll.

## Installation

### Python Dependencies
```bash
pip install -r src/requirements.txt
```

Currently, the simulator has no external dependencies — uses only Python standard library.

## Documentation

See the `docs/` folder for detailed guides:
- **SETUP.md** — Installation and configuration
- **USAGE.md** — Detailed usage examples
- **BETTING_STRATEGY.md** — Explanation of the betting logic
- **SESSION_FORMAT.md** — Session ID and data format specifications

## GitHub Backup

To back up this project to GitHub:

```bash
cd C:\Users\HP\PawWork\BetPilot
git init
git add .
git commit -m "Initial commit: BetPilot simulator with Python and web frontends"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/BetPilot.git
git push -u origin main
```

## License

See LICENSE file for details.

## Author

Developed as a betting strategy analysis tool.

## Version

v1.0.0 — Initial release with dual interfaces (Python + Web)

---

For questions or issues, refer to the documentation in `docs/` or examine the source code comments in `src/` and `frontend/`.
