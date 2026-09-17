# Casino Tracker — Workspace

A consolidated workspace for casino tracking, analysis, and strategy tools.

## Structure

```
casino-tracker/
├── roulette/           # European Roulette Live Dashboard (main project)
├── baccarat/           # Baccarat session tracker
├── betpilot/           # Roulette strategy simulator (Martingale pairs)
└── doubledragon/       # Desktop roulette tracker (PowerShell)

OCR/                    # Pragmatic Roulette history-strip OCR monitor
experiments/            # Prototypes, charts, and archived experiments
```

## Quick Start

### Roulette Dashboard (main project)

```text
casino-tracker/roulette/
```

Double-click `Launch Live Dashboard.bat` to start the local server and open the dashboard.

The dashboard can start the separate OCR monitor in Observe, Confirm, or guarded
Automatic mode. OCR secrets remain under `casino-tracker/.secrets/` and are
excluded from Git.

See [casino-tracker/roulette/README.md](casino-tracker/roulette/README.md) for full documentation.

### Baccarat Tracker

```text
casino-tracker/baccarat/
```

Open `index.html` in a browser. No server required.

See [casino-tracker/baccarat/README.md](casino-tracker/baccarat/README.md) for usage.

### BetPilot Simulator

```text
casino-tracker/betpilot/
```

See [casino-tracker/betpilot/README.md](casino-tracker/betpilot/README.md) for CLI and web UI instructions.

### DoubleDragon (Desktop)

```text
casino-tracker/doubledragon/
```

Double-click `Run Native DoubleDragon.cmd`. Requires Windows with PowerShell.

## Branches

| Branch | Purpose |
|--------|---------|
| `main` | Stable, release-ready state |
| `dev` | Active development and testing |

## Backup

A full workspace backup exists at:

```text
C:\Users\HP\PawWork-backup-20260908\
```

This preserves the pre-reorganization state including all git histories.

## One-way GitHub sync

Double-click the permanent root launcher:

```text
C:\Users\HP\PawWork\Sync PawWork to GitHub.bat
```

It verifies the repository, `dev` branch, and GitHub remote; commits the active
Roulette/OCR project; and pushes only to `origin/local-sync`. It never pulls, switches
branches, merges, rebases, resets, or pushes to `main`.

## Notes

- Each sub-project was previously a standalone git repo. Their independent histories are preserved in the backup.
- Roulette runtime logs, OCR audit data, private secrets, pending screenshots,
  and unrelated `work/` files are excluded from the one-way project sync.
