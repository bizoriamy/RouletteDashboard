# European Roulette Live Dashboard

Local-first European roulette tracking, betting-session management, backtesting,
floating quick entry, and completed-session Google Sheets archiving.

**Current version:** `v2026.08.11.3`  
**Active branch:** `local-sync`  
**Local source of truth:** `C:\Users\HP\PawWork\roulette-analyzer`

> Roulette outcomes are random. This project organizes tracking, stake timing,
> and session analysis; it does not predict outcomes or remove the house edge.

## Documentation

- [Strategy Guide](STRATEGY_GUIDE.md) - overview and verified read-only link to
  the complete Google strategy document.
- [Changelog](CHANGELOG.md) - version and development history.
- [Project Description](PROJECT_DESCRIPTION.md) - concise scope, architecture,
  and suggested GitHub About text.
- [Project Guidance](AGENTS.md) - repository, version, safety, architecture, and
  verification rules for Codex and PawWork.
- [Google Apps Script Setup](google-apps-script/SETUP.md) - Google Sheets bridge
  deployment instructions.

## Main features

- Manual European roulette spin entry from `0` through `36`.
- Newest-first display of recent winning numbers.
- Undo, session reset, dealer-change markers, history, and session summaries.
- Automatic retention of the last-used strategy settings.
- Standard European and La Partage table-rule handling.
- Unit and real-currency displays.
- Session trigger-frequency counters.
- Backtesting for supported strategy categories.
- Local-first session recording with optional completed-session batch
  synchronization to Google Sheets.
- A detachable Freddy's Triangle Snake window that can remain always on top.
- A detachable Quick Entry roulette keypad with remembered **0 Left** and
  vertical **0 Top** layouts.
- Main-window position, size, and always-on-top preference memory.

## Strategies

### 1. Even-Money - Streak Rider

- Tracks Red/Black, Odd/Even, and Low/High.
- Current working trigger: 6 consecutive absences.
- Repeating progression: `1, 2, 1, 2, ...` units.
- Continues while the selected card wins.
- Stops at the first full loss.

### 2. 12-Number - Wait 6 / Play 6 Fibonacci

- Tracks all three dozens and all three columns.
- Triggers after 6 consecutive absences.
- Maximum six betting hands: `1, 1, 2, 3, 5, 8` units.
- Stops on the first win or after the sixth loss.
- The main dashboard permits up to four simultaneous 12-number cards.

### 3. 4-Streets

- Requires at least 24 uploaded or manually entered history numbers.
- Identifies six candidate streets.
- Observes the next 12 spins.
- Selects the hottest four streets from the candidates.
- Per-street progression: `1, 1, 2, 3, 5` units.
- Combined four-street wagers: `4, 4, 8, 12, 20` units.
- After a win or stage-five burst, automatically returns to a new 12-spin
  observation period.

### 4. Freddy's Triangle Snake (FTS)

- Uses a separate floating companion window while spin entry remains in the
  main dashboard.
- Supports up to seven active cards:
  - three even-money selections;
  - two dozens;
  - two columns.
- Each card independently tracks its bankroll, triangle position, cycle P/L,
  session P/L, drawdown, and next stake.
- After four consecutive full losses, only the affected card pauses. Tracking
  continues while the user chooses **Reset Level 1**, **Continue**, or
  **Stop card**.
- Recently stopped and previous-session results are independently collapsible.

See [STRATEGY_GUIDE.md](STRATEGY_GUIDE.md) for the authoritative detailed rules.

## Start the dashboard

1. Open this folder:

   ```text
   C:\Users\HP\PawWork\roulette-analyzer
   ```

2. Double-click:

   ```text
   Launch Live Dashboard.bat
   ```

3. The launcher starts exactly one local server and opens the dashboard in
   Google Chrome.

4. Confirm that the launcher, main dashboard, and FTS floating window show the
   same value as the [`VERSION`](VERSION) file.

The stable local address is:

```text
http://localhost:8765/live-dashboard.html
```

Do not open `live-dashboard.html` with a `file:///` address. Server features,
Google Sheets synchronization, OCR support, and window controls require the
local launcher.

## Local-first Google Sheets synchronization

The live dashboard does **not** contact Google Sheets while spins are being
entered. Every current-session change continues to be stored immediately in the
browser. When **Reset** ends a non-empty session, the dashboard first creates a
complete local archive and then asks whether to synchronize that completed
session to the **European Roulette Analyzer History** Google Sheet.

- **OK - Sync now:** sends the complete session in one replace-safe batch.
- **Cancel - Keep locally:** retains the completed session as **Pending Sync**.
- **Sync pending sessions:** retries every locally pending completed session.
- A failed upload remains pending locally and can be retried later.
- Closing the browser is not used as a sync trigger because browsers cannot
  guarantee completion of a network request while closing.

Synchronized tables include:

- Spins
- Triggers
- Bet Sessions
- Bet Steps
- 4-Street Cycles
- 4-Street Steps
- Freddy Sessions
- Freddy Steps
- Bankroll

The Google Sheets panel's **Save connection** button stores the Apps Script
deployment URL and private synchronization token without uploading the active
session. These credentials remain in the browser profile's local storage and
are not committed to GitHub.

If synchronization reports `Unauthorized request`, `404`, or `Failed to fetch`,
verify the Apps Script deployment, access setting, web-app URL, and token using
[google-apps-script/SETUP.md](google-apps-script/SETUP.md).

## Where information is stored

| Information | Storage location |
| --- | --- |
| Active application and documentation | `C:\Users\HP\PawWork\roulette-analyzer` |
| Committed code backup | GitHub branch `local-sync` |
| Current session and up to 30 completed local archives | Browser local storage |
| Synchronized completed history | Google Sheets |
| Full strategy specification | Read-only Google Doc linked from `STRATEGY_GUIDE.md` |
| Current unfinished session and preferences | Browser local storage for `http://localhost:8765` |

Browser-local information includes the current unfinished session, up to 30
completed recovery archives, pending-sync state, FTS card states, last-used
settings, window position and size, and always-on-top preference. Clearing site
data or switching browser profiles can remove or isolate this live state. Use
**Download last archive** when a separate recovery file is required.

## One-way GitHub backup

To back up local PawWork changes, double-click:

```text
Sync PawWork to GitHub.bat
```

The synchronization workflow:

- uses `C:\Users\HP\PawWork\roulette-analyzer` as the source of truth;
- commits and pushes only to `origin/local-sync`;
- does not pull;
- does not switch branches;
- does not merge or rebase;
- does not reset files;
- does not push to `main`.

The GitHub repository uses `local-sync` as its default display branch. The old
`main` branch remains untouched as historical state.

## Project structure

| File or folder | Purpose |
| --- | --- |
| `VERSION` | Authoritative project version |
| `AGENTS.md` | Project operating and safety guidance |
| `CHANGELOG.md` | Release and development history |
| `STRATEGY_GUIDE.md` | Strategy summary and Google Doc link |
| `live-dashboard.html` | Main dashboard structure |
| `live-dashboard.css` | Main dashboard layout and styling |
| `live-dashboard.js` | Main dashboard behavior and integration |
| `roulette-core.js` | Even-money and 12-number betting engine |
| `hot-streets.js` | 4-Streets candidate, observation, and betting engine |
| `freddy-engine.js` | Freddy's Triangle Snake engine |
| `freddy-window.html` | Floating FTS window structure |
| `freddy-window.css` | Floating FTS window styling |
| `freddy-window.js` | Floating FTS window behavior |
| `dashboard-storage.js` | Browser persistence for dashboard sessions |
| `google-sheets-sync.js` | Local archive and completed-session Google Sheets batch client |
| `ocr-grid-order.js` | Roulette-history image reading-order support |
| `server.py` | Local server, sync proxy, OCR, and window-control endpoints |
| `dashboard-launcher.ps1` | Server startup and health verification |
| `Launch Live Dashboard.bat` | User-facing dashboard launcher |
| `github-sync.ps1` | Safe one-way GitHub synchronization logic |
| `Sync PawWork to GitHub.bat` | User-facing GitHub synchronization launcher |
| `google-apps-script/` | Google Sheets Apps Script bridge and setup guide |
| `*.test.js` | Automated strategy and synchronization tests |

## Verification

Before publishing application changes, run the relevant checks:

```text
node freddy-engine.test.js
node roulette-core.test.js
node google-sheets-sync.test.js
node hot-streets-sync.test.js
```

Also verify:

- the launcher reports a healthy server on port `8765`;
- the main dashboard and floating FTS window match `VERSION`;
- manual spin entry, undo, reset, and active strategy controls work;
- a live spin creates no Google Sheets network request;
- ending a session creates a local pending archive before any upload;
- successful batch sync clears Pending Sync, while failure retains it;
- Google Sheets status corresponds with the completed-session rows received by
  the Sheet.

## Backup and recovery

- Installers create timestamped `backup-before-*` folders before replacing
  application files.
- Backup folders are excluded from Git synchronization.
- GitHub `local-sync` stores committed project files.
- Browser local storage keeps the active session and recent completed archives.
- Google Sheets stores only completed sessions that the user chooses to sync.
- The strategy Google Doc stores the detailed operating specification.

For recovery, restore the project from `local-sync`, then reconnect the local
Google Sheets web-app URL and token if the browser profile no longer contains
them.
