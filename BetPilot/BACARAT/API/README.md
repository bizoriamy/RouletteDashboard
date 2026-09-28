> **SUPERSEDED — 2026-09-28.** The Baccarat API layer was built in `app/ocr.py` (reading) and
> `app/server.py` (endpoints) rather than in this folder, because it needs to share the session and
> the settlement rules with the module. The separation you asked for is preserved: the Roulette OCR
> stays in `OCR/`, and nothing here was copied into it. `baccarat_ocr_client.py` is still a
> comments-only placeholder and can be archived with this folder on your word. One thing in here is
> worth knowing about: `switch_deepseek_gemini.md` used to print a real-looking API key — that value
> has been removed, and **that key should still be rotated**.

# BETPILOT — BACARAT API FOLDER
Status: SEPARATE FROM ROULETTE API — NEVER MIXED
Version: v1.0.0-20260928-Baccarat

---

## WHY THIS FOLDER EXISTS

Your request: "I do not wish to mix the API use for roulette and Baccarat."

This folder (`BetPilot/BACARAT/API/`) holds ONLY Baccarat-related API
calls and configurations. It is separate from:
- `OCR/` (Roulette OCR module — unchanged)
- `casino-tracker/roulette/` (Roulette engine — unchanged)
- Any future `BetPilot/ROULETTE/API/` (if created later, it will be separate)

---

## RULE: SEPARATE BY GAME

| Game | API Folder | Status |
|------|------------|--------|
| Baccarat | `BetPilot/BACARAT/API/` | ✅ Created — ONLY Baccarat |
| Roulette | `OCR/` (existing) | ✅ Unchanged — ONLY Roulette |
| Blackjack | (future `BetPilot/BLACKJACK/API/`) | 🔜 Not yet needed |

`Never` put Baccarat and Roulette calls in the same folder or script.

---

## WHAT GOES IN THIS FOLDER

When developed, this folder will contain (for Baccarat ONLY):

- `baccarat_ocr_client.py` — DeepSeek vision call for Baccarat (separate from `ocr_tool.py`)
- `baccarat_api_config.json` — Baccarat-specific settings (region, mode, provider)
- `baccarat_session_bridge.py` — Connects Baccarat result to BetPilot session
- `baccarat_signature.py` — Signature check adapted for Banker/Player/Tie results

`These files do NOT exist yet.` This folder is reserved for Baccarat-only code.

---

## SECURITY RULE (REQUIRED — NEVER BROKEN)

- The DeepSeek key stays ONLY in `casino-tracker/.secrets/ocr.env`
- This folder (`API/`) will NOT contain any API keys
- If a file needs the key, it reads from `.secrets/` at runtime — never stores
- No Roulette files will be copied into this folder
- No Baccarat files will be copied into `OCR/`

---

## HOW TO USE (FUTURE — WHEN DEVELOPED)

Your developer (or you with step-by-step guide) will:

1. Create `baccarat_ocr_client.py` in this folder
2. Configure `baccarat_api_config.json` with Baccarat region (from `config_baccarat_*.json`)
3. Run separately from Roulette OCR: `python baccarat_ocr_client.py` (not `python app_monitor.py`)

`This ensures complete separation`.

---

## APPROVED BY YOU

- Confirmed: Baccarat gets its own `API/` folder
- Confirmed: Roulette stays in existing `OCR/`
- Confirmed: No mixing of APIs between games

---

## NEXT STEP (YOU)

Confirm which items you want me to create in `BetPilot/BACARAT/API/`:
- `baccarat_ocr_client.py` (template only — no real API key)
- `baccarat_api_config.json` (configuration template)
- Both
- Or wait until you calibrate the region first
