# 🎰 Baccarat Tracker

A simple, compact tool to track your baccarat bets across multiple online casinos.

## Features

- **Session Management** - Track bets by casino with auto-generated session IDs
- **Table Type Selection** - 5% Commission or No Commission tables
- **Unit-Based Betting** - Set your unit value and click to add units
- **Click-Based Interface** - No typing required during betting
- **Three Result Options** - WIN, TIE (Push), or LOSE
- **Automatic Payout Calculation** - Handles standard baccarat payouts with commission
- **History Tracking** - View all bets with running balance
- **CSV Export** - Export single session or all sessions
- **End Time Tracking** - Records session duration
- **Casino Theme** - Dark design with gold accents
- **Mobile Friendly** - Works on phones and fits beside casino windows on PC
- **Keyboard Shortcuts** - For faster entry on desktop

## Quick Start

See [INSTALL.md](INSTALL.md) for detailed setup instructions.

**TL;DR:**
1. Open `index.html` in your web browser
2. Enter casino name, select table type, and set unit value
3. Click **START SESSION**
4. Start tracking your bets!

## How to Use

### Starting a Session
1. Enter the casino name (e.g., "BetVictor", "BK8")
2. Select table type:
   - **5% Commission Table** - Banker wins pay 0.95:1
   - **No Commission Table** - Banker wins pay 1:1
3. Set your unit value (e.g., $0.50)
4. Click **START SESSION**

The app will generate a session ID like `BV-001` (BetVictor session 1).

### Placing a Bet
1. **Add units** by clicking the +1, +2, or +5 buttons
   - Each click adds that many units to your bet
   - Example: Click +5 five times = 25 units
2. **Select side** by clicking BANKER, TIE, or PLAYER
3. **Bet summary** appears showing your bet details
4. **Record result** by clicking WIN, TIE, or LOSE

### Unit Buttons
| Button | Action |
|--------|--------|
| +1 | Add 1 unit |
| +2 | Add 2 units |
| +5 | Add 5 units |
| x2 | Double current bet |
| CLR | Clear current bet |

### Result Buttons
| Button | Action |
|--------|--------|
| WIN | Your bet side won |
| TIE | Hand was a Tie (Push for Banker/Player, Win for Tie bets) |
| LOSE | Opposite side won |

### Payout Rules

**5% Commission Table:**
| Bet | Payout |
|-----|--------|
| Player Win | 1:1 (bet × 1) |
| Banker Win | 0.95:1 (bet × 0.95) |
| Tie (bet on Tie) | 8:1 (bet × 8) |
| Tie (bet on Banker/Player) | Push (money back) |

**No Commission Table:**
| Bet | Payout |
|-----|--------|
| Player Win | 1:1 (bet × 1) |
| Banker Win | 1:1 (bet × 1) |
| Tie (bet on Tie) | 8:1 (bet × 8) |
| Tie (bet on Banker/Player) | Push (money back) |

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| B | Select Banker |
| T | Select Tie |
| P | Select Player |
| W | Record Win |
| U | Record Tie/Push |
| L | Record Lose |
| Escape | Clear current bet |

### CSV Export

**Two report types available:**

1. **Current Session Report** (Session screen → 📄 CSV button)
   - Detailed bet-by-bet history
   - Includes start time, end time, and running balance

2. **All Sessions Report** (Setup screen → 📄 Export History to CSV)
   - Summary of all sessions
   - Includes duration, win rate, and final P/L

## Screenshots

### Setup Screen
```
┌─────────────────────────┐
│    🎰 BACCARAT TRACKER  │
├─────────────────────────┤
│ CASINO NAME             │
│ [BetVictor           ]  │
│                         │
│ TABLE TYPE              │
│ [5% Commission Table ▼] │
│                         │
│ 1 UNIT = $              │
│ [0.50                ]  │
│                         │
│ [    START SESSION    ]  │
│                         │
│ 📄 Export History to CSV│
└─────────────────────────┘
```

### Betting Screen
```
┌─────────────────────────────────────┐
│ BV-001    BetVictor    BALANCE      │
│ 5% Comm                  +$12.50    │
├─────────────────────────────────────┤
│ CURRENT BET                         │
│ [+1] [+2] [+5] [x2] [CLR]         │
│ [BANKER] [TIE] [PLAYER]            │
│                                     │
│      5 UNITS ($2.50)               │
│                                     │
│ 5 units ($2.50) on Banker          │
│        [WIN]   [TIE]   [LOSE]      │
├─────────────────────────────────────┤
│ SESSION HISTORY    [📄 CSV] [END]  │
│ Bets:12 Wins:7 Win%:58% P/L:+$12.50│
│ [B] 5u ($2.50)         +$4.75      │
│ [P] 3u ($1.50)         -$1.50      │
│ [T] 2u ($1.00)         +$8.00      │
└─────────────────────────────────────┘
```

## Data Storage

All data is stored locally in your browser using localStorage:
- **No internet required** - works completely offline
- **No account needed** - data stays on your device
- **Persistent** - survives browser restarts

**Note:** Clearing browser data will delete your history. Consider exporting CSV regularly.

## Future Features

Planned additions (see CHANGELOG.md for updates):
- Google Sheets integration (live sync)
- Side bets (Tiger, Super 6, etc.)
- Detailed statistics and charts
- Bankroll management tools
- Multi-device sync

## Browser Support

Tested and works on:
- Google Chrome (recommended)
- Mozilla Firefox
- Microsoft Edge
- Safari
- Mobile browsers (Chrome, Safari)

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

For issues or suggestions, please create an issue in the project repository.
