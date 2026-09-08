# DoubleDragon

DoubleDragon is a Windows desktop roulette-session tracker. It records European roulette spins (0–36), shows recent spin history, tracks dozens and columns, and provides configurable trigger-based Fibonacci betting guidance.

> Educational tracking tool only. Each roulette spin is independent; past spins do not change future odds.

## Launch

Double-click **Run Native DoubleDragon.cmd**. It starts the native Windows Forms interface through PowerShell without requiring Node.js, Electron, or a browser.

## Features

- Number board for 0–36 with red, black, and green colour coding.
- Per-number count displayed directly on each board cell.
- Manual number entry and keyboard Enter support.
- Undo the latest recorded spin.
- Recent-spin strip: newest first, retaining the latest 20 spins.
- Per-group statistics for all dozens and columns.
- One global absence trigger shared by every group.
- Global stop-loss selection using Fibonacci-labelled steps.
- Group action button that appears after the trigger is reached.
- Fibonacci tracking that advances after a miss and resets on a group hit.
- Fixed square (1:1) desktop window.

## Repository layout

- `DoubleDragon.ps1` — native UI and betting-tracker logic.
- `Run Native DoubleDragon.cmd` — recommended launcher.
- `index.html`, `main.js`, `package.json` — earlier Electron/browser implementation retained as source history; the native launcher is the supported build.
- `docs/USAGE.md` — user workflow.
- `docs/BETTING-LOGIC.md` — trigger and Fibonacci behaviour.

## Development

The app is intentionally dependency-free at runtime: it uses the Windows PowerShell and Windows Forms components available on Windows.

To start manually:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File .\DoubleDragon.ps1
```

## Licence

Private project; no licence has been granted for redistribution.
