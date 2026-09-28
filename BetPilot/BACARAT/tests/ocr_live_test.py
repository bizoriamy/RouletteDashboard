"""BetPilot — end-to-end run of the live OCR loop.

Drives the REAL pieces — the monitor thread, the server's OCR controller, the session store, the
derived statistics and the accuracy readout — against a fake screen and a fake vision model. No API
call, no real screen, no casino: this is the integration proof that the parts work together, which the
unit tests (each part alone) and the HTTP suite (no candidate ever arises) cannot give.

    python tests\\ocr_live_test.py
"""
import io
import json
import os
import shutil
import sys
import time

TESTS_DIR = os.path.normcase(os.path.realpath(os.path.dirname(os.path.abspath(__file__))))
APP_DIR = os.path.normcase(os.path.realpath(os.path.join(TESTS_DIR, "..", "app")))
DATA_DIR = os.path.join(TESTS_DIR, ".ocr-live-data")

shutil.rmtree(DATA_DIR, ignore_errors=True)
os.environ["BACCARAT_DATA_DIR"] = DATA_DIR
os.environ["BACCARAT_INSTANCE_KEY"] = "ocr-live-%d" % os.getpid()

sys.path.insert(0, APP_DIR)

for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(errors="replace")
    except (AttributeError, ValueError):
        pass

import ocr  # noqa: E402
import server  # noqa: E402

BANKER = (200, 30, 30)
PLAYER = (30, 60, 200)
BLANK = (245, 245, 245)

SCAN_SETTINGS = {"scan": {"intervalSeconds": 0.05, "confirmDelaySeconds": 0, "stableReads": 2,
                          "minConfidence": 0.5, "autoMinConfidence": 0.9}}

passed = []
failed = []


def check(name, condition, detail=""):
    if condition:
        passed.append(name)
        print("  ok   %s" % name)
    else:
        failed.append((name, detail))
        print("  FAIL %s  <- %s" % (name, detail))


class FakeScreen:
    """A screen whose colour decides what the fake vision model reports.

    Each distinct colour is a distinct hand as far as the signature guard is concerned, so scenarios
    use a different shade for each hand — exactly as a real screen changes between hands.
    """

    def __init__(self):
        self.colour = BLANK
        self.confidence = 0.97
        self.results = {}

    def set_result(self, result, shade=0):
        """Point the screen at a hand showing `result`, in a shade unique to that scenario."""
        base = {"banker": (200, 30, 30), "player": (30, 60, 200), "tie": (30, 140, 70)}[result]
        colour = tuple(min(255, channel + shade * 7) for channel in base)
        self.colour = colour
        self.results[colour] = result
        return colour

    def clear(self):
        self.colour = BLANK

    def image_bytes(self):
        from PIL import Image
        buffer = io.BytesIO()
        Image.new("RGB", (40, 24), self.colour).save(buffer, format="PNG")
        return buffer.getvalue()

    def capture(self, region):
        return self.image_bytes()

    def read(self, image_bytes):
        from PIL import Image
        with Image.open(io.BytesIO(image_bytes)) as image:
            pixel = image.convert("RGB").getpixel((5, 5))
        result = self.results.get(pixel)
        if not result:
            return json.dumps({"result": None, "confidence": 0.0, "evidence": "nothing settled"})
        return json.dumps({"result": result, "confidence": self.confidence,
                           "evidence": "%s panel highlighted" % result})


def wait_for(predicate, timeout=6.0, interval=0.03):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return False


def fresh_session(starting_units=100):
    server.STORE.clear()
    return server.STORE.create({
        "casino": "live OCR test", "startingUnits": starting_units, "unitValueCents": 500,
        "provider": "Pragmatic", "layout": "Half Width / Full Length", "mode": "manual", "force": True,
    })


def build_controller(screen):
    """The real controller, with the real monitor, fed by the fake screen."""
    controller = server.OcrController()
    controller.monitor = ocr.OcrMonitor(server.STORE, controller._on_candidate,
                                        capture=screen.capture, read=screen.read,
                                        interval=0.05, config=SCAN_SETTINGS)
    return controller


def hands():
    return (server.STORE.load() or {}).get("hands", [])


def open_wagers():
    return (server.STORE.load() or {}).get("openWagers", [])


def main():
    screen = FakeScreen()
    controller = build_controller(screen)
    # Keep the run hermetic: no dependence on a key being present, on which profiles are shipped, or
    # on the real screen size.
    real_availability = server.ocr.describe_availability
    real_profiles = server.load_profiles
    server.ocr.describe_availability = lambda: {"available": True, "missing": [], "provider": "deepseek",
                                                "providers": {}, "secretsFile": "test"}
    server.load_profiles = lambda: [{"id": "test-profile", "region": [10, 10, 200, 100],
                                     "calibrated": True}]
    try:
        print("\nLIVE LOOP — CONFIRM MODE, A REAL HAND END TO END")
        fresh_session()
        server.STORE.place({"side": "banker", "stakeUnits": 1})
        screen.set_result("banker", shade=0)
        controller.start({"mode": "confirm", "profileId": "test-profile"})
        check("the reader is running", controller.monitor.is_running() is True)
        check("a candidate is offered for confirmation",
              wait_for(lambda: controller.pending is not None), controller.monitor.snapshot())
        pending = controller.pending or {}
        check("the pending candidate carries the reading",
              pending.get("result") == "banker" and pending.get("confidence", 0) > 0.9, pending)
        check("nothing is recorded before the user confirms", hands() == [], hands())

        controller.confirm({"accept": True})
        check("confirming records the hand", len(hands()) == 1, hands())
        hand = hands()[0] if hands() else {}
        check("the hand carries the table's result", hand.get("result") == "banker", hand)
        check("it is marked as coming from the screen", hand.get("source") == "ocr", hand.get("source"))
        check("it keeps the screen signature for the duplicate guard", bool(hand.get("signature")), hand)
        derived = (server.STORE.load() or {}).get("derived") or server.settlement.derive(server.STORE.load())
        check("the money is right: 1u banker at $5 pays $4.75 after commission",
              derived["netCents"] == 475, derived["netCents"])
        check("the bet is no longer open", open_wagers() == [], open_wagers())

        print("\nLIVE LOOP — THE SAME HAND IS NEVER RECORDED TWICE")
        before = len(hands())
        time.sleep(0.6)
        check("an unchanged screen records nothing more", len(hands()) == before, hands())
        snapshot = controller.monitor.snapshot()
        check("and it says it is ignoring a hand it already has",
              snapshot.get("duplicates", 0) >= 1 or "already recorded" in (snapshot.get("message") or ""),
              snapshot)

        print("\nLIVE LOOP — A NEW HAND ON THE SAME SCREEN")
        screen.clear()
        wait_for(lambda: controller.monitor.snapshot().get("scans", 0) > 0)
        time.sleep(0.3)
        # The bet goes on BEFORE the hand resolves — the real order. Placed after, the reading would
        # already have been recorded as a no-bet hand, because OCR never invents a bet.
        server.STORE.place({"side": "player", "stakeUnits": 2})
        screen.set_result("player", shade=1)
        check("the new hand is offered too", wait_for(lambda: controller.pending is not None and
                                                      (controller.pending or {}).get("result") == "player"),
              controller.pending)
        controller.confirm({"accept": True})
        check("two hands are recorded, each with its own signature",
              len(hands()) == 2 and len({hand.get("signature") for hand in hands()}) == 2, hands())
        derived = server.settlement.derive(server.STORE.load())
        check("the running total is right (475 + 1000 for a 2u player bet at 1:1)",
              derived["netCents"] == 1475, derived["netCents"])

        print("\nLIVE LOOP — A WRONG READING CAN BE CORRECTED BEFORE IT IS RECORDED")
        screen.clear()
        time.sleep(0.3)
        server.STORE.place({"side": "banker", "stakeUnits": 1})
        screen.set_result("tie", shade=2)          # the screen says Tie ...
        check("a candidate appears", wait_for(lambda: controller.pending is not None), controller.pending)
        check("and it read what the screen showed",
              (controller.pending or {}).get("result") == "tie", controller.pending)
        controller.confirm({"accept": True, "result": "banker"})   # ... the user corrects it
        check("the corrected result is what gets recorded",
              hands()[-1].get("result") == "banker", hands()[-1])
        check("the correction is logged as corrected",
              any(event.get("action") == "confirmed-corrected" for event in controller.events),
              controller.events[-1:])
        server.STORE.undo()

        print("\nLIVE LOOP — REJECTING A READING RECORDS NOTHING")
        count = len(hands())
        screen.clear()
        time.sleep(0.3)
        server.STORE.place({"side": "player", "stakeUnits": 1})
        screen.set_result("player", shade=3)
        check("a candidate appears to reject", wait_for(lambda: controller.pending is not None),
              controller.pending)
        controller.confirm({"accept": False})
        check("rejecting records nothing", len(hands()) == count, hands())
        check("and the bet stays open for the user", len(open_wagers()) == 1, open_wagers())

        print("\nLIVE LOOP — AUTOMATIC SETTLES ONLY WHAT IT IS SURE OF")
        screen.confidence = 0.97
        screen.clear()
        time.sleep(0.3)
        controller.stop()
        controller.start({"mode": "auto", "profileId": "test-profile"})
        screen.set_result("banker", shade=4)
        check("a 0.97 reading settles the open bet by itself",
              wait_for(lambda: len(hands()) == count + 1), hands())
        check("and it is logged as auto-settled",
              any(event.get("action") == "auto-settled" for event in controller.events),
              controller.events[-1:])

        count = len(hands())
        screen.confidence = 0.60
        screen.clear()
        time.sleep(0.3)
        server.STORE.place({"side": "player", "stakeUnits": 1})
        screen.set_result("player", shade=5)
        check("a 0.60 reading is NOT acted on",
              wait_for(lambda: controller.pending is not None) and len(hands()) == count,
              "%d hands, pending %s" % (len(hands()), bool(controller.pending)))
        check("the bet is left open for the user", len(open_wagers()) == 1, open_wagers())
        controller.confirm({"accept": False})
        server.STORE.cancel()

        print("\nLIVE LOOP — OBSERVE MODE RECORDS NO-BET HANDS")
        controller.stop()
        count = len(hands())
        controller.start({"mode": "observe", "profileId": "test-profile"})
        screen.clear()
        time.sleep(0.3)
        screen.set_result("tie", shade=6)
        check("observe mode records the result without a bet",
              wait_for(lambda: len(hands()) == count + 1), hands())
        observed_stored = hands()[-1]
        check("stored as a zero-stake pass hand, the same shape manual PASS uses",
              (observed_stored.get("wagers") or [{}])[0].get("side") == "pass"
              and (observed_stored.get("wagers") or [{}])[0].get("stakeUnits") == 0, observed_stored)
        check("keeping the table's result", observed_stored.get("result") == "tie", observed_stored)
        observed = server.settlement.derive(server.STORE.load())["hands"][-1]
        check("derived as a no-bet hand", observed.get("isPass") is True, observed)
        check("with no money moved",
              observed.get("profitCents") == 0 and observed.get("outcome") == "void", observed)

        print("\nLIVE LOOP — THE ACCURACY READOUT REFLECTS WHAT HAPPENED")
        stats = server.ocr_event_stats()
        check("readings were counted", stats["readings"] >= 3, stats)
        check("accepted readings were counted", stats["accepted"] >= 3, stats)
        check("a rejection was counted", stats["rejected"] >= 1, stats)
        check("an automatic settlement was counted", stats["autoSettled"] >= 1, stats)
        check("accuracy is a percentage", stats["accuracyPercent"] is None or
              0 <= stats["accuracyPercent"] <= 100, stats["accuracyPercent"])
        check("the verdict is present", bool(stats["verdict"]), stats["verdict"])

        print("\nLIVE LOOP — REFUSING A REGION THAT CANNOT BE CAPTURED")
        controller.stop()
        server.load_profiles = lambda: [{"id": "offscreen", "region": [1900, 1000, 900, 680],
                                         "calibrated": True}]
        try:
            controller.start({"mode": "confirm", "profileId": "offscreen"})
            check("an off-screen region is refused at start", False, "it started anyway")
        except server.StateError as error:
            check("an off-screen region is refused at start", error.code == "bad-region", error.code)
            check("and the message says the window probably moved",
                  "moved" in str(error) or "resized" in str(error), str(error))
        check("nothing was left running after the refusal", controller.monitor.is_running() is False,
              controller.monitor.snapshot())

        print("\nLIVE LOOP — WITH NO SESSION, NOTHING IS RECORDED")
        controller.stop()
        server.STORE.clear()
        screen.clear()
        time.sleep(0.3)
        controller._on_candidate({"result": "banker", "confidence": 0.99, "signature": "x"}, "confirm")
        check("a reading with no active session records nothing",
              (server.STORE.load() or {}).get("hands") in (None, []), server.STORE.load())
        check("and it is logged as ignored",
              any(event.get("action") == "ignored" for event in controller.events), controller.events[-1:])

    finally:
        controller.stop()
        server.ocr.describe_availability = real_availability
        server.load_profiles = real_profiles

    print("\n%s — %d passed, %d failed\n" % ("PASS" if not failed else "FAIL", len(passed), len(failed)))
    for name, detail in failed:
        print("  FAILED: %s  <- %s" % (name, detail))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
