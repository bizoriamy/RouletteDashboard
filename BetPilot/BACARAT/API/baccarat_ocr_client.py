# BACARAT ONLY — DUAL-PROVIDER API CLIENT (DeepSeek + Gemini 1.5 Flash)
# SUPERSEDED — 2026-09-28. This is still a comments-only placeholder and should not be activated.
# The working Baccarat OCR was built in BACARAT/app/ocr.py, which shares the session and the
# settlement rules with the module and cannot bypass them.
#
# To change provider now, edit ONE line in BACARAT/config/ocr.json:
#     "provider": "deepseek"   ->   "gemini"
# Keys stay in casino-tracker/.secrets/ocr.env and are read at runtime. Never paste a key in here.
# Separate from Roulette (OCR/). Baccarat only.
# Version: v1.0.0-20260928-Baccarat (unchanged placeholder)

# SECURITY RULES (DO NOT CHANGE):
# 1. Keys stay ONLY in casino-tracker/.secrets/ocr.env
# 2. This file contains NO keys — reads at runtime
# 3. Baccarat ONLY — not mixed with Roulette
# 4. Confirm with Senior Architect before activation

# --- SWITCH MECHANISM ---
# To change provider, edit:
#   BetPilot/BACARAT/API/baccarat_api_config.json
# Change: "provider": "deepseek"  →  "gemini"
# No code changes needed in this file.

# The config file controls the provider, endpoint, model, and key field.
# This file reads from the config at runtime.

# PLACEHOLDER — NOT ACTIVE
# The real implementation (after your approval) will:
# 1. Load provider from baccarat_api_config.json
# 2. Read the appropriate key (DEEPSEEK_API_KEY or GEMINI_API_KEY)
# 3. Call the correct endpoint/model
# 4. Return Baccarat result (Banker / Player / Tie / Pass)

# Example structure (after activation):
# def baccarat_ocr_call(image_path, profile_name):
#     config = load_config()
#     provider = config.get("provider", "deepseek")  # or "gemini"
#     # Read key based on provider
#     # Call DeepSeek OR Gemini endpoint
#     # Confirm result with user
#     # Return result
#     pass

# CONFIRM BEFORE ACTIVATION:
# Confirm with the Senior Architect (you) before enabling real calls.
# Confirm calibration profile (Pragmatic half-width first) before first run.
