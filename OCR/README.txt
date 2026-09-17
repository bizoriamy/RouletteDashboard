PRAGMATIC ROULETTE OCR MONITOR
Last updated: 17 September 2026

PURPOSE

This separate local component reads the Pragmatic Roulette history strip and
sends validated candidates to the European Roulette Live Dashboard. It does not
contain or change any roulette strategy, progression, payout, or betting engine.

SUPPORTED PROFILE

- Casino table: Pragmatic Roulette
- Window: Half Width, Maximum Height
- Display: 1920 x 1080
- Windows scale: 125%
- Established capture region: (1660, 900, 450, 70)

NORMAL USE

1. Start the dashboard with:
   C:\Users\HP\PawWork\casino-tracker\roulette\Launch Live Dashboard.bat
2. Open OCR Input in the main dashboard.
3. Select the Pragmatic profile and one operating mode.
4. Press Start OCR.

The number visible at startup is used only as the baseline and is not entered.
The monitor checks the strip locally four times per second. When the strip
changes and becomes stable, it sends one image to DeepSeek for recognition.

OPERATING MODES

- Observe only: record OCR observations without entering spins.
- Confirm before entry: show an editable 0-36 result. Confirm, correct, or use
  Skip This Round.
- Automatic when validated: enter only when the history sequence shifts
  correctly and the dashboard spin count did not change during recognition.
  A failed safety check falls back to editable confirmation.

If OCR is late and the number was entered manually, do not enter it twice. The
automatic check blocks the duplicate; use Skip This Round on the pending OCR
result. Manual dashboard and Quick Entry input remain available if OCR stops.

PRIVATE API KEY

The key must exist only in:

  C:\Users\HP\PawWork\casino-tracker\.secrets\ocr.env

with this format:

  DEEPSEEK_API_KEY=your_private_key

The .secrets folder is excluded from Git. Do not put the key in Python files,
screenshots, logs, documentation, or commits.

FILES

- app_monitor.py: screen capture and DeepSeek image recognition.
- dashboard_monitor.py: fast local change detection and dashboard bridge.
- calibrate.py / select_region.py: optional region-calibration tools.
- test_region.py / check_crop.py: diagnostic tools.
- config_*.json: saved table-region profiles.

LOCAL DATA

- Dashboard audit: casino-tracker\roulette\data\ocr-events.jsonl
- Corrected crops: casino-tracker\roulette\data\ocr-corrections\
- Pending crops: OCR\.pending\

These paths and generated screenshots/logs are excluded from Git.

DEPENDENCIES

Python 3 with:

  pip install openai pillow pyautogui opencv-python

TROUBLESHOOTING

- OCR does not start: verify Python, dependencies, and ocr.env.
- Screen capture fails: launch the dashboard normally under the Windows HP
  account; a restricted background account cannot capture the casino window.
- Recognition is wrong or incomplete: restore the agreed table size and display
  settings, then use the calibration/test tools before changing coordinates.
- Dashboard unavailable: restart Launch Live Dashboard.bat. OCR failure never
  removes manual or Quick Entry operation.

Roulette outcomes are random. This tool records visible results; it does not
predict outcomes or remove the house edge. Use it in accordance with applicable
laws and the casino platform's terms.
