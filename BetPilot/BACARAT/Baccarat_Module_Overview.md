> **SUPERSEDED — 2026-09-28.** This describes the v1.0.0 prototype and no longer matches the code.
> The module was rebuilt as **v2.0.0**; read [README.md](README.md) and [CHANGELOG.md](CHANGELOG.md)
> instead. Nothing was deleted — this file is kept for the audit trail and can be archived on your word.

# BETPILOT — BACARAT MODULE
Version: v1.0.0-20260928-Baccarat
Status: DOCUMENT DRAFT (build planned — not yet released)

---

## 1. WHAT IS BACARAT IN BETPILOT?

Baccarat is a casino table game played with cards. The goal is to bet on which
hand — **Banker** (red) or **Player** (blue) — will have a total closest to 9.
There is also a **Tie** (green) option.

BetPilot's Baccarat module is a **side-by-side assistant** that runs alongside
your online casino. It does NOT play games, does NOT guarantee wins.

`IMPORTANT: This tool does NOT guarantee winnings. Game outcomes are random.
The house always has a mathematical advantage. Bet only what you can afford to lose.`

---

## 2. GAME RULES (SIMPLIFIED — FOR DOCUMENT REFERENCE)

| Hand | Values | Description |
|------|--------|-------------|
| **Banker** | Red cards / red button | The dealer's hand |
| **Player** | Blue cards / blue button | The player's hand |
| **Tie** | Green / both equal | Both hands have the same total |

Point totals: 2 cards added; if > 9, subtract 10 (e.g., 7+6 = 13 → 3 points).
The winning hand is closest to 9.

Bet types supported:
- **Banker bet** — pays 0.95 (usually 5% commission)
- **Player bet** — pays 1:1
- **Tie bet** — pays 8:1 (or 9:1 depending on casino)

---

## 3. VISUAL DESIGN (BASED ON YOUR EXISTING CODE)

Your `casino-tracker/baccarat/style.css` defines a premium casino aesthetic.
BetPilot Baccarat will follow this design:

### Color Palette
| Color | Code | Usage |
|-------|------|-------|
| Gold | `#FFD700` / `#B8860B` | Highlights, buttons, borders |
| Red (Banker) | `#DC143C` | Banker button / result |
| Blue (Player) | `#1E90FF` | Player button / result |
| Green (Tie) | `#0D6B3D` / `#064D2A` | Tie button / result |
| Dark background | `#1A1A2E` | Main screen |
| Card dark | `#16213E` | Panels, cards |

### Layout Elements (from `baccarat/style.css`)
- `.setup-card` — session start (gold border, dark fill)
- `.betting-area` — main betting screen (flex column)
- `.current-bet` — shows current bet amount (gold numbers)
- `.unit-controls` — adjust bet units (± buttons)
- `.bet-buttons` — Banker / Player / Tie (large colored buttons)
- `.history-panel` — past hands list (sticky top)
- `.session-header` — displays session info, balance, casino name

---

## 4. HOW BETPILOT BACARAT WORKS (STEP-BY-STEP FOR USER)

`Step 1`: Open BetPilot Baccarat module (side by side with casino)
`Step 2`: Select casino name and set starting balance
`Step 3`: Start session → screen shows betting buttons
`Step 4`: When casino shows a new hand result, click the result button (Banker/Player/Tie/Pass)
`Step 5`: BetPilot records the result, updates your session history, and calculates stats
`Step 6`: Review `.history-panel` for past results, stats, and trends

---

## 5. OCR INTEGRATION (DEEPSEEK API — YOUR SETUP)

Your existing `OCR/` folder uses DeepSeek for recognition.
BetPilot Baccarat can optionally use this to read casino screenshots.

**How your OCR works (from study):**
- Captures screen region (default: 1660, 900, 450, 70 at 1920×1080, 125%)
- Sends base64 PNG to `https://api.deepseek.com` using model `deepseek-v4-flash-vision-exp`
- Confirms results using a **3-number signature** method
- API key must stay in `casino-tracker/.secrets/ocr.env` — **NEVER in BetPilot source**

**BetPilot Baccarat integration plan:**
- Option to read casino result screenshot automatically
- Must require **user confirmation** before recording (your `Confirm` mode)
- Must show editable result before saving (your `Confirm before entry` mode)
- Must prevent duplicates (your `Automatic` mode with spin-count check)

---

## 6. DOCUMENT PRESERVATION — NO FILES DELETED

Your existing Baccarat files (`casino-tracker/baccarat/style.css`) remain unchanged.
BetPilot creates **new** documentation here; nothing is moved to Archive
unless you explicitly approve it.

---

## 7. LEGAL & DISCLAIMERS (REQUIRED)

Every Baccarat document and screen must display:

> **DISCLAIMER**
> BetPilot is a bet-assistance tool. It does NOT predict outcomes, guarantee
> winnings, or provide betting advice. Game results are random. The casino
> always has a house edge. Only bet amounts you can afford to lose.
> This is for entertainment and record-keeping purposes only.
> Check your local gambling laws. Must be 18+ (or local age) to use.

---

## 8. VERSION & CHANGE TRACKING

- Current module: Baccarat v1.0.0-20260928 (draft)
- Next planned: Blackjack module (after Baccarat release)
- All changes recorded in `BetPilot/CHANGELOG.md`

---

## 9. ROLE REFERENCES

When working on Banyard module, consult:
- `BetPilot/ROLES/PRODUCTION.md` — release process
- `BetPilot/ROLES/MARKETING.md` — messaging rules (no win promises)
- `BetPilot/ROLES/SALES.md` — pricing and distribution
- `BetPilot/ROLES/CUSTOMER_SUPPORT.md` — user assistance
- `BetPilot/ROLES/SENIOR_ARCHITECT.md` — architecture decisions