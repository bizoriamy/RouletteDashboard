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
        if self.path == QUICK_ENTRY_PATH:
            self.handle_quick_entry_post_()
        elif self.path == PROXY_PATH:
            self.handle_sync_()
        elif self.path == FETCH_PATH:
            self.handle_fetch_()
        elif self.path == FREDDY_TOPMOST_PATH:
            self.handle_window_topmost_("freddy")
        elif self.path == WINDOW_TOPMOST_PATH:
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
