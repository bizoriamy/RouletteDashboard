# Roulette Analyzer project guidance

## Active repository

- The source of truth is `C:\Users\HP\PawWork\roulette-analyzer\`.
- Treat `C:\Users\HP\PawWork\` as a separate parent repository. Do not edit,
  commit, or report its revision as the Roulette Analyzer revision.

## Version

- `VERSION` is the authoritative project version.
- Always read and report the value from `VERSION`; do not infer the current
  version from Git dates, commit messages, browser cache, or backup folders.
- The launcher and local server read `VERSION` directly.
- The visible main-dashboard and Freddy floating-window labels must match
  `VERSION`. A mismatch is a defect or stale browser window and must be
  investigated before reporting the running version.
- Record every user-facing release in `CHANGELOG.md`. Add the newest release at
  the top and describe additions, changes, and fixes in plain language.
- `STRATEGY_GUIDE.md` links to the authoritative read-only Google strategy
  document. Keep its summary and last-reviewed date aligned with material rule
  changes in that document.

## Git safety

- The local working branch and one-way backup destination are `local-sync`.
- Push only to `origin/local-sync`.
- Never pull, switch branches, merge, rebase, reset, or push to `main` as part
  of the PawWork one-way sync.
- Before committing, verify the repository root, current branch, and remote.
- Do not commit `backup-before-*` directories or generated cache files.
- Preserve user changes and unrelated working-tree files.

## Application structure

- `live-dashboard.html`, `live-dashboard.js`, and `live-dashboard.css`
  implement the main dashboard and spin entry.
- `roulette-core.js` implements even-money and 12-number betting logic.
- `hot-streets.js` implements the 4-Streets workflow.
- `freddy-engine.js` implements Freddy's Triangle Snake (FTS).
- `freddy-window.html`, `freddy-window.js`, and `freddy-window.css`
  implement the floating FTS companion.
- `server.py`, `dashboard-launcher.ps1`, and
  `Launch Live Dashboard.bat` implement the local server and launcher.
- `google-sheets-sync.js` implements local completed-session archives and
  explicit Google Sheets batch synchronization.

## Local-first synchronization boundary

- Never send Google Sheets requests from live spin, Undo, FTS, betting-engine,
  or 4-Streets change notifications.
- Ending a non-empty session must create its complete local archive before any
  optional Google Sheets request begins.
- A completed archive remains marked **Pending Sync** until the complete batch
  succeeds. Failure must retain the archive and its retry state locally.
- The user may sync at session end or later with **Sync pending sessions**.
- Do not use browser close or unload as the primary sync trigger; browsers do
  not guarantee that such requests finish.
- Existing archives created before this model are not automatically classified
  as pending, preventing accidental re-upload of historical sessions.
- Synchronization changes must not alter strategy engines, calculations,
  settings, tracking, Quick Entry, or FTS behavior.

## Current FTS safety behavior

- After four consecutive full losses, only the affected FTS card pauses.
- While paused, no wager is placed for that card; spin and frequency tracking
  continue, and other cards continue normally.
- The user chooses Reset Level 1, Continue, or Stop card.
- Reset Level 1 retains the card's bankroll and overall session P/L but begins
  a new triangle cycle.
- A win or La Partage half-loss breaks the consecutive-full-loss count.

## Current window and FTS limits

- The main dashboard remembers its last window position, size, and always-on-top
  choice.
- FTS permits up to seven simultaneous cards: three even-money selections, two
  dozens, and two columns. Opposite even-money selections remain mutually
  exclusive.
- Previous-session FTS results are collapsed until the user opens them.
- Recently stopped and previous-session sections remain visible even when
  empty. Resetting an empty session must not erase the last non-empty previous
  session result list.

## Automatic local-server recovery

- dashboard-keeper.ps1 is launched from the current user's Windows Startup
  folder and checks the exact dashboard health endpoint every 15 seconds.
- If the server is unavailable, it runs dashboard-launcher.ps1 -SkipBrowser;
  it must not stop unrelated processes or open duplicate browser windows.
- The keeper log is %TEMP%\roulette-dashboard-keeper.log.
## Quick Roulette Entry

- The main-dashboard **Quick Entry** button opens `quick-entry-window.html` as a
  separate floating companion. It communicates through BroadcastChannel while
  all spin and Undo processing remains in `live-dashboard.js`.
- The companion may request always-on-top through the local server target `quick`.
- The companion offers remembered `0 Left` and vertical `0 Top` roulette-table layouts.
- Do not restore the removed global PowerShell hotkey helper.
## Verification

Run the relevant checks before preparing an update:

```text
node freddy-engine.test.js
node roulette-core.test.js
node google-sheets-sync.test.js
node hot-streets-sync.test.js
```

The Google Sheets test must confirm that live spin entry causes zero network
requests and that a completed pending archive is sent as one batch and marked
synchronized only after success.

Also verify that the launcher health check, main dashboard label, and Freddy
floating-window label agree with `VERSION`.
