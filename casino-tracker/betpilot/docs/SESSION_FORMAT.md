# BetPilot Session Format & Data Structure

## Purpose

Session files preserve the results of a strategy test so runs can be reviewed and compared later. BetPilot stores the input outcomes, strategy mode, version, per-bettor results, bankroll changes, and risk metrics. These records describe historical simulation outcomes; they do not represent a prediction or guarantee of future roulette results.

## Session ID Format

```
NNNNNN-YYMMDD-SSS
```

### Components

- **NNNNNN** (6 digits): Number of spins, zero-padded
  - Example: 000001 (1 spin), 010000 (10,000 spins), 999999 (999,999 spins)

- **YYMMDD** (6 digits): Local date when session was run
  - YY: Year (last 2 digits, e.g., 26 for 2026)
  - MM: Month (01–12)
  - DD: Day (01–31)
  - Example: 260824 = August 24, 2026

- **SSS** (3 digits): Sequence number, auto-incremented per date
  - 001: First session on that date
  - 002: Second session on that date
  - 999: Up to 999 sessions per date (rarely exceeded)

### Examples

- **000100-260824-001**: 100 spins, Aug 24 2026, 1st session of the day
- **010000-260824-002**: 10,000 spins, Aug 24 2026, 2nd session of the day
- **000001-260824-003**: 1 spin, Aug 24 2026, 3rd session of the day

## Session Data Storage

### Python Version

#### File: `data/sessions.json`

Summary index of all sessions:

```json
{
  "000100-260824-001": {
    "session_id": "000100-260824-001",
    "timestamp": "2026-08-24T15:30:45.123456",
    "spins": 100,
    "max_step": 6,
    "summaryA": {
      "name": "A",
      "spins": 100,
      "wins": 65,
      "losses": 35,
      "total_bet": 5000.00,
      "total_return": 4800.00,
      "net": -200.00,
      "current_step_index": 0,
      "current_stake": 1,
      "max_step_hits": 3,
      "max_step_wins": 1,
      "max_step_losses": 2
    },
    "summaryB": {
      "name": "B",
      "spins": 100,
      "wins": 62,
      "losses": 38,
      "total_bet": 5150.00,
      "total_return": 4650.00,
      "net": -500.00,
      "current_step_index": 1,
      "current_stake": 3,
      "max_step_hits": 2,
      "max_step_wins": 1,
      "max_step_losses": 1
    },
    "session_metrics": {
      "spins": 100,
      "combined_net": -700.00,
      "max_drawdown": 1200.00,
      "largest_burst": -486.00,
      "largest_burst_spin": 45,
      "largest_win_A": 9.00,
      "largest_loss_A": -18.00,
      "largest_win_B": 12.00,
      "largest_loss_B": -54.00,
      "max_step_hits_A": 3,
      "max_step_wins_A": 1,
      "max_step_losses_A": 2,
      "max_step_hits_B": 2,
      "max_step_wins_B": 1,
      "max_step_losses_B": 1
    }
  },
  "010000-260824-002": {
    ...
  }
}
```

#### File: `data/session_<SESSION_ID>_per_spin.json`

Detailed per-spin records:

```json
[
  {
    "spin_index": 1,
    "winning_number": 7,
    "pairA": [1, 2],
    "pairB": [2, 3],
    "winA": true,
    "netA": 1.00,
    "stepA_after": 1,
    "pairA_pretty": "Col1+Col2",
    "winB": false,
    "netB": -2.00,
    "stepB_after": 2,
    "pairB_pretty": "Col2+Col3",
    "spin_total_net": -1.00,
    "cumulative_net": -1.00
  },
  {
    "spin_index": 2,
    "winning_number": 19,
    "pairA": [1, 3],
    "pairB": [1, 2],
    "winA": true,
    "netA": 1.00,
    "stepA_after": 1,
    "pairA_pretty": "Col1+Col3",
    "winB": true,
    "netB": 1.00,
    "stepB_after": 1,
    "pairB_pretty": "Col1+Col2",
    "spin_total_net": 2.00,
    "cumulative_net": 1.00
  },
  ...
]
```

### Web Frontend Version

#### Browser Storage Location

Key: `betpilot_sessions`
Storage Type: LocalStorage (per-domain)

#### Structure

Same as Python `sessions.json`, stored in browser's localStorage:

```javascript
localStorage.getItem('betpilot_sessions')
// Returns JSON string of { sessionId: summaryRecord, ... }
```

#### Viewing Sessions

1. Open the HTML frontend
2. Run a simulation (or look up existing session ID)
3. Use the "Lookup session ID" box to view saved records
4. Session data displays as formatted JSON

#### Persistence

- **Persists**: Until browser cache is cleared
- **Not persisted**: Between browsers, on different machines, after clear cache
- **Backup**: Download CSV export to save permanently

## CSV Export Format

### File Naming
`betpilot_results_<SESSION_ID>.csv`

Example: `betpilot_results_000100-260824-001.csv`

### Structure

**Per-Spin Rows**
```csv
Spin,Number,A Pair,A Stake,A Result,A Net,NextStepA,B Pair,B Stake,B Result,B Net,NextStepB,SpinTotal,Cumulative
1,7,Col1+Col2,1,WIN,1.00,1,Col2+Col3,1,LOSS,-2.00,2,-1.00,-1.00
2,19,Col1+Col3,1,WIN,1.00,1,Col1+Col2,2,WIN,2.00,1,3.00,2.00
...
```

**Summary Rows**
```csv
Summary A,spins,100,wins,65,losses,35,totalBet,5000.00,totalReturn,4800.00,net,-200.00
Summary B,spins,100,wins,62,losses,38,totalBet,5150.00,totalReturn,4650.00,net,-500.00

SessionMetrics,combined_net,-700.00,max_drawdown,1200.00,largest_burst,-486.00,largest_burst_spin,45
```

## Field Descriptions

### Bettor Summary Fields
- **name**: Bettor identifier (A or B)
- **spins**: Total spins completed
- **wins**: Successful spins (winning number hit)
- **losses**: Failed spins (winning number didn't hit or was 0)
- **total_bet**: Sum of all stakes (stake × 2 per spin)
- **total_return**: Sum of all payouts (non-zero only on wins)
- **net**: total_return - total_bet (profit/loss)
- **current_step_index**: Step at end of session (0-based index)
- **current_stake**: Stake value at end of session
- **max_step_hits**: Times reached Step 6 during session
- **max_step_wins**: Wins achieved at Step 6
- **max_step_losses**: Losses incurred at Step 6

### Per-Spin Fields
- **spin_index**: Spin number (1-based)
- **winning_number**: Number drawn (0–36)
- **pairA**: Column pair for Bettor A (e.g., [1, 2])
- **pairB**: Column pair for Bettor B (e.g., [2, 3])
- **winA**: Boolean, whether Bettor A won
- **netA**: Profit/loss for Bettor A on this spin
- **stepA_after**: Step for Bettor A after this spin (1-based, 1–6)
- **pairA_pretty**: Readable pair format (e.g., "Col1+Col2")
- *Same for B fields*
- **spin_total_net**: netA + netB (combined spin result)
- **cumulative_net**: Running total profit/loss from session start

### Session Metrics Fields
- **spins**: Total spins in session
- **combined_net**: Total profit/loss (sum of all spin totals)
- **max_drawdown**: Largest peak-to-trough decline
- **largest_burst**: Single-spin change with largest absolute value
- **largest_burst_spin**: Spin index of largest burst
- **largest_win_A/B**: Largest single-spin win for each bettor
- **largest_loss_A/B**: Largest single-spin loss for each bettor
- **max_step_hits_A/B**: Times at max step for each bettor
- **max_step_wins_A/B**: Wins at max step for each bettor
- **max_step_losses_A/B**: Losses at max step for each bettor

## Data Retention

### Python
- Sessions automatically saved to `data/sessions.json` and `data/session_<ID>_per_spin.json`
- Files persist indefinitely
- Can be archived, backed up to GitHub, etc.

### Web
- Sessions stored in browser localStorage
- Persist until manually cleared or browser cache is cleared
- Not synced across browsers/devices
- Download CSV for permanent record

## Querying Sessions

### Python (Manual JSON Review)
```bash
# View all sessions
type C:\Users\HP\PawWork\BetPilot\data\sessions.json

# View specific session per-spin details
type C:\Users\HP\PawWork\BetPilot\data\session_000100-260824-001_per_spin.json
```

### Python (Programmatic)
```python
import json
with open('data/sessions.json', 'r') as f:
    sessions = json.load(f)
    for session_id, record in sessions.items():
        print(f"{session_id}: net={record['session_metrics']['combined_net']}")
```

### Web (Browser Console)
```javascript
const sessions = JSON.parse(localStorage.getItem('betpilot_sessions') || '{}');
Object.entries(sessions).forEach(([id, record]) => {
  console.log(`${id}: net=${record.session_metrics.combined_net}`);
});
```

---

For detailed field explanations, see BETTING_STRATEGY.md and USAGE.md.

---

## Web Session Fields (Current UI)

For web runs, session records are saved in browser `localStorage` (`betpilot_all_sessions`) with these top-level fields:

- `sessionId` (format: `YYMMDD-SSS`)
- `timestamp` (ISO datetime)
- `appVersion` (example: `v2.6.0`)
- `bettors`
- `metrics`
- `records` (per-spin detail rows)

### `bettors` object

Each bettor key (`A`, `B`, `C`, `D`) stores:

- `name`
- `type` (`column` or `dozen`)
- `spins`
- `wins`
- `losses`
- `net`
- `maxStepHits`
- `maxStepWins`
- `maxStepLosses`
- `stopped` (true/false)
- `burstSpin` (spin index if stopped, otherwise null/blank)

### `metrics` object

- `maxDrawdown`
- `largestBurst`
- `totalSpins`
- `combinedNet`

### Comparison report data

The "Summary of Summary — Max Step Comparison (Same Numbers)" table is computed at runtime from the same input number sequence and displays results for max step:

- 4
- 5
- 6

Columns shown:

- `#`
- `Strategy`
- `Total Bankroll Change`
- `A`
- `B`
- `C`
- `D`
- `Bettors Stopped`

### Summary CSV (web) additional tracking

The web summary CSV includes:

- `sessionId`
- `appVersion`
- `timestamp`
- aggregate metrics and bettor totals
- stop/burst fields (`stoppedA..D`, `burstSpinA..D`)
