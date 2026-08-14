# Changelog

This file records meaningful user-facing changes to Roulette Live Dashboard.
`VERSION` remains the authoritative current build number. Older entries are
grouped by date where the historical commits did not contain a reliable build
number.

## v2026.08.14.1 - 2026-08-14

### Fixed

- Increased the local Google Sheets proxy timeout for completed-session uploads
  from 20 seconds to 90 seconds.
- Replaced plain browser `Failed to fetch` failures with clearer messages that
  identify local proxy or Apps Script web-app URL reachability problems.
- Pending sessions remain locally retained after network, timeout, or fetch
  failures and can be retried with **Sync pending sessions**.
- Added regression coverage for local-first pending sync when browser fetch
  fails.

## v2026.08.11.6 - 2026-08-11

### Fixed

- Added a direct one-time recovery prompt for a legacy live snapshot that did
  not exactly match its pending archive and therefore bypassed v2026.08.11.5's
  automatic duplicate detection.
- With confirmation, recovery clears the current main history, 4-Streets, FTS
  counters, and Quick Entry history without changing local archives, Pending
  Sync records, credentials, or Google Sheets.
- No strategy engine or calculation rules were changed.

## v2026.08.11.5 - 2026-08-11

### Fixed

- Added safe recovery for a completed session left visible by a reset failure
  that occurred before v2026.08.11.4.
- When live spins exactly match a pending local archive, the dashboard offers to
  clear only the duplicated main, 4-Streets, FTS, and Quick Entry live state.
- Recovery does not create a duplicate archive, delete the pending archive, or
  contact Google Sheets.
- Added build-mismatch detection so future Quick Entry windows reload when the
  main dashboard sends a different build version.

## v2026.08.11.4 - 2026-08-11

### Fixed

- Made session reset atomic and independent from Google Sheets response time.
- Reset now archives the completed session, immediately clears and persists the
  main spin history, 4-Streets, FTS counters, and Quick Entry history, advances
  the session number, and only then offers completed-session synchronization.
- A timeout or failed sync can no longer leave the previous live session visible
  in the newly started session.
- Kept betting engines, calculations, settings, and strategy behavior unchanged.

## v2026.08.11.3 - 2026-08-11

### Changed

- Replaced automatic live Google Sheets uploads with local-first recording and
  one-batch synchronization of completed sessions.
- Ending a session now saves its complete local archive before asking whether
  to sync immediately or retain it as **Pending Sync**.
- Added **Sync pending sessions** and changed **Connect & sync** to the safer
  **Save connection** action.

### Safety and recovery

- Failed, offline, or unauthorized uploads remain stored locally for retry.
- Historical archives from earlier releases are not automatically re-uploaded.
- Added automated coverage proving that live spin entry makes no network request
  and completed sessions synchronize in a single batch.
- Kept all strategy engines, calculations, settings, FTS, 4-Streets, and Quick
  Entry behavior unchanged from v2026.08.11.2.

## v2026.08.11.2 - 2026-08-11

### Fixed

- Corrected **0 Top** to a vertical keypad: 0 above rows 1-2-3, 4-5-6, through 34-35-36.
- Kept **0 Left** as the current wide roulette-table layout.
- Kept the floating window, Always on top, Undo, recent history, and all existing entry behavior unchanged.
## v2026.08.11.1 - 2026-08-11

### Added

- Added two remembered Quick Entry roulette layouts: **0 Left** and **0 Top**.
- Kept the floating window, Always on top, Undo, recent history, and all existing entry behavior unchanged.
## v2026.08.10.9 - 2026-08-10

### Changed

- The dashboard Quick Entry button now opens a separate floating companion window.
- Added companion Always on top, Undo, typed entry, roulette keypad, and recent history.
- Kept all spin processing in the main dashboard without a global hotkey process.
## v2026.08.10.8 - 2026-08-10

### Changed

- Replaced the unreliable global Ctrl+Q background helper with a stable
  in-dashboard **Quick Entry** button and modal roulette keypad.
- Quick Entry retains typed entry, Undo, latest-ten history, persistent open
  behavior, and an optional Ctrl+Q shortcut while the dashboard has focus.
- Removed the Quick Entry Windows Startup shortcut and background helper file.
## v2026.08.10.7 - 2026-08-10

### Fixed

- Kept Quick Entry alive with an explicit Windows ApplicationContext that owns
  the hidden form for the full background-process lifetime.
- Changed Apps Script setup() to reuse the existing private token instead of
  silently rotating it and causing Unauthorized request errors.
- Added rotateSyncToken() for deliberate credential replacement only.
## v2026.08.10.6 - 2026-08-10

### Fixed

- Kept the hidden Quick Entry form as the owner of its Windows message loop so
  the native handle remains alive and continues receiving Ctrl+Q.
- Added explicit hotkey-registration and live-window verification during install.
## v2026.08.10.5 - 2026-08-10

### Fixed

- Repaired accumulated UTF-8 mojibake in the main dashboard, FTS window,
  JavaScript labels, documentation, and server comments.
- Changed the release updater to use explicit UTF-8 reads and writes so symbols
  such as arrows, dashes, ellipses, bullets, and the settings chevron remain intact.
## v2026.08.10.4 - 2026-08-10

### Added

- Added Quick Entry **Undo** using the dashboard's normal recalculation path.
- Added a colour-coded strip mirroring the main dashboard's latest ten numbers.

### Changed

- Quick Entry remains open after a successful number or Undo instruction.
- Quick Entry uses an ordered local event queue so rapid clicks cannot be skipped.
## v2026.08.10.3 - 2026-08-10

### Fixed

- Forced creation of the hidden Quick Entry native window handle before starting
  its message loop, allowing Windows to deliver the global Ctrl+Q hotkey.
- Added %TEMP%\roulette-quick-entry.log readiness diagnostics.
## v2026.08.10.2 - 2026-08-10

### Added

- Added global **Ctrl+Q** Quick Roulette Entry while the casino or another app is active.
- Added a compact always-on-top European roulette table with coloured 0–36 buttons.
- Added typed 0–36 entry, Enter-to-submit, Escape-to-close, and input validation.
- Quick Entry numbers use the dashboard's normal spin path for all strategies, FTS,
  persistence, and Google Sheets synchronization.
## v2026.08.10.1 - 2026-08-10

### Fixed

- Corrected the dashboard and Freddy window build labels so they match VERSION.
- Removed the UTF-8 byte-order marker from the Windows launcher batch file.
- Changed automatic-recovery installation order to verify the server before
  starting the persistent keeper, preventing port 8765 startup races.
## v2026.08.09.1 - 2026-08-09

### Added

- Added a hidden Dashboard Keeper that starts with Windows and checks the local
  synchronization server every 15 seconds.
- The keeper automatically restarts the exact Roulette Dashboard server when it
  is unavailable, without opening duplicate browser windows.

### Fixed

- Prevented recurring **Sync failed: Failed to fetch** errors caused by the
  local server not running after a Windows restart or unexpected server exit.
## v2026.08.06.4 — 2026-08-06

### Added

- Main-dashboard window position and size are remembered between launches.
- Added a remembered **Always on top** option for the main dashboard.
- Increased Freddy's Triangle Snake (FTS) capacity to seven simultaneous cards:
  three even-money selections, two dozens, and two columns.
- Added automated tests for the FTS engine and synchronization behavior.

### Changed

- Replaced the obsolete Milestone 4 README with current launch, strategy,
  storage, synchronization, documentation, and recovery guidance.
- FTS **Recently stopped** and **Previous session results** are independently
  collapsible.
- The chosen expanded/collapsed state is retained while live updates refresh
  the FTS window.
- Previous-session results remain available even when the current session has
  recently stopped cards.
- Both the main dashboard and floating FTS window display the authoritative
  version from the project release.

### Fixed

- Kept the **Recently stopped** and **Previous session results** sections
  visible even when their counts are zero.
- Preserved the last non-empty FTS previous-session result list when an empty
  session is reset.
- Fixed previous-session results disappearing when current-session results
  existed.
- Fixed previous-session results collapsing immediately during live refreshes.
- Fixed the FTS result list showing only six entries instead of all seven.

## v2026.08.03.2 — 2026-08-03

### Added

- Introduced Freddy's Triangle Snake as a complete live-tracking engine.
- Added the detachable FTS floating companion window while spin entry remains
  in the main dashboard.
- Added FTS support for even-money, dozen, and column selections.
- Added configurable maximum level, starting bankroll, initial unit, cycle
  target, loss limit, and European/La Partage table rules.
- Added the four-consecutive-full-loss safety checkpoint. The affected card
  pauses and asks for **Reset Level 1**, **Continue**, or **Stop card** while
  other cards and frequency tracking continue.
- Added `VERSION` as the single authoritative build identifier.
- Added `AGENTS.md` with repository, version, Git safety, application structure,
  FTS safety, and verification guidance.

### Changed

- FTS monetary results display currency and units together, for example
  `RM +2.7 / +27 U`.
- Main-dashboard and floating-window versions were standardized.
- The launcher and local server read the build from `VERSION`.

## 2026-07-29 to 2026-07-30 — Session tracking and synchronization

### Added

- Added session trigger-frequency displays for the main betting categories.
- Added retention of the last-used settings between sessions.
- Expanded Google Sheets synchronization for 4-Streets cycles and steps.
- Added 4-Streets session-history flow so uploaded history seeds the current
  session while observation and betting spins contribute to later selections.

### Changed

- Standardized settings layout and controls across Even-Money, Dozens &
  Columns, and 4-Streets.
- Simplified progression selectors to named families with separate steps and
  amount fields.
- Clarified that 12-number bets include both dozens and columns.

## 2026-07-27 to 2026-07-28 — 4-Streets and OCR improvements

### Added

- Added ordered OCR grid processing for roulette-history images.
- Added image enlargement support in the history-upload workflow.
- Added a minimum-history rule: candidate identification starts after at least
  24 uploaded or manually entered numbers.
- Added 4-Streets observation, candidate selection, progression settings, and
  backtesting support.

### Changed

- Corrected OCR reading order to left-to-right and then top-to-bottom.
- Defined the five-stage 4-Streets per-street progression as `1,1,2,3,5`,
  producing total hand wagers of `4,4,8,12,20` units across four streets.
- Improved candidate-history handling when uploaded history is added after
  manual entries.

## 2026-07-25 to 2026-07-26 — Reliable local operation

### Added

- Added the PawWork one-way GitHub synchronization launcher targeting only
  `origin/local-sync`.
- Added a dedicated dashboard launcher and server health checks.
- Added dashboard application icons.
- Added progression and rule tests for Even-Money and 12-number strategies.

### Changed

- Stabilized local server startup and dashboard build verification.
- Constrained the one-way synchronization workflow so it does not pull,
  switch branches, merge, reset, or push to `main`.
- Improved long Google Sheets error-message layout so errors do not distort the
  dashboard.

### Fixed

- Corrected settings that reverted after pressing **Apply Settings**.
- Corrected progression calculations that continued using older presets after
  a custom selection.
- Corrected several launcher failures caused by stale server processes or port
  conflicts.

## 2026-07-21 to 2026-07-24 — Initial dashboard foundation

### Added

- Created the European Roulette live tracking dashboard.
- Added spin entry, undo, reset, dealer changes, history, and session summary.
- Added Even-Money and Dozens & Columns absence tracking and betting sessions.
- Added configurable progressions, table rules, bankrolls, units, and
  backtesting.
- Added roulette-history OCR and early Hot Streets/4-Streets analysis.
- Added Google Sheets synchronization and setup documentation.

### Fixed

- Restored the Google Sheets panel after merge conflicts.
- Added guards for missing interface elements.
- Corrected character-encoding and compact-layout problems.
