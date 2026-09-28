> **IMPLEMENTED — 2026-09-28, as v2.0.0.** This plan was carried out, with two deliberate changes:
> the Baccarat OCR now lives in `app/ocr.py` (a separate module from the Roulette `OCR/` folder, per
> your no-mixing rule) and it is wired behind Observe / Confirm / Automatic with duplicate
> suppression by screen signature. The provider switch is `config/ocr.json`, default `deepseek`.
> The "3-number signature" described below is a roulette concept; for Baccarat the signal is a
> colour-aware hash of the result region plus a double read, which is what actually detects a new
> hand. Read [README.md](README.md) for how to calibrate and enable it.

# BETPILOT — BACARAT OCR INTEGRATION PLAN
Version: v1.0.0-20260928-Baccarat
Status: PLAN (not yet implemented — requires your approval)

---

## 1. WHAT WE ARE INTEGRATING

Your existing `OCR/` module reads casino screenshots using DeepSeek API.
We will connect this to the Baccarat module to read hand results.

---

## 2. YOUR CURRENT OCR SETUP (SUMMARY FROM STUDY)

**Files studied:**
- `OCR/ocr_tool.py` — DeepSeek vision API call (base64 PNG, `deepseek-v4-flash-vision-exp`)
- `OCR/app_monitor.py` — screen capture + 3-number signature confirmation
- `OCR/dashboard_monitor.py` — fast change detection + dashboard bridge (`/candidate` endpoint)
- `OCR/README.txt` — setup instructions and security rules

**Key security rules (DO NOT BREAK):**
- `DEEPSEEK_API_KEY` lives ONLY in `casino-tracker/.secrets/ocr.env`
- Never put the key in source files, docs, screenshots, or commits
- The `.secrets/` folder is excluded from version control
- API endpoint: `https://api.deepseek.com`
- Temperature: `0.0`

---

## 3. INTEGRATION DESIGN FOR BACARAT

`Goal`: When casino shows a Baccarat result (Banker/Player/Tie), BetPilot
records it with help from DeepSeek OCR.

`User flow (step-by-step)`:
1. User opens both casino and BetPilot Baccarat side by side
2. User clicks "Start OCR" (optional)
3. BetPilot captures a region of the casino screen
4. Image is sent to DeepSeek for recognition
5. User sees editable result — confirms or corrects
6. BetPilot saves the result to session history

`Safety rules (your existing rules applied)`:
- **Observe only** — no automatic entry
- **Confirm before entry** — user must approve
- **Automatic (with check)** — only enter when sequence validates
- **No duplicates** — if manual entry exists, do not enter twice
- **Late results** — if OCR is late, skip duplicate

---

## 4. TECHNICAL SPECIFICATION (FOR DEVELOPER)

| Component | Source | New in BetPilot |
|-----------|--------|-----------------|
| Screen capture | `OCR/app_monitor.py` (`pyautogui.screenshot`) | Reuse logic |
| DeepSeek call | `OCR/ocr_tool.py` (`client.chat.completions.create`) | Reuse logic |
| Region config | `OCR/config_*.json` | Add 9 profiles: `baccarat-[layout]-[provider].json` (3 layouts × 3 providers: Pragmatic/Evolution/Playtech) |
| Signature check | `OCR/app_monitor.py` (`get_winning_signature`) | Adapt to Baccarat labels |
| Dashboard bridge | `OCR/dashboard_monitor.py` | Connect to BetPilot session |

`NOTE FOR YOU: The actual integration requires a developer. You do not need
to code this yourself. Give this document to your developer with this instruction:`
`"Integrate BetPilot Baccarat with the existing OCR module using DeepSeek`."

---

## 5. WHAT YOU DO NEXT (SIMPLE STEPS)

`Step 1`: Confirm this integration plan with your developer
`Step 2`: Provide the developer access to `OCR/` folder (read-only)
`Step 3`: Confirm where the Baccarat result appears on screen (region coordinates)
`Step 4`: Confirm which mode you want (Observe / Confirm / Automatic)
`Step 5`: Do NOT put any API key inside `BetPilot/`

---

## 6. DISCLAIMER (REQUIRED)

This OCR integration does not guarantee accuracy. DeepSeek vision may
produce incorrect results. Always confirm with the casino display.
BetPilot does not predict game outcomes.