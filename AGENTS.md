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
- `google-sheets-sync.js` implements Google Sheets synchronization.

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

## Verification

Run the relevant checks before preparing an update:

```text
node freddy-engine.test.js
node roulette-core.test.js
node google-sheets-sync.test.js
node hot-streets-sync.test.js
```

Also verify that the launcher health check, main dashboard label, and Freddy
floating-window label agree with `VERSION`.
