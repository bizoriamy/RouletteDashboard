"""BetPilot — OCR logic tests.

Run: python ocr_test.py

Drives the OCR reader and the server's OCR controller with a fake screen and a fake vision model, so
duplicate suppression and the observe/confirm/auto rules are verified without touching a real casino
screen or spending an API call.

The fake screen is a solid-colour PNG: the colour decides the result the fake model reports.
"""
import io
import json
import os
import shutil
import sys
import time

TESTS_DIR = os.path.normcase(os.path.realpath(os.path.dirname(os.path.abspath(__file__))))
APP_DIR = os.path.normcase(os.path.realpath(os.path.join(TESTS_DIR, "..", "app")))
DATA_DIR = os.path.join(TESTS_DIR, ".ocr-test-data")

shutil.rmtree(DATA_DIR, ignore_errors=True)
os.environ["BACCARAT_DATA_DIR"] = DATA_DIR
os.environ["BACCARAT_INSTANCE_KEY"] = "ocr-test-%d" % os.getpid()

sys.path.insert(0, APP_DIR)

import ocr  # noqa: E402
import server  # noqa: E402
import settlement  # noqa: E402

from PIL import Image  # noqa: E402

BANKER = (220, 20, 60)
PLAYER = (30, 144, 255)
TIE = (13, 107, 61)
BLANK = (200, 200, 200)
COLOUR_RESULT = {BANKER: "banker", PLAYER: "player", TIE: "tie", BLANK: None}

# Scan settings live under the "scan" key, exactly as config/ocr.json has them. Getting this nesting
# wrong silently falls back to the 1.5s production delay, which made these tests crawl.
SCAN_SETTINGS = {"scan": {"intervalSeconds": 0.05, "confirmDelaySeconds": 0.0,
                          "stableReads": 2, "minConfidence": 0.5}}
SCAN_INTERVAL = SCAN_SETTINGS["scan"]["intervalSeconds"]

passed = []
failed = []


def check(name, condition, detail=""):
    if condition:
        passed.append(name)
        print("  ok   %s" % name)
    else:
        failed.append((name, detail))
        print("  FAIL %s%s" % (name, ("  <- " + str(detail)) if detail else ""))


def png_bytes(colour, size=(60, 30)):
    image = Image.new("RGB", size, colour)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


class FakeScreen:
    """A screen whose colour can be changed, with a queue to force specific model replies."""

    def __init__(self):
        self.colour = BLANK
        self.confidence = 0.92
        self.replies = []       # optional queue of raw model replies, consumed before the colour map
        self.captures = 0
        self.reads = 0
        self.on_capture = None  # hook: called after each capture, to simulate the screen changing

    def capture(self, region):
        self.captures += 1
        # The image is produced FIRST, so a hook can change the screen for the *next* capture —
        # which is how a mid-read change is simulated.
        data = png_bytes(self.colour)
        if self.on_capture:
            self.on_capture(self)
        return data

    def read(self, image_bytes):
        self.reads += 1
        if self.replies:
            return self.replies.pop(0)
        with Image.open(io.BytesIO(image_bytes)) as image:
            colour = image.convert("RGB").getpixel((0, 0))
        return json.dumps({
            "result": COLOUR_RESULT.get(colour),
            "confidence": self.confidence,
            "evidence": "fake screen colour %s" % (colour,),
        })


def make_monitor(controller, screen):
    return ocr.OcrMonitor(server.STORE, controller._on_candidate, capture=screen.capture,
                          read=screen.read, interval=SCAN_INTERVAL, config=SCAN_SETTINGS)


def wait_for(predicate, timeout=6.0, interval=0.05):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return False


def fresh_session(mode="manual", starting_units=100):
    server.STORE.clear()
    return server.STORE.create({
        "casino": "OCR test table", "startingUnits": starting_units, "unitValueCents": 500,
        "provider": "Pragmatic", "layout": "Half Width / Full Length", "mode": mode, "force": True,
    })


# ============================================================ scan decisions (pure)


def test_scan_decisions():
    print("\nSCAN DECISIONS")
    screen = FakeScreen()
    reader = ocr.OcrReader(capture=screen.capture, read=screen.read, config=SCAN_SETTINGS)

    screen.colour = BANKER
    decision = reader.scan((0, 0, 10, 10), set())
    check("a stable region with a clear result is a candidate",
          decision["status"] == "candidate" and decision["result"] == "banker", decision)
    check("a candidate is confirmed by a double read", len(decision["reads"]) == 2, decision.get("reads"))
    signature = decision["signature"]

    decision = reader.scan((0, 0, 10, 10), set())
    check("an unchanged region is not re-reported", decision["status"] == "unchanged", decision)

    reader.last_signature = None
    decision = reader.scan((0, 0, 10, 10), {signature})
    check("a signature already recorded is reported as a duplicate",
          decision["status"] == "duplicate", decision)

    # A colour-only change must count as a change: this is what the luminance hash got wrong.
    reader = ocr.OcrReader(capture=screen.capture, read=screen.read, config=SCAN_SETTINGS)
    screen.colour = BANKER
    banker_signature = ocr.region_signature(screen.capture((0, 0, 10, 10)))
    player_signature = ocr.region_signature(png_bytes(PLAYER))
    check("a red Banker region and a blue Player region have different signatures",
          banker_signature != player_signature, "%s vs %s" % (banker_signature, player_signature))

    # The screen changing between the two reads must not produce a decision.
    reader = ocr.OcrReader(capture=screen.capture, read=screen.read, config=SCAN_SETTINGS)

    def flip_once(current):
        current.colour = PLAYER
        current.on_capture = None

    screen.colour = BANKER
    screen.on_capture = flip_once
    decision = reader.scan((0, 0, 10, 10), set())
    check("a region that changes mid-read yields no decision",
          decision["status"] == "unchanged" and "changed" in decision.get("note", ""), decision)
    screen.on_capture = None

    # Two reads that disagree must not produce a candidate.
    reader = ocr.OcrReader(capture=screen.capture, read=screen.read, config=SCAN_SETTINGS)
    screen.colour = BANKER
    screen.replies = [json.dumps({"result": "banker", "confidence": 0.9}),
                      json.dumps({"result": "player", "confidence": 0.9})]
    decision = reader.scan((0, 0, 10, 10), set())
    check("two reads that disagree yield unclear, not a candidate",
          decision["status"] == "unclear" and not decision["result"], decision)

    # Low confidence is refused.
    reader = ocr.OcrReader(capture=screen.capture, read=screen.read, config=SCAN_SETTINGS)
    screen.replies = []
    screen.colour = BANKER
    screen.confidence = 0.2
    decision = reader.scan((0, 0, 10, 10), set())
    check("a low-confidence read is refused",
          decision["status"] == "unclear" and "confidence" in decision.get("note", ""), decision)
    screen.confidence = 0.92

    # An unclear display (no result) is not a candidate.
    reader = ocr.OcrReader(capture=screen.capture, read=screen.read, config=SCAN_SETTINGS)
    screen.colour = BLANK
    decision = reader.scan((0, 0, 10, 10), set())
    check("a blank display yields unclear", decision["status"] == "unclear", decision)

    # A model that answers with prose is an error, not a silent zero.
    reader = ocr.OcrReader(capture=screen.capture, read=lambda _b: "I think it was banker, maybe.",
                           config=SCAN_SETTINGS)
    screen.colour = TIE
    try:
        reader.scan((0, 0, 10, 10), set())
        check("a non-JSON model reply raises", False, "no error raised")
    except ocr.OcrError as error:
        check("a non-JSON model reply raises", True)
        check("the error explains what arrived", "did not return JSON" in str(error), error)


def test_parsing():
    print("\nMODEL REPLY PARSING")
    parsed = ocr.parse_result_json('```json\n{"result":"BANKER","confidence":0.92,"evidence":"red"}\n```')
    check("code fences and upper case are tolerated", parsed["result"] == "banker" and parsed["confidence"] == 0.92, parsed)
    parsed = ocr.parse_result_json('{"result":"none","confidence":0}')
    check("'none' becomes no result", parsed["result"] is None, parsed)
    for bad, why in (('{"result":"super-six","confidence":1}', "an unknown result"),
                     ('{"result":7,"confidence":1}', "a non-text result")):
        try:
            ocr.parse_result_json(bad)
            check("a reply with %s is refused" % why, False, bad)
        except ocr.OcrError:
            check("a reply with %s is refused" % why, True)


# ============================================================ mode semantics


def test_modes():
    print("\nMODE SEMANTICS (through the real server controller)")
    controller = server.OcrController()
    controller_start = controller.start

    # Availability depends on this machine's key file; these tests are about mode rules, so state
    # availability explicitly. describe_availability() itself is covered by the server smoke test.
    original = ocr.describe_availability
    ocr.describe_availability = lambda: {
        "available": True, "missing": [], "provider": "deepseek", "providers": {},
        "secretsFile": "<test>", "configPath": "<test>",
    }
    try:
        screen = FakeScreen()
        controller.monitor = make_monitor(controller, screen)
        profile = "baccarat-pragmatic-half-width-full-length"

        # ---- observe: records the hand as a no-bet observation, never a bet -------------------
        fresh_session()
        screen.colour = PLAYER
        controller.start({"mode": "observe", "profileId": profile})
        check("observe mode starts", controller.status()["status"]["running"] is True)
        check("observe mode records the result",
              wait_for(lambda: len((server.STORE.load() or {}).get("hands", [])) == 1))
        session = server.STORE.load()
        hand = session["hands"][0]
        check("the observed hand is a no-bet hand",
              settlement.derive(session)["hands"][0]["isPass"] and hand["wagers"][0]["side"] == "pass", hand)
        check("an observed hand moves no money",
              settlement.derive(session)["netCents"] == 0 and settlement.open_wagers(session) == [],
              settlement.derive(session)["netCents"])
        controller.stop()

        # ---- auto: settles an open bet from the screen ----------------------------------------
        fresh_session(mode="auto")
        server.STORE.place({"side": "banker", "stakeUnits": 10})
        screen.colour = BANKER
        controller.start({"mode": "auto", "profileId": profile})
        check("auto mode settles the open bet from the screen",
              wait_for(lambda: settlement.open_wagers(server.STORE.load() or {}) == []))
        derived = settlement.derive(server.STORE.load())
        check("auto settlement pays the Banker win correctly (10u x $5 less 5%)",
              derived["netCents"] == 4750, derived["netCents"])
        check("the OCR hand is marked as an OCR hand",
              server.STORE.load()["hands"][0]["source"] == "ocr")
        check("the OCR hand carries its screen signature",
              bool(server.STORE.load()["hands"][0]["signature"]))
        controller.stop()

        # ---- duplicate: the same screen must not be recorded twice ----------------------------
        controller.start({"mode": "auto", "profileId": profile})
        time.sleep(0.4)
        hands_after = len(server.STORE.load()["hands"])
        controller.stop()
        check("the same unchanged screen is never recorded twice", hands_after == 1, "hands=%d" % hands_after)
        check("duplicates are counted", controller.status()["status"]["duplicates"] >= 1,
              controller.status()["status"])

        # ---- a late result with no open bet is observed, never settled -------------------------
        fresh_session(mode="auto")
        screen.colour = TIE
        controller.start({"mode": "auto", "profileId": profile})
        check("with no open bet the result is recorded as a no-bet hand",
              wait_for(lambda: len((server.STORE.load() or {}).get("hands", [])) == 1))
        session = server.STORE.load()
        check("no bet was invented",
              settlement.derive(session)["hands"][0]["isPass"] and settlement.open_wagers(session) == [],
              session["hands"][0])
        check("no money moved", settlement.derive(session)["netCents"] == 0)
        controller.stop()

        # ---- confirm: nothing is recorded until the user confirms, and their edit wins ---------
        fresh_session(mode="confirm")
        server.STORE.place({"side": "banker", "stakeUnits": 10})
        screen.colour = PLAYER
        controller.start({"mode": "confirm", "profileId": profile})
        check("confirm mode raises a pending candidate",
              wait_for(lambda: controller.status()["pending"] is not None))
        check("nothing is recorded before confirmation",
              len(server.STORE.load()["hands"]) == 0 and settlement.open_wagers(server.STORE.load()))
        pending = controller.status()["pending"]
        check("the candidate shows what was read", pending["result"] == "player", pending)

        confirmation = controller.confirm({"accept": True, "result": "player"})
        check("confirming records the hand", confirmation["recorded"] is True, confirmation)
        session = server.STORE.load()
        check("the confirmed result settled the bet as a loss",
              settlement.derive(session)["netCents"] == -5000, settlement.derive(session)["netCents"])
        controller.stop()

        # ---- confirm with a correction --------------------------------------------------------
        fresh_session(mode="confirm")
        server.STORE.place({"side": "banker", "stakeUnits": 10})
        screen.colour = BANKER
        controller.start({"mode": "confirm", "profileId": profile})
        wait_for(lambda: controller.status()["pending"] is not None)
        controller.confirm({"accept": True, "result": "player"})  # the user corrects it
        session = server.STORE.load()
        check("a user correction overrides the reading",
              settlement.derive(session)["netCents"] == -5000 and session["hands"][0]["result"] == "player",
              session["hands"][0])
        check("the correction is logged as such",
              any(event.get("action") == "confirmed-corrected" for event in controller.events_tail()),
              [event.get("action") for event in controller.events_tail()])
        controller.stop()

        # ---- reject ---------------------------------------------------------------------------
        fresh_session(mode="confirm")
        server.STORE.place({"side": "player", "stakeUnits": 5})
        screen.colour = TIE
        controller.start({"mode": "confirm", "profileId": profile})
        wait_for(lambda: controller.status()["pending"] is not None)
        controller.confirm({"accept": False})
        session = server.STORE.load()
        check("rejecting records nothing and leaves the bet open",
              len(session["hands"]) == 0 and settlement.open_wagers(session))
        controller.stop()

        # ---- guards still apply ---------------------------------------------------------------
        fresh_session(mode="auto")
        screen.colour = BANKER
        controller.start({"mode": "observe", "profileId": profile})
        wait_for(lambda: len((server.STORE.load() or {}).get("hands", [])) == 1)
        controller.stop()
        server.STORE.clear()
        try:
            controller.start({"mode": "observe", "profileId": profile})
            check("starting OCR with no session is refused", False, "no error raised")
        except server.StateError as error:
            check("starting OCR with no session is refused", error.code == "no-session", error.code)
    finally:
        ocr.describe_availability = original
        try:
            server.OCR_STATE.stop()
        except Exception:  # noqa: BLE001
            pass


def test_bad_start_requests():
    print("\nSTART REQUEST VALIDATION")
    original = ocr.describe_availability
    ocr.describe_availability = lambda: {
        "available": True, "missing": [], "provider": "deepseek", "providers": {},
        "secretsFile": "<test>", "configPath": "<test>",
    }
    try:
        fresh_session()
        controller = server.OcrController()
        controller.monitor = make_monitor(controller, FakeScreen())
        for payload, code, why in (
            ({"mode": "telepathy", "profileId": "baccarat-pragmatic-half-width-full-length"}, "bad-mode", "an unknown mode"),
            ({"mode": "observe", "profileId": "no-such-profile"}, "bad-profile", "an unknown profile"),
            ({"mode": "auto"}, "bad-profile", "a missing profile"),
        ):
            try:
                controller.start(payload)
                check("%s is refused" % why, False, "no error")
            except server.StateError as error:
                check("%s is refused" % why, error.code == code, "%s != %s" % (error.code, code))
    finally:
        ocr.describe_availability = original
        server.STORE.clear()


def test_event_stats():
    print("\nOCR ACCURACY READOUT (the evidence for trusting Automatic)")
    original = server.OCR_EVENT_LOG
    path = os.path.join(DATA_DIR, "stats-test.jsonl")
    try:
        server.OCR_EVENT_LOG = os.path.join(DATA_DIR, "no-such-log.jsonl")
        stats = server.ocr_event_stats()
        check("with no log it reports no readings",
              stats["readings"] == 0 and "No readings yet" in stats["verdict"], stats["verdict"])
        check("and no accuracy figure", stats["accuracyPercent"] is None, stats["accuracyPercent"])

        rows = [{"action": "start"},
                {"action": "observed", "at": "2026-09-28T10:00:00"},
                {"action": "observed-no-open-bet"},
                {"action": "confirmed"},
                {"action": "confirmed-corrected"},
                {"action": "rejected"},
                {"action": "auto-settled"},
                {"action": "error"},
                {"action": "stop"}]
        with open(path, "w", encoding="utf-8") as handle:
            for row in rows:
                handle.write(json.dumps(row) + "\n")
        server.OCR_EVENT_LOG = path
        stats = server.ocr_event_stats()
        check("start/stop are not counted as readings", stats["readings"] == 6, stats)
        check("accepted counts only the readings that were used", stats["accepted"] == 5, stats)
        check("corrections are counted", stats["corrected"] == 1, stats)
        check("rejections are counted", stats["rejected"] == 1, stats)
        check("recording errors are counted separately from readings", stats["errors"] == 1, stats)
        check("auto-settled readings are counted", stats["autoSettled"] == 1, stats)
        check("accuracy excludes the corrected reading", stats["accuracyPercent"] == 80.0,
              stats["accuracyPercent"])
        check("a small sample is called too few to judge", "too few" in stats["verdict"], stats["verdict"])

        with open(path, "w", encoding="utf-8") as handle:
            for _ in range(25):
                handle.write(json.dumps({"action": "confirmed"}) + "\n")
        stats = server.ocr_event_stats()
        check("25 clean readings clear the sample threshold",
              "Automatic mode is reasonable" in stats["verdict"], stats["verdict"])
        check("a clean record reports 100%", stats["accuracyPercent"] == 100.0, stats["accuracyPercent"])

        with open(path, "w", encoding="utf-8") as handle:
            for index in range(25):
                action = "confirmed-corrected" if index % 4 == 0 else "confirmed"
                handle.write(json.dumps({"action": action}) + "\n")
        stats = server.ocr_event_stats()
        check("a sloppy record warns against Automatic", "too error-prone" in stats["verdict"],
              stats["verdict"])
        check("accuracy reflects those corrections", stats["accuracyPercent"] == 72.0,
              stats["accuracyPercent"])

        with open(path, "w", encoding="utf-8") as handle:
            handle.write("this is not json\n")
            handle.write(json.dumps({"action": "confirmed"}) + "\n")
        stats = server.ocr_event_stats()
        check("a corrupt log line is skipped rather than fatal", stats["readings"] == 1, stats)
    finally:
        server.OCR_EVENT_LOG = original
        if os.path.isfile(path):
            os.remove(path)


def test_truncated_replies():
    print("\nTRUNCATED REPLIES ARE SALVAGED, NEVER GUESSED")
    # A provider token cap once cut a good reply off before its closing brace. Losing the reading is
    # worse than recovering it, provided the result value itself is complete.
    salvaged = ocr.parse_result_json(
        '{"result": "player", "confidence": 0.95, "evidence": "Single blue panel reading PLAYER"')
    check("a reply cut off after a complete result still reads",
          salvaged["result"] == "player", salvaged)
    check("its confidence survives", salvaged["confidence"] == 0.95, salvaged["confidence"])
    check("the salvage is admitted in the evidence",
          "truncated" in salvaged["evidence"], salvaged["evidence"])
    check("a missing confidence falls back to zero",
          ocr.parse_result_json('{"result": "tie"')["confidence"] == 0.0)

    for bad in ('{"result": "pla', '{"result":', 'not json at all', ''):
        try:
            parsed = ocr.parse_result_json(bad)
            check("an incomplete reply is refused, never guessed (%r)" % bad[:18], False,
                  "accepted it as %r" % (parsed,))
        except ocr.OcrError:
            check("an incomplete reply is refused, never guessed (%r)" % bad[:18], True)

    # A reply with no result field at all is a refusal, not an error: nothing is claimed.
    check("a reply with no result field becomes a refusal",
          ocr.parse_result_json('{"confidence": 0.9}')["result"] is None)

    fenced = '```json\n{"result": "tie", "confidence": 0.9, "evidence": "green"}\n```'
    check("code fences are still tolerated", ocr.parse_result_json(fenced)["result"] == "tie")
    check("an upper-case result is normalised",
          ocr.parse_result_json('{"result": "BANKER", "confidence": 0.9}')["result"] == "banker")
    check("'none' becomes a null result",
          ocr.parse_result_json('{"result": "none", "confidence": 0.0}')["result"] is None)


def test_retry():
    print("\nAN EMPTY REPLY IS RETRIED, NOT DROPPED")
    calls = {"n": 0}

    def flaky(image_bytes):
        calls["n"] += 1
        return "" if calls["n"] == 1 else '{"result": "banker", "confidence": 0.9, "evidence": "ok"}'

    reader = ocr.with_retry(flaky, attempts=2, delay=0, sleep=lambda _s: None)
    check("an empty first reply is asked again", reader(b"x").find("banker") >= 0, "no retry happened")
    check("the retry is a second call", calls["n"] == 2, calls["n"])

    calls["n"] = 0

    def always_empty(image_bytes):
        calls["n"] += 1
        return ""

    reader = ocr.with_retry(always_empty, attempts=3, delay=0, sleep=lambda _s: None)
    try:
        reader(b"x")
        check("persistent emptiness raises rather than looping", False, "no error")
    except ocr.OcrError as error:
        check("persistent emptiness raises rather than looping", calls["n"] == 3, calls["n"])
        check("and says so", "returned nothing" in str(error), error)

    def boom(image_bytes):
        raise RuntimeError("connection reset")

    reader = ocr.with_retry(boom, attempts=2, delay=0, sleep=lambda _s: None)
    try:
        reader(b"x")
        check("a transport error is surfaced, not silently retried", False, "no error")
    except ocr.OcrError as error:
        check("a transport error is surfaced, not silently retried",
              "connection reset" in str(error), error)


def main():
    test_scan_decisions()
    test_parsing()
    test_modes()
    test_bad_start_requests()
    test_event_stats()
    test_truncated_replies()
    test_retry()

    shutil.rmtree(DATA_DIR, ignore_errors=True)
    print("\n%s — %d passed, %d failed\n" % ("PASS" if not failed else "FAIL", len(passed), len(failed)))
    if failed:
        for name, detail in failed:
            print("FAILED: %s\n  %s" % (name, detail))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
