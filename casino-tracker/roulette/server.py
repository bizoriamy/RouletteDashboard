"""
Local development server with Google Apps Script proxy.
Run: python server.py
Then open: http://localhost:8080/live-dashboard.html

The /api/sync proxy bypasses browser CORS and 302-redirect issues
by forwarding POST requests to Google's Apps Script endpoint server-side.
"""
import http.server
import json
import urllib.request
import urllib.error
import urllib.parse
import sys
import os
import re as _re
import ctypes
import hashlib
import threading
import time
import socket
import subprocess
import shutil

PORT = int(os.environ.get("ROULETTE_PORT", "8080"))
ROOT = os.path.normcase(os.path.realpath(os.path.dirname(os.path.abspath(__file__))))
VERSION_PATH = os.path.join(ROOT, "VERSION")
try:
    with open(VERSION_PATH, "r", encoding="utf-8") as version_file:
        BUILD = version_file.read().strip()
except OSError as error:
    raise RuntimeError(f"Unable to read dashboard VERSION file: {VERSION_PATH}") from error
if not BUILD:
    raise RuntimeError(f"Dashboard VERSION file is empty: {VERSION_PATH}")
PROXY_PATH = "/api/sync"
FETCH_PATH = "/api/fetch"
FREDDY_TOPMOST_PATH = "/api/freddy/topmost"
WINDOW_TOPMOST_PATH = "/api/window/topmost"
QUICK_ENTRY_PATH = "/api/quick-entry"
OCR_PREFIX = "/api/ocr"
OCR_STATUS_PATH = OCR_PREFIX + "/status"
OCR_START_PATH = OCR_PREFIX + "/start"
OCR_STOP_PATH = OCR_PREFIX + "/stop"
OCR_CANDIDATE_PATH = OCR_PREFIX + "/candidate"
OCR_CONFIRM_PATH = OCR_PREFIX + "/confirm"
OCR_SKIP_PATH = OCR_PREFIX + "/skip"
OCR_RESET_PATH = OCR_PREFIX + "/reset"
OCR_PROGRESS_PATH = OCR_PREFIX + "/progress"
OCR_DASHBOARD_STATE_PATH = OCR_PREFIX + "/dashboard-state"
HEALTH_PATH = "/__roulette_health__"
SESSION_PATH = "/__roulette_session__"
NUMBERS_24_PREFIX = "/24/"
NUMBERS_24_DIR = os.path.normcase(os.path.realpath(os.path.join(ROOT, "..", "24Numbers")))
INSTANCE_KEY = os.environ.get("ROULETTE_INSTANCE_KEY", ROOT)
MUTEX_NAME = "Local\\RouletteDashboard-" + hashlib.sha256(
    INSTANCE_KEY.encode("utf-8")
).hexdigest()[:20]
SYNC_TIMEOUT_SECONDS = int(os.environ.get("ROULETTE_SYNC_TIMEOUT", "90"))
FETCH_TIMEOUT_SECONDS = int(os.environ.get("ROULETTE_FETCH_TIMEOUT", "20"))
OCR_ROOT = os.path.normcase(os.path.realpath(os.path.join(ROOT, "..", "..", "OCR")))
OCR_MONITOR_PATH = os.path.join(OCR_ROOT, "dashboard_monitor.py")
OCR_SECRET_PATH = os.path.normcase(os.path.realpath(os.path.join(ROOT, "..", ".secrets", "ocr.env")))
OCR_DATA_DIR = os.path.normcase(os.path.realpath(os.environ.get("ROULETTE_OCR_DATA_DIR", os.path.join(ROOT, "data"))))
OCR_EVENT_PATH = os.path.join(OCR_DATA_DIR, "ocr-events.jsonl")
OCR_CORRECTION_DIR = os.path.join(OCR_DATA_DIR, "ocr-corrections")
OCR_PENDING_DIR = os.path.join(OCR_ROOT, ".pending")

def set_window_topmost(target, enabled):
    """Toggle topmost for one of the dashboard browser windows."""
    if os.name != "nt":
        return 0
    title_fragments = {
        "main": "Roulette Live Dashboard",
        "freddy": "Freddy Triangle Snake",
        "quick": "Quick Roulette Entry",
        "numbers24": "24 Numbers Live Tracker",
    }
    title_fragment = title_fragments.get(target)
    if not title_fragment:
        raise ValueError("Unknown dashboard window target.")
    user32 = ctypes.windll.user32
    user32.SetWindowPos.argtypes = [
        ctypes.c_void_p, ctypes.c_void_p,
        ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_uint
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

class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    _session_lock = threading.Lock()
    _quick_entry_lock = threading.Lock()
    _quick_entry_id = 0
    _quick_entry_event = None
    _quick_entry_events = []
    _quick_entry_history = []
    _ocr_lock = threading.Lock()
    _ocr_process = None
    _ocr_profile = "Pragmatic-HalfWidth-MaxHeight"
    _ocr_pending = None
    _ocr_error = ""
    _ocr_mode = "confirm"
    _ocr_phase = "stopped"
    _ocr_message = ""
    _ocr_dashboard_state = {"session": None, "spinCount": 0, "lastNumber": None}

    def do_GET(self):
        request_path = urllib.parse.urlsplit(self.path).path
        if request_path == HEALTH_PATH:
            self.send_json(200, {
                "ok": True,
                "app": "RouletteDashboard",
                "build": BUILD,
                "root": ROOT,
                "server": os.path.normcase(os.path.realpath(__file__)),
                "pid": os.getpid(),
            })
            return
        if request_path == QUICK_ENTRY_PATH:
            self.handle_quick_entry_get_()
            return
        if request_path == OCR_STATUS_PATH:
            self.handle_ocr_status_()
            return
        if request_path == SESSION_PATH:
            self.handle_dashboard_session_()
            return
        # Serve 24Numbers folder via /24/ prefix
        if request_path.startswith(NUMBERS_24_PREFIX) or request_path == "/24":
            self.handle_numbers_24_(request_path)
            return
        super().do_GET()

    def handle_dashboard_session_(self):
        """Stream a lightweight heartbeat to dashboard windows.

        The dashboard server intentionally stays alive after browser windows are
        closed or briefly disconnected. Earlier builds shut the server down when
        the live-state connection disappeared; that made Freddy Floating, Quick
        Entry, and 24 Numbers fail with "localhost refused to connect" from
        otherwise visible stale windows.
        """

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        try:
            while not getattr(self.server, "_dashboard_stopping", False):
                self.wfile.write(b": dashboard-window-open\n\n")
                self.wfile.flush()
                time.sleep(1)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass

    def handle_numbers_24_(self, request_path):
        """Serve files from the 24Numbers directory via /24/ prefix."""
        rel = request_path[len(NUMBERS_24_PREFIX):] if request_path.startswith(NUMBERS_24_PREFIX) else ""
        if not rel or rel == "":
            rel = "24numbers-Live-Trackers.html"
        # Security: prevent directory traversal
        rel = rel.lstrip("/")
        if ".." in rel:
            self.send_error(403)
            return
        file_path = os.path.normcase(os.path.join(NUMBERS_24_DIR, rel))
        if not file_path.startswith(NUMBERS_24_DIR):
            self.send_error(403)
            return
        if not os.path.isfile(file_path):
            self.send_error(404)
            return
        try:
            with open(file_path, "rb") as f:
                content = f.read()
            ctype = self.guess_type(file_path)
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception:
            self.send_error(500)

    def do_POST(self):
        request_path = urllib.parse.urlsplit(self.path).path
        if request_path == QUICK_ENTRY_PATH:
            self.handle_quick_entry_post_()
        elif request_path == OCR_START_PATH:
            self.handle_ocr_start_()
        elif request_path == OCR_STOP_PATH:
            self.handle_ocr_stop_()
        elif request_path == OCR_CANDIDATE_PATH:
            self.handle_ocr_candidate_()
        elif request_path == OCR_CONFIRM_PATH:
            self.handle_ocr_confirm_()
        elif request_path == OCR_SKIP_PATH:
            self.handle_ocr_skip_()
        elif request_path == OCR_RESET_PATH:
            self.handle_ocr_reset_()
        elif request_path == OCR_PROGRESS_PATH:
            self.handle_ocr_progress_()
        elif request_path == OCR_DASHBOARD_STATE_PATH:
            self.handle_ocr_dashboard_state_()
        elif request_path == PROXY_PATH:
            self.handle_sync_()
        elif request_path == FETCH_PATH:
            self.handle_fetch_()
        elif request_path == FREDDY_TOPMOST_PATH:
            self.handle_window_topmost_("freddy")
        elif request_path == WINDOW_TOPMOST_PATH:
            self.handle_window_topmost_()
        else:
            self.send_error(404)

    def handle_quick_entry_get_(self):
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        try:
            after = int(query.get("after", ["0"])[0])
        except (TypeError, ValueError):
            after = 0
        with self._quick_entry_lock:
            latest_id = type(self)._quick_entry_id
            events = [event for event in type(self)._quick_entry_events if event["id"] > after]
            history = list(type(self)._quick_entry_history)
        self.send_json(200, {"ok": True, "latestId": latest_id, "events": events, "history": history})

    def handle_quick_entry_post_(self):
        length = int(self.headers.get("Content-Length", 0))
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
            action = str(payload.get("action", "spin")).lower()
            if action == "history":
                history = payload.get("history", [])
                if not isinstance(history, list) or len(history) > 12:
                    raise ValueError("History must contain no more than 12 numbers.")
                clean = []
                for value in history:
                    if isinstance(value, bool) or not isinstance(value, (int, float)) or int(value) != value or int(value) < 0 or int(value) > 36:
                        raise ValueError("History contains an invalid roulette number.")
                    clean.append(int(value))
                with self._quick_entry_lock:
                    type(self)._quick_entry_history = clean[-10:]
                self.send_json(200, {"ok": True, "history": clean[-10:]})
                return
            if action == "undo":
                with self._quick_entry_lock:
                    type(self)._quick_entry_id += 1
                    event = {"id": type(self)._quick_entry_id, "action": "undo", "at": time.time()}
                    type(self)._quick_entry_events.append(event)
                    type(self)._quick_entry_events = type(self)._quick_entry_events[-100:]
                    if type(self)._quick_entry_history:
                        type(self)._quick_entry_history.pop()
                    history = list(type(self)._quick_entry_history)
                self.send_json(200, {"ok": True, "event": event, "history": history})
                return
            number = payload.get("number")
            if isinstance(number, bool) or not isinstance(number, (int, float)) or int(number) != number:
                raise ValueError("Winning number must be a whole number.")
            number = int(number)
            if number < 0 or number > 36:
                raise ValueError("Winning number must be between 0 and 36.")
            with self._quick_entry_lock:
                type(self)._quick_entry_id += 1
                event = {"id": type(self)._quick_entry_id, "action": "spin", "number": number, "at": time.time()}
                type(self)._quick_entry_events.append(event)
                type(self)._quick_entry_events = type(self)._quick_entry_events[-100:]
                type(self)._quick_entry_history.append(number)
                type(self)._quick_entry_history = type(self)._quick_entry_history[-10:]
                history = list(type(self)._quick_entry_history)
            self.send_json(200, {"ok": True, "event": event, "history": history})
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as error:
            self.send_json(400, {"ok": False, "error": str(error)})

    def _local_request_(self):
        return self.client_address[0] in ("127.0.0.1", "::1")

    def _json_body_(self):
        length = int(self.headers.get("Content-Length", 0))
        try:
            return json.loads(self.rfile.read(length) or b"{}")
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise ValueError("Invalid JSON body") from error

    @classmethod
    def _ocr_running_(cls):
        process = cls._ocr_process
        if process is None:
            return False
        if process.poll() is None:
            return True
        if not cls._ocr_error:
            cls._ocr_error = f"OCR monitor exited with code {process.returncode}. Check .runtime/ocr-monitor.log."
        cls._ocr_process = None
        return False

    @classmethod
    def _append_ocr_event_(cls, event):
        os.makedirs(OCR_DATA_DIR, exist_ok=True)
        with open(OCR_EVENT_PATH, "a", encoding="utf-8", newline="\n") as output:
            output.write(json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n")

    @classmethod
    def _public_pending_(cls):
        if not cls._ocr_pending:
            return None
        return {key: value for key, value in cls._ocr_pending.items() if key != "screenshotPath"}

    @classmethod
    def _discard_pending_crop_(cls, pending):
        path = str((pending or {}).get("screenshotPath", ""))
        if path and os.path.isfile(path):
            try:
                os.remove(path)
            except OSError:
                pass

    @classmethod
    def _enqueue_ocr_spin_(cls, number):
        with cls._quick_entry_lock:
            cls._quick_entry_id += 1
            event = {"id": cls._quick_entry_id, "action": "spin", "number": number, "source": "ocr", "at": time.time()}
            cls._quick_entry_events.append(event)
            cls._quick_entry_events = cls._quick_entry_events[-100:]
            cls._quick_entry_history.append(number)
            cls._quick_entry_history = cls._quick_entry_history[-10:]
        return event

    def handle_ocr_status_(self):
        if not self._local_request_():
            self.send_json(403, {"ok": False, "error": "OCR controls are local-only."})
            return
        with self._ocr_lock:
            running = type(self)._ocr_running_()
            self.send_json(200, {
                "ok": True,
                "running": running,
                "profile": type(self)._ocr_profile,
                "mode": type(self)._ocr_mode,
                "phase": type(self)._ocr_phase,
                "message": type(self)._ocr_message,
                "pending": type(self)._public_pending_(),
                "dashboardState": dict(type(self)._ocr_dashboard_state),
                "error": type(self)._ocr_error,
            })

    def handle_ocr_start_(self):
        if not self._local_request_():
            self.send_json(403, {"ok": False, "error": "OCR controls are local-only."})
            return
        try:
            payload = self._json_body_()
            profile = str(payload.get("profile") or "Pragmatic-HalfWidth-MaxHeight")
            mode = str(payload.get("mode") or "confirm").lower()
            if profile != "Pragmatic-HalfWidth-MaxHeight":
                raise ValueError("Unknown OCR profile.")
            if mode not in ("observe", "confirm", "automatic"):
                raise ValueError("Unknown OCR operating mode.")
            if not os.path.isfile(OCR_MONITOR_PATH):
                raise ValueError(f"OCR monitor was not found: {OCR_MONITOR_PATH}")
            if not os.path.isfile(OCR_SECRET_PATH):
                raise ValueError(f"Private OCR settings were not found: {OCR_SECRET_PATH}")
            with self._ocr_lock:
                if type(self)._ocr_running_():
                    self.send_json(200, {"ok": True, "running": True, "alreadyRunning": True})
                    return
                os.makedirs(os.path.join(ROOT, ".runtime"), exist_ok=True)
                log_path = os.path.join(ROOT, ".runtime", "ocr-monitor.log")
                log = open(log_path, "a", encoding="utf-8", buffering=1)
                try:
                    ocr_environment = os.environ.copy()
                    ocr_environment["PYTHONIOENCODING"] = "utf-8"
                    ocr_environment["PYTHONUTF8"] = "1"
                    process = subprocess.Popen(
                        [sys.executable, "-u", OCR_MONITOR_PATH, "default", f"http://127.0.0.1:{PORT}{OCR_PREFIX}"],
                        cwd=OCR_ROOT,
                        env=ocr_environment,
                        stdin=subprocess.DEVNULL,
                        stdout=log,
                        stderr=subprocess.STDOUT,
                        creationflags=(subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0),
                    )
                finally:
                    log.close()
                type(self)._ocr_process = process
                type(self)._ocr_profile = profile
                type(self)._ocr_mode = mode
                type(self)._ocr_error = ""
                type(self)._ocr_phase = "starting"
                type(self)._ocr_message = "Starting OCR monitor"
            self.send_json(200, {"ok": True, "running": True, "pid": process.pid, "profile": profile, "mode": mode})
        except (ValueError, OSError) as error:
            self.send_json(400, {"ok": False, "error": str(error)})

    def handle_ocr_stop_(self):
        if not self._local_request_():
            self.send_json(403, {"ok": False, "error": "OCR controls are local-only."})
            return
        with self._ocr_lock:
            process = type(self)._ocr_process
            if process and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=4)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=2)
            type(self)._ocr_process = None
            type(self)._ocr_error = ""
            type(self)._ocr_phase = "stopped"
            type(self)._ocr_message = ""
        self.send_json(200, {"ok": True, "running": False})

    def handle_ocr_candidate_(self):
        if not self._local_request_():
            self.send_json(403, {"ok": False, "error": "OCR candidate delivery is local-only."})
            return
        try:
            payload = self._json_body_()
            event_id = str(payload.get("eventId", ""))
            if not _re.fullmatch(r"ocr-[A-Za-z0-9-]{8,64}", event_id):
                raise ValueError("Invalid OCR event ID.")
            number = payload.get("number")
            if isinstance(number, bool) or not isinstance(number, int) or not 0 <= number <= 36:
                raise ValueError("OCR number must be an integer from 0 to 36.")
            signature = payload.get("signature")
            if not isinstance(signature, list) or not signature or any(isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 36 for value in signature):
                raise ValueError("OCR signature is invalid.")
            sequence_valid = bool(payload.get("sequenceValid", False))
            baseline_spin_count = int(payload.get("baselineSpinCount", 0))
            recognition_ms = max(0, int(payload.get("recognitionMs", 0)))
            candidate = {
                "eventId": event_id,
                "profile": type(self)._ocr_profile,
                "detectedNumber": number,
                "signature": signature,
                "previousSignature": payload.get("previousSignature", []),
                "sequenceValid": sequence_valid,
                "baselineSpinCount": baseline_spin_count,
                "recognitionMs": recognition_ms,
                "detectedAt": str(payload.get("detectedAt", "")),
                "screenshotPath": os.path.join(OCR_PENDING_DIR, event_id + ".png") if os.path.isfile(os.path.join(OCR_PENDING_DIR, event_id + ".png")) else "",
            }
            resolution = "pending"
            queued_event = None
            with self._ocr_lock:
                if type(self)._ocr_pending:
                    self.send_json(409, {"ok": False, "error": "Another OCR number is awaiting confirmation."})
                    return
                mode = type(self)._ocr_mode
                current_spin_count = int(type(self)._ocr_dashboard_state.get("spinCount", 0))
                manual_entry_during_read = current_spin_count != baseline_spin_count
                if mode == "observe":
                    resolution = "observed"
                    record = {**candidate, "status": "observed", "resolvedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
                    type(self)._append_ocr_event_({key: value for key, value in record.items() if key != "screenshotPath"})
                    type(self)._discard_pending_crop_(candidate)
                elif mode == "automatic" and sequence_valid and not manual_entry_during_read:
                    resolution = "automatic"
                    record = {**candidate, "confirmedNumber": number, "session": type(self)._ocr_dashboard_state.get("session"), "status": "automatic", "confirmedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
                    type(self)._append_ocr_event_({key: value for key, value in record.items() if key != "screenshotPath"})
                    type(self)._discard_pending_crop_(candidate)
                    queued_event = type(self)._enqueue_ocr_spin_(number)
                else:
                    candidate["status"] = "pending"
                    if mode == "automatic":
                        candidate["automaticBlockedReason"] = "dashboard-changed-during-reading" if manual_entry_during_read else "history-shift-not-validated"
                    type(self)._ocr_pending = candidate
                    type(self)._append_ocr_event_({key: value for key, value in candidate.items() if key != "screenshotPath"})
            self.send_json(200, {"ok": True, "resolution": resolution, "pending": type(self)._public_pending_(), "event": queued_event})
        except (ValueError, OSError) as error:
            self.send_json(400, {"ok": False, "error": str(error)})

    def handle_ocr_confirm_(self):
        if not self._local_request_():
            self.send_json(403, {"ok": False, "error": "OCR confirmation is local-only."})
            return
        try:
            payload = self._json_body_()
            event_id = str(payload.get("eventId", ""))
            number = payload.get("number")
            if isinstance(number, bool) or not isinstance(number, int) or not 0 <= number <= 36:
                raise ValueError("Confirmed number must be an integer from 0 to 36.")
            session_number = payload.get("session")
            with self._ocr_lock:
                pending = type(self)._ocr_pending
                if not pending or pending.get("eventId") != event_id:
                    raise ValueError("This OCR candidate is no longer pending.")
                corrected = number != pending["detectedNumber"]
                screenshot_path = pending.get("screenshotPath", "")
                correction_path = ""
                if corrected and screenshot_path and os.path.isfile(screenshot_path):
                    os.makedirs(OCR_CORRECTION_DIR, exist_ok=True)
                    correction_path = os.path.join(OCR_CORRECTION_DIR, event_id + ".png")
                    shutil.move(screenshot_path, correction_path)
                else:
                    type(self)._discard_pending_crop_(pending)
                final_event = {
                    "eventId": event_id,
                    "profile": pending["profile"],
                    "detectedNumber": pending["detectedNumber"],
                    "confirmedNumber": number,
                    "signature": pending["signature"],
                    "detectedAt": pending["detectedAt"],
                    "confirmedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                    "session": session_number,
                    "status": "corrected" if corrected else "confirmed",
                }
                if correction_path:
                    final_event["correctionScreenshot"] = os.path.relpath(correction_path, ROOT).replace("\\", "/")
                type(self)._append_ocr_event_(final_event)
                type(self)._ocr_pending = None
            event = type(self)._enqueue_ocr_spin_(number)
            self.send_json(200, {"ok": True, "event": event, "ocrEvent": final_event})
        except (ValueError, OSError) as error:
            self.send_json(400, {"ok": False, "error": str(error)})

    def handle_ocr_skip_(self):
        if not self._local_request_():
            self.send_json(403, {"ok": False, "error": "OCR skip is local-only."})
            return
        try:
            payload = self._json_body_()
            event_id = str(payload.get("eventId", ""))
            with self._ocr_lock:
                pending = type(self)._ocr_pending
                if not pending or pending.get("eventId") != event_id:
                    raise ValueError("This OCR candidate is no longer pending.")
                record = {key: value for key, value in pending.items() if key != "screenshotPath"}
                record.update({"status": "skipped-manual-entry", "session": payload.get("session"), "skippedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z")})
                type(self)._append_ocr_event_(record)
                type(self)._discard_pending_crop_(pending)
                type(self)._ocr_pending = None
            self.send_json(200, {"ok": True, "status": "skipped-manual-entry"})
        except (ValueError, OSError) as error:
            self.send_json(400, {"ok": False, "error": str(error)})

    def handle_ocr_progress_(self):
        if not self._local_request_():
            self.send_json(403, {"ok": False, "error": "OCR progress is local-only."})
            return
        try:
            payload = self._json_body_()
            phase = str(payload.get("phase", ""))
            if phase not in ("starting", "baseline", "watching", "change-detected", "reading", "error"):
                raise ValueError("Invalid OCR phase.")
            with self._ocr_lock:
                type(self)._ocr_phase = phase
                type(self)._ocr_message = str(payload.get("message", ""))[:200]
            self.send_json(200, {"ok": True})
        except ValueError as error:
            self.send_json(400, {"ok": False, "error": str(error)})

    def handle_ocr_dashboard_state_(self):
        if not self._local_request_():
            self.send_json(403, {"ok": False, "error": "OCR dashboard state is local-only."})
            return
        try:
            payload = self._json_body_()
            spin_count = int(payload.get("spinCount", 0))
            if spin_count < 0:
                raise ValueError("Invalid dashboard spin count.")
            with self._ocr_lock:
                type(self)._ocr_dashboard_state = {"session": payload.get("session"), "spinCount": spin_count, "lastNumber": payload.get("lastNumber")}
            self.send_json(200, {"ok": True})
        except (TypeError, ValueError) as error:
            self.send_json(400, {"ok": False, "error": str(error)})

    def handle_ocr_reset_(self):
        if not self._local_request_():
            self.send_json(403, {"ok": False, "error": "OCR reset is local-only."})
            return
        with self._ocr_lock:
            pending = type(self)._ocr_pending
            if pending:
                type(self)._append_ocr_event_({
                    "eventId": pending["eventId"],
                    "profile": pending["profile"],
                    "detectedNumber": pending["detectedNumber"],
                    "signature": pending["signature"],
                    "detectedAt": pending["detectedAt"],
                    "clearedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                    "status": "cleared-session-reset",
                })
                type(self)._discard_pending_crop_(pending)
            type(self)._ocr_pending = None
        self.send_json(200, {"ok": True, "pending": None})
    def handle_window_topmost_(self, forced_target=None):
        length = int(self.headers.get("Content-Length", 0))
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
            enabled = bool(payload.get("enabled", True))
            target = forced_target or str(payload.get("target", "")).lower()
            matched = set_window_topmost(target, enabled)
            self.send_json(200, {"ok": True, "target": target, "enabled": enabled, "matchedWindows": matched})
        except Exception as e:
            self.send_json(500, {"ok": False, "error": str(e)})

    def handle_sync_(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)

        try:
            payload = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_json(400, {"ok": False, "error": "Invalid JSON body"})
            return

        target_url = payload.pop("_targetUrl", None)
        if not target_url:
            self.send_json(400, {"ok": False, "error": "Missing _targetUrl in payload"})
            return

        forward_body = json.dumps(payload).encode("utf-8")

        try:
            # Build opener that properly follows Apps Script POST→GET redirects
            opener = urllib.request.build_opener(
                urllib.request.HTTPRedirectHandler()
            )
            req = urllib.request.Request(
                target_url,
                data=forward_body,
                headers={
                    "Content-Type": "text/plain;charset=utf-8",
                    "User-Agent": "RouletteAnalyzer/1.0",
                },
                method="POST",
            )
            resp = opener.open(req, timeout=SYNC_TIMEOUT_SECONDS)
            resp_body = resp.read().decode("utf-8", errors="replace")
            try:
                self.send_json(200, json.loads(resp_body))
            except (json.JSONDecodeError, UnicodeDecodeError):
                # Apps Script may wrap JSON in HTML after redirect
                m = _re.search(r'\{.*\}', resp_body, _re.DOTALL)
                if m:
                    self.send_json(200, json.loads(m.group()))
                else:
                    self.send_json(200, {"ok": False, "error": f"Non-JSON response: {resp_body[:300]}"})
        except urllib.error.HTTPError as e:
            resp_body = e.read().decode("utf-8", errors="replace")
            try:
                data = json.loads(resp_body)
            except (json.JSONDecodeError, UnicodeDecodeError):
                data = {"ok": False, "error": f"Apps Script returned {e.code}: {resp_body[:300]}"}
            self.send_json(e.code, data)
        except urllib.error.URLError as e:
            self.send_json(502, {"ok": False, "error": f"Cannot reach Apps Script: {e.reason}"})
        except (TimeoutError, socket.timeout):
            self.send_json(504, {"ok": False, "error": f"Apps Script did not respond within {SYNC_TIMEOUT_SECONDS} seconds. The completed session remains pending; try Sync pending sessions again later."})
        except Exception as e:
            self.send_json(500, {"ok": False, "error": str(e)})

    def handle_fetch_(self):
        """Proxy: fetch a URL server-side and return its HTML text (bypasses CORS)."""
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)

        try:
            payload = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_json(400, {"ok": False, "error": "Invalid JSON body"})
            return

        target_url = payload.get("url", "")
        if not target_url:
            self.send_json(400, {"ok": False, "error": "Missing 'url' in payload"})
            return

        # Sanity check — only http/https
        if not _re.match(r"^https?://", target_url):
            self.send_json(400, {"ok": False, "error": "Only http/https URLs supported"})
            return

        try:
            req = urllib.request.Request(
                target_url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.5",
                },
            )
            resp = urllib.request.urlopen(req, timeout=FETCH_TIMEOUT_SECONDS)
            html = resp.read().decode("utf-8", errors="replace")
            self.send_json(200, {"ok": True, "html": html})
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", errors="replace")[:300]
            self.send_json(e.code, {"ok": False, "error": f"HTTP {e.code}: {msg}"})
        except urllib.error.URLError as e:
            self.send_json(502, {"ok": False, "error": f"Cannot reach URL: {e.reason}"})
        except Exception as e:
            self.send_json(500, {"ok": False, "error": str(e)})

    def send_json(self, status, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def guess_type(self, path):
        """Serve .js/.css/.html with explicit UTF-8 charset."""
        base = super().guess_type(path)
        if base in ("text/javascript", "text/css", "text/html"):
            return base + "; charset=utf-8"
        return base

    def log_message(self, format, *args):
        # Keep logs quiet for proxy requests, but show errors
        msg = format % args
        if "api/sync" in msg:
            sys.stderr.write(f"[proxy] {msg}\n")
        else:
            super().log_message(format, *args)


if __name__ == "__main__":
    mutex = None
    if os.name == "nt":
        mutex = ctypes.windll.kernel32.CreateMutexW(None, False, MUTEX_NAME)
        if not mutex:
            print("ERROR: Could not create the dashboard singleton lock.", file=sys.stderr)
            sys.exit(20)
        if ctypes.windll.kernel32.GetLastError() == 183:
            print("ERROR: This exact Roulette Dashboard server is already running.", file=sys.stderr)
            sys.exit(21)

    os.chdir(ROOT)
    with http.server.ThreadingHTTPServer(("", PORT), ProxyHandler) as httpd:
        httpd.daemon_threads = True
        print(f"Roulette Live Dashboard {BUILD}")
        print(f"Serving on http://localhost:{PORT}")
        print(f"Dashboard: http://localhost:{PORT}/live-dashboard.html")
        print(f"Proxy:     POST http://localhost:{PORT}{PROXY_PATH}")
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
