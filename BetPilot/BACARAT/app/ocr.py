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
        "intervalSeconds": 1.5,
        "confirmDelaySeconds": 1.5,
        "stableReads": 2,
        "minConfidence": 0.5,
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
    "- A wrong result is worse than no result."
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


def capture_region(region):
    """Screenshot a (x, y, width, height) region and return PNG bytes."""
    import pyautogui
    x, y, width, height = [int(value) for value in region]
    if width <= 0 or height <= 0:
        raise OcrError("Capture region has no area: %r" % (region,))
    image = pyautogui.screenshot(region=(x, y, width, height))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def screen_size():
    """The capture coordinate space, which is the same space calibrate.py measures in."""
    import pyautogui
    width, height = pyautogui.size()
    return [int(width), int(height)]


def capture_full_screen():
    width, height = screen_size()
    return capture_region([0, 0, width, height])


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
    # "length" — a good hand silently lost. Escalate the budget once when that happens, but keep the
    # ceiling modest: an image the model cannot settle within it is better treated as "no result"
    # (which the caller logs and the user records by hand) than left to stall the scan loop.
    for budget in (base_budget, base_budget * 2):
        response = client.chat.completions.create(
            model=section.get("model", DEFAULT_CONFIG["deepseek"]["model"]),
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
        "The vision model produced no content within a %d-token budget (finish_reason=%s). The image "
        "is probably too ambiguous to read; treat it as no result, or raise maxTokens for deepseek in "
        "config/ocr.json." % (base_budget * 2, last_finish)
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

        if first_hash in known_signatures:
            # Durable guard first: a signature already attached to a recorded hand is a duplicate
            # even if this reader has never seen it — after a restart, or from a second window.
            self.last_signature = first_hash
            return {"status": "duplicate", "signature": first_hash, "result": None}
        if first_hash == self.last_signature:
            # Fast path: nothing on screen has changed since the last look.
            return {"status": "unchanged", "signature": first_hash, "result": None}

        wanted_reads = max(1, int(scan_config.get("stableReads", 2)))
        delay = float(scan_config.get("confirmDelaySeconds", 1.5))
        first_read = parse_result_json(self.read(first))
        reads = [first_read]

        if wanted_reads > 1:
            self.clock(delay)
            second = self.capture(region)
            second_hash = region_signature(second)
            if second_hash != first_hash:
                # The display changed under us: the hand is not finished yet, or a new one is
                # arriving. Do not decide anything on a moving target.
                self.last_signature = None
                return {"status": "unchanged", "signature": second_hash, "result": None,
                        "note": "region changed between reads"}
            second_read = parse_result_json(self.read(second))
            reads.append(second_read)
            if second_read["result"] != first_read["result"]:
                return {"status": "unclear", "signature": first_hash, "result": None,
                        "note": "the two reads disagreed: %r vs %r"
                                % (first_read["result"], second_read["result"]), "reads": reads}

        decision = reads[-1]
        self.last_signature = first_hash

        if not decision["result"]:
            return {"status": "unclear", "signature": first_hash, "result": None,
                    "note": decision.get("evidence", ""), "reads": reads}

        minimum = float(scan_config.get("minConfidence", 0.5))
        if decision["confidence"] < minimum:
            return {"status": "unclear", "signature": first_hash, "result": decision["result"],
                    "note": "confidence %.2f is below the %.2f threshold"
                            % (decision["confidence"], minimum), "reads": reads}

        return {
            "status": "candidate",
            "signature": first_hash,
            "result": decision["result"],
            "confidence": decision["confidence"],
            "evidence": decision.get("evidence", ""),
            "reads": reads,
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
            return dict(self.status)

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
    def start(self, region, mode, profile_id):
        if self.is_running():
            return self.snapshot()
        if self.reader is None:
            self.reader = OcrReader(capture=self._capture, read=self._read, config=self.config)
        self._stop.clear()
        self._set(running=True, phase="watching", mode=mode, region=list(region), profile=profile_id,
                  message="Watching the region for a new hand.", error="", scans=0, candidates=0,
                  duplicates=0)
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

    def _loop(self, region, mode):
        while not self._stop.is_set():
            try:
                session = self.store.load()
                known = self._known_signatures(session) if session else set()
                decision = self.reader.scan(region, known)
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
