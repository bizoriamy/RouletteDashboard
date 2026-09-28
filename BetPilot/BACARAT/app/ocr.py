"""BetPilot — Baccarat OCR reader.

Reads the result off the casino screen and turns it into the SAME two inputs the rest of the module
uses, so OCR cannot bypass any guard: it goes through SessionStore, which enforces one open bet and
refuses a duplicate settle.

Design notes
------------
* Duplicate suppression is image-based. Each accepted result stores an average-hash of the captured
  region; an identical hash is never accepted twice, so the same hand cannot be entered again after a
  restart. The failure mode is deliberately "miss a hand" rather than "record a hand twice".
* A candidate must survive a double read (two reads separated by a delay that agree on the result)
  over a region whose hash did not change in between. That mirrors the 3-number signature double-read
  the Roulette OCR already uses.
* Modes follow casino-tracker/roulette/AGENTS.md:
    observe — recognises and logs, never enters anything;
    confirm — recognises, shows an editable candidate, waits for the user;
    auto    — enters only a signature-validated, double-read, not-yet-seen result, and only to settle
              an OPEN bet. With no open bet it degrades to observe: OCR never invents a bet.
* A late result (the bet was already settled by hand) therefore cannot duplicate: with no open bet
  there is nothing to settle, so the read is recorded as information only.

Both `capture` and `read` are injected so tests can drive the whole thing with a fake screen.
"""
import base64
import hashlib
import io
import json
import os
import re
import threading
import time

APP_DIR = os.path.normcase(os.path.realpath(os.path.dirname(os.path.abspath(__file__))))
MODULE_DIR = os.path.normcase(os.path.realpath(os.path.join(APP_DIR, "..")))
# BetPilot/BACARAT/app -> BetPilot/BACARAT -> BetPilot -> PawWork
WORKSPACE_DIR = os.path.normcase(os.path.realpath(os.path.join(MODULE_DIR, "..", "..")))
SECRETS_FILE = os.path.normcase(os.path.realpath(
    os.environ.get("BACCARAT_SECRETS_FILE", os.path.join(WORKSPACE_DIR, "casino-tracker", ".secrets", "ocr.env"))
))

OCR_CONFIG_PATH = os.path.join(MODULE_DIR, "config", "ocr.json")

DEFAULT_CONFIG = {
    "provider": "deepseek",
    "deepseek": {
        "baseUrl": "https://api.deepseek.com",
        "model": "deepseek-v4-flash-vision-exp",
        "keyName": "DEEPSEEK_API_KEY",
        "temperature": 0,
        # Generous on purpose: a reasoning vision model spends tokens before it writes the JSON, and a
        # tight cap makes cluttered images come back empty. The reply itself is only a few dozen tokens.
        "maxTokens": 800,
    },
    "gemini": {
        "baseUrl": "https://generativelanguage.googleapis.com/v1beta",
        # Verified against the user's key on 2026-09-28: the API told us gemini-1.5-flash and
        # gemini-2.5-flash are no longer served to this key and recommended gemini-3.8-flash.
        "model": "gemini-3.8-flash",
        "keyName": "GEMINI_API_KEY",
        "temperature": 0,
    },
    "scan": {
        # How often the reader looks. It only calls the model when the picture changed, so a short
        # interval costs a screenshot, not an API call — and it is what lets the reader notice a
        # settled hand within a fraction of a second instead of up to 1.5s late.
        "intervalSeconds": 0.6,
        # On a change, wait until the picture has been still for this long before reading it, so the
        # reader never reads a half-updated hand. This is the roulette monitor's method: poll fast,
        # read the settled frame once.
        "stableSeconds": 0.75,
        "stablePollSeconds": 0.25,
        # The gap between the two reads, used only when the first read is not certain enough to accept
        # on its own. 1.5s straddled the moment the hand settles on a fast table and cancelled hands.
        "confirmDelaySeconds": 0.4,
        "stableReads": 2,
        # A reading at or above this confidence is accepted on ONE model call, which is the difference
        # between answering while the hand is still on screen and answering after the next one started.
        "singleReadConfidence": 0.93,
        "minConfidence": 0.5,
        # Automatic mode settles a bet with no human looking, so it demands more certainty than a
        # reading that is only shown for confirmation. A reading below this is handed to the user.
        "autoMinConfidence": 0.9,
    },
}

PROMPT = (
    "You are reading the result of the CURRENT baccarat hand from a screenshot of a casino table. "
    "Reply with STRICT JSON only, no prose, no code fences:\n"
    '{"result": "banker|player|tie" or null, "confidence": 0.0-1.0, "evidence": "short reason"}\n'
    "\n"
    "Conventions: red = Banker, blue = Player, green = Tie. A result may be shown as a word "
    "(BANKER / PLAYER / TIE), a single letter (B / P / T, or the characters 庄 / 闲 / 和), a coloured "
    "marker or light, or a hand total.\n"
    "\n"
    "Many tables show the result as hand totals in small coloured boxes above the betting panels: the "
    "blue box is Player's total, the red box is Banker's total, and the HIGHER total wins. Baccarat "
    "totals run 0-9 (face cards count 0, an Ace counts 1). The winning side's panel is bright while the "
    "losing side's is dimmed, and equal totals mean a Tie. On such a full layout the panels are labelled "
    "PLAYER / BANKER / TIE with odds such as \"0.95:1\" on every hand, winner or not: there, decide from "
    "the totals and the highlighted panel rather than from the mere presence of a word. When the image "
    "shows only one word or one marker instead (for example a single blue panel reading PLAYER), that "
    "word or marker IS the result. If the image is a row or grid of markers with no totals, the newest "
    "(last) marker is the current hand.\n"
    "\n"
    "Refuse rather than guess:\n"
    "- If a hand is still being dealt (cards moving or blurred, no settled totals, a timer or "
    "countdown), or no hand is visible at all, reply "
    '{"result": null, "confidence": 0.0, "evidence": "no clear result"}.\n'
    "- A wrong result is worse than no result.\n"
    "In \"evidence\", give the signal you decided from and keep it short. Do not restate totals or "
    "other numbers unless you are certain of them — a wrong number there is more misleading than no "
    "number, and the person reading it checks it against the table."
)


class OcrError(RuntimeError):
    pass


# --------------------------------------------------------------------------- configuration


def load_config():
    config = json.loads(json.dumps(DEFAULT_CONFIG))
    if os.path.isfile(OCR_CONFIG_PATH):
        try:
            with open(OCR_CONFIG_PATH, "r", encoding="utf-8") as handle:
                stored = json.load(handle)
            for key, value in stored.items():
                if isinstance(value, dict) and isinstance(config.get(key), dict):
                    config[key].update(value)
                else:
                    config[key] = value
        except (OSError, json.JSONDecodeError) as error:
            raise OcrError("config/ocr.json is not readable: %s" % error)
    return config


def save_config(config):
    os.makedirs(os.path.dirname(OCR_CONFIG_PATH), exist_ok=True)
    temporary = OCR_CONFIG_PATH + ".tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(config, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    os.replace(temporary, OCR_CONFIG_PATH)


def load_secrets():
    """Read the private env file. Keys are never copied into the module or returned to the browser."""
    secrets = {}
    try:
        with open(SECRETS_FILE, "r", encoding="utf-8-sig") as handle:
            for line in handle:
                text = line.strip()
                if not text or text.startswith("#") or "=" not in text:
                    continue
                key, value = text.split("=", 1)
                secrets[key.strip()] = value.strip().strip('"').strip("'")
    except OSError:
        return {}
    return secrets


def available_providers():
    config = load_config()
    secrets = load_secrets()
    out = {}
    for name in ("deepseek", "gemini"):
        section = config.get(name, {})
        key_name = section.get("keyName", "")
        out[name] = {
            "configured": bool(secrets.get(key_name)),
            "model": section.get("model"),
            "keyName": key_name,
        }
    return out


def describe_availability():
    """What is missing before OCR can run, said plainly so the UI can be honest about it."""
    missing = []
    for module_name in ("PIL", "pyautogui"):
        try:
            __import__(module_name)
        except ImportError:
            missing.append(module_name)
    try:
        __import__("openai")
        has_openai = True
    except ImportError:
        has_openai = False
    providers = available_providers()
    config = load_config()
    provider = str(config.get("provider", "deepseek")).lower()
    if provider == "deepseek" and not has_openai:
        missing.append("openai")
    if not providers.get(provider, {}).get("configured"):
        missing.append("%s in %s" % (providers.get(provider, {}).get("keyName", "API key"), SECRETS_FILE))
    return {
        "available": not missing,
        "missing": missing,
        "provider": provider,
        "providers": providers,
        "secretsFile": SECRETS_FILE,
        "configPath": OCR_CONFIG_PATH,
    }


# --------------------------------------------------------------------------- image helpers


def region_signature(image_bytes, size=16):
    """Colour-aware signature of the captured region.

    Downscales to 16x16 RGB (LANCZOS averages away small rendering noise) and hashes the pixels.
    Colour counts: a result strip that changes only in hue — a red Banker marker becoming a blue
    Player marker at the same brightness — still produces a different signature. A pure luminance
    hash would call those two hands identical and miss the second one.
    """
    from PIL import Image
    with Image.open(io.BytesIO(image_bytes)) as image:
        small = image.convert("RGB").resize((size, size), Image.LANCZOS)
        payload = small.tobytes()
    return "%s-%s" % (hashlib.sha1(payload).hexdigest()[:16], size)


def preview_png(image_bytes, max_width=1100):
    """A smaller PNG of a captured screen, for drawing a region on, plus the scale applied.

    Drawing happens on a picture scaled to fit, so the scale must travel with it: display pixels are
    converted back to screen pixels by dividing by this number.
    """
    from PIL import Image
    with io.BytesIO(image_bytes) as buffer:
        with Image.open(buffer) as opened:
            image = opened.convert("RGB")
    scale = 1.0
    if image.width > max_width:
        scale = float(max_width) / float(image.width)
        image = image.resize((max(1, int(round(image.width * scale))),
                              max(1, int(round(image.height * scale)))), Image.LANCZOS)
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue(), scale


def region_covers_whole_screen(region, screen=None, coverage=0.95):
    """Whether a region is essentially the entire screen.

    A whole-screen region contains the module itself, the desktop and the taskbar. Measured on the
    real table, that much clutter makes the reader spend its whole token budget deliberating and
    answer nothing — so it is worth refusing up front rather than looping on errors.
    """
    if not (isinstance(region, (list, tuple)) and len(region) == 4):
        return False
    try:
        x, y, width, height = [int(value) for value in region]
    except (TypeError, ValueError):
        return False
    try:
        size = list(screen) if screen else screen_size()
    except Exception:  # noqa: BLE001
        return False
    if size[0] <= 0 or size[1] <= 0:
        return False
    return (width * height) >= coverage * size[0] * size[1]


def validate_region(region, screen=None):
    """Why a region cannot be captured, or None when it is fine.

    A calibrated region is measured against a window that can later be moved or resized. Saying so
    plainly beats a capture error repeating every scan while the reader watches nothing.
    """
    if not isinstance(region, (list, tuple)) or len(region) != 4:
        return "a region needs four numbers: x, y, width, height"
    try:
        x, y, width, height = [int(value) for value in region]
    except (TypeError, ValueError):
        return "the region must be whole numbers: x, y, width, height"
    if width <= 0 or height <= 0:
        return "the region has no width or height (%dx%d)" % (width, height)
    try:
        size = list(screen) if screen else screen_size()
    except Exception as error:  # noqa: BLE001
        return "the screen size could not be read: %s" % error
    if x < 0 or y < 0:
        return "the region starts off the screen at %d,%d" % (x, y)
    if x + width > size[0] or y + height > size[1]:
        return ("the region %d,%d %dx%d runs past the edge of the %dx%d screen — the table window has "
                "probably moved or been resized since calibration, so press \"Find my table\" again"
                % (x, y, width, height, size[0], size[1]))
    return None


def capture_region(region):
    """Screenshot a (x, y, width, height) region and return PNG bytes."""
    import pyautogui
    problem = validate_region(region)
    if problem:
        raise OcrError("Cannot capture the region: %s" % problem)
    x, y, width, height = [int(value) for value in region]
    if width <= 0 or height <= 0:
        raise OcrError("Capture region has no area: %r" % (region,))
    image = pyautogui.screenshot(region=(x, y, width, height))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def auto_is_confident_enough(confidence, scan_config=None):
    """Whether Automatic mode may settle on this reading without a human looking.

    Automatic moves money on its own, so it holds a higher bar than a reading merely shown for
    confirmation. Anything less certain is handed to the user instead of being acted on.
    """
    settings = scan_config if isinstance(scan_config, dict) else DEFAULT_CONFIG["scan"]
    try:
        minimum = float(settings.get("autoMinConfidence", 0.9))
    except (TypeError, ValueError):
        minimum = 0.9
    try:
        value = float(confidence or 0.0)
    except (TypeError, ValueError):
        value = 0.0
    return value >= minimum


def screen_size():
    """The capture coordinate space, which is the same space calibrate.py measures in."""
    import pyautogui
    width, height = pyautogui.size()
    return [int(width), int(height)]


def capture_full_screen():
    width, height = screen_size()
    return capture_region([0, 0, width, height])


# --------------------------------------------------------------------------- finding the table


def _to_bgr(image_bytes):
    import cv2
    import numpy as np
    from PIL import Image
    with io.BytesIO(image_bytes) as buffer:
        with Image.open(buffer) as image:
            rgb = np.array(image.convert("RGB"))
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


def _scales_between(low=0.55, high=1.5, step=0.05):
    count = int(round((high - low) / step))
    return [round(low + step * index, 2) for index in range(count + 1)]


def locate_sample(screen_bytes, sample_paths, scales=None, min_score=0.60):
    """Find which sample (a saved table screenshot) is on the screen now, and where.

    The sample defines WHAT to read: whatever was snipped is what the module will capture. Returns
    {"found": bool, "score": float, "region": [x, y, w, h], "sample": name, "scale": float, "reason": str}
    and never invents a region — an unconvincing match comes back with found=False.
    """
    try:
        import cv2  # noqa: F401
    except Exception as error:  # noqa: BLE001
        raise OcrError("Finding the table needs OpenCV, which is not available: %s" % error)

    import cv2
    import numpy as np

    screen = _to_bgr(screen_bytes)
    screen_height, screen_width = screen.shape[:2]
    scales = scales or _scales_between()

    best = {"found": False, "score": 0.0, "region": None, "sample": None, "scale": None,
            "reason": "No sample screenshots to look for."}
    for path in sample_paths:
        if not os.path.isfile(path):
            continue
        with open(path, "rb") as handle:
            template = _to_bgr(handle.read())
        flat = float(np.std(template))
        for scale in scales:
            width = max(8, int(round(template.shape[1] * scale)))
            height = max(8, int(round(template.shape[0] * scale)))
            if width >= screen_width or height >= screen_height:
                continue
            interpolation = cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR
            resized = cv2.resize(template, (width, height), interpolation=interpolation)
            result = cv2.matchTemplate(screen, resized, cv2.TM_CCOEFF_NORMED)
            _, max_value, _, max_location = cv2.minMaxLoc(result)
            if max_value > best["score"]:
                best = {
                    "found": bool(max_value >= min_score),
                    "score": float(max_value),
                    "region": [int(max_location[0]), int(max_location[1]), width, height],
                    "sample": os.path.basename(path),
                    "scale": float(scale),
                    "flat": flat < 12.0,
                    "reason": "",
                }

    if best["region"] is None:
        best["reason"] = ("No usable sample screenshot was found to look for. Save one with the "
                          "sample button first.")
    elif not best["found"]:
        best["reason"] = ("The table does not appear to be on screen (best match %.2f against %s, "
                          "needs %.2f). Open the Baccarat table so the hand result is visible, and "
                          "make sure the window is the same size as when the sample was taken."
                          % (best["score"], best["sample"], min_score))
    return best


def crop_from_screen(screen_bytes, region):
    """PNG bytes of one region of a captured screen — used to show what a located region contains."""
    import cv2
    screen = _to_bgr(screen_bytes)
    x, y, width, height = [int(value) for value in region]
    x = max(0, min(x, screen.shape[1] - 1))
    y = max(0, min(y, screen.shape[0] - 1))
    width = max(1, min(width, screen.shape[1] - x))
    height = max(1, min(height, screen.shape[0] - y))
    ok, buffer = cv2.imencode(".png", screen[y:y + height, x:x + width])
    if not ok:
        raise OcrError("Could not encode the cropped region.")
    return buffer.tobytes()


def apply_region_to_profile(profile_path, region, sample=None, score=None, when=None):
    """Write a located region into a calibration profile and mark it calibrated."""
    if not (isinstance(region, list) and len(region) == 4
            and all(isinstance(value, int) for value in region)):
        raise OcrError("Refusing to write a malformed region: %r" % (region,))
    if not os.path.isfile(profile_path):
        raise OcrError("No such profile file: %s" % profile_path)
    with open(profile_path, "r", encoding="utf-8") as handle:
        profile = json.load(handle)
    profile["region"] = region
    profile["calibrated"] = True
    profile["calibratedAt"] = when or time.strftime("%Y-%m-%dT%H:%M:%S")
    if sample:
        profile["calibratedFrom"] = os.path.basename(sample)
    if score is not None:
        profile["matchScore"] = round(float(score), 3)
    else:
        # A region drawn by hand has no match score. Leaving a stale one from an earlier locate would
        # misrepresent how it was measured.
        profile.pop("matchScore", None)
    with open(profile_path, "w", encoding="utf-8") as handle:
        json.dump(profile, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    return profile


# --------------------------------------------------------------------------- providers


def salvage_truncated_json(text):
    """Recover {result, confidence, evidence} from a reply cut off before its closing brace.

    Some providers cap output tokens hard enough to truncate the JSON. If the "result" value is
    complete in the text, the reading is still good and throwing it away would lose a hand. The
    result must be a COMPLETE quoted string here — a half-written value is refused, never guessed.
    """
    result = re.search(r'"result"\s*:\s*"(banker|player|tie|none)"', text, re.IGNORECASE)
    if not result:
        return None
    confidence = re.search(r'"confidence"\s*:\s*([0-9]*\.?[0-9]+)', text)
    evidence = re.search(r'"evidence"\s*:\s*"([^"]*)', text)
    return {
        "result": result.group(1),
        "confidence": confidence.group(1) if confidence else 0.0,
        "evidence": (evidence.group(1) if evidence else "") + " [recovered from a truncated reply]",
    }


def parse_result_json(text):
    """Parse the model's reply into {result, confidence, evidence}. Tolerates code fences."""
    if not text:
        raise OcrError("The vision model returned nothing.")
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?|```$", "", cleaned, flags=re.MULTILINE).strip()
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    try:
        payload = json.loads(match.group()) if match else None
    except json.JSONDecodeError:
        payload = None
    if payload is None:
        # The braces may be missing because the reply was cut short. Salvage what is complete.
        payload = salvage_truncated_json(cleaned)
        if payload is None:
            raise OcrError("The vision model did not return JSON I could use: %s" % cleaned[:160])
    result = payload.get("result")
    if isinstance(result, str):
        result = result.strip().lower()
        if result in ("none", "unknown", "null", ""):
            result = None
        elif result not in ("banker", "player", "tie"):
            raise OcrError("The vision model returned an unknown result: %r" % result)
    elif result is not None:
        raise OcrError("The vision model returned a non-text result: %r" % (result,))
    try:
        confidence = float(payload.get("confidence", 0.0))
    except (TypeError, ValueError):
        confidence = 0.0
    return {
        "result": result,
        "confidence": max(0.0, min(1.0, confidence)),
        "evidence": str(payload.get("evidence", ""))[:200],
    }


def model_attempts(section):
    """The models to try, in order: the configured one, then an optional fallback.

    The fast vision model occasionally spends its whole budget deliberating on a busy frame (a settled
    hand with cards on it, measured) and returns nothing. A slower model read that same frame, so one
    retry with it turns a missed hand into a reading. The fallback is only ever reached after the
    primary has failed, so it costs nothing on a normal hand.
    """
    primary = section.get("model", DEFAULT_CONFIG["deepseek"]["model"])
    fallback = section.get("fallbackModel", DEFAULT_CONFIG["deepseek"].get("fallbackModel"))
    attempts = [primary]
    if fallback and fallback != primary:
        attempts.append(fallback)
    return attempts


def read_with_deepseek(image_bytes, section, api_key):
    from openai import OpenAI
    client = OpenAI(api_key=api_key, base_url=section.get("baseUrl", DEFAULT_CONFIG["deepseek"]["baseUrl"]),
                    timeout=float(section.get("timeoutSeconds", 30)))
    encoded = base64.b64encode(image_bytes).decode("ascii")
    base_budget = int(section.get("maxTokens", 800))
    last_finish = None
    last_content = ""
    # A reasoning-style vision model spends output tokens before it writes the JSON. On a cluttered
    # image that can eat a modest budget whole and the reply comes back empty with finish_reason
    # "length" — a good hand silently lost. Escalate the budget once, then try the fallback model.
    models = model_attempts(section)
    for model in models:
        # One budget per model: escalating the primary's budget as well made a bad frame take ~30
        # seconds before the fallback was even tried (measured live), by which time the hand was gone.
        for budget in (base_budget,):
            response = client.chat.completions.create(
                model=model,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": PROMPT},
                        {"type": "image_url", "image_url": {"url": "data:image/png;base64," + encoded}},
                    ],
                }],
                temperature=float(section.get("temperature", 0)),
                max_tokens=budget,
            )
            choice = response.choices[0]
            last_finish = getattr(choice, "finish_reason", None)
            last_content = choice.message.content or ""
            if last_content.strip():
                return last_content
            if last_finish != "length":
                return last_content  # empty for another reason; the retry wrapper deals with it
    raise OcrError(
        "The vision model spent its whole %d-token budget deliberating and answered nothing "
        "(finish_reason=%s) — tried %s. Raising maxTokens does NOT help; a bigger budget was measured "
        "and made no difference. The frame is too busy: leave out the history grid of coloured circles "
        "on the left and the balance row along the bottom, keeping the hand totals and the panels."
        % (base_budget * 2, last_finish, " then ".join(models))
    )


def read_with_gemini(image_bytes, section, api_key):
    import requests
    base_url = str(section.get("baseUrl", DEFAULT_CONFIG["gemini"]["baseUrl"])).rstrip("/")
    model = section.get("model", DEFAULT_CONFIG["gemini"]["model"])
    url = "%s/models/%s:generateContent" % (base_url, model)
    payload = {
        "contents": [{
            "parts": [
                {"text": PROMPT},
                {"inline_data": {"mime_type": "image/png",
                                 "data": base64.b64encode(image_bytes).decode("ascii")}},
            ]
        }],
        "generationConfig": {
            "temperature": float(section.get("temperature", 0)),
            "maxOutputTokens": int(section.get("maxTokens", 300)),
        },
    }
    response = requests.post(url, params={"key": api_key}, json=payload, timeout=45)
    if response.status_code == 404:
        raise OcrError(
            "Gemini does not serve the configured model '%s' for this key. List the ids available "
            "to it at %s/models?key=... and set gemini.model in config/ocr.json. (%s)"
            % (model, base_url, response.text[:160])
        )
    if response.status_code in (429, 503):
        raise OcrError(
            "Gemini is temporarily unavailable (HTTP %s: demand spike or rate limit). This is a "
            "service-side condition, not a configuration problem — retry in a minute, or set "
            "\"provider\": \"deepseek\" in config/ocr.json." % response.status_code
        )
    if response.status_code != 200:
        raise OcrError("Gemini returned HTTP %s: %s" % (response.status_code, response.text[:200]))
    body = response.json()
    try:
        return body["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as error:
        raise OcrError("Gemini returned an unexpected shape: %s" % json.dumps(body)[:200]) from error


def with_retry(read, attempts=2, delay=0.7, sleep=time.sleep):
    """Retry a read that came back empty or unusable.

    Providers occasionally answer with an empty body (~1 call in 15 measured on 2026-09-28). In a live
    session that is a missed hand, and asking again for the same picture is free of risk: the read is
    stateless and the image has not changed. Transport errors still raise immediately — they are not
    something a silent retry should paper over mid-hand.
    """
    def reader(image_bytes):
        last = None
        for attempt in range(1, max(1, attempts) + 1):
            try:
                text = read(image_bytes)
            except (OcrError, ValueError, TypeError):
                raise
            except Exception as error:  # noqa: BLE001 - network and provider errors
                raise OcrError("%s: %s" % (type(error).__name__, error)) from error
            if text and str(text).strip():
                return text
            last = text
            if attempt < attempts:
                sleep(delay)
        raise OcrError("The vision model returned nothing after %d attempts." % attempts)
    return reader


def make_reader(config=None, secrets=None):
    """Build the read(image_bytes) callable for the configured provider."""
    config = config or load_config()
    secrets = secrets if secrets is not None else load_secrets()
    provider = str(config.get("provider", "deepseek")).lower()
    section = config.get(provider)
    if not isinstance(section, dict):
        raise OcrError("Unknown OCR provider: %s" % provider)
    api_key = secrets.get(section.get("keyName", ""))
    if not api_key:
        raise OcrError(
            "%s is not set in %s. Add the key there; never paste a key into the module."
            % (section.get("keyName"), SECRETS_FILE)
        )
    if provider == "deepseek":
        return with_retry(lambda image_bytes: read_with_deepseek(image_bytes, section, api_key))
    if provider == "gemini":
        return with_retry(lambda image_bytes: read_with_gemini(image_bytes, section, api_key))
    raise OcrError("Unknown OCR provider: %s" % provider)


# --------------------------------------------------------------------------- the history grid

GRID_SIDE_BY_COLOUR = {"B": "banker", "P": "player", "T": "tie"}


def grid_markers(image_bytes, min_area=60, max_area=400, min_size=8, max_size=24, pitch=13.5):
    """Find the B/P/T markers on the history grid: [(side, x, y), ...] with no model call.

    The grid's circles are pure red (Banker), blue (Player) and green (Tie), so classifying them is a
    colour test rather than a reading. Measured on the user's table: the grid gains exactly one marker
    per hand, top to bottom within a column, and it shows the result before the panels finish flashing
    — so this answers in one frame instead of seconds, at no cost.
    """
    import cv2
    import numpy as np
    from PIL import Image
    with io.BytesIO(image_bytes) as buffer:
        with Image.open(buffer) as opened:
            rgb = np.array(opened.convert("RGB"))
    hsv = cv2.cvtColor(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), cv2.COLOR_BGR2HSV)
    masks = {
        "B": cv2.inRange(hsv, (0, 120, 90), (10, 255, 255)) | cv2.inRange(hsv, (170, 120, 90), (180, 255, 255)),
        "P": cv2.inRange(hsv, (100, 120, 90), (130, 255, 255)),
        "T": cv2.inRange(hsv, (40, 100, 60), (85, 255, 255)),
    }
    markers = []
    for side, mask in masks.items():
        count, _labels, stats, centroids = cv2.connectedComponentsWithStats(mask, 8)
        for index in range(1, count):
            x, y, width, height, area = stats[index]
            if min_area <= area <= max_area and min_size <= width <= max_size and min_size <= height <= max_size:
                markers.append((side, int(centroids[index][0]), int(centroids[index][1])))
    # A stable order, so the same frame always produces the same signature.
    return sorted(markers, key=lambda marker: (grid_cell(marker[1], pitch), grid_cell(marker[2], pitch)))


def grid_cell(position, pitch=13.5):
    """Which grid column/row a pixel position belongs to.

    Rounds rather than dividing with floor: markers are one pitch apart, and floor-division put two
    neighbouring rows in the same bucket whenever the measured pitch was slightly under the cell size
    — which made a new marker look like no change at all (caught by the tests).
    """
    return int(round(float(position) / float(pitch))) if pitch else int(position)


def ensure_grid_region(panels_region, stored_region, capture=None):
    """A grid region that actually contains markers, re-finding it if the window has moved.

    A stored region goes stale when the casino window is moved or resized, and a stale region is worse
    than none: it points at whatever is now there (a chat window, measured on the user's screen) and
    the reader silently falls back to the model. So the region is only trusted while markers are
    visible in it; otherwise it is looked for again from the panels' region.
    """
    grab = capture or capture_region
    if stored_region:
        try:
            if grid_markers(grab(stored_region)):
                return list(stored_region)
        except Exception:  # noqa: BLE001 - a stored region that cannot be read is not trusted
            pass
    return find_grid_region(panels_region, capture=grab)


def grid_shot(image_bytes, max_width=640, padding=10, min_aspect=1.4):
    """A crisp picture of the history grid, cropped to its content, for the Hand History panel.

    The grid box has empty white columns to the right of the filled markers, which showed as dead
    space. Two rules keep the picture sane:

    * The full HEIGHT is always kept. A single filled column is tall and narrow; cropping to it and
      then stretching it to the panel's width made the markers gigantic (measured on the user's screen:
      it filled the panel and overflowed). A crop is only taken when what remains is still wide.
    * The upscale is capped, and nearest-neighbour, so the solid-colour markers stay crisp.
    """
    from PIL import Image
    with io.BytesIO(image_bytes) as buffer:
        with Image.open(buffer) as opened:
            image = opened.convert("RGB")
    markers = grid_markers(image_bytes)
    if markers:
        left = max(0, min(m[1] for m in markers) - padding)
        right = min(image.width, max(m[1] for m in markers) + padding + 1)
        width, height = right - left, image.height
        # Only cut the empty columns away while the result is still wider than it is tall (by
        # min_aspect). Otherwise keep the whole box, which is reliably wide.
        if width >= 24 and width >= min_aspect * height:
            image = image.crop((left, 0, right, height))
    if image.width < max_width:
        factor = min(2, max(1, int(round(float(max_width) / image.width))))
        if factor > 1:
            image = image.resize((image.width * factor, image.height * factor), Image.NEAREST)
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue(), len(markers)


class GridWatcher:
    """Read the result the moment a new marker appears on the history grid.

    Same shape of decision as OcrReader, so the monitor and the modes treat it identically — but with
    no model call at all. The structural check is that EXACTLY ONE marker appeared: a new shoe (many
    markers at once) is a baseline, not a result.
    """

    def __init__(self, capture=None, clock=time.sleep, pitch=13.5):
        self.capture = capture or capture_region
        self.clock = clock
        self.pitch = pitch
        self.last = None
        self.last_signature = None

    def _cells(self, markers):
        return {(grid_cell(x, self.pitch), grid_cell(y, self.pitch)): side for side, x, y in markers}

    def scan(self, region, known_signatures):
        image = self.capture(region)
        frame = {"frame": image}
        current = self._cells(grid_markers(image, pitch=self.pitch))
        if len(current) < 2:
            return {"status": "unclear", "signature": None, "result": None,
                    "note": "no history grid found in the region (%d marker(s))" % len(current), **frame}

        if self.last is None:
            self.last = current
            return {"status": "unchanged", "signature": None, "result": None, **frame}

        appeared = [key for key in current if key not in self.last]
        if not appeared:
            # Markers can also move (a column scrolls); treat any change that adds nothing as noise.
            self.last = current
            return {"status": "unchanged", "signature": None, "result": None, **frame}
        if len(appeared) > 1:
            # Many at once: a new shoe, or the grid re-rendered. Re-baseline rather than guess.
            self.last = current
            return {"status": "unchanged", "signature": None, "result": None,
                    "note": "grid re-drawn (%d markers appeared) — baseline reset" % len(appeared), **frame}

        key = appeared[0]
        side = current[key]
        signature = "grid-%d-%d-%s-%d" % (key[0], key[1], side, len(current))
        self.last = current
        self.last_signature = signature
        if signature in known_signatures:
            return {"status": "duplicate", "signature": signature, "result": None, **frame}
        return {
            "status": "candidate",
            "signature": signature,
            "result": GRID_SIDE_BY_COLOUR.get(side),
            "confidence": 0.99,
            "evidence": "a new %s marker appeared on the history grid (column %d, row %d)"
                        % (side, key[0], key[1]),
            "reads": [{"result": GRID_SIDE_BY_COLOUR.get(side), "confidence": 0.99}],
            "singleRead": True,
            "readMs": 0,
            **frame,
        }


def find_grid_region(panels_region, capture=None, look_left=340, extra_bottom=60):
    """Find the white history grid that sits to the left of the betting panels.

    The panels' region is already calibrated and the grid is immediately left of it, so the grid does
    not need calibrating separately — look for near-white rectangles there and take the closest one
    that ACTUALLY CONTAINS B/P/T markers.

    That verification matters: the first version returned the largest white box, and on the user's
    screen that was their chat window, not the grid — the reader then found no markers there and
    silently fell back to the model. A candidate that cannot be read is not the grid.
    """
    import cv2
    import numpy as np
    from PIL import Image
    x, y, width, height = [int(value) for value in panels_region]
    screen = screen_size()
    left = max(0, x - int(look_left))
    # Cover the panels' own width too: on the user's table the grid sits INSIDE the calibrated region's
    # x range, so a probe that only looked to the left missed it entirely and found a chat window.
    probe = [left, y, (x + width) - left, min(height + int(extra_bottom), screen[1] - y)]
    if probe[2] <= 20 or probe[3] <= 20:
        return None
    image = (capture or capture_region)(probe)
    with io.BytesIO(image) as buffer:
        with Image.open(buffer) as opened:
            rgb = np.array(opened.convert("RGB"))
    gray = cv2.cvtColor(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), cv2.COLOR_BGR2GRAY)
    white = cv2.inRange(gray, 235, 255)
    white = cv2.morphologyEx(white, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    count, _labels, stats, _centroids = cv2.connectedComponentsWithStats(white, 8)
    candidates = []
    for index in range(1, count):
        bx, by, bw, bh, area = stats[index]
        if bw < 60 or bh < 40:              # too small to be the plate
            continue
        if area < 0.35 * bw * bh:           # too sparse to be a solid white box
            continue
        candidates.append((bx, by, bw, bh, area))
    # Closest to the panels first: the grid sits immediately beside them, a chat panel does not.
    candidates.sort(key=lambda box: (box[0] + box[2]) - x, reverse=True)
    grab = capture or capture_region
    for bx, by, bw, bh, _area in candidates:
        region = [int(left + bx), int(y + by), int(bw), int(bh)]
        try:
            if grid_markers(grab(region)):
                return region
        except Exception:  # noqa: BLE001 - a candidate that cannot be read is not the grid
            continue
    return None


def save_grid_region(profile_path, grid_region, when=None):
    """Remember where the history grid is, so it is found once and then reused."""
    if not (isinstance(grid_region, (list, tuple)) and len(grid_region) == 4
            and all(isinstance(int(value), int) for value in grid_region)):
        raise OcrError("Refusing to store a malformed grid region: %r" % (grid_region,))
    if not os.path.isfile(profile_path):
        raise OcrError("No such profile file: %s" % profile_path)
    with open(profile_path, "r", encoding="utf-8") as handle:
        profile = json.load(handle)
    profile["gridRegion"] = [int(value) for value in grid_region]
    profile["gridRegionAt"] = when or time.strftime("%Y-%m-%dT%H:%M:%S")
    with open(profile_path, "w", encoding="utf-8") as handle:
        json.dump(profile, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    return profile


# --------------------------------------------------------------------------- the reader


class OcrReader:
    """One scan decision at a time. Pure enough to test: capture and read are injected."""

    def __init__(self, capture=None, read=None, config=None, clock=time.sleep):
        self.config = config or load_config()
        self.capture = capture or capture_region
        self.read = read or make_reader(self.config)
        self.clock = clock
        self.last_signature = None

    def scan(self, region, known_signatures):
        """Take one decision.

        Returns a dict with:
          status: "unchanged" | "unclear" | "candidate" | "duplicate"
          signature, result, confidence, evidence, reads
        A candidate is a result that survived a double read over a stable region and has not been
        recorded before.
        """
        scan_config = self.config.get("scan", DEFAULT_CONFIG["scan"])
        first = self.capture(region)
        first_hash = region_signature(first)
        # The frame travels with the decision so the panel can show exactly what was looked at. It is
        # never logged (the server builds its log entries field by field) and never sent to a model
        # beyond the read itself.
        frame = {"frame": first}

        if first_hash in known_signatures:
            # Durable guard first: a signature already attached to a recorded hand is a duplicate
            # even if this reader has never seen it — after a restart, or from a second window.
            self.last_signature = first_hash
            return {"status": "duplicate", "signature": first_hash, "result": None, **frame}
        if first_hash == self.last_signature:
            # Fast path: nothing on screen has changed since the last look.
            return {"status": "unchanged", "signature": first_hash, "result": None, **frame}

        # A change was detected. Reading it immediately is how the reader caught a half-updated hand:
        # the totals settle, then the cards and amounts keep animating, and a read in the middle sees
        # a transition. The user's roulette monitor already solved this: it polls fast and WAITS for
        # the picture to stop moving before it reads, so it always reads a settled frame. Adopt that.
        stable_seconds = float(scan_config.get("stableSeconds", 0.75))
        stable_poll = float(scan_config.get("stablePollSeconds", 0.25))
        if stable_seconds > 0:
            stable_image = first
            stable_hash = first_hash
            stable_since = time.monotonic()
            deadline = time.monotonic() + max(2.5, stable_seconds * 3.0)
            while time.monotonic() < deadline:
                self.clock(stable_poll)
                next_image = self.capture(region)
                next_hash = region_signature(next_image)
                if next_hash != stable_hash:
                    stable_image = next_image
                    stable_hash = next_hash
                    stable_since = time.monotonic()
                elif time.monotonic() - stable_since >= stable_seconds:
                    break
            first = stable_image
            first_hash = stable_hash
            frame = {"frame": first}

        wanted_reads = max(1, int(scan_config.get("stableReads", 2)))
        delay = float(scan_config.get("confirmDelaySeconds", 0.4))
        # A clear reading is accepted on ONE model call: two calls per hand put the answer ~5-16s
        # after the hand settled, by which time the user had already watched the next hand start
        # (measured on their table). The second read is kept for readings that are not certain, which
        # is where the agreement check earns its latency.
        single_read_bar = float(scan_config.get("singleReadConfidence", 0.93))
        started = time.time()
        try:
            first_read = parse_result_json(self.read(first))
        except OcrError as error:
            # An unreadable reply must not kill the scan: that left the reader retrying the same frame
            # forever (measured live — scans stuck at 1 while the table moved on). Record it as this
            # frame's answer and move on; the note is what the panel shows.
            self.last_signature = first_hash
            return {"status": "unclear", "signature": first_hash, "result": None,
                    "note": "the model's reply could not be read: %s" % error,
                    "readMs": int((time.time() - started) * 1000), **frame}
        reads = [first_read]
        decisive = bool(first_read["result"]) and first_read["confidence"] >= single_read_bar

        if wanted_reads > 1 and not decisive:
            self.clock(delay)
            second = self.capture(region)
            second_hash = region_signature(second)
            try:
                second_read = parse_result_json(self.read(second))
            except OcrError as error:
                self.last_signature = first_hash
                return {"status": "unclear", "signature": first_hash, "result": None,
                        "note": "the second read could not be read: %s" % error,
                        "readMs": int((time.time() - started) * 1000), "frame": second}
            reads.append(second_read)
            moved = second_hash != first_hash
            if second_read["result"] != first_read["result"]:
                # The two reads must agree on the RESULT. Requiring the two pictures to be identical
                # as well looked safer but broke every real table: live bet amounts, countdowns and
                # timers change within the delay, so a pixel-identical rule cancelled every reading
                # and the reader silently produced nothing, forever. Measured on the user's table:
                # 0 candidates in 25 scans while direct reads of the same region read the hand fine.
                return {"status": "unclear", "signature": first_hash, "result": None,
                        "note": "the two reads disagreed: %r vs %r%s"
                                % (first_read["result"], second_read["result"],
                                   " (and the picture changed between them)" if moved else ""),
                        "reads": reads, **frame}

        decision = reads[-1]
        self.last_signature = first_hash
        elapsed_ms = int((time.time() - started) * 1000)

        if not decision["result"]:
            return {"status": "unclear", "signature": first_hash, "result": None,
                    "note": decision.get("evidence", ""), "reads": reads,
                    "readMs": elapsed_ms, **frame}

        minimum = float(scan_config.get("minConfidence", 0.5))
        if decision["confidence"] < minimum:
            return {"status": "unclear", "signature": first_hash, "result": decision["result"],
                    "note": "confidence %.2f is below the %.2f threshold"
                            % (decision["confidence"], minimum), "reads": reads,
                    "readMs": elapsed_ms, **frame}

        return {
            "status": "candidate",
            "signature": first_hash,
            "result": decision["result"],
            "confidence": decision["confidence"],
            "evidence": decision.get("evidence", ""),
            "reads": reads,
            "readMs": elapsed_ms,
            "singleRead": bool(decisive),
            **frame,
        }


class OcrMonitor:
    """Background scanner. Never writes state itself; it hands decisions to a handler."""

    def __init__(self, store, handler, capture=None, read=None, interval=None, config=None):
        self.store = store
        self.handler = handler          # callable(decision) -> None, supplied by the server
        self.config = config or load_config()
        self.interval = interval or float(
            self.config.get("scan", DEFAULT_CONFIG["scan"]).get("intervalSeconds", 1.5))
        # Built lazily in start(): the provider reader needs the API key, and a missing key must
        # surface as "OCR is not ready" in the UI rather than as an import error in the server.
        self._capture = capture
        self._read = read
        self.reader = None
        self._thread = None
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self.status = {
            "running": False,
            "phase": "stopped",
            "mode": "manual",
            "profile": None,
            "region": None,
            "message": "OCR is stopped.",
            "lastScanAt": None,
            "scans": 0,
            "candidates": 0,
            "duplicates": 0,
            "error": "",
        }

    # ------------------------------------------------------------------ status
    def snapshot(self):
        with self._lock:
            status = dict(self.status)
        # The last frame is raw PNG bytes: it is served by its own endpoint, never inside the JSON
        # status payload.
        status.pop("lastFrame", None)
        return status

    def set_status(self, **fields):
        """Public status update, for callers outside the scan loop (the server controller)."""
        self._set(**fields)

    def _set(self, **fields):
        with self._lock:
            self.status.update(fields)

    def _bump(self, field, amount=1):
        with self._lock:
            self.status[field] = self.status.get(field, 0) + amount

    # ------------------------------------------------------------------ control
    def start(self, region, mode, profile_id, grid_region=None):
        if self.is_running():
            return self.snapshot()
        if self.reader is None:
            self.reader = OcrReader(capture=self._capture, read=self._read, config=self.config)
        self._stop.clear()
        scan_config = self.config.get("scan", DEFAULT_CONFIG["scan"])
        source = str(scan_config.get("source", "auto")).lower()
        self.grid_region = grid_region
        self.grid_reader = None
        self.source = "model"
        if source in ("grid", "auto") and grid_region:
            self.grid_reader = GridWatcher(capture=self._capture, pitch=float(scan_config.get("gridPitch", 13.5)))
            self.source = "grid"
        # Polling the grid costs a screenshot, not a model call, so it can be watched much faster.
        self.interval = float(scan_config.get("gridIntervalSeconds", 0.25)) if self.grid_reader \
            else float(scan_config.get("intervalSeconds", 0.6))
        self._set(running=True, phase="watching", mode=mode, region=list(region), profile=profile_id,
                  gridRegion=list(grid_region) if grid_region else None, source=self.source,
                  message="Watching the history grid for a new marker." if self.grid_reader
                          else "Watching the region for a new hand.",
                  error="", scans=0, candidates=0, duplicates=0)
        self._thread = threading.Thread(target=self._loop, args=(list(region), mode), daemon=True)
        self._thread.start()
        return self.snapshot()

    def stop(self):
        self._stop.set()
        thread = self._thread
        if thread and thread.is_alive():
            thread.join(timeout=5)
        self._thread = None
        self._set(running=False, phase="stopped", message="OCR is stopped.")
        return self.snapshot()

    def is_running(self):
        return bool(self._thread and self._thread.is_alive())

    # ------------------------------------------------------------------ loop
    def _known_signatures(self, session):
        return {hand.get("signature") for hand in session.get("hands", []) if hand.get("signature")}

    def latest_frame(self):
        """The most recent picture the reader looked at: (png_bytes, when, signature) or (None, ...).

        The panel shows this so "no result" can be diagnosed by looking, rather than by guessing.
        """
        with self._lock:
            return self.status.get("lastFrame"), self.status.get("lastFrameAt"), \
                self.status.get("lastFrameSignature")

    def remember_frame(self, frame, signature, read_ms=None, single=None):
        if not frame:
            return
        with self._lock:
            self.status["lastFrame"] = frame
            self.status["lastFrameAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
            self.status["lastFrameSignature"] = signature
            if read_ms is not None:
                self.status["lastReadMs"] = read_ms
                # A rolling average over the last few reads: the number that says whether the reader is
                # fast enough for the table it is watching.
                history = list(self.status.get("readHistory") or [])[-9:]
                history.append(read_ms)
                self.status["readHistory"] = history
                self.status["avgReadMs"] = int(sum(history) / len(history))
            if single is not None:
                self.status["lastSingleRead"] = bool(single)

    def _loop(self, region, mode):
        while not self._stop.is_set():
            try:
                session = self.store.load()
                known = self._known_signatures(session) if session else set()
                decision = None
                used = "model"
                if self.grid_reader is not None and self.grid_region:
                    decision = self.grid_reader.scan(self.grid_region, known)
                    used = "grid"
                    if decision["status"] == "unclear" and str(self.source) == "grid" \
                            and str(self.config.get("scan", {}).get("source", "auto")).lower() == "auto":
                        # The grid could not be read (not calibrated, hidden, re-drawn): fall back to
                        # reading the panels with the model rather than missing the hand entirely.
                        decision = self.reader.scan(region, known)
                        used = "model"
                if decision is None:
                    decision = self.reader.scan(region, known)
                    used = "model"
                self._set(lastSource=used)
                self.remember_frame(decision.get("frame"), decision.get("signature"),
                                    decision.get("readMs"), decision.get("singleRead"))
                self._bump("scans")
                self._set(lastScanAt=time.strftime("%Y-%m-%dT%H:%M:%S"))
                if decision["status"] == "unchanged":
                    self._set(message="Watching the region for a new hand.", phase="watching")
                elif decision["status"] == "duplicate":
                    self._bump("duplicates")
                    self._set(phase="watching",
                              message="That hand was already recorded, so it was ignored.")
                elif decision["status"] == "unclear":
                    self._set(phase="watching",
                              message="No clear result: %s" % (decision.get("note") or "nothing detected"))
                elif decision["status"] == "candidate":
                    self._bump("candidates")
                    self.handler(decision, mode)
            except Exception as error:  # noqa: BLE001 - the loop must survive a bad read
                self._set(phase="error", error="%s: %s" % (type(error).__name__, error),
                          message="OCR error: %s" % error)
                time.sleep(max(2.0, self.interval))
                continue
            # Stop quickly when asked, instead of sleeping through a full interval.
            self._stop.wait(self.interval)
        self._set(phase="stopped", message="OCR is stopped.")
