# European Roulette Analyzer — Milestone 4

This local browser project contains:

- the standard European roulette table with `0` across the top, followed by ascending rows (`1 2 3`, `4 5 6`, and so on);
- the column rule **Column 1 contains 1, Column 2 contains 2, Column 3 contains 3**;
- a single shared data record for every number from 0–36;
- hover, keyboard-focus, click-to-lock, and clear-selection interactions;
- the actual European wheel with `0` at the top and the correct clockwise sequence;
- synchronized highlighting between the table and wheel;
- a racetrack with `0` at the top and synchronized number highlighting;
- hover coverage for Jeu Zéro, Voisins du Zéro, Orphelins, and Tiers du Cylindre;
- interactive splits, streets, corners, six-lines, dozens, columns, and even-money bets;
- hover-to-preview and click-to-lock bet coverage across all three layouts;
- a fixed top-right Bet Explorer that remains visible while viewing highlights;
- multi-bet selection with combined unique-number coverage on the wheel and racetrack;
- number details for colour, column, dozen, parity, range, and wheel position.

## Start it

### Easiest method

Open `index.html` in a modern browser.

### Recommended local-server method

1. Open PowerShell in this folder.
2. Run `python -m http.server 8000`.
3. Open `http://localhost:8000` in your browser.
4. Press `Ctrl+C` in PowerShell when finished.

No packages or installation are required.

## Live Dashboard

Open `live-dashboard.html` in a separate browser window. It is a compact manual-entry dashboard with a casino-style, newest-first color-coded strip of the latest 12 winning numbers, six absence trackers, manual trigger decisions, three independently tracked Martingale sessions, opposite-side locking, bankroll/exposure figures, and spin undo.

An ignored trigger remains grey and muted, but its **Resume** button restores it during the same absence streak. It becomes Triggered again immediately when it is still beyond its threshold.

Completed bets produce acknowledgement ribbons: green for **Won** and persistent red for an eight-stage **Burst**. The betting slot and opposite-side lock are released as soon as the session ends, while the result stays visible until acknowledged.

Dashboard state is saved automatically in the browser and restored after refresh or reopening. The versioned persistence code is isolated in `dashboard-storage.js`; it currently uses local browser storage and can later be replaced by a SQLite adapter without changing the roulette engine or dashboard UI.

The dashboard's **History** button opens `history.html` as a separate row-wise archive viewer. Its tabs cover Spins, Triggers, Bet Sessions, individual Bet Steps, and Bankroll; it reads the same saved snapshot and updates when storage changes or when Refresh is pressed.

The manual-entry bar includes a confirmation-protected **Reset** button. It permanently clears the current saved session and its history while preserving thresholds, starting bankroll, and unit value.

`google-apps-script/Code.gs` is the secure row-append bridge for the connected Google Sheet. Follow `google-apps-script/SETUP.md` to install and deploy it; the resulting `/exec` URL and generated token are required for the dashboard sync client.

The Google Apps Script web app (google-apps-script/Code.gs) is the server-side endpoint that the dashboard posts archives to. A recent fix added support for the "Freddy Sessions" and "Freddy Steps" tables which the client now sends. Before pushing this change, ensure you:
- Do not commit any secret tokens (the ROULETTE_SYNC_TOKEN remains a script property).
- Save an Apps Script project version (pre-change) and create a local backup: google-apps-script/Code.gs.backup-<timestamp>.
- Run upgradeSchema() once in the Apps Script editor to create/update the new sheets and headers (this preserves the sync token).
- Deploy a new project version and update the existing Web App deployment.



The dashboard's collapsed **Google Sheets** panel stores the web-app URL and private token only in browser storage. After **Connect & sync**, new rows are queued automatically and sent with unique session/request identifiers; the Apps Script `_Sync Log` prevents duplicate requests.

The **Table rule** selector supports Standard European roulette and French **La Partage**. Under La Partage, zero produces a half-loss on active even-money bets and repeats the same Martingale stage; histories record the outcome explicitly as `Half-loss`.

The dashboard logic lives in `roulette-core.js`, separate from its interface. `exportSnapshot()` exposes a versioned event log ready for a future SQLite persistence adapter, while automatic logger input can call the same `addSpin(number)` method used by manual entry.

## Project structure

- `index.html` — page content
- `styles.css` — layout, colours, and responsive design
- `app.js` — roulette data and interactions

## Next milestone

Add a multi-number analysis mode with colour, parity, range, dozen, column, and wheel-clustering summaries.

## GitHub Copilot — contributor setup & usage

This repository includes recommended settings and a short checklist for contributors who want to use GitHub Copilot while working here.

What is included

- Per-repo VS Code settings: [.vscode/settings.json](C:/Users/HP/PawWork/roulette-analyzer.worktrees/github-copilot-integration/.vscode/settings.json) enables inline suggestions.
- A repository onboarding file for cloud agents: [.github/copilot-setup-steps.yml](C:/Users/HP/PawWork/roulette-analyzer.worktrees/github-copilot-integration/.github/copilot-setup-steps.yml).

Local VS Code setup

1. Install the GitHub Copilot extension (Extensions view → search "GitHub Copilot" → Install).
2. Sign in to GitHub through the extension when prompted (or via the Accounts menu).
3. Open this repository in VS Code. The included .vscode/settings.json turns on inline suggestions by default for contributors using VS Code.
4. To accept a Copilot inline suggestion press Tab (or your configured accept key). Use Ctrl+Enter to open alternative suggestions where supported.

Best practices when using Copilot

- Treat Copilot suggestions as starting points: read and understand generated code before committing.
- Run the project's tests (if applicable) and validate behavior locally after accepting AI-generated code.
- Avoid inserting secrets (API keys, tokens) suggested by Copilot — never commit secrets.
- If unsure about licensing or provenance of suggested code, prefer hand-written alternatives or ask a maintainer.

Repository and review notes

- Reviewers: explicitly check PRs for AI-assisted code changes and ensure tests and style standards pass.
- If a contributor prefers not to use Copilot, they can disable it in VS Code settings or at the extension level.

Questions or issues

Open an issue if any contributor wants different repository Copilot settings or if the onboarding file needs adjustments.
