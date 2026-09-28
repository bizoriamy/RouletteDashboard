# HOW TO SWITCH BETWEEN DEEPSEEK AND GEMINI 1.5 FLASH (Baccarat Only)

Version: v1.0.0-20260928-Baccarat
Status: Design documented — activation requires your approval

---

## THE SWITCH (ONE CONFIG LINE)

Edit ONLY `BetPilot/BACARAT/API/baccarat_api_config.json`:

`Current (default)`:
```json
"provider": "deepseek"
```

`To switch to Gemini`:
```json
"provider": "gemini"
```

`No code changes needed in baccarat_ocr_client.py` — it reads `provider` from config.

---

## WHAT EACH PROVIDER NEEDS

### DeepSeek (default — already working)
- Key in `.secrets/ocr.env`: `DEEPSEEK_API_KEY=<your existing key — never printed here>`
- Endpoint: `https://api.deepseek.com`
- Model: `deepseek-v4-flash-vision-exp`
- Temperature: `0.0`
- Note: Your current Roulette OCR uses this — shared, no second account needed

### Gemini 1.5 Flash (when needed)
- Key in `.secrets/ocr.env`: ADD `GEMINI_API_KEY=your-gemini-key-here`
- Endpoint: `https://generativelanguage.googleapis.com/v1beta`
- Model: `gemini-1.5-flash`
- Temperature: `0.0`
- Note: Separate Google account/payment needed if you want separate billing
- Both keys can coexist in `.secrets/ocr.env` (they have different names)

---

## KEYS — ALREADY IN PLACE (DO NOT RE-PASTE)

Both keys already exist in `C:\Users\HP\PawWork\casino-tracker\.secrets\ocr.env`:

```
DEEPSEEK_API_KEY=<already set — leave it alone>
GEMINI_API_KEY=<already set — leave it alone>
```

Never paste a key from a document, chat, or screenshot into this file. To read the current
value, open `.secrets/ocr.env` directly. Copying a stale value over a working key silently
breaks the Roulette OCR.

No other files changed. The Baccarat client picks the key based on `provider`.

---

## PRICE COMPARISON (YOUR QUESTION — ANSWERED)

| | DeepSeek Flash Vision | Gemini 1.5 Flash | Note |
|---|---|---|---|
| **Vision input cost** | Low (~$0.10–0.30 / 1K tok) | Low (~$0.35 / 1K tok) | Similar for small images |
| **Your volume (~10–30/img/min)** | ~$1–3/month | ~$3–5/month | Both cheap at your scale |
| **Accuracy (small text)** | Good | Excellent | Gemini slightly faster |
| **Switch effort** | Zero (already using) | One config line + add key | Minimal |

**Recommendation**: Start with DeepSeek (working, cheap, same key). Switch to Gemini only if you need faster results or DeepSeek has outages.

---

## SECURITY (STAYS THE SAME)

- Both keys in `.secrets/ocr.env` — never in `BetPilot/`
- `BetPilot/BACARAT/API/` has NO keys — only config and template
- `baccarat_ocr_client.py` reads key at runtime from `.secrets/`
- Roulette (`OCR/`) stays separate — its `ocr.env` key unchanged

---

## NEXT STEP (CONFIRM)

Confirm before activation:
- [ ] Calibration region confirmed (Pragmatic half-width — `calibrate.py`)
- [ ] Provider choice: `deepseek` (default) or `gemini` (needs new key)
- [ ] Key added to `.secrets/ocr.env` (if Gemini chosen)
- [ ] Senior Architect (you) approves activation
