# BETPILOT — DOCUMENT INDEX

Version: v2.0.0-20260928-Baccarat
Date: 2026-09-28
Created by: Senior Architect

---

## WHAT IS THIS FOLDER?

This folder (`BetPilot/DOCUMENTS/`) holds official BetPilot documentation. Nothing here is deleted.
Unneeded files are moved to `ARCHIVE/` only with your explicit approval.

---

## DOCUMENT LIST (PRESERVED FROM YOUR PROJECT)

| Document | Source | Status | Notes |
|----------|--------|--------|-------|
| `casino-tracker/roulette/AGENTS.md` | Your project | ✅ Preserved | Project guidance; the OCR mode rules in it are what the Baccarat module now implements |
| `OCR/README.txt` | Your OCR module | ✅ Studied, preserved | DeepSeek API setup, security rules |
| `OCR/ocr_tool.py` | Your code | ✅ Read-only (not copied) | DeepSeek vision call |
| `OCR/app_monitor.py` | Your code | ✅ Read-only | Signature detection, double read |
| `baccarat/style.css` | Your code | ✅ Read-only | Design reference; the theme was carried into `BACARAT/app/web/baccarat.css` |

---

## THE CURRENT MODULE DOCUMENTS (v2.0.0)

Read these for anything to do with the Baccarat module. These are current:

| Document | Location | Purpose |
|----------|----------|---------|
| `README.md` | `BetPilot/BACARAT/` | How to run it, what it does, what is still open |
| `CHANGELOG.md` | `BetPilot/BACARAT/` | Item-by-item record of the rebuild, including the fix for each review finding |
| `REVIEW_Baccarat_v1.0.0-20260928.md` | `BetPilot/BACARAT/` | The review that prompted the rebuild — 1 critical, 8 high, 18 medium findings, with reproduced evidence |
| `VERSION` | `BetPilot/BACARAT/` | Module version, read by the server and the launcher |
| `README.step-by-step.md` | `BetPilot/` | Your step-by-step guide |
| `CHANGELOG.md` | `BetPilot/` | Product-level release notes |
| `VERSION` | `BetPilot/` | Authoritative product version |
| `DISCLAIMER.md` | `BetPilot/` | Required disclaimers |
| `ROLES/` | `BetPilot/` | The five role definitions |
| `ARCHIVE/` | `BetPilot/ARCHIVE/` | Retired files — still empty, nothing moved |

---

## SUPERSEDED DOCUMENTS (v1.0.0 — kept for the audit trail)

Each of these now carries a banner at the top saying what replaced it. Do not treat them as a
description of the current module:

| Document | Status |
|----------|--------|
| `BACARAT/Baccarat_Module_Overview.md` | Superseded — described a prototype that no longer exists |
| `BACARAT/Baccarat_Capture_Configuration_Guide.md` | Superseded — its 9 profiles and their mixed region conventions were replaced by `BACARAT/config/` |
| `BACARAT/Baccarat_OCR_Integration_Plan.md` | Implemented — the plan was carried out as `BACARAT/app/ocr.py` |
| `BACARAT/API/` | Superseded — the Baccarat API layer was built in `app/`, not here |
| `BACARAT/SOURCE/Baccarat/` | Superseded — the five prototype browser files |
| `BACARAT/config_baccarat_*.json` | Superseded — the old 12 calibration profiles |

Nothing above has been deleted or moved. Say the word and any of it can go to `ARCHIVE/`.

---

## WHAT HAS NOT BEEN CHANGED?

Your existing folders are untouched:

- `casino-tracker/` (all files intact; `.secrets/ocr.env` untouched)
- `OCR/` (all files intact — no Baccarat code was copied into it)
- `baccarat/` (all files intact)

---

## NEXT STEPS (FOR YOU — SIMPLE ORDER)

`Step 1`: Run `BACARAT\launcher\Start Baccarat.bat` and try a session in Manual mode
`Step 2`: Decide whether to rotate the DeepSeek key (24 of its 35 characters were written to a document)
`Step 3`: Decide whether `BetPilot/` should be added to the GitHub sync allowlist — at the moment none of this is backed up
`Step 4`: Confirm which superseded files (if any) should go to `ARCHIVE/`
`Step 5`: Calibrate your capture region, then try OCR in Confirm mode
`Step 6`: Confirm release of `v2.0.0-20260928-Baccarat`
