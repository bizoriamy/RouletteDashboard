> **SUPERSEDED — 2026-09-28.** The nine profiles named below lived in this folder and mixed two
> region conventions. They are replaced by nine profiles in [config/](config/) that state
> `"regionConvention": "x, y, width, height"` once and carry an identical key set, plus a
> `calibrated` flag so nothing pretends to be measured. Calibrate with
> `python app\tools\calibrate.py --profile <id>`. Read [README.md](README.md) for the current setup.

# BETPILOT — BACARAT CAPTURE REGION CONFIGURATION GUIDE
Version: v1.0.0-20260928-Baccarat
Date: 2026-09-28

---

## THE PROBLEM YOU IDENTIFIED (CONFIRMED CORRECT)

> The (1660, 900, 450, 70) region is for **Pragmatic Roulette Half-Width/Full-Length**.
>
> For **Baccarat**, we need different capture regions because:
> 1. Baccarat table layout is different (cards, betting buttons, result display)
> 2. The result history strip is at a different position
> 3. The screen scale (125%) affects the actual pixel coordinates
> 4. You mentioned 3 layout types: **Full Width/Full Length**, **Half Width/Full Length**, **Min Width/Full Length**

---

## YOUR 9 BACARAT CONFIG PROFILES (3 PROVIDERS × 3 LAYOUTS)

These replace the single Roulette region with 3 Baccarat-specific profiles.

| Profile File | Provider | Layout | Approx Region | Use When |
|--------------|----------|--------|---------------|----------|
| `config_baccarat_full_width_full_length_pragmatic.json` | Pragmatic | Full / Full | `(0,0,1920,1080)` | Full Pragmatic window |
| `config_baccarat_full_width_full_length_evolution.json` | Evolution | Full / Full | `(0,0,1920,1080)` | Full Evolution window |
| `config_baccarat_full_width_full_length_playtech.json` | Playtech | Full / Full | `(0,0,1920,1080)` | Full Playtech window |
| `config_baccarat_half_width_full_length_pragmatic.json` | Pragmatic | Half / Full | `(820,200,900,680)` | Pragmatic betting + result |
| `config_baccarat_half_width_full_length_evolution.json` | Evolution | Half / Full | `(820,200,900,680)` | Evolution betting + result |
| `config_baccarat_half_width_full_length_playtech.json` | Playtech | Half / Full | `(820,200,900,680)` | Playtech betting + result |
| `config_baccarat_min_width_full_length_pragmatic.json` | Pragmatic | Min / Full | `(1060,350,600,380)` | Pragmatic result only |
| `config_baccarat_min_width_full_length_evolution.json` | Evolution | Min / Full | `(1060,350,600,380)` | Evolution result only |
| `config_baccarat_min_width_full_length_playtech.json` | Playtech | Min / Full | `(1060,350,600,380)` | Playtech result only |

`All regions are APPROXIMATE`. You must run `calibrate.py` for each provider/layout to get exact coordinates.

---

## HOW TO USE (SIMPLE STEPS FOR YOU)

### Step 1: Choose your layout
Look at your casino's Baccarat screen:
- If you see the full table large → **Full Width** → use `full_width` profile
- If you see a narrow strip with buttons + cards → **Half Width** → use `half_width` profile
- If you want just the result history → **Min Width** → use `min_width` profile

### Step 2: Calibrate (run this once per layout)
Run: `python calibrate.py`
- It opens your screen
- You drag a box over the area you want to capture
- Press Enter/Space
- It saves `config_[name].json`

`This is exactly what your existing OCR setup uses` (`calibrate.py` in `OCR/`).

### Step 3: Choose provider + profile name
Your `app_monitor.py` uses `sys.argv[1]` for profile (e.g., `pragmatic`, `evolution`, `playtech`).
For Baccarat (3 providers × 3 layouts = 9 combinations):

`Full Width`:
- `python app_monitor.py baccarat-full-width-full-length-pragmatic`
- `python app_monitor.py baccarat-full-width-full-length-evolution`
- `python app_monitor.py baccarat-full-width-full-length-playtech`

`Half Width`:
- `python app_monitor.py baccarat-half-width-full-length-pragmatic`
- `python app_monitor.py baccarat-half-width-full-length-evolution`
- `python app_monitor.py baccarat-half-width-full-length-playtech`

`Min Width`:
- `python app_monitor.py baccarat-min-width-full-length-pragmatic`
- `python app_monitor.py baccarat-min-width-full-length-evolution`
- `python app_monitor.py baccarat-min-width-full-length-playtech`

---

## DIFFERENCE FROM ROULETTE PROFILE

| Feature | Roulette (existing) | Baccarat (new) |
|---------|--------------------|----------------|
| Profile name | `default` / `centre` | `baccarat-full-width-full-length` etc. |
| Region | `(1660, 900, 450, 70)` | Varies by layout (see above) |
| Target | Roulette result strip | Baccarat result / cards |
| Scale | 125% (per `README.txt`) | 100% or 125% (check your screen) |
| Signature length | 3 numbers | 3 results (Banker/Player/Tie) |

---

## IMPORTANT SECURITY NOTE (REQUIRED)

> The DeepSeek API key (`DEEPSEEK_API_KEY`) stays in `casino-tracker/.secrets/ocr.env`.
>
> These new `config_*.json` files contain ONLY region coordinates — NO API keys, NO passwords.
>
> They are safe to include in `BetPilot/`.

---

## NEXT STEP TO ACTIVATE

You must confirm which layout you use most often for Baccarat.
Then the developer (or you with `calibrate.py`) will:
1. Run calibration on your actual casino screen
2. Update the profile with exact coordinates
3. Confirm `app_monitor.py` can read Baccarat results correctly

`This document does NOT change any existing code in OCR/`.
It only creates the configuration templates for Baccarat.
