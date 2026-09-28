# BETPILOT — BACARAT MODULE REVIEW (v1.0.0-20260928-Baccarat)

Reviewer: independent code/document review (DSH agent)
Date: 2026-09-28
Scope: `BetPilot/SOURCE/Baccarat/*` (5 files), `BetPilot/BACARAT/**` (4 docs + 12 config JSONs),
`BetPilot/` root docs (`VERSION`, `CHANGELOG.md`, `README.step-by-step.md`, `DOCUMENTS/`, `ROLES/`,
`ARCHIVE/`, `DISCLAIMER.md`, `LICENSE.md`)
Method: line-by-line reading, plus executing the real `baccarat_app.js` under a stubbed DOM
(Node v24) to confirm behaviour, plus cross-checking the OCR study claims against the real
`C:\Users\HP\PawWork\OCR` module and the module against `casino-tracker/roulette/AGENTS.md`.
Every finding below was reproduced; a second, independent review pass re-derived the same
H1-H7 defects from scratch and contributed M13-M18 and D15-D16.

Status: **not releasable as-is** — 1 credential issue (C1) that changes the framing of the backup
setup (C2), 8 reproduced functional defects (H1-H8), 18 medium items (M1-M18), 16 documentation /
configuration contradictions (D1-D16), and 5 deviations from the project's own `AGENTS.md`
conventions (P1-P5). Nothing here is a style opinion: every numbered finding names the line and
was reproduced or byte-verified.

---

## 0. VERIFIED AS CORRECT (no action)

| Claim | Verification |
|---|---|
| OCR study is genuine, not invented | All 8 claimed studied files exist in `PawWork/OCR`; `config_centre.json` = `[1395,352,96,93]` and `config_Center1.json` = `[1390,325,102,106]` match the study record exactly |
| DeepSeek model / endpoint / temperature | `OCR/app_monitor.py:67,96,106` and `OCR/ocr_tool.py:31,40,56` = `https://api.deepseek.com`, `deepseek-v4-flash-vision-exp`, `0.0` — matches the plan |
| `get_winning_signature()` exists as cited | `OCR/app_monitor.py:150` |
| Roulette files untouched | `OCR/` modules present and unchanged in content; no Baccarat file copied into `OCR/` |
| All existing files preserved, `ARCHIVE/` empty | Confirmed; nothing moved without approval |
| Version string consistent in source files | All 5 source files carry `v1.0.0-20260928-Baccarat` |
| Disclaimers present on all three screens | `baccarat_module.html:12-14`, `entry.html:68-70`, `baccarat_launcher.html:57-59` |
| Disclaimer wording contains no win guarantees | Checked; compliant with `DISCLAIMER.md` "never say" list |
| Live DeepSeek key is not in `BetPilot/` | Confirmed: only `.secrets/ocr.env` holds the live key (git-ignored) |
| Files are valid UTF-8 | Confirmed by byte inspection (mojibake seen in a PowerShell 5.1 console is a console decoding artifact, not a file defect) |

---

## 1. CRITICAL

### C1. A real-looking API key is published in a Baccarat document, and it partially matches the live key
`BetPilot/BACARAT/API/switch_deepseek_gemini.md:50` (original text, now sanitised) printed a full
35-character `DEEPSEEK_API_KEY=sk-…` value, and lines 47-52 instructed the user to paste
exactly that into `C:\Users\HP\PawWork\casino-tracker\.secrets\ocr.env`.

**Status: FIXED on 2026-09-28.** The literal value has been removed from that document (and from an
earlier draft of this report); the section now says the keys are already in place and must never be
re-pasted. A recursive scan of `BetPilot/` for `sk-…`/`AIza…` strings now returns no hits.

Verified by direct comparison (values never printed): that 35-character value shares its
**first 24 of 35 characters with the account's live `DEEPSEEK_API_KEY`** and differs only in the
final 11 characters. Two separate problems:

1. **Partial live-credential exposure** — 24/35 characters of a working secret are published in
   plaintext in the project folder. If this file is ever committed or handed to a developer
   (which the docs explicitly tell the user to do), that much of the key is disclosed.
2. **Copy-paste trap** — the doc tells the user their env file "already has DeepSeek" and shows
   this value; pasting it would *overwrite the working key with the wrong one* and silently break
   the Roulette OCR that currently works.

It violates four of the project's own rules:
- `Baccarat_OCR_Integration_Plan.md:22-27` — "Never put the key in source files, docs, screenshots, or commits"
- `casino-tracker/roulette/AGENTS.md:55-56` (the project guidance the study record claims to have followed) — the key "must never be committed, **printed**, or copied into source files"
- `DOCUMENTS/OCR_STUDY_RECORD.md` — "`Verified`: No API key copied to `BetPilot/`" (false as written)
- `API/README.md:44-50` and `LICENSE.md` — no keys in `BetPilot/`; users may not copy the key out

**Fix (do first, before anything else):** delete lines 47-52's literal value, replace with
`DEEPSEEK_API_KEY=<paste from casino-tracker/.secrets/ocr.env>`, and consider rotating the
DeepSeek key since 24 of its characters have been written to disk in a shareable document.
Then grep the whole `BetPilot/` tree for `sk-` and confirm zero hits.

**Exposure is currently contained — verify this holds.** The official backup path
(`Sync PawWork to GitHub.bat` → `casino-tracker/roulette/github-sync.ps1:92-98`) stages an explicit
allowlist — `.gitignore`, `README.md`, `Sync PawWork to GitHub.bat`, `casino-tracker/roulette`,
`OCR` — and **`BetPilot/` is not in it**, so no push will contain this file. Do not "fix" that
(C2 below) before sanitising this document.

### C2. The entire BetPilot module is outside the project's backup/version-control boundary
`github-sync.ps1:92-98` stages only the allowlist above. `BetPilot/` is untracked
(`git status`: `?? BetPilot/`), is not in `.gitignore`, and is not in the sync allowlist, so it is
**never committed and never pushed** by the only backup mechanism this project has. Every
BetPilot artifact — docs, 5 source files, 12 configs — currently exists in exactly one place with
no version history, despite a `CHANGELOG.md` and `VERSION` discipline that implies otherwise.

**Fix:** decide deliberately, then act in this order:
1. Sanitise C1 and grep `BetPilot/` for `sk-` (zero hits).
2. Add `BetPilot` to `$syncPaths` in `github-sync.ps1:92-98`, and extend the `$forbidden` guard
   (`:101-105`) with a `BetPilot/.*(\.secrets|ocr\.env)` rule so a future key cannot be staged.
3. Update `casino-tracker/roulette/AGENTS.md:33-35`, which currently documents the sync scope as
   "Roulette and OCR only".
4. Confirm the first BetPilot commit contains no credential-shaped string before it reaches
   `origin/local-sync`.

---

## 2. HIGH — functional defects (all reproduced by executing `baccarat_app.js`)

| # | Location | Defect | Reproduced evidence |
|---|---|---|---|
| H1 | `baccarat_module.html:115-118` | The four in-table OCR mode buttons call `setTableOcr(...)`, **which is defined nowhere** in the module or its JS. Every click throws `ReferenceError`. | `typeof setTableOcr` after loading `baccarat_app.js` = `undefined` |
| H2 | `baccarat_app.js:108-154` | **The recorded outcome is not derived from (bet side + casino result), so contradictory data is accepted and a loss can be recorded as a win.** Bet Banker, casino result Player, operator presses WIN → paid as a winning Banker bet. Decision must be derived, not typed twice. | Bankroll 100 → **110** (correct settlement: 90) |
| H3 | `baccarat_app.js:143-144`, `162-167` | **PUSH double-counts the stake.** The stake is never deducted at bet placement, yet a push credits `+bet` in both the bankroll and the P/L. A push must be neutral. (The bankroll and `stat-pl` agree with each other here — because both duplicate the same error, not because either is right.) | 100U start, 10U Banker bet, Tie/PUSH → bankroll **110**, P/L **+10** (expected 100 / 0) |
| H4 | `baccarat_app.js:128-154` | `recordOutcome()` never checks `lastHand.outcome`, so a double-click / key repeat applies the payout **twice**. | After 1×WIN = 110; a second identical call = **120** |
| H5 | `entry.html:102-105` → `baccarat_app.js` | **The entry screen's data never reaches the table.** `entry.html` writes `betpilot_start_units`, `betpilot_unit_value`, `betpilot_ocr_mode`, `betpilot_start_dollars` to `sessionStorage`; nothing anywhere reads them (grep: the only matches are the writes). The user's capital, unit value and OCR mode are silently discarded and the table starts at 0 units. | Betting screen starts with bankroll `0` regardless of the entry screen |
| H6 | `baccarat_app.js:205` | End-of-session P/L uses `parseInt(starting-bankroll.value) \|\| 1000`, so the default `0` starting bankroll yields a **-1000** result. | `endSession()` alert: "Net P/L: **-1000** units" |
| H7 | `baccarat_app.js:89-98` + `108-126` | Nothing prevents placing a second bet while the previous hand has no result. The first hand is orphaned, and one WIN resolves only the last hand — so stats and P/L silently drift from the real session. | Place Banker, place Player, confirm Banker + WIN → 2 hands, hand 1 still `—`, `wins=1` |
| H8 | `baccarat_module.html:21,127` + `baccarat_app.js:24,44,57` | **The UI advertises OCR that does not exist.** "Provider: Gemini 1.5 Flash" and "Using Gemini 1.5 Flash (configurable)" are shown although there is no capture, no network call, and no config read anywhere in `SOURCE/` (grep for `fetch`/`XMLHttpRequest`/`getDisplayMedia`/`toDataURL` = 0 hits; `baccarat_api_config.json` is never opened). The four "OCR Mode" options (`baccarat_app.js:63-71`) are a label only — all four produce byte-identical behaviour. "Automatic (with check)" therefore performs no check and enters nothing. | All 4 modes → same result, differing only in the displayed label |

---

## 3. MEDIUM

| # | Location | Issue |
|---|---|---|
| M1 | `baccarat_app.js:140` | Banker commission rounds **up**: `Math.round(bet*0.95)` pays 1U profit on a 1U bet and 3U on 3U (exact 0.95 / 2.85). Either floor the commission or settle unrounded and display to 2 dp. |
| M2 | `baccarat_app.js:79-82`, `89-98` | `doubleUnit()` is uncapped and no bet is validated against the bankroll: 12 clicks from 10U = **40,960U**, and a bet larger than the bankroll is accepted without warning. Needs a cap and a `bet <= bankroll` guard. |
| M3 | `baccarat_app.js:84-87` | `clearBet()` sets the bet to 10, not to zero/one — the button labelled "Clear" does not clear. |
| M4 | `baccarat_app.js:95-98` | `placeBet()` calls `updateStats()` but not `updateHistory()`, so a freshly placed bet increments "Hands" while rendering **zero** history rows until an outcome is recorded. |
| M5 | `baccarat_app.js` (whole file) | No persistence at all (no `localStorage`, no file write) and `exportHistory()` is an `alert()` stub (`:216-218`), while `endSession()` still offers export (`:201-206`). A "record-keeping" tool that loses everything on refresh, with a non-functional Export button. |
| M6 | `entry.html`, `baccarat_launcher.html`, `baccarat_module.html:17-63` | **Three competing start screens** for one module. `baccarat_launcher.html:78` ignores its own Start Units / Start $ inputs; the module duplicates the same setup card; there is no `index.html` and no documented launch path (`README.step-by-step.md` never mentions `entry.html`). Pick one entry point, delete the others. |
| M7 | `entry.html:107`, `baccarat_launcher.html:78` | `window.open(..., 'alwaysOnTop=yes,chrome=no')` — browsers ignore both flags (the launcher's own comment at `:26-27` admits Electron/Python is needed). The product's core promise, sitting side-by-side and on top of the casino window, is **not implemented**. Note the project already solves this: `casino-tracker/roulette/server.py:68` (`set_window_topmost`) exposes a window-topmost API with a `quick` target, used by the Roulette Quick Entry companion (`AGENTS.md:105,127`). Reuse that endpoint instead of inventing launch flags. |
| M8 | `baccarat_module.html:87`, `baccarat_styles.css:102` | `#current-dollar` exists and is styled but is never populated — the unit-value→dollar conversion collected in `entry.html` is missing from the table. |
| M9 | `baccarat_module.html:125` | `class="btn btn-sm btn-pass-sm"` uses `.btn-sm`, which is not defined (the stylesheet defines `.btn-small`), so the PASS button inherits the large `.btn` padding. Dead rules `.result-pass` and `.pass-label` (`baccarat_styles.css:170-171`) are never used. |
| M10 | `entry.html:95` | `resetEntry()` writes to `#min-bet`, which does not exist in the file → `TypeError`, and the following `updateUnit()` never runs, leaving the display stale. |
| M11 | `entry.html:6` | Links `entry.css`, which does not exist (404); all styling is inline. |
| M12 | `baccarat_app.js:44` | The active provider is round-tripped **through the DOM**: `startSession()` reads `#current-provider`'s `textContent` to decide `gemini` vs `deepseek`. Any label edit or missing element silently switches provider. Provider must come from one config value. |
| M13 | `baccarat_app.js:108-126` | `confirmResult('pass')` stores the string result `"pass"` but leaves the hand's `side` and `bet` untouched, so pressing PASS in the result panel after betting Tie still records a 10-unit PLAYER/Tie bet in history and stats. | History row renders a "P" badge with `10u` and result PLAYER |
| M14 | `baccarat_app.js:150` | On outcome the panel is only hidden — `#bet-summary` is never cleared, so the next bet's panel still shows the previous hand's "Result: PLAYER — Confirm outcome below", which reads like a pre-filled result. |
| M15 | `baccarat_app.js:31-32` | No server-side validation of the starting bankroll: the HTML has `min="0"` but the JS accepts `-500` and starts the session negative. (Extends M2's missing `bet ≤ bankroll` guard.) |
| M16 | `baccarat_app.js:207-211` | After `endSession()` the displayed bankroll is hardcoded to `"1000"` without calling `updateBalance()`, while `session.bankroll` is actually `0` — the label and the state diverge immediately after reset. |
| M17 | `baccarat_module.html:114-118`, `baccarat_styles.css` | A "used but undefined" CSS class pass finds `empty-state`, `ocr-mode-side`, and `session-info` have no rules, and `.active` exists only as `.screen.active` — so the in-table mode buttons could never show a selected state even once H1 is fixed. |
| M18 | `baccarat_module.html:27-28` vs `:75` | Contradictory bankroll display: the setup label reads "Starting Units (Default: 0)" while the betting header hardcodes `1000`. Pre-start the module shows 1000; after Start with the default input it silently drops to 0. |

---

## 4. DOCUMENTATION / CONFIG CONTRADICTIONS (the user is being handed these to act on)

| # | Files | Contradiction |
|---|---|---|
| D1 | `API/baccarat_api_config.json:5` (`"provider": "gemini"`) vs `API/switch_deepseek_gemini.md:12-15` ("Current (default): `deepseek`") vs `API/baccarat_ocr_client.py:29-36` (recommends starting with DeepSeek) vs `CHANGELOG.md:48` ("Baccarat = Gemini per user request") vs the UI hardcoding Gemini (`baccarat_module.html:21`) | **Four documents, two different "defaults".** The user's own "switch with one config line" instruction cannot work at all, because no code reads that config (H8). |
| D2 | `Baccarat_Capture_Configuration_Guide.md:19-33` and `CHANGELOG.md:45` say **9** profiles; the folder holds **12** JSON files | The 3 provider-less files (`config_baccarat_{full,half,min}_width_full_length.json`) are undocumented, and `config_baccarat_half_width_full_length.json` duplicates the Pragmatic profile while declaring `"table_provider": "Pragmatic"`. Delete the 3 generic ones or document them. |
| D3 | `API/baccarat_api_config.json:23-27` lists only the three **half-width** profiles under `calibration_profiles` | Misleading: the module's own table selector offers all 9 provider×layout combos (`baccarat_module.html:31-41`), and its option values (`pragmatic-half`) match **no config filename** (`baccarat-half-width-full-length-pragmatic`). Nothing maps a selected table to a config file. The three listed filenames do not even exist **in `API/`** — they live one level up in `BACARAT/` — so a loader resolving relative to the config's own folder fails, and one resolving to `BACARAT/` silently ignores the other 9 profiles. A third naming scheme appears in `DOCUMENTS/OCR_STUDY_RECORD.md:46` ("Create `Baccarat/config_baccarat.json`"), a fourth folder name (`Baccarat`, not `BACARAT`). |
| D15 | `config_baccarat_half_width_full_length.json:2` and `config_baccarat_min_width_full_length.json:2` | **`region` semantics are self-contradictory across the config set.** The half-width file describes `[820,200,900,680]` as ranges ("820-1720 horizontal, 200-880 vertical" = x,y,x2,y2) while the min-width file describes `[1060,350,600,380]` as "1060-1660 horizontal" (= x,y,w,h). Both arrays fit x,y,w,h exactly for 1920×1080, but a consumer that assumes x,y,x2,y2 for the min-width profile computes a *negative* width. Fix: rename the keys to `x,y,width,height` (or `left/top/right/bottom`) in every profile, and state the convention once. |
| D16 | `config_baccarat_*_{pragmatic,evolution,playtech}.json` (9 files) vs the 3 un-suffixed files | The nine provider-specific profiles **drop** the `capture_target`, `ocr_use`, and `signature_check` keys that the three generic profiles carry (13 keys vs 10). Any consumer keying on `signature_check: true` gets `undefined` for every profile that actually names a provider — i.e. for every profile that would be used in practice. |
| D4 | `config_baccarat_full_width_*.json` (`scale_percent: 100`) vs `config_baccarat_min_width_*.json` (`scale_percent: 125`) vs the guide (`:84`, "100% or 125% — check your screen") | Same physical screen, three different scale assumptions. Under 125% DPI a `[0,0,1920,1080]` capture is not the physical screen and the roulette-derived region family is not directly transferable. Recalibration must be mandatory, not advisory. |
| D5 | Guide `:85` ("Signature length: 3 results") and `signature_check: true` in the configs vs the real `get_winning_signature()` (`OCR/app_monitor.py:150`), which is numeric-roulette | **Baccarat duplicate detection is undefined.** Nothing specifies the dedup key (B/P/T sequence? shoe/hand counter?). The docs assert "no duplicates" as a hard rule with no mechanism, and the OCR prompt itself is roulette-specific — "adapt to Baccarat labels" is a real design task, not a rename. |
| D6 | `README.step-by-step.md:34,36` ("BACARAT … has 2 docs", "SOURCE … empty, for future code"), `:80` ("They are NOT the actual program"), `:130` ("No code runs"), `API/README.md:40` ("These files do NOT exist yet"), `DOCUMENTS/DOCUMENT.md:34` (2 Baccarat docs), `CHANGELOG.md:38-40` (3 source files) | **The documentation describes the state before the code was written.** Reality: 5 source files, 4 Baccarat docs, an API folder with 3 files, 12 configs. The guide the user is following is now wrong at every step. |
| D7 | `CHANGELOG.md:8` and `:35` | Two entries with the **identical version and date** ("CURRENT / DRAFT" and "BUILD COMPLETE"), contradicting the "newest at top" rule and the `VERSION` file's own "DRAFT — pending review". Pick one status. |
| D8 | `SOURCE/Baccarat/entry.html` and `baccarat_launcher.html` | Not mentioned in `CHANGELOG.md:38-40` at all, although they are the actual user-facing entry points. |
| D9 | `DISCLAIMER.md` (Disclaimer 3 required on OCR features) vs `SOURCE/**` | Disclaimer 3 appears **nowhere** in the code (grep "third-party" = 0 hits), and it names DeepSeek while the UI advertises Gemini. `ROLES/MARKETING.md` says App Store rating **17+** while every other doc says **18+**. |
| D10 | Folder/file naming | `BACARAT` (misspelled "Baccarat") is baked into paths, doc titles and `API/baccarat_api_config.json:21` (`"folder": "BetPilot/BACARAT/API/"`), plus a "**Banyard** module" typo in `Baccarat_Module_Overview.md:126`. Renaming after the developer starts costs more; rename now or accept it deliberately. |
| D11 | `API/baccarat_api_config.json:19`, `API/switch_deepseek_gemini.md:47`, `DOCUMENTS/OCR_STUDY_RECORD.md` | Absolute paths with the local username (`C:\Users\HP\...`) are embedded in shareable docs/config. Use a relative path or an env var. |
| D12 | `API/switch_deepseek_gemini.md:58-67` | A vendor price/accuracy comparison with no source, an outdated model name ("Gemini 1.5 Flash"), and a recommendation ("start with DeepSeek") that contradicts the config it ships with (D1). Unverifiable numbers should not be presented as fact in a developer handover doc. |
| D13 | `API/switch_deepseek_gemini.md:36,45-52` vs `.secrets/ocr.env` | The doc tells the user to "ADD `GEMINI_API_KEY=your-gemini-key-here`", but `GEMINI_API_KEY` is **already present** in the env file (added earlier). Following the doc would overwrite an existing working key with a placeholder. `CHANGELOG.md:49` already states both keys are stored, so the switch doc is simply stale. |
| D14 | `Baccarat_OCR_Integration_Plan.md:44-50` claims the "existing rules" are applied — vs `casino-tracker/roulette/AGENTS.md:57-62`, which defines them precisely | Project guidance requires: Observe = records only; Confirm = **editable** confirmation; Automatic = enter only after a valid history shift **and** a spin/hand-count check; a late result must fall back to confirmation and never duplicate. The Baccarat module implements none of these — modes are a label (H8), confirmation is a `confirm()` dialog rather than an editable result (`baccarat_app.js:121`), and there is no count/shift check or duplicate detection anywhere. "Adapt to Baccarat labels" is an unwritten design task, not a rename (see also D5). |

### 4b. Deviation from the project's documented conventions

| # | Convention (`casino-tracker/roulette/AGENTS.md`) | BetPilot reality |
|---|---|---|
| P1 | `:5-7` — "The parent repository tracks all casino tools under `casino-tracker/`" | BetPilot is a new top-level sibling folder; this is also why it falls outside the sync allowlist (C2) |
| P2 | `:137-141` — "Run the relevant checks before preparing an update", with `node *.test.js` per engine | Zero tests, no `package.json`, no runner. 8 defects (H1-H7) are reproducible in minutes by exactly this convention |
| P3 | `:11-19` — `VERSION` is authoritative; visible labels must match it; CHANGELOG newest-at-top with plain-language entries | The version is hardcoded into 3 HTML files and 12 configs; `CHANGELOG.md` holds two entries for the same version/date (D7) |
| P4 | `:33-35` — the permanent sync launcher's scope is Roulette + OCR | BetPilot is silently excluded (C2) |
| P5 | `:31` — "Do not commit `backup-before-*` directories or generated cache files" | Observed only outside BetPilot: a 0-byte `SmartScan/SmartScan` is staged at the repo root |

---

## 5. NON-BLOCKING NOTES

- No `package.json`, build pipeline, `dist/`, or test suite exists (the CHANGELOG admits this). Given 8 reproduced defects in ~220 lines of JS, a minimal headless harness (like the one used for this review) would have caught H1-H7 in minutes — and `AGENTS.md:137-141` already establishes that convention for this project.
- Handler audit of all three HTML files: `setTableOcr` (H1) is the **only** undefined inline handler; `entry.html`'s missing `#min-bet` (M10) is the only missing element reference. Everything else resolves.
- `baccarat_app.js:17` ships a test default (`currentBet: 6`) and `:207` resets the session with `bankroll: 1000`, inconsistent with the 0 used elsewhere.
- Accessibility: the mode buttons carry no `aria-pressed`, `entry.html`/`baccarat_launcher.html` use `role="dialog"` without `aria-modal`, and focus is not moved when screens switch (`classList.add("active")` only).
- Repo hygiene outside this module: a 0-byte file `SmartScan/SmartScan` is staged for commit; `SmartScan/index.html` is untracked. Probably accidental.
- Positive: the module is genuinely additive. `OCR/`, `casino-tracker/roulette/`, and the existing Baccarat `style.css` were not modified, and `ARCHIVE/` remains empty as promised.

---

## 6. RECOMMENDED ORDER OF WORK

1. **Sanitise the key** (`switch_deepseek_gemini.md:50`) and rotate the DeepSeek key, then confirm
   `.secrets/ocr.env` is untouched and the Roulette OCR still runs.
2. **Decide the backup boundary deliberately** (C2): either bring `BetPilot/` into
   `github-sync.ps1` with a secrets guard, or explicitly accept that it lives outside version
   control. Do this *after* step 1.
3. **Decide the provider contract once** — one config value, read by one module, reflected in the UI,
   and update `CHANGELOG`, the switch doc, and the client header to match.
4. **Fix the recording engine** (H2, H3, H4, H7 + M1-M4): derive the outcome from
   (side, result), make push neutral, guard against a recorded outcome being applied twice, block a
   second bet while one is open, refresh history on every state change, validate bet ≤ bankroll.
5. **Make the entry path real** (H5, H6, M6, M7, M8, M10, M11): one entry screen, data actually
   passed to the table, dollar conversion wired, Reset fixed, missing `entry.css` and `#min-bet`
   resolved, and always-on-top handled through the existing `server.py` `set_window_topmost`
   endpoint rather than unusable `window.open` flags.
6. **Wire or hide the OCR** (H1, H8, D14): either implement capture + provider call behind
   Observe/Confirm/Auto with the semantics `AGENTS.md:57-62` already defines, or remove the provider
   label, the mode selector, and the "OCR Mode" setup field until it exists. Do not ship a UI that
   advertises OCR and "Automatic (with check)".
7. **Bring the docs back in line** (D1-D14, P1-P5) — at minimum `README.step-by-step.md`,
   `API/README.md`, `DOCUMENTS/DOCUMENT.md`, `CHANGELOG.md`, the 12-vs-9 profile count, and the
   `GEMINI_API_KEY` instruction — and define the Baccarat duplicate-detection key before any OCR
   work starts.
