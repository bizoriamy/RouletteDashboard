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

PORT = 8080
PROXY_PATH = "/api/sync"
FETCH_PATH = "/api/fetch"

class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == PROXY_PATH:
            self.handle_sync_()
        elif self.path == FETCH_PATH:
            self.handle_fetch_()
        else:
            self.send_error(404)

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
            resp = opener.open(req, timeout=20)
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
        if not re.match(r"^https?://", target_url):
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
            resp = urllib.request.urlopen(req, timeout=20)
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
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    with http.server.HTTPServer(("", PORT), ProxyHandler) as httpd:
        print(f"Serving on http://localhost:{PORT}")
        print(f"Dashboard: http://localhost:{PORT}/live-dashboard.html")
        print(f"Proxy:     POST http://localhost:{PORT}{PROXY_PATH}")
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
