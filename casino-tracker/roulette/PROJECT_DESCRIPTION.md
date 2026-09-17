# Project Description

European Roulette Live Dashboard is a local-first decision-support and session
recording application for European roulette. It combines rapid manual or
floating-keypad spin entry with optional Pragmatic Roulette history-strip OCR,
Even-Money, 12-Number, 4-Streets, and Freddy's Triangle Snake tracking,
configurable progressions, backtesting, and session analysis.

The live application runs from `C:\Users\HP\PawWork\casino-tracker\roulette` on a
private local server. Active play never depends on Google Sheets: spins,
settings, strategy states, and recent completed-session archives are retained in
the browser first. At session end, the user may synchronize the completed
session to Google Sheets in one batch or keep it locally as **Pending Sync** for
later retry. The local server proxy handles completed-session uploads and keeps
failed uploads pending for later retry.

OCR is maintained as a separate local component and supports Observe, editable
Confirm, and guarded Automatic modes. Automatic entry requires a valid history
shift and an unchanged dashboard spin count while recognition runs; uncertain
or late results fall back to manual confirmation. The API key and OCR audit
records remain local and are excluded from Git.

The project is intended to organize observations and support faster operational
decisions. Roulette outcomes remain random; no strategy in this application
predicts future results or removes the house edge.

## Suggested GitHub About description

Local-first European roulette dashboard with guarded OCR input, live strategy
tracking, floating quick entry, recovery archives, and optional completed-session
Google Sheets sync.
