"""BetPilot — Baccarat local server.

Run:  python server.py
Open: http://127.0.0.1:8766/

The server owns the session state and the settlement rules. The browser is a view: it sends the
two inputs (bet side, casino result) and re-renders whatever the server returns. Nothing derived —
outcomes, commission, bankroll, P&L — is accepted from the client.

Deliberate differences from the Roulette dashboard server (casino-tracker/roulette/server.py):
  * binds to 127.0.0.1 only, because this server exposes state-changing endpoints;
  * keeps its state in BACARAT/data, so a browser refresh can never lose a session;
  * refuses to settle a hand twice, and refuses a second open bet (see settlement.py).
"""
import ctypes
import functools
import hashlib
import http.server
import io
import json
import os
import re
import secrets
import sys
import threading
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import settlement  # noqa: E402  (local module, path set above)

try:
    import ocr  # noqa: E402
    OCR_IMPORT_ERROR = ""
except Exception as _ocr_error:  # noqa: BLE001 - a missing OCR stack must not stop the module
    ocr = None
    OCR_IMPORT_ERROR = "%s: %s" % (type(_ocr_error).__name__, _ocr_error)

PORT = int(os.environ.get("BACCARAT_PORT", "8766"))
HOST = os.environ.get("BACCARAT_HOST", "127.0.0.1")
APP_DIR = os.path.normcase(os.path.realpath(os.path.dirname(os.path.abspath(__file__))))
MODULE_DIR = os.path.normcase(os.path.realpath(os.path.join(APP_DIR, "..")))
WEB_DIR = os.path.join(APP_DIR, "web")
DATA_DIR = os.path.normcase(os.path.realpath(os.environ.get("BACCARAT_DATA_DIR", os.path.join(MODULE_DIR, "data"))))
CONFIG_DIR = os.path.join(MODULE_DIR, "config")
SESSIONS_DIR = os.path.join(DATA_DIR, "sessions")
CURRENT_PATH = os.path.join(DATA_DIR, "current-session.json")

VERSION_PATH = os.path.join(MODULE_DIR, "VERSION")
try:
    with open(VERSION_PATH, "r", encoding="utf-8") as version_file:
        BUILD = version_file.read().strip()
except OSError as error:
    raise RuntimeError("Unable to read the Baccarat VERSION file: %s" % VERSION_PATH) from error
if not BUILD or "\n" in BUILD:
    raise RuntimeError("The Baccarat VERSION file must hold a single non-empty line: %s" % VERSION_PATH)

HEALTH_PATH = "/__baccarat_health__"
STATE_PATH = "/api/baccarat/state"
SESSION_PATH = "/api/baccarat/session"
HAND_PATH = "/api/baccarat/hand"
END_PATH = "/api/baccarat/end"
REOPEN_PATH = "/api/baccarat/reopen"
HISTORY_PATH = "/api/baccarat/history"
EXPORT_PATH = "/api/baccarat/export"
PROFILES_PATH = "/api/baccarat/profiles"
TOPMOST_PATH = "/api/window/topmost"
OCR_PREFIX = "/api/baccarat/ocr"
OCR_STATUS_PATH = OCR_PREFIX + "/status"
OCR_START_PATH = OCR_PREFIX + "/start"
OCR_STOP_PATH = OCR_PREFIX + "/stop"
OCR_CONFIRM_PATH = OCR_PREFIX + "/confirm"
OCR_REJECT_PATH = OCR_PREFIX + "/reject"
OCR_EVENTS_PATH = OCR_PREFIX + "/events"
OCR_SAMPLE_PATH = OCR_PREFIX + "/sample"
OCR_LOCATE_PATH = OCR_PREFIX + "/locate"
OCR_SCREEN_PATH = OCR_PREFIX + "/screen"
OCR_REGION_PATH = OCR_PREFIX + "/region"
OCR_EVENT_LOG = os.path.join(DATA_DIR, "ocr-events.jsonl")

INSTANCE_KEY = os.environ.get("BACCARAT_INSTANCE_KEY", APP_DIR)
MUTEX_NAME = "Local\\BetPilotBaccarat-" + hashlib.sha256(INSTANCE_KEY.encode("utf-8")).hexdigest()[:20]

WINDOW_TITLES = {
    "table": "BetPilot Baccarat",
}


def set_window_topmost(target, enabled):
    """Toggle always-on-top for the Baccarat window (same approach as the Roulette dashboard)."""
    if os.name != "nt":
        return 0
    title_fragment = WINDOW_TITLES.get(str(target or "").lower())
    if not title_fragment:
        raise ValueError("Unknown Baccarat window target.")
    user32 = ctypes.windll.user32
    user32.SetWindowPos.argtypes = [
        ctypes.c_void_p, ctypes.c_void_p,
        ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_uint,
    ]
    user32.SetWindowPos.restype = ctypes.c_bool
    matches = []
    callback_type = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)

    def visit(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        if length <= 0:
            return True
        title = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, title, length + 1)
        if title_fragment in title.value:
            matches.append(hwnd)
        return True

    user32.EnumWindows(callback_type(visit), 0)
    insert_after = ctypes.c_void_p(-1 if enabled else -2)  # HWND_TOPMOST / HWND_NOTOPMOST
    flags = 0x0001 | 0x0002 | 0x0010  # NOSIZE | NOMOVE | NOACTIVATE
    for hwnd in matches:
        user32.SetWindowPos(hwnd, insert_after, 0, 0, 0, 0, flags)
    return len(matches)


class StateError(Exception):
    """A rejected state change. The HTTP layer turns these into 400/409 responses."""

    def __init__(self, message, code="invalid", status=400):
        super().__init__(message)
        self.code = code
        self.status = status


class SessionStore:
    """Owns the current session file. Every mutation derives, validates, then writes atomically."""

    def __init__(self):
        self._lock = threading.Lock()

    # ---------------------------------------------------------------- file helpers
    @staticmethod
    def _write_atomic(path, text):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        temporary = path + ".tmp"
        with open(temporary, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)

    def load(self):
        if not os.path.isfile(CURRENT_PATH):
            return None
        try:
            with open(CURRENT_PATH, "r", encoding="utf-8") as handle:
                session = json.load(handle)
        except (OSError, json.JSONDecodeError):
            return None
        if not isinstance(session, dict) or not isinstance(session.get("hands"), list):
            return None
        return session

    def save(self, session):
        self._write_atomic(CURRENT_PATH, json.dumps(session, indent=2, ensure_ascii=False))
        return session

    def clear(self):
        if os.path.isfile(CURRENT_PATH):
            os.remove(CURRENT_PATH)

    def archive(self, session):
        os.makedirs(SESSIONS_DIR, exist_ok=True)
        path = os.path.join(SESSIONS_DIR, "%s.json" % session["id"])
        self._write_atomic(path, json.dumps(session, indent=2, ensure_ascii=False))
        return path

    def history(self, limit=50):
        if not os.path.isdir(SESSIONS_DIR):
            return []
        entries = []
        for name in sorted(os.listdir(SESSIONS_DIR), reverse=True):
            if not name.endswith(".json"):
                continue
            path = os.path.join(SESSIONS_DIR, name)
            try:
                with open(path, "r", encoding="utf-8") as handle:
                    session = json.load(handle)
                derived = settlement.derive(session)
            except (OSError, json.JSONDecodeError, settlement.SettlementError, KeyError):
                continue
            entries.append({
                "id": session.get("id"),
                "casino": session.get("casino"),
                "provider": session.get("provider"),
                "layout": session.get("layout"),
                "startedAt": session.get("startedAt"),
                "endedAt": session.get("endedAt"),
                "hands": derived["totalHands"],
                "wins": derived["wins"],
                "losses": derived["losses"],
                "pushes": derived["pushes"],
                "voids": derived["voids"],
                "netCents": derived["netCents"],
                "bankrollCents": derived["bankrollCents"],
            })
            if len(entries) >= limit:
                break
        return entries

    # ------------------------------------------------------------------- mutations
    def create(self, payload, force=False):
        with self._lock:
            existing = self.load()
            if existing and existing.get("status") == "active" and not force:
                raise StateError(
                    "A session is already open. End it first, or pass force to replace it.",
                    "session-exists",
                    409,
                )
            starting_units = payload.get("startingUnits", 0)
            unit_value = payload.get("unitValueCents", 500)
            if isinstance(starting_units, bool) or not isinstance(starting_units, int) or starting_units < 0:
                raise StateError("Starting units must be a whole number of 0 or more.", "bad-start")
            if isinstance(unit_value, bool) or not isinstance(unit_value, int) or not 0 < unit_value <= settlement.LIMITS["maxUnitValueCents"]:
                raise StateError("Unit value must be a whole number of cents.", "bad-unit-value")
            mode = str(payload.get("mode") or "manual").lower()
            if mode not in ("manual", "observe", "confirm", "auto"):
                mode = "manual"
            session = {
                "schema": 2,
                "id": "%s-%s" % (time.strftime("%Y%m%d-%H%M%S"), secrets.token_hex(2)),
                "casino": str(payload.get("casino") or "")[:80],
                "provider": str(payload.get("provider") or "")[:40],
                "layout": str(payload.get("layout") or "")[:60],
                "mode": mode,
                "status": "active",
                "startedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "endedAt": None,
                "rules": settlement.normalize_rules(payload.get("rules")),
                "startingUnits": starting_units,
                "unitValueCents": unit_value,
                "seq": 1,
                "hands": [],
                "openWagers": [],
            }
            if existing and existing.get("status") != "active":
                self.archive(existing)
            return self.save(session)

    def _require(self):
        session = self.load()
        if not session:
            raise StateError("There is no session yet.", "no-session", 409)
        return session

    @staticmethod
    def _require_active(session):
        if session.get("status") != "active":
            raise StateError("This session has ended.", "session-ended", 409)
        return session

    def place(self, payload):
        with self._lock:
            session = self._require_active(self._require())
            side = settlement.normalize_side(payload.get("side"))
            wagers = settlement.open_wagers(session)

            if side == "pass":
                # PASS opens the hand with nothing at risk so the table's result can still be
                # recorded when it lands. No stake, no bankroll movement, never a win or a loss.
                # The request shape is checked before the hand's state so a staked pass says so.
                stake = payload.get("stakeUnits")
                if isinstance(stake, bool) or (stake is not None and stake != 0):
                    raise StateError("A pass has no stake — there is no money at risk.", "bad-stake")
                if any(wager.get("side") == "pass" for wager in wagers):
                    raise StateError("This hand is already marked as a pass.", "duplicate-wager", 409)
                if wagers:
                    raise StateError("This hand already has a bet on it — remove it before passing.",
                                     "conflicting-wager", 409)
                session["openWagers"] = [{
                    "side": "pass",
                    "stakeUnits": 0,
                    "stakeCents": 0,
                    "placedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
                }]
                return self.save(session)

            # One wager per side; Banker and Player are mutually exclusive; Tie is optional.
            if any(wager.get("side") == "pass" for wager in wagers):
                raise StateError("This hand is marked as a pass — remove it before placing a bet.",
                                 "pass-open", 409)
            if any(wager.get("side") == side for wager in wagers):
                raise StateError("A %s bet is already on this hand." % side, "duplicate-wager", 409)
            if side in ("banker", "player"):
                opposite = "player" if side == "banker" else "banker"
                if any(wager.get("side") == opposite for wager in wagers):
                    raise StateError("Banker and Player cannot both be bet on the same hand.",
                                     "conflicting-wager", 409)

            stake_units = payload.get("stakeUnits")
            if isinstance(stake_units, bool) or not isinstance(stake_units, int) or stake_units < 1:
                raise StateError("Stake must be a whole number of 1 unit or more.", "bad-stake")
            if stake_units > settlement.LIMITS["maxUnits"]:
                raise StateError("Stake exceeds the %s-unit ceiling." % settlement.LIMITS["maxUnits"], "stake-too-large")

            derived = settlement.derive(session)
            stake_cents = stake_units * session["unitValueCents"]
            committed = sum((wager.get("stakeUnits") or 0) * session["unitValueCents"] for wager in wagers)
            if committed + stake_cents > derived["bankrollCents"]:
                raise StateError(
                    "This would commit %s of a %s bankroll (already open: %s)."
                    % (settlement.format_cents(committed + stake_cents),
                       settlement.format_cents(derived["bankrollCents"]),
                       settlement.format_cents(committed)),
                    "stake-over-bankroll",
                )

            wagers.append({
                "side": side,
                "stakeUnits": stake_units,
                "stakeCents": stake_cents,
                "placedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
            })
            session["openWagers"] = wagers
            return self.save(session)

    def settle(self, payload):
        with self._lock:
            session = self._require_active(self._require())
            wagers = settlement.open_wagers(session)
            if not wagers:
                raise StateError("There is no open bet to settle.", "no-open-bet", 409)
            if len(session.get("hands", [])) >= settlement.LIMITS["maxHands"]:
                raise StateError("This session has reached its hand limit.", "too-many-hands")

            result = settlement.normalize_result(payload.get("result"))
            if result is None:
                raise StateError("A result is required to settle this hand.", "missing-result")

            # Every open wager settles from the one result the table showed.
            settled_wagers = []
            for wager in wagers:
                settled = settlement.settle(wager.get("side"), result, wager.get("stakeUnits"),
                                            session["unitValueCents"], session.get("rules"))
                settled_wagers.append({
                    "side": settled["side"],
                    "stakeUnits": settled["stakeUnits"],
                    "stakeCents": settled["stakeCents"],
                    "outcome": settled["outcome"],
                    "profitCents": settled["profitCents"],
                    "commissionCents": settled["commissionCents"],
                })

            session.setdefault("hands", []).append({
                "wagers": settled_wagers,
                "result": result,
                "source": "ocr" if payload.get("source") == "ocr" else "manual",
                # The screen signature that produced this hand. Stored so the OCR can prove a read
                # has not already been recorded, even across a restart.
                "signature": str(payload.get("signature") or "") or None,
                "at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            })
            session["openWagers"] = []
            session["seq"] = len(session["hands"]) + 1
            return self.save(session)

    def record_pass(self, payload):
        with self._lock:
            session = self._require_active(self._require())
            if settlement.open_wagers(session):
                raise StateError("Settle or cancel the open bet before recording a no-bet hand.", "bet-already-open", 409)
            result = settlement.normalize_result(payload.get("result"))
            session.setdefault("hands", []).append({
                "wagers": [{"side": "pass", "stakeUnits": 0, "stakeCents": 0}],
                "result": result,
                "source": "ocr" if payload.get("source") == "ocr" else "manual",
                "signature": str(payload.get("signature") or "") or None,
                "at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            })
            session["seq"] = len(session["hands"]) + 1
            return self.save(session)

    def cancel(self):
        with self._lock:
            session = self._require_active(self._require())
            if not settlement.open_wagers(session):
                raise StateError("There is no open bet to cancel.", "no-open-bet", 409)
            session["openWagers"] = []
            return self.save(session)

    def remove_wager(self, payload):
        """Take one wager off the open hand, leaving the rest in place."""
        with self._lock:
            session = self._require_active(self._require())
            side = settlement.normalize_side(payload.get("side"))
            wagers = settlement.open_wagers(session)
            remaining = [wager for wager in wagers if wager.get("side") != side]
            if len(remaining) == len(wagers):
                raise StateError("There is no open %s bet on this hand." % side, "no-open-wager", 409)
            session["openWagers"] = remaining
            return self.save(session)

    def undo(self):
        with self._lock:
            session = self._require_active(self._require())
            if not session.get("hands"):
                raise StateError("There is nothing to undo.", "nothing-to-undo", 409)
            session["hands"].pop()
            session["seq"] = len(session["hands"]) + 1
            return self.save(session)

    def end(self):
        with self._lock:
            session = self._require_active(self._require())
            if settlement.open_wagers(session):
                raise StateError("Settle or cancel the open bet before ending the session.", "bet-already-open", 409)
            session["status"] = "ended"
            session["endedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
            self.archive(session)
            return self.save(session)

    def reopen(self):
        with self._lock:
            session = self._require()
            session["status"] = "active"
            session["endedAt"] = None
            return self.save(session)

    def set_mode(self, mode):
        """Keep the session's recorded entry mode in step with the OCR panel."""
        with self._lock:
            session = self.load()
            if not session:
                return None
            if mode in ("manual", "observe", "confirm", "auto"):
                session["mode"] = mode
                return self.save(session)
            return session

    def hand_signatures(self):
        session = self.load()
        if not session:
            return set()
        return {hand.get("signature") for hand in session.get("hands", []) if hand.get("signature")}


STORE = SessionStore()

# Actions that mean "the reader produced a candidate the user or the auto rule acted on".
# start/stop are lifecycle, and "ignored"/"error" do not reflect a reading's accuracy.
OCR_READING_ACTIONS = ("observed", "observed-no-open-bet", "confirmed", "confirmed-corrected",
                       "rejected", "auto-settled")
OCR_ACCEPTED_ACTIONS = ("observed", "observed-no-open-bet", "confirmed", "confirmed-corrected",
                        "auto-settled")


def ocr_event_stats(max_lines=20000):
    """Summarise the OCR audit log: how many readings, how many needed correcting.

    This is the evidence for trusting Automatic mode. Until the reader has a real record on the
    user's table, the honest answer is "no readings yet".
    """
    stats = {
        "readings": 0, "accepted": 0, "corrected": 0, "rejected": 0, "errors": 0,
        "autoSettled": 0, "observed": 0,
        "accuracyPercent": None, "firstAt": None, "lastAt": None,
        "verdict": "No readings yet. Start the reader in Confirm mode and approve a few hands.",
        "log": OCR_EVENT_LOG,
    }
    if not os.path.isfile(OCR_EVENT_LOG):
        return stats

    try:
        with open(OCR_EVENT_LOG, "r", encoding="utf-8") as handle:
            lines = handle.readlines()[-max_lines:]
    except OSError as error:
        stats["verdict"] = "The OCR audit log could not be read: %s" % error
        return stats

    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        action = str(event.get("action") or "")
        at = event.get("at")
        if at:
            stats["firstAt"] = stats["firstAt"] or at
            stats["lastAt"] = at
        if action in OCR_READING_ACTIONS:
            stats["readings"] += 1
        if action in OCR_ACCEPTED_ACTIONS:
            stats["accepted"] += 1
        if action == "rejected":
            stats["rejected"] += 1
        if action == "error":
            stats["errors"] += 1
        if action == "auto-settled":
            stats["autoSettled"] += 1
        if action in ("observed", "observed-no-open-bet"):
            stats["observed"] += 1
        # "confirmed-corrected" means the user had to fix the reading.
        if action == "confirmed-corrected":
            stats["corrected"] += 1

    if stats["accepted"]:
        clean = stats["accepted"] - stats["corrected"]
        stats["accuracyPercent"] = round((clean / stats["accepted"]) * 100, 1)

    readings = stats["readings"]
    if readings == 0:
        stats["verdict"] = "No readings yet. Start the reader in Confirm mode and approve a few hands."
    elif readings < 20:
        stats["verdict"] = ("Only %d reading%s so far — too few to judge. Keep using Confirm mode."
                            % (readings, "" if readings == 1 else "s"))
    elif stats["corrected"] == 0:
        stats["verdict"] = ("%d readings with no corrections. Automatic mode is reasonable now, but "
                            "watch the first few hands." % readings)
    elif stats["accuracyPercent"] is not None and stats["accuracyPercent"] >= 95:
        stats["verdict"] = ("%d readings, %.1f%% needed no correction. Automatic is workable; keep "
                            "an eye on it." % (readings, stats["accuracyPercent"]))
    else:
        stats["verdict"] = ("%d readings and %.1f%% needed no correction — too error-prone for "
                            "Automatic. Stay on Confirm, and check the region and the crop."
                            % (readings, stats["accuracyPercent"] or 0.0))
    return stats


class OcrController:
    """Owns the OCR monitor and turns its decisions into recorded hands.

    The controller never writes session state directly: it calls the same store methods the UI does,
    so every guard (one open bet, no double settle, no stake over bankroll) still applies to OCR.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self.pending = None
        self.events = []
        self.monitor = None
        self._verify_reader = None
        if ocr is not None:
            self.monitor = ocr.OcrMonitor(STORE, self._on_candidate)

    # ------------------------------------------------------------------ helpers
    def _log(self, entry):
        entry["at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        with self._lock:
            self.events.append(entry)
            self.events = self.events[-200:]
            pending_events = list(self.events)
        try:
            os.makedirs(DATA_DIR, exist_ok=True)
            with open(OCR_EVENT_LOG, "a", encoding="utf-8") as handle:
                handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
        except OSError:
            pass
        return pending_events

    def status(self):
        if ocr is None:
            return {
                "ok": True,
                "available": False,
                "missing": ["the OCR module failed to import: %s" % OCR_IMPORT_ERROR],
                "provider": None,
                "providers": {},
                "status": {"running": False, "phase": "unavailable", "mode": "manual",
                           "message": "OCR is unavailable in this Python environment.", "error": OCR_IMPORT_ERROR},
                "pending": None,
                "stats": ocr_event_stats(),
                "events": self.events[-20:],
            }
        availability = ocr.describe_availability()
        with self._lock:
            pending = dict(self.pending) if self.pending else None
        return {
            "ok": True,
            "available": availability["available"],
            "missing": availability["missing"],
            "provider": availability["provider"],
            "providers": availability["providers"],
            "secretsFile": availability["secretsFile"],
            "status": self.monitor.snapshot() if self.monitor else {},
            "pending": pending,
            "stats": ocr_event_stats(),
            "events": self.events[-20:],
        }

    # ------------------------------------------------------------------ control
    def start(self, payload):
        if ocr is None:
            raise StateError("OCR is unavailable: %s" % OCR_IMPORT_ERROR, "ocr-unavailable", 503)
        availability = ocr.describe_availability()
        if not availability["available"]:
            raise StateError("OCR cannot start yet. Missing: %s" % "; ".join(availability["missing"]),
                             "ocr-not-ready", 409)

        mode = str(payload.get("mode") or "").lower()
        if mode not in ("observe", "confirm", "auto"):
            raise StateError("OCR mode must be observe, confirm or auto.", "bad-mode")

        profile_id = str(payload.get("profileId") or "").strip()
        profiles = {profile["id"]: profile for profile in load_profiles()}
        profile = profiles.get(profile_id) or profiles.get(profile_id.replace(".json", ""))
        if not profile:
            raise StateError("Unknown calibration profile: %s" % (profile_id or "(none)"), "bad-profile")

        region = payload.get("region") or profile.get("region")
        if not isinstance(region, (list, tuple)) or len(region) != 4:
            raise StateError("Profile %s has no usable region. Run the calibration tool." % profile_id,
                             "bad-region")
        # A calibrated region is measured against a window that can move. Refuse up front with a clear
        # reason rather than repeating a capture error every scan while the reader watches nothing.
        problem = ocr.validate_region(region)
        if problem:
            raise StateError("This region cannot be captured: %s" % problem, "bad-region")

        session = STORE.load()
        if not session or session.get("status") != "active":
            raise StateError("Start a session before starting OCR.", "no-session", 409)

        STORE.set_mode(mode)
        with self._lock:
            self.pending = None
        status = self.monitor.start(region, mode, profile_id)
        if not profile.get("calibrated"):
            self.monitor.set_status(message="Watching (region is NOT calibrated yet — run app/tools/calibrate.py).")
        self._log({"action": "start", "mode": mode, "profile": profile_id, "region": list(region),
                   "calibrated": bool(profile.get("calibrated"))})
        return {"ok": True, "started": True, "status": status}

    def stop(self):
        if ocr is None or self.monitor is None:
            return {"ok": True, "started": False, "status": {}}
        was_running = self.monitor.is_running()
        status = self.monitor.stop()
        with self._lock:
            self.pending = None
        # Ending a session stops the reader, but logging a "stop" for a reader that was never
        # started would fill the audit log with noise and skew the accuracy readout.
        if was_running:
            self._log({"action": "stop"})
        return {"ok": True, "started": False, "status": status}

    # ------------------------------------------------------------------ decisions
    def _on_candidate(self, decision, mode):
        """Called from the monitor thread. Implements the mode rules from AGENTS.md."""
        result = decision.get("result")
        base = {
            "mode": mode,
            "result": result,
            "confidence": decision.get("confidence"),
            "signature": decision.get("signature"),
            "evidence": decision.get("evidence", ""),
        }
        session = STORE.load()
        if not session or session.get("status") != "active":
            self._log(dict(base, action="ignored", detail="no active session"))
            self.monitor.set_status(message="Result seen, but there is no active session to record it in.")
            return

        if mode == "observe" or not settlement.open_wagers(session):
            # Observe mode records the observation as a no-bet hand: money-neutral, and it builds the
            # bead plate. With no open wager the same applies — OCR never invents a bet.
            action = "observed" if mode == "observe" else "observed-no-open-bet"
            self._apply(base, action, "Recorded as a no-bet hand.")
            return

        if mode == "confirm":
            with self._lock:
                self.pending = dict(base, detectedAt=time.strftime("%Y-%m-%dT%H:%M:%S"), action="pending")
            self.monitor.set_status(phase="candidate",
                                    message="%s detected — confirm or correct it." % str(result).upper())
            self._log(dict(base, action="pending"))
            return

        # auto: validated signature, double read, not seen before, and an open bet to settle. But only
        # when the reading is certain enough to move money with nobody looking — otherwise the user
        # gets the same confirm-or-correct prompt they would have had, instead of a silent bet.
        scan_config = self.monitor.config.get("scan", {}) if self.monitor else {}
        if not ocr.auto_is_confident_enough(decision.get("confidence"), scan_config):
            detail = ("auto deferred: confidence %.2f is below the %.2f needed to settle on its own"
                      % (float(decision.get("confidence") or 0.0),
                         float(scan_config.get("autoMinConfidence", 0.9))))
            with self._lock:
                self.pending = dict(base, detectedAt=time.strftime("%Y-%m-%dT%H:%M:%S"),
                                    action="pending", detail=detail)
            if self.monitor:
                self.monitor.set_status(
                    phase="candidate",
                    message="%s detected, but only %.2f confidence — confirm it rather than letting "
                            "Automatic settle it." % (str(result).upper(),
                                                      float(decision.get("confidence") or 0.0)))
            self._log(dict(base, action="pending", detail=detail))
            return
        self._apply(base, "auto-settled", "Settled the open bet from the screen.")

    def _apply(self, base, action, message):
        session = STORE.load()
        payload = {"result": base["result"], "source": "ocr", "signature": base.get("signature")}
        try:
            wagers = settlement.open_wagers(session) if session else []
            if wagers:
                STORE.settle(payload)
                detail = "settled the open %s bet" % "+".join(wager.get("side", "?") for wager in wagers)
            else:
                STORE.record_pass(payload)
                detail = "recorded as a no-bet hand"
        except (StateError, settlement.SettlementError) as error:
            self._log(dict(base, action="error", detail=str(error)))
            if self.monitor:
                self.monitor.set_status(message="Could not record that read: %s" % error)
            return False
        self._log(dict(base, action=action, detail=detail))
        if self.monitor:
            self.monitor.set_status(phase="watching",
                                    message="%s — %s." % (message, detail))
        return True

    def confirm(self, payload):
        with self._lock:
            pending = dict(self.pending) if self.pending else None
        if not pending:
            raise StateError("There is no OCR result waiting for confirmation.", "no-pending", 409)

        accept = bool(payload.get("accept", True))
        with self._lock:
            self.pending = None
        if not accept:
            self._log(dict(pending, action="rejected"))
            if self.monitor:
                self.monitor.set_status(phase="watching", message="Result rejected — nothing recorded.")
            return {"ok": True, "recorded": False}

        # The user may correct the reading before it is recorded; their edit wins.
        result = payload.get("result") or pending.get("result")
        result = settlement.normalize_result(result)
        if result is None:
            raise StateError("Choose Banker, Player or Tie before confirming.", "bad-result")
        corrected = result != pending.get("result")
        applied = self._apply(dict(pending, result=result), "confirmed" + ("-corrected" if corrected else ""),
                              "Confirmed from the screen." if not corrected else "Recorded your correction.")
        return {"ok": True, "recorded": bool(applied), "result": result}

    def events_tail(self, limit=50):
        with self._lock:
            return self.events[-limit:]

    def _verify_region(self, screen_bytes, region):
        """Read the located region once, so a calibration proves itself instead of only scoring.

        One call, and only when a region is found. A failure here is reported but never invalidates
        the region itself: the location is geometry, the reading is the model's opinion.
        """
        try:
            if self._verify_reader is None:
                self._verify_reader = ocr.make_reader()
            crop = ocr.crop_from_screen(screen_bytes, region)
            parsed = ocr.parse_result_json(self._verify_reader(crop))
            return {"result": parsed["result"], "confidence": parsed["confidence"],
                    "evidence": parsed["evidence"][:160]}
        except Exception as error:  # noqa: BLE001 - the reading is a bonus, not the answer
            return {"error": "%s: %s" % (type(error).__name__, error)}

    def screen_preview(self, payload=None):
        """A picture of the screen for drawing a region on, scaled to fit a panel.

        Stays on this machine: it is captured here and served to the local page. The scale travels
        with it so the drawn rectangle can be converted back to screen pixels exactly.
        """
        if ocr is None:
            raise StateError("OCR is unavailable: %s" % OCR_IMPORT_ERROR, "ocr-unavailable", 503)
        try:
            screen = ocr.capture_full_screen()
        except Exception as error:  # noqa: BLE001
            raise StateError("Screen capture failed: %s: %s" % (type(error).__name__, error),
                             "capture-failed", 503)
        try:
            preview, scale = ocr.preview_png(screen, max_width=1100)
        except Exception as error:  # noqa: BLE001
            raise StateError("The screen picture could not be prepared: %s" % error, "preview-failed", 503)
        size = ocr.screen_size()
        import base64
        return {
            "ok": True,
            "image": "data:image/png;base64," + base64.b64encode(preview).decode("ascii"),
            "scale": scale,
            "screenWidth": size[0],
            "screenHeight": size[1],
            "bytes": len(preview),
        }

    def set_region(self, payload):
        """Save a hand-drawn region into a profile, after checking it can actually be captured.

        Draws on the same self-check as calibration-by-matching: the region is validated, a picture of
        it is saved for eyeballing, and it is read once so the user is told what the reader sees.
        """
        if ocr is None:
            raise StateError("OCR is unavailable: %s" % OCR_IMPORT_ERROR, "ocr-unavailable", 503)

        region = payload.get("region")
        problem = ocr.validate_region(region)
        if problem:
            raise StateError("That region cannot be captured: %s" % problem, "bad-region")

        profile_id = str(payload.get("profileId") or "").strip()
        profile_path = None
        if profile_id:
            known = {profile["id"]: profile for profile in load_profiles()}
            if profile_id.replace(".json", "") not in known:
                raise StateError("Unknown calibration profile: %s" % profile_id, "bad-profile")
            profile_path = os.path.join(CONFIG_DIR, profile_id.replace(".json", "") + ".json")

        try:
            screen = ocr.capture_full_screen()
        except Exception as error:  # noqa: BLE001
            raise StateError("Screen capture failed: %s: %s" % (type(error).__name__, error),
                             "capture-failed", 503)

        region = [int(value) for value in region]
        result = {"ok": True, "region": region, "profileId": profile_id or None,
                  "reading": self._verify_region(screen, region), "cropPath": None}
        try:
            folder = os.path.join(DATA_DIR, "calibration")
            os.makedirs(folder, exist_ok=True)
            crop_path = os.path.join(folder, "region-%s.png" % time.strftime("%Y%m%d-%H%M%S"))
            with open(crop_path, "wb") as handle:
                handle.write(ocr.crop_from_screen(screen, region))
            result["cropPath"] = crop_path
        except Exception:  # noqa: BLE001 - the picture is a convenience
            pass

        if profile_path:
            ocr.apply_region_to_profile(profile_path, region, sample="drawn by hand",
                                        score=None)
            result["saved"] = True
        else:
            result["saved"] = False
        self._log({"action": "calibrated", "by": "hand", "region": region,
                   "profile": profile_id or None, "reading": result["reading"]})
        return result

    def locate_table(self, payload):
        """Find the table on screen from a saved sample and write the region into the profile.

        This is calibration without dragging a box: the sample says WHAT to read, and matching it
        against the live screen says WHERE it is. An unconvincing match is refused, never written,
        because a wrong region makes the reader read the wrong thing.
        """
        if ocr is None:
            raise StateError("OCR is unavailable: %s" % OCR_IMPORT_ERROR, "ocr-unavailable", 503)

        profile_id = str(payload.get("profileId") or "").strip()
        profile_path = None
        if profile_id:
            known = {profile["id"]: profile for profile in load_profiles()}
            if profile_id.replace(".json", "") not in known:
                raise StateError("Unknown calibration profile: %s" % profile_id, "bad-profile")
            profile_path = os.path.join(CONFIG_DIR, profile_id.replace(".json", "") + ".json")

        sample_dir = os.path.join(DATA_DIR, "samples")
        wanted = str(payload.get("sample") or "").strip()
        if wanted:
            paths = [os.path.join(sample_dir, os.path.basename(wanted))]
        elif os.path.isdir(sample_dir):
            paths = sorted(os.path.join(sample_dir, name) for name in os.listdir(sample_dir)
                           if name.lower().endswith(".png"))
        else:
            paths = []
        if not paths or not any(os.path.isfile(path) for path in paths):
            raise StateError(
                "No sample screenshots to look for yet — press \"Save a screenshot sample\" while the "
                "table is visible, then try again.", "no-samples", 409)

        # A sample the module captured itself came FROM the region currently in use, so matching it
        # only confirms that region — it cannot find the table. Prefer samples the user snipped, and
        # when only self-captured ones exist, say so and do not mark anything calibrated: "calibrated"
        # must mean found from a real reference, not found itself.
        self_captured = [path for path in paths if os.path.basename(path).startswith("sample-")]
        user_samples = [path for path in paths if not os.path.basename(path).startswith("sample-")]
        only_self_captured = bool(self_captured) and not user_samples
        if only_self_captured:
            paths = self_captured

        try:
            screen = ocr.capture_full_screen()
        except Exception as error:  # noqa: BLE001
            raise StateError("Screen capture failed: %s: %s" % (type(error).__name__, error),
                             "capture-failed", 503)

        try:
            result = ocr.locate_sample(screen, paths, min_score=float(payload.get("minScore") or 0.60))
        except ocr.OcrError as error:
            raise StateError(str(error), "locate-failed", 503)

        if result["found"]:
            result["reading"] = self._verify_region(screen, result["region"])
        if only_self_captured:
            result["circular"] = True
            result["note"] = ("This sample was captured from the region already in use, so a match only "
                              "confirms it rather than finding your table. Nothing was written. To "
                              "calibrate for real, snip the table yourself and save it into "
                              "data\\samples, or press Draw the region.")
        if result["found"] and profile_path and not only_self_captured:
            ocr.apply_region_to_profile(profile_path, result["region"], result["sample"], result["score"])
            result["profileId"] = profile_id
            try:
                folder = os.path.join(DATA_DIR, "calibration")
                os.makedirs(folder, exist_ok=True)
                crop_path = os.path.join(folder, "found-%s.png" % time.strftime("%Y%m%d-%H%M%S"))
                with open(crop_path, "wb") as handle:
                    handle.write(ocr.crop_from_screen(screen, result["region"]))
                result["cropPath"] = crop_path
            except Exception:  # noqa: BLE001 - the crop is a convenience, not the answer
                result["cropPath"] = None
        self._log({"action": "locate", "found": result["found"], "score": round(result["score"], 3),
                   "sample": result["sample"], "profile": profile_id or None,
                   "region": result["region"], "circular": bool(only_self_captured)})
        return result

    def save_sample(self, payload):
        """Capture the region now and save it as a sample, WITHOUT calling the model.

        This is the one-click equivalent of `ocr_check.py --crop-only`: press it while the table is
        showing a result and the picture lands in data/samples/ to be looked at before any calibration
        is trusted. It costs nothing and records nothing in the session.
        """
        if ocr is None:
            raise StateError("OCR is unavailable: %s" % OCR_IMPORT_ERROR, "ocr-unavailable", 503)

        profile_id = str(payload.get("profileId") or "").strip()
        region = payload.get("region")
        profile = None
        if profile_id:
            profiles = {profile["id"]: profile for profile in load_profiles()}
            profile = profiles.get(profile_id) or profiles.get(profile_id.replace(".json", ""))
            if not profile:
                raise StateError("Unknown calibration profile: %s" % profile_id, "bad-profile")
            region = region or profile.get("region")
        if not (isinstance(region, list) and len(region) == 4
                and all(isinstance(value, int) for value in region)):
            region = None  # fall back to the whole screen

        try:
            image_bytes = ocr.capture_region(region) if region else ocr.capture_full_screen()
        except Exception as error:  # noqa: BLE001 - surface the reason, do not guess
            raise StateError("Screen capture failed: %s: %s" % (type(error).__name__, error),
                             "capture-failed", 503)

        folder = os.path.join(DATA_DIR, "samples")
        os.makedirs(folder, exist_ok=True)
        name = "sample-%s.png" % time.strftime("%Y%m%d-%H%M%S")
        path = os.path.join(folder, name)
        with open(path, "wb") as handle:
            handle.write(image_bytes)

        try:
            from PIL import Image
            with Image.open(io.BytesIO(image_bytes)) as image:
                image_size = (image.width, image.height)
        except Exception:  # noqa: BLE001 - the size is informational
            image_size = (0, 0)

        self._log({"action": "sample", "profile": profile_id or None,
                   "region": region, "path": path, "bytes": len(image_bytes)})
        return {
            "ok": True,
            "path": path,
            "bytes": len(image_bytes),
            "region": region,
            "signature": ocr.region_signature(image_bytes),
            "calibrated": bool(profile.get("calibrated")) if profile else False,
            "width": image_size[0],
            "height": image_size[1],
        }


OCR_STATE = OcrController()


def load_profiles():
    """The calibration profiles the UI may offer. Data-driven, so the dropdown cannot drift.

    A calibration profile is identified by having a real region, not by living in config/ — otherwise
    any other settings file dropped in config/ (config/ocr.json, for one) would appear in the UI as a
    selectable table with no capture area.
    """
    profiles = []
    if os.path.isdir(CONFIG_DIR):
        for name in sorted(os.listdir(CONFIG_DIR)):
            if not name.endswith(".json"):
                continue
            path = os.path.join(CONFIG_DIR, name)
            try:
                with open(path, "r", encoding="utf-8") as handle:
                    data = json.load(handle)
            except (OSError, json.JSONDecodeError):
                continue
            region = data.get("region")
            if not (isinstance(region, list) and len(region) == 4
                    and all(isinstance(value, int) and not isinstance(value, bool) for value in region)):
                continue
            profiles.append({
                "file": name,
                "id": data.get("name") or os.path.splitext(name)[0],
                "provider": data.get("provider"),
                "layout": data.get("layout"),
                "label": data.get("label") or data.get("name") or name,
                "region": region,
                "calibrated": bool(data.get("calibrated")),
                # How it was measured, so the UI can show it and so "calibrated" can never be a bare
                # claim without provenance.
                "calibratedAt": data.get("calibratedAt"),
                "calibratedFrom": data.get("calibratedFrom"),
                "matchScore": data.get("matchScore"),
            })
    return profiles


class BaccaratHandler(http.server.SimpleHTTPRequestHandler):
    server_version = "BetPilotBaccarat/" + BUILD

    # ------------------------------------------------------------------- responses
    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_text(self, status, text, content_type="text/plain; charset=utf-8", download_name=None):
        body = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if download_name:
            self.send_header("Content-Disposition", 'attachment; filename="%s"' % download_name)
        self.end_headers()
        self.wfile.write(body)

    def state_payload(self, session):
        if not session:
            return {"ok": True, "build": BUILD, "session": None, "derived": None}
        return {"ok": True, "build": BUILD, "session": session, "derived": settlement.derive(session)}

    def _json_body_(self):
        length = int(self.headers.get("Content-Length", 0))
        if length > 512 * 1024:
            raise StateError("Request body is too large.", "body-too-large", 413)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw or b"{}")
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise StateError("Invalid JSON body.", "bad-json") from error
        if not isinstance(payload, dict):
            raise StateError("JSON body must be an object.", "bad-json")
        return payload

    def _local_only_(self):
        if self.client_address[0] not in ("127.0.0.1", "::1"):
            self.send_json(403, {"ok": False, "error": "This endpoint is local only.", "code": "not-local"})
            return False
        return True

    # ------------------------------------------------------------------------ GET
    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)
        path = parsed.path
        if path == HEALTH_PATH:
            self.send_json(200, {
                "ok": True,
                "app": "BetPilotBaccarat",
                "build": BUILD,
                "root": MODULE_DIR,
                "server": os.path.normcase(os.path.realpath(__file__)),
                "data": DATA_DIR,
                "pid": os.getpid(),
            })
            return
        if path == STATE_PATH:
            self.send_json(200, self.state_payload(STORE.load()))
            return
        if path == HISTORY_PATH:
            self.send_json(200, {"ok": True, "sessions": STORE.history()})
            return
        if path == PROFILES_PATH:
            self.send_json(200, {"ok": True, "profiles": load_profiles()})
            return
        if path == OCR_STATUS_PATH:
            self.send_json(200, OCR_STATE.status())
            return
        if path == OCR_EVENTS_PATH:
            self.send_json(200, {"ok": True, "events": OCR_STATE.events_tail()})
            return
        if path == EXPORT_PATH:
            query = urllib.parse.parse_qs(parsed.query)
            session = STORE.load()
            if not session:
                self.send_json(409, {"ok": False, "error": "There is no session to export.", "code": "no-session"})
                return
            stamp = re.sub(r"[^0-9A-Za-z_-]", "", session.get("id") or "session")
            if query.get("format", ["csv"])[0].lower() == "json":
                self.send_text(200, json.dumps(session, indent=2, ensure_ascii=False),
                               "application/json; charset=utf-8", "baccarat-%s.json" % stamp)
            else:
                self.send_text(200, settlement_csv(session), "text/csv; charset=utf-8", "baccarat-%s.csv" % stamp)
            return
        super().do_GET()

    # ----------------------------------------------------------------------- POST
    def do_POST(self):
        if not self._local_only_():
            return
        path = urllib.parse.urlsplit(self.path).path
        handlers = {
            SESSION_PATH: self.handle_create_,
            HAND_PATH: self.handle_hand_,
            END_PATH: self.handle_end_,
            REOPEN_PATH: lambda: self.state_payload(STORE.reopen()),
            TOPMOST_PATH: self.handle_topmost_,
            OCR_START_PATH: lambda: OCR_STATE.start(self._json_body_()),
            OCR_STOP_PATH: lambda: OCR_STATE.stop(),
            OCR_CONFIRM_PATH: lambda: OCR_STATE.confirm(self._json_body_()),
            OCR_REJECT_PATH: lambda: OCR_STATE.confirm({"accept": False}),
            OCR_SAMPLE_PATH: lambda: OCR_STATE.save_sample(self._json_body_()),
            OCR_LOCATE_PATH: lambda: OCR_STATE.locate_table(self._json_body_()),
            OCR_SCREEN_PATH: lambda: OCR_STATE.screen_preview(self._json_body_()),
            OCR_REGION_PATH: lambda: OCR_STATE.set_region(self._json_body_()),
        }
        handler = handlers.get(path)
        if not handler:
            self.send_error(404)
            return
        try:
            self.send_json(200, handler())
        except settlement.SettlementError as error:
            self.send_json(400, {"ok": False, "error": str(error), "code": "bad-input"})
        except StateError as error:
            self.send_json(error.status, {"ok": False, "error": str(error), "code": error.code})
        except Exception as error:  # noqa: BLE001 - surface the reason instead of a blank 500
            self.send_json(500, {"ok": False, "error": "%s: %s" % (type(error).__name__, error), "code": "server-error"})

    def handle_create_(self):
        payload = self._json_body_()
        return self.state_payload(STORE.create(payload, force=bool(payload.get("force"))))

    def handle_end_(self):
        # A monitor running against a finished session would keep reading a screen it can no longer
        # record, so stop it first.
        try:
            OCR_STATE.stop()
        except Exception:  # noqa: BLE001 - ending the session must not depend on the OCR stack
            pass
        return self.state_payload(STORE.end())

    def handle_hand_(self):
        # Read the body once: action + fields.
        payload = self._json_body_()
        action = str(payload.get("action") or "").lower()
        if action == "place":
            return self.state_payload(STORE.place(payload))
        if action == "settle":
            return self.state_payload(STORE.settle(payload))
        if action == "pass":
            return self.state_payload(STORE.record_pass(payload))
        if action == "remove":
            return self.state_payload(STORE.remove_wager(payload))
        if action == "cancel":
            return self.state_payload(STORE.cancel())
        if action == "undo":
            return self.state_payload(STORE.undo())
        raise StateError("Unknown hand action: %s" % action, "unknown-action")

    def handle_topmost_(self):
        payload = self._json_body_()
        target = str(payload.get("target") or "table").lower()
        enabled = bool(payload.get("enabled", True))
        matched = set_window_topmost(target, enabled)
        return {"ok": True, "target": target, "enabled": enabled, "matchedWindows": matched}

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def guess_type(self, path):
        base = super().guess_type(path)
        if base in ("text/javascript", "text/css", "text/html", "application/json"):
            return base + "; charset=utf-8"
        return base

    def log_message(self, fmt, *args):
        message = fmt % args
        if message.startswith('"GET /__baccarat_health__') or message.startswith('"GET /api/baccarat/state'):
            return
        sys.stderr.write("[baccarat] %s\n" % message)


def settlement_csv(session):
    derived = settlement.derive(session)
    header = ["hand", "at", "source", "side", "stake_units", "result", "outcome",
              "stake_cents", "commission_cents", "profit_cents", "bankroll_cents", "wagers"]
    running = derived["startingCents"]
    rows = [",".join(header)]
    for hand in derived["hands"]:
        running += hand["profitCents"]
        wager_label = ";".join(
            "%s:%s" % (wager["side"], wager["stakeUnits"])
            for wager in hand["wagers"] if wager["side"] != "pass"
        )
        rows.append(",".join(str(value) for value in [
            hand["n"], hand.get("at") or "", hand["source"], hand["side"], hand["stakeUnits"],
            hand.get("result") or "", hand["outcome"], hand["stakeCents"],
            hand["commissionCents"], hand["profitCents"], running, wager_label,
        ]))
    return "\n".join(rows) + "\n"


def main():
    # Error text and model evidence can contain non-Latin characters (a Chinese-labelled table, for
    # one). Replace anything the console cannot encode rather than dying mid-diagnosis.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")
        except (AttributeError, ValueError):
            pass

    mutex = None
    if os.name == "nt":
        mutex = ctypes.windll.kernel32.CreateMutexW(None, False, MUTEX_NAME)
        if not mutex:
            print("ERROR: Could not create the Baccarat singleton lock.", file=sys.stderr)
            return 20
        if ctypes.windll.kernel32.GetLastError() == 183:
            print("ERROR: This exact Baccarat server is already running.", file=sys.stderr)
            return 21

    os.makedirs(DATA_DIR, exist_ok=True)

    # Importing the OCR stack (PIL, pyautogui, the provider SDK) costs ~4s on a cold start. Doing it
    # here, before the socket opens, means the health check only answers when the server is genuinely
    # ready and the first click on "Start reading" gets an immediate reply. An async warm-up is not
    # enough: the first status request would still wait on the import while the GIL is held.
    if ocr is not None:
        warm_start = time.time()
        try:
            availability = ocr.describe_availability()
            print("OCR %s in %.1fs (provider: %s)"
                  % ("ready" if availability["available"] else "not ready",
                     time.time() - warm_start, availability.get("provider")))
            if not availability["available"]:
                print("OCR missing: %s" % "; ".join(availability["missing"]))
        except Exception as error:  # noqa: BLE001 - OCR must never stop the module from starting
            print("OCR warm-up failed (%s: %s); OCR will report unavailable." % (type(error).__name__, error))

    handler = functools.partial(BaccaratHandler, directory=WEB_DIR)
    with http.server.ThreadingHTTPServer((HOST, PORT), handler) as httpd:
        httpd.daemon_threads = True
        print("BetPilot Baccarat %s" % BUILD)
        print("Serving on http://%s:%d" % (HOST, PORT))
        print("Data:    %s" % DATA_DIR)
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
