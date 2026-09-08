"""
Roulette Capture Server — standalone proof-of-concept.

Run: python capture-server.py
Then: - Open http://localhost:8081 for instructions
      - Open http://localhost:8081/test.html to test the bookmarklet
      - Open http://localhost:8081/view to see captured spins

Future integration note:
  This server stores every captured spin in spins.json.
  The main dashboard can later poll GET /api/spins or read spins.json directly.
"""
import http.server
import json
import os
import sys
import time
import mimetypes

PORT = 8081
SPINS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "spins.json")


def load_spins():
    if not os.path.exists(SPINS_FILE):
        return []
    try:
        with open(SPINS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return []


def save_spins(spins):
    with open(SPINS_FILE, "w", encoding="utf-8") as f:
        json.dump(spins, f, indent=2, ensure_ascii=False)


class CaptureHandler(http.server.SimpleHTTPRequestHandler):
    # ── Quiet broken-pipe errors from client disconnects ──
    def handle_error(self, request, client_address):
        import traceback
        tb = traceback.format_exc()
        if "ConnectionAbortedError" in tb or "ConnectionResetError" in tb or "BrokenPipeError" in tb:
            return  # silent — client disconnected during polling
        super().handle_error(request, client_address)

    def do_GET(self):
        # Route API calls
        if self.path == "/api/spins":
            self.send_json(200, load_spins())
            return
        if self.path == "/api/spins/latest":
            spins = load_spins()
            self.send_json(200, spins[-10:] if spins else [])
            return

        # Friendly URL aliases
        if self.path == "/view" or self.path == "/view/":
            self.path = "/capture-dashboard.html"
        if self.path == "/capture" or self.path == "/capture/":
            self.path = "/capture.html"

        # Serve static files (default)
        super().do_GET()

    def do_DELETE(self):
        if self.path == "/api/spins":
            save_spins([])
            self.send_json(200, {"ok": True, "message": "All spins cleared."})
            return
        self.send_json(404, {"ok": False, "error": "Not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else b"{}"

        try:
            payload = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_json(400, {"ok": False, "error": "Invalid JSON"})
            return

        if self.path == "/api/spin":
            self.handle_spin(payload)
        elif self.path == "/api/spins/batch":
            self.handle_batch(payload)
        else:
            self.send_json(404, {"ok": False, "error": "Not found"})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS, GET, DELETE")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    # ── API handlers ──────────────────────────────────────────────

    def handle_spin(self, payload):
        number = payload.get("number")
        if number is None or not isinstance(number, (int, float)) or number < 0 or number > 36 or number != int(number):
            self.send_json(400, {"ok": False, "error": "Invalid number. Must be an integer 0–36."})
            return

        spins = load_spins()
        record = {
            "number": int(number),
            "capturedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "timestamp": int(time.time() * 1000),
            "method": payload.get("method", "bookmarklet"),
            "label": payload.get("label", ""),
        }
        spins.append(record)
        save_spins(spins)
        self.send_json(200, {"ok": True, "count": len(spins), "last": record})

    def handle_batch(self, payload):
        numbers = payload.get("numbers", [])
        if not isinstance(numbers, list) or not numbers:
            self.send_json(400, {"ok": False, "error": "Invalid or empty numbers array"})
            return

        valid = []
        for n in numbers:
            if isinstance(n, (int, float)) and 0 <= n <= 36 and n == int(n):
                valid.append(int(n))

        if not valid:
            self.send_json(400, {"ok": False, "error": "No valid numbers 0–36 found in array"})
            return

        spins = load_spins()
        now = time.strftime("%Y-%m-%dT%H:%M:%S")
        ts = int(time.time() * 1000)
        for n in valid:
            spins.append({
                "number": n,
                "capturedAt": now,
                "timestamp": ts,
                "method": payload.get("method", "bookmarklet"),
            })
        save_spins(spins)
        self.send_json(200, {"ok": True, "count": len(valid), "total": len(spins)})

    # ── Helpers ───────────────────────────────────────────────────

    def send_json(self, status, data):
        body = json.dumps(data).encode("utf-8")
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            pass  # client disconnected — harmless

    def log_message(self, fmt, *args):
        msg = fmt % args
        # Quiet: suppress polling noise and broken-pipe tracebacks
        if "/api/spins" in msg or "/api/spin" in msg:
            return
        if "/api/" in msg:
            sys.stderr.write(f"[capture] {msg}\n")
        else:
            super().log_message(fmt, *args)


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    # Ensure spins.json exists
    if not os.path.exists(SPINS_FILE):
        save_spins([])
    with http.server.HTTPServer(("", PORT), CaptureHandler) as httpd:
        print(f"+{'-'*46}+")
        print(f"|  Roulette Capture Server                    |")
        print(f"|  Running on http://localhost:{PORT:<5}             |")
        print(f"|                                              |")
        print(f"|  Home:  http://localhost:{PORT}/               |")
        print(f"|  Tab:   http://localhost:{PORT}/capture         |")
        print(f"|  Test:  http://localhost:{PORT}/test.html       |")
        print(f"|  View:  http://localhost:{PORT}/view            |")
        print(f"|                                              |")
        print(f"|  POST /api/spin     single number            |")
        print(f"|  POST /api/spins/batch    batch numbers      |")
        print(f"|  GET  /api/spins     all captured numbers    |")
        print(f"+{'-'*46}+")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
