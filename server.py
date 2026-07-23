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

PORT = 8080
PROXY_PATH = "/api/sync"

class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != PROXY_PATH:
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)

        # Parse to extract the target URL from the payload
        try:
            payload = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_json(400, {"ok": False, "error": "Invalid JSON body"})
            return

        target_url = payload.pop("_targetUrl", None)
        if not target_url:
            self.send_json(400, {"ok": False, "error": "Missing _targetUrl in payload"})
            return

        # Re-encode the remaining payload
        forward_body = json.dumps(payload).encode("utf-8")

        try:
            req = urllib.request.Request(
                target_url,
                data=forward_body,
                headers={
                    "Content-Type": "text/plain;charset=utf-8",
                    "User-Agent": "RouletteAnalyzer/1.0",
                },
                method="POST",
            )
            resp = urllib.request.urlopen(req, timeout=20)
            resp_body = resp.read().decode("utf-8")
            self.send_json(200, json.loads(resp_body))
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
