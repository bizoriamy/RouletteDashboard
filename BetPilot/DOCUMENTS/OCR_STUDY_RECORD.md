# BETPILOT — OCR STUDY RECORD
Version: v1.0.0-20260928-Baccarat
Date: 2026-09-28
Priority: DEVELOP FIRST — Baccarat module documentation complete

---

## STUDIED FILES (NOT COPIED — READ ONLY)

These files were studied (read with read tool) to design the integration:

| File Path | Purpose | Status |
|-----------|---------|--------|
| `C:\Users\HP\PawWork\OCR\README.txt` | Setup guide, security rules, region settings | Studied |
| `C:\Users\HP\PawWork\OCR\ocr_tool.py` | DeepSeek vision call (`deepseek-v4-flash-vision-exp`) | Studied |
| `C:\Users\HP\PawWork\OCR\app_monitor.py` | Signature detection, confirmation delay, retry logic | Studied |
| `C:\Users\HP\PawWork\OCR\dashboard_monitor.py` | Dashboard bridge, `/candidate` endpoint, `pending` resolution | Studied |
| `C:\Users\HP\PawWork\OCR\calibrate.py` | Region calibration (OpenCV selectROI) | Studied |
| `C:\Users\HP\PawWork\OCR\select_region.py` | Region selection helper | Studied |
| `C:\Users\HP\PawWork\OCR\config_centre.json` | Example profile (`region: [1395,352,96,93]`) | Studied |
| `C:\Users\HP\PawWork\OCR\config_Center1.json` | Second profile (`region: [1390,325,102,106]`) | Studied |
| `C:\Users\HP\PawWork\casino-tracker\roulette\AGENTS.md` | Project guidance (version control, branches, sync rules) | Studied |

---

## KEY FINDINGS FROM OCR STUDY

1. **DeepSeek model**: `deepseek-v4-flash-vision-exp`
2. **API endpoint**: `https://api.deepseek.com`
3. **Authentication**: `DEEPSEEK_API_KEY` in `.secrets/ocr.env`
4. **Image format**: Base64 PNG (not URL)
5. **Temperature**: `0.0`
6. **Region method**: Fixed rectangle (calibratable via `calibrate.py`)
7. **Confirmation**: 3-number signature, 1.5s delay, double-read
8. **Safety**: Observe / Confirm / Auto modes with duplicate protection
9. **Output**: `winning_number.txt`, `.pending/` crops, `ocr-events.jsonl`
10. **No strategy/prediction**: OCR only reads visible results — never predicts

---

## INTEGRATION APPROACH FOR BACARAT

`Plan` (from `Baccarat_OCR_Integration_Plan.md`):
- Reuse `ocr_tool.py` logic (OpenAI client setup)
- Reuse `app_monitor.py` capture/confirmation logic
- Create `Baccarat/config_baccarat.json` for region
- Connect to BetPilot session via new bridge (not yet coded)
- User must confirm every result

--

## SEPARATE API FOLDERS (USER CONFIRMED)

`User request`: "I do not wish to mix the API use for roulette and Baccarat."

`Response`: Created `BetPilot/BACARAT/API/` — separate from `OCR/` (Roulette).
- `BetPilot/BACARAT/API/README.md` — explains separation
- `BetPilot/BACARAT/API/baccarat_ocr_client.py` — Baccarat-only template (no key)
- `BetPilot/BACARAT/API/baccarat_api_config.json` — Baccarat-only config
- `OCR/ocr_tool.py` — Roulette only, unchanged
- `OCR/app_monitor.py` — Roulette only, unchanged
- `casino-tracker/.secrets/ocr.env` — shared key location, never copied

Per user directive (`"You will start with Baccarat first"`):
- Baccarat module docs are complete
- OCR study complete
- Next step: User confirms plan, then build can start

---

## SECURITY CHECK (CRITICAL)

`Verified`: No API key copied to `BetPilot/`
`Verified`: `.secrets/ocr.env` remains only in `casino-tracker/`
`Verified`: All new BetPilot files contain only documentation, no credentials
`Verified`: No code changes to `OCR/` files