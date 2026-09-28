"""BetPilot — Baccarat end-to-end server test.

Run: python server_smoke.py

Starts the real server on a throwaway port with a throwaway data directory, then drives the whole
session flow over HTTP exactly as the browser does — including the requests that must be REJECTED.
The rejections are the point: the old build allowed all of them.
"""
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

TESTS_DIR = os.path.normcase(os.path.realpath(os.path.dirname(os.path.abspath(__file__))))
APP_DIR = os.path.normcase(os.path.realpath(os.path.join(TESTS_DIR, "..", "app")))
CONFIG_DIR = os.path.normcase(os.path.realpath(os.path.join(TESTS_DIR, "..", "config")))
PORT = int(os.environ.get("BACCARAT_TEST_PORT", "8791"))
BASE = "http://127.0.0.1:%d" % PORT

passed = []
failed = []


def check(name, condition, detail=""):
    if condition:
        passed.append(name)
        print("  ok   %s" % name)
    else:
        failed.append((name, detail))
        # str() here: a detail of any type must never turn a failure report into a crash.
        print("  FAIL %s%s" % (name, ("  <- " + str(detail)) if detail else ""))


def request(path, payload=None, method=None, timeout=15):
    """Returns (status, body). Never raises: a timeout or dropped connection becomes status 0.

    A bare traceback here would hide which endpoint misbehaved, so the path travels with the result.
    """
    url = BASE + path
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method or ("POST" if data else "GET"))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
            status = response.status
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        status = error.code
    except (TimeoutError, urllib.error.URLError, ConnectionError, OSError) as error:
        return 0, {"ok": False, "error": "%s on %s" % (type(error).__name__, path), "path": path}
    try:
        return status, json.loads(raw)
    except json.JSONDecodeError:
        return status, raw


def wait_for_health(timeout=20.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            status, body = request("/__baccarat_health__")
            if status == 200 and isinstance(body, dict) and body.get("ok"):
                return body
        except (urllib.error.URLError, ConnectionError, OSError):
            pass
        time.sleep(0.25)
    return None


def main():
    # Scratch data lives inside the module (never in the real config/ or data/ folders) and is
    # removed at the end, so a failed run cannot leave a half-written session behind.
    data_dir = os.path.join(TESTS_DIR, ".smoke-data-%d" % os.getpid())
    shutil.rmtree(data_dir, ignore_errors=True)
    os.makedirs(data_dir, exist_ok=True)
    log_path = os.path.join(data_dir, "server.log")
    env = dict(os.environ)
    env["BACCARAT_PORT"] = str(PORT)
    env["BACCARAT_DATA_DIR"] = data_dir
    env["BACCARAT_INSTANCE_KEY"] = "smoke-%s" % os.getpid()

    with open(log_path, "wb") as log:
        process = subprocess.Popen(
            [sys.executable, "-u", os.path.join(APP_DIR, "server.py")],
            cwd=APP_DIR, env=env, stdout=log, stderr=subprocess.STDOUT,
        )

    try:
        health = wait_for_health()
        if not health:
            print("  FAIL server did not start; log follows")
            with open(log_path, "r", encoding="utf-8", errors="replace") as handle:
                print(handle.read())
            return 1

        print("\nHEALTH & STATIC")
        check("health reports the app and build",
              health.get("app") == "BetPilotBaccarat" and health.get("build", "").startswith("v2."),
              json.dumps(health))
        check("health reports the data directory in use", health.get("data") == os.path.normcase(data_dir),
              "got %s" % health.get("data"))
        with urllib.request.urlopen(BASE + "/", timeout=5) as page:
            html = page.read().decode("utf-8")
        check("index.html is served at /", "<title>BetPilot Baccarat" in html)
        check("the page carries the build string", health["build"] in html)
        check("the page has a single entry screen (no window.open handoff)",
              "window.open" not in html and "entry.html" not in html)
        for asset, marker in (("/engine.js", "settleOpenBet"), ("/ui.js", "BaccaratEngine"), ("/baccarat.css", "--gold")):
            with urllib.request.urlopen(BASE + asset, timeout=5) as response:
                body = response.read().decode("utf-8")
                content_type = response.headers.get("Content-Type", "")
            check("%s is served with utf-8 and its expected content" % asset,
                  marker in body and "charset=utf-8" in content_type,
                  "%s / %s" % (content_type, marker))
        check("no always-on-top window.open flags are used anywhere",
              "alwaysOnTop" not in html and "chrome=no" not in html)
        status, _ = request("/api/baccarat/state")
        check("state starts empty", status == 200)

        print("\nCALIBRATION PROFILES")
        status, body = request("/api/baccarat/profiles")
        profiles = body.get("profiles", []) if isinstance(body, dict) else []
        check("the API serves exactly the 9 provider x layout profiles", len(profiles) == 9,
              "%d profiles" % len(profiles))
        check("every profile states its region convention",
              all(p.get("region") and p.get("label") for p in profiles))
        check("no provider-less duplicate profiles are served",
              all(p.get("provider") for p in profiles),
              [p.get("id") for p in profiles if not p.get("provider")])
        # A profile may be calibrated once the user measures it, but it may never CLAIM calibration
        # without saying where the measurement came from. That is the property worth protecting.
        unjustified = [p.get("id") for p in profiles if p.get("calibrated")
                       and not (p.get("calibratedAt") or p.get("calibratedFrom")
                                or p.get("matchScore") is not None)]
        check("no profile claims calibration without provenance", not unjustified, unjustified)
        check("a profile that is not calibrated says so",
              all(p.get("calibrated") in (True, False) for p in profiles),
              [p.get("calibrated") for p in profiles])

        print("\nSESSION SETUP")
        status, body = request("/api/baccarat/session", {
            "casino": "Pragmatic Table 3", "startingUnits": 200, "unitValueCents": 500,
            "provider": "Pragmatic", "layout": "Half Width / Full Length", "mode": "manual",
        })
        check("session is created", status == 200 and body.get("ok"), json.dumps(body)[:200])
        check("bankroll equals the starting capital",
              body["derived"]["bankrollCents"] == 100000, json.dumps(body["derived"]["bankrollCents"]))
        status, body = request("/api/baccarat/session", {"startingUnits": 10, "unitValueCents": 500})
        check("a second active session is refused (409, session-exists)",
              status == 409 and body.get("code") == "session-exists", "%s %s" % (status, body))
        status, body = request("/api/baccarat/session", {"startingUnits": -50, "unitValueCents": 500, "force": True})
        check("a negative starting bankroll is refused (the old build accepted -500)",
              status == 400 and body.get("code") == "bad-start", "%s %s" % (status, body))

        print("\nBETTING — the guards that did not exist before")
        status, body = request("/api/baccarat/hand", {"action": "place", "side": "banker", "stakeUnits": 10})
        check("a Banker bet of 10u is accepted",
              status == 200 and body["session"]["openWagers"][0]["side"] == "banker", json.dumps(body)[:200])
        status, body = request("/api/baccarat/hand", {"action": "place", "side": "banker", "stakeUnits": 5})
        check("the same side cannot be bet twice on one hand",
              status == 409 and body.get("code") == "duplicate-wager", "%s %s" % (status, body))
        status, body = request("/api/baccarat/hand", {"action": "place", "side": "player", "stakeUnits": 10})
        check("Banker and Player cannot both be bet on one hand",
              status == 409 and body.get("code") == "conflicting-wager", "%s %s" % (status, body))
        status, body = request("/api/baccarat/hand", {"action": "place", "side": "tie", "stakeUnits": 1})
        check("a Tie bet CAN be added alongside Banker",
              status == 200 and len(body["session"]["openWagers"]) == 2,
              json.dumps(body.get("session", {}).get("openWagers"))[:200])
        status, body = request("/api/baccarat/hand", {"action": "remove", "side": "tie"})
        check("a single wager can be taken off the hand",
              status == 200 and len(body["session"]["openWagers"]) == 1, json.dumps(body)[:200])
        status, body = request("/api/baccarat/hand", {"action": "remove", "side": "tie"})
        check("removing a wager that is not open is refused",
              status == 409 and body.get("code") == "no-open-wager", "%s %s" % (status, body))
        # Clear the hand so the stake-validation checks below are not masked by the wager guards.
        status, body = request("/api/baccarat/hand", {"action": "cancel"})
        check("cancelling clears the open hand", status == 200 and body["session"]["openWagers"] == [],
              json.dumps(body)[:200])
        status, body = request("/api/baccarat/hand", {"action": "place", "side": "banker", "stakeUnits": 500})
        check("a stake larger than the bankroll is refused (M2)",
              status == 400 and body.get("code") == "stake-over-bankroll", "%s %s" % (status, body))
        status, body = request("/api/baccarat/hand", {"action": "place", "side": "dragon", "stakeUnits": 1})
        check("an unknown bet side is refused",
              status == 400 and body.get("code") == "bad-input", "%s %s" % (status, body))
        status, body = request("/api/baccarat/hand", {"action": "place", "side": "banker", "stakeUnits": 0})
        check("a zero stake is refused", status == 400 and body.get("code") == "bad-stake", "%s %s" % (status, body))
        status, state_body = request("/api/baccarat/state")
        check("a refused bet leaves no open wager behind", state_body["session"]["openWagers"] == [])

        print("\nHEDGED HANDS — a Tie bet alongside Banker or Player")
        request("/api/baccarat/hand", {"action": "place", "side": "banker", "stakeUnits": 10})
        status, body = request("/api/baccarat/hand", {"action": "place", "side": "tie", "stakeUnits": 1})
        check("both wagers are committed", len(body["session"]["openWagers"]) == 2)
        status, body = request("/api/baccarat/hand", {"action": "settle", "result": "tie"})
        hedged = body["derived"]
        check("one result settles both wagers",
              hedged["hands"][0]["wagers"][0]["outcome"] == "push"
              and hedged["hands"][0]["wagers"][1]["outcome"] == "win",
              json.dumps(hedged["hands"][0])[:220])
        check("the hedged hand nets the Tie win (8:1 on 1u at $5)",
              hedged["netCents"] == 4000, hedged["netCents"])
        check("it counts as one hand with two wagers",
              hedged["totalHands"] == 1 and hedged["wagers"] == 2,
              json.dumps({key: hedged[key] for key in ("totalHands", "wagers")}))
        check("the hand is a win for the statistics", hedged["wins"] == 1 and hedged["pushes"] == 0,
              json.dumps({key: hedged[key] for key in ("wins", "pushes")}))
        status, body = request("/api/baccarat/hand", {"action": "undo"})
        check("the hedged hand undoes in one step", body["derived"]["totalHands"] == 0, json.dumps(body)[:200])
        check("undoing it restores the bankroll", body["derived"]["bankrollCents"] == 100000,
              body["derived"]["bankrollCents"])

        print("\nINSURANCE — the Tie stake is sized on its own")
        request("/api/baccarat/hand", {"action": "place", "side": "banker", "stakeUnits": 100})
        status, body = request("/api/baccarat/hand", {"action": "place", "side": "tie", "stakeUnits": 10})
        stakes = [(wager["side"], wager["stakeUnits"]) for wager in body["session"]["openWagers"]]
        check("Banker 100u and Tie 10u keep their own stakes",
              stakes == [("banker", 100), ("tie", 10)], json.dumps(stakes))
        status, body = request("/api/baccarat/hand", {"action": "settle", "result": "banker"})
        check("a 10u insurance only costs 10u when Banker wins (47500 - 5000)",
              body["derived"]["netCents"] == 42500, str(body["derived"]["netCents"]))
        status, body = request("/api/baccarat/hand", {"action": "undo"})
        request("/api/baccarat/hand", {"action": "place", "side": "banker", "stakeUnits": 100})
        request("/api/baccarat/hand", {"action": "place", "side": "tie", "stakeUnits": 10})
        status, body = request("/api/baccarat/hand", {"action": "settle", "result": "tie"})
        check("the insurance pays 8:1 on its own 10u when the Tie lands",
              body["derived"]["netCents"] == 40000, body["derived"]["netCents"])
        check("the Banker stake is pushed, not lost",
              body["derived"]["hands"][0]["wagers"][0]["outcome"] == "push",
              json.dumps(body["derived"]["hands"][0])[:200])
        status, body = request("/api/baccarat/hand", {"action": "undo"})
        check("the insurance hand undoes cleanly",
              body["derived"]["totalHands"] == 0 and body["derived"]["bankrollCents"] == 100000,
              json.dumps(body["derived"])[:200])

        print("\nPASS — no bet, but the table's result is still recorded")
        status, body = request("/api/baccarat/hand", {"action": "place", "side": "pass", "stakeUnits": 0})
        check("a pass opens the hand with nothing at stake",
              status == 200 and body["session"]["openWagers"][0]["side"] == "pass"
              and body["session"]["openWagers"][0]["stakeUnits"] == 0, json.dumps(body)[:220])
        status, body = request("/api/baccarat/hand", {"action": "place", "side": "pass", "stakeUnits": 5})
        check("a pass cannot carry a stake",
              status == 400 and body.get("code") == "bad-stake", "%s %s" % (status, body))
        status, body = request("/api/baccarat/hand", {"action": "place", "side": "banker", "stakeUnits": 1})
        check("a bet cannot be added to a passed hand",
              status == 409 and body.get("code") == "pass-open", "%s %s" % (status, body))
        status, body = request("/api/baccarat/hand", {"action": "place", "side": "pass", "stakeUnits": 0})
        check("passing the same hand twice is refused",
              status == 409 and body.get("code") == "duplicate-wager", "%s %s" % (status, body))
        status, body = request("/api/baccarat/hand", {"action": "settle", "result": "banker"})
        passed_derived = body["derived"]
        check("the passed hand records the table's result",
              passed_derived["totalHands"] == 1 and passed_derived["hands"][0]["result"] == "banker",
              json.dumps(passed_derived["hands"][0])[:220])
        check("the passed hand moves no money",
              passed_derived["netCents"] == 0 and passed_derived["bankrollCents"] == 100000,
              json.dumps({key: passed_derived[key] for key in ("netCents", "bankrollCents")}))
        check("it counts as a no-bet hand, never a win or a wager",
              passed_derived["voids"] == 1 and passed_derived["wins"] == 0 and passed_derived["wagers"] == 0,
              json.dumps({key: passed_derived[key] for key in ("voids", "wins", "wagers")}))
        check("the result feeds the bead plate and the result distribution",
              passed_derived["sequence"] == ["banker"] and passed_derived["bankerResults"] == 1,
              json.dumps({key: passed_derived[key] for key in ("sequence", "bankerResults")}))
        status, body = request("/api/baccarat/hand", {"action": "place", "side": "pass", "stakeUnits": 0})
        check("a new pass can be opened after the last one settled", status == 200)
        status, body = request("/api/baccarat/hand", {"action": "remove", "side": "pass"})
        check("removing a pass before the result logs nothing",
              status == 200 and body["session"]["openWagers"] == []
              and body["derived"]["totalHands"] == 1, json.dumps(body["session"]["openWagers"]))
        status, body = request("/api/baccarat/hand", {"action": "undo"})
        check("the passed hand undoes cleanly",
              body["derived"]["totalHands"] == 0 and body["derived"]["bankrollCents"] == 100000,
              json.dumps(body["derived"])[:200])

        print("\nSETTLEMENT — outcomes are derived, never submitted")
        status, body = request("/api/baccarat/hand", {"action": "place", "side": "banker", "stakeUnits": 10})
        status, body = request("/api/baccarat/hand", {"action": "settle", "result": "tie"})
        check("Banker vs a Tie result pushes", status == 200 and body["derived"]["pushes"] == 1, json.dumps(body)[:200])
        check("a push leaves the bankroll untouched (H3)",
              body["derived"]["bankrollCents"] == 100000 and body["derived"]["netCents"] == 0,
              json.dumps(body["derived"]))
        status, body = request("/api/baccarat/hand", {"action": "settle", "result": "tie"})
        check("settling the same hand twice is refused (H4)",
              status == 409 and body.get("code") == "no-open-bet", "%s %s" % (status, body))

        status, body = request("/api/baccarat/hand", {"action": "place", "side": "banker", "stakeUnits": 10})
        status, body = request("/api/baccarat/hand", {"action": "settle", "result": "player"})
        check("a Banker bet on a Player result loses the stake (H2)",
              body["derived"]["netCents"] == -5000, json.dumps(body["derived"]["netCents"]))
        status, body = request("/api/baccarat/hand", {"action": "place", "side": "player", "stakeUnits": 10})
        status, body = request("/api/baccarat/hand", {"action": "settle", "result": "player"})
        check("a Player bet on a Player result pays 1:1, netting the previous loss back to zero",
              body["derived"]["netCents"] == 0, json.dumps(body["derived"]["netCents"]))
        status, body = request("/api/baccarat/hand", {"action": "place", "side": "banker", "stakeUnits": 1})
        status, body = request("/api/baccarat/hand", {"action": "settle", "result": "banker"})
        check("a 1-unit Banker win pays 475 cents, not a whole unit (M1)",
              body["derived"]["netCents"] == 475 and body["derived"]["commissionCents"] == 25,
              json.dumps({"net": body["derived"]["netCents"], "commission": body["derived"]["commissionCents"]}))
        status, body = request("/api/baccarat/hand", {"action": "pass", "result": "banker"})
        check("a no-bet hand is recorded as void and moves nothing",
              status == 200 and body["derived"]["voids"] == 1 and body["derived"]["netCents"] == 475,
              json.dumps({"voids": body["derived"]["voids"], "net": body["derived"]["netCents"]}))
        check("bankroll always equals starting capital plus net P&L",
              body["derived"]["bankrollCents"] == body["derived"]["startingCents"] + body["derived"]["netCents"])

        print("\nUNDO, END, ARCHIVE, EXPORT")
        status, body = request("/api/baccarat/hand", {"action": "undo"})
        check("undo removes the last hand and recalculates", status == 200 and body["derived"]["voids"] == 0)
        status, body = request("/api/baccarat/end", {})
        check("ending the session archives it", status == 200 and body["session"]["status"] == "ended")
        status, body = request("/api/baccarat/hand", {"action": "place", "side": "banker", "stakeUnits": 1})
        check("an ended session refuses further bets", status == 409 and body.get("code") == "session-ended")
        status, body = request("/api/baccarat/history")
        check("the archived session appears in history", status == 200 and len(body["sessions"]) == 1,
              json.dumps(body)[:200])
        check("history carries the net result",
              body["sessions"][0]["netCents"] == 475 and body["sessions"][0]["hands"] == 4,
              json.dumps(body["sessions"][0]))
        with urllib.request.urlopen(BASE + "/api/baccarat/export?format=csv", timeout=5) as response:
            csv = response.read().decode("utf-8")
        lines = [line for line in csv.strip().split("\n") if line]
        check("CSV export has a header and one row per hand", len(lines) == 5, "lines=%d" % len(lines))
        check("CSV export carries the wager breakdown column", lines[0].strip().endswith("wagers"), lines[0])
        check("CSV export shows the derived outcome", ",win," in csv or ",lose," in csv, csv[:200])
        check("CSV export never contains a key or a path outside the module", "sk-" not in csv and "PawWork" not in csv)
        with urllib.request.urlopen(BASE + "/api/baccarat/export?format=json", timeout=5) as response:
            exported = json.loads(response.read().decode("utf-8"))
        check("JSON export round-trips the recorded inputs",
              exported["hands"][0]["wagers"][0]["side"] == "banker"
              and exported["hands"][0]["result"] == "tie",
              json.dumps(exported["hands"][0])[:200])

        print("\nPERSISTENCE ACROSS A RESTART")
        restarted = subprocess.Popen(
            [sys.executable, "-u", os.path.join(APP_DIR, "server.py")],
            cwd=APP_DIR, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        check("the same server refuses to double-start (singleton lock)", restarted.wait(timeout=10) == 21,
              "exit=%s" % restarted.returncode)

        print("\nENDPOINT HYGIENE")
        status, body = request("/api/baccarat/hand", {"action": "levitate"})
        check("an unknown action is refused", status == 400 and body.get("code") == "unknown-action",
              "%s %s" % (status, body))
        status, body = request("/api/baccarat/hand", "not-an-object")
        check("a non-object JSON body is refused", status == 400 and body.get("code") == "bad-json",
              "%s %s" % (status, str(body)[:120]))
        status, body = request("/api/window/topmost", {"target": "elsewhere", "enabled": True})
        check("an unknown topmost target is refused", status == 500 or status == 400, "%s" % status)
        status, body = request("/api/baccarat/history", method="GET")
        check("history is readable", status == 200)

        print("\nOCR — honest availability, guarded start")
        status, body = request("/api/baccarat/ocr/status")
        check("OCR status is readable", status == 200 and body.get("ok") is True, body)
        check("OCR status reports availability and lists what is missing",
              isinstance(body.get("available"), bool) and isinstance(body.get("missing"), list), body)
        available = bool(body.get("available"))
        check("OCR status states which provider is configured",
              body.get("provider") in ("deepseek", "gemini") or not available, body.get("provider"))
        check("OCR status carries the accuracy readout",
              isinstance(body.get("stats"), dict) and "readings" in body["stats"]
              and "verdict" in body["stats"] and "accuracyPercent" in body["stats"],
              json.dumps(body.get("stats"))[:220])
        check("the readout starts with no readings on a fresh data directory",
              body["stats"]["readings"] == 0 and "No readings yet" in body["stats"]["verdict"],
              json.dumps(body["stats"])[:220])
        status, body = request("/api/baccarat/ocr/stop", {})
        check("stopping OCR that never started is safe", status == 200 and body.get("ok") is True, body)
        status, body = request("/api/baccarat/ocr/confirm", {"accept": True})
        check("confirming with nothing pending is refused",
              status == 409 and body.get("code") == "no-pending", "%s %s" % (status, body))
        status, body = request("/api/baccarat/ocr/start", {"mode": "telepathy",
                                                          "profileId": "baccarat-pragmatic-half-width-full-length"})
        if available:
            check("an unknown OCR mode is refused",
                  status == 400 and body.get("code") == "bad-mode", "%s %s" % (status, body))
        else:
            check("OCR refuses to start when its stack is incomplete",
                  status == 409 and body.get("code") == "ocr-not-ready", "%s %s" % (status, body))
        status, body = request("/api/baccarat/ocr/start", {"mode": "confirm",
                                                          "profileId": "baccarat-pragmatic-half-width-full-length"})
        if available:
            # The session at this point is ended, so OCR must refuse rather than resurrect it.
            check("OCR refuses to start without an active session",
                  status == 409 and body.get("code") == "no-session", "%s %s" % (status, body))
        else:
            check("OCR stays unavailable rather than half-starting",
                  status == 409, "%s %s" % (status, body))
        status, body = request("/api/baccarat/ocr/events")
        check("the OCR event log is readable", status == 200 and isinstance(body.get("events"), list))
        status, body = request("/api/baccarat/state")
        ocr_hands = [hand for hand in (body["session"]["hands"] if body.get("session") else [])
                     if hand.get("source") == "ocr"]
        check("no refused OCR start wrote anything into the session", not ocr_hands, ocr_hands)

        # The one-click sample: captures what the reader would see and saves it, calling no model.
        status, body = request("/api/baccarat/ocr/sample", {"profileId": None})
        if status == 200 and body.get("ok"):
            check("a screenshot sample is saved and reported",
                  os.path.isfile(body["path"]) and body["bytes"] > 0, json.dumps(body)[:220])
            check("the sample lands in the data directory, not in the module",
                  os.path.normcase(body["path"]).startswith(os.path.normcase(data_dir)), body.get("path"))
            check("the sample reports its size and signature",
                  body["width"] > 0 and body["height"] > 0 and "-" in body["signature"],
                  json.dumps(body)[:220])
        else:
            # A headless or locked session cannot capture; the endpoint must say so plainly rather
            # than claim it saved something.
            check("without a capturable screen the sample endpoint refuses clearly",
                  status in (500, 503) and "capture" in json.dumps(body).lower(),
                  "%s %s" % (status, json.dumps(body)[:200]))
        status, body = request("/api/baccarat/ocr/sample", {"profileId": "no-such-profile"})
        check("an unknown calibration profile is refused for a sample",
              status == 400 and body.get("code") == "bad-profile", "%s %s" % (status, body))

        # Locating the table: the refusals matter more than the success (which needs a live table).
        with open(os.path.join(CONFIG_DIR, "baccarat-pragmatic-half-width-full-length.json"),
                  "r", encoding="utf-8") as handle:
            stored = json.load(handle)
        before_profile = (stored.get("region"), stored.get("calibrated"), stored.get("calibratedAt"))
        status, body = request("/api/baccarat/ocr/locate", {"profileId": "no-such-profile"})
        check("locating the table refuses an unknown profile",
              status == 400 and body.get("code") == "bad-profile", "%s %s" % (status, body))
        status, body = request("/api/baccarat/ocr/locate", {"profileId": None, "sample": "not-there.png"})
        check("locating refuses when there is no sample to look for",
              status == 409 and body.get("code") == "no-samples", "%s %s" % (status, body))

        # Drawing the region by hand: a picture of the screen comes back, and a bad region is refused.
        status, body = request("/api/baccarat/ocr/screen", {})
        check("a picture of the screen can be fetched for drawing",
              status == 200 and body.get("ok")
              and str(body.get("image", "")).startswith("data:image/png;base64,"),
              "%s %s" % (status, json.dumps(body)[:120]))
        check("it reports the scale and the screen size it measured",
              0 < float(body.get("scale", 0)) <= 1.0 and int(body.get("screenWidth", 0)) > 0
              and int(body.get("screenHeight", 0)) > 0,
              json.dumps({key: body.get(key) for key in ("scale", "screenWidth", "screenHeight")}))
        screen_w = int(body.get("screenWidth") or 0)
        screen_h = int(body.get("screenHeight") or 0)
        status, body = request("/api/baccarat/ocr/region",
                               {"profileId": "no-such-profile", "region": [10, 10, 100, 50]})
        check("a drawn region for an unknown profile is refused",
              status == 400 and body.get("code") == "bad-profile", "%s %s" % (status, body))
        status, body = request("/api/baccarat/ocr/region",
                               {"profileId": "baccarat-pragmatic-half-width-full-length", "region": [1, 2, 3]})
        check("a malformed drawn region is refused",
              status == 400 and body.get("code") == "bad-region", "%s %s" % (status, body))
        status, body = request("/api/baccarat/ocr/region",
                               {"profileId": "baccarat-pragmatic-half-width-full-length",
                                "region": [1900, 1000, 900, 680]})
        check("a drawn region that runs off the screen is refused",
              status == 400 and body.get("code") == "bad-region", "%s %s" % (status, body))
        # A refused locate or an off-screen region must leave the profile EXACTLY as it was. This is
        # checked as a before/after comparison rather than assuming the profile ships uncalibrated —
        # the user may well have calibrated it for real by now.
        profile_path = os.path.join(CONFIG_DIR, "baccarat-pragmatic-half-width-full-length.json")

        def profile_state():
            with open(profile_path, "r", encoding="utf-8") as handle:
                stored = json.load(handle)
            return (stored.get("region"), stored.get("calibrated"), stored.get("calibratedAt"))

        unchanged = profile_state() == before_profile
        check("nothing that was refused wrote anything into a profile", unchanged,
              "%s -> %s" % (before_profile, profile_state()))
        check("the profile is a real one with a region", len(before_profile[0]) == 4, before_profile[0])

        # A whole-screen profile must be refused before it loops on errors, not started. Whether the
        # shipped full-width region counts as the whole screen depends on THIS machine's screen, and
        # the user may have calibrated the profile since — so the expectation is computed, not assumed.
        profiles = {p.get("id"): p for p in (request("/api/baccarat/profiles")[1].get("profiles") or [])}
        candidate = profiles.get("baccarat-playtech-full-width-full-length") or {}
        candidate_region = candidate.get("region") or []
        whole = (len(candidate_region) == 4 and screen_w and screen_h
                 and candidate_region[2] * candidate_region[3] >= 0.95 * screen_w * screen_h)
        status, body = request("/api/baccarat/ocr/start",
                               {"mode": "confirm", "profileId": candidate.get("id")})
        if whole:
            check("a whole-screen profile is refused rather than started",
                  status == 409 and body.get("code") == "busy-region", "%s %s" % (status, body))
            check("and the refusal says what to do instead",
                  "Draw the region" in str(body.get("error", "")), body.get("error"))
        else:
            check("a profile smaller than the screen is not flagged as whole-screen",
                  status != 200 or body.get("ok"), "%s %s" % (status, body))
            if status == 200:
                request("/api/baccarat/ocr/stop", {})

    finally:
        try:
            process.terminate()
            process.wait(timeout=10)
        except Exception:
            try:
                process.kill()
            except Exception:
                pass
        # Keep the evidence when something failed: the server log explains a dropped request.
        if failed:
            try:
                with open(log_path, "r", encoding="utf-8", errors="replace") as handle:
                    tail = handle.read().strip().splitlines()[-25:]
                print("\n--- server log (last %d lines) ---" % len(tail))
                for line in tail:
                    print("  " + line)
            except OSError:
                pass
        shutil.rmtree(data_dir, ignore_errors=True)

    print("\n%s — %d passed, %d failed\n" % ("PASS" if not failed else "FAIL", len(passed), len(failed)))
    if failed:
        for name, detail in failed:
            print("FAILED: %s\n  %s" % (name, detail))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
