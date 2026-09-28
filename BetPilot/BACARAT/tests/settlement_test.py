"""BetPilot — cross-language settlement test.

Run: python settlement_test.py   (after node generate-vectors.js)

The settlement rules exist twice: app/web/engine.js for the browser and app/settlement.py for the
server. This test recomputes every vector the JavaScript engine produced and fails on any
disagreement, so the two implementations cannot drift apart unnoticed.
"""
import json
import math
import os
import sys

TESTS_DIR = os.path.normcase(os.path.realpath(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.normcase(os.path.realpath(os.path.join(TESTS_DIR, "..", "app"))))

import settlement  # noqa: E402

VECTORS_PATH = os.path.join(TESTS_DIR, "settlement-vectors.json")
FIELDS = ["side", "result", "outcome", "stakeUnits", "stakeCents", "profitCents", "commissionCents"]
DERIVE_FIELDS = ["bankrollCents", "netCents", "commissionCents", "stakedUnits", "bets", "totalHands",
                 "wins", "losses", "pushes", "voids", "bankerResults", "playerResults", "tieResults",
                 "winRate", "maxDrawdownCents", "sequence", "last20", "streak", "longest"]


def main():
    if not os.path.isfile(VECTORS_PATH):
        print("FAIL — %s is missing. Run: node generate-vectors.js" % VECTORS_PATH)
        return 1

    with open(VECTORS_PATH, "r", encoding="utf-8") as handle:
        vectors = json.load(handle)

    failures = []
    cases = vectors.get("settleCases", [])
    compared = 0

    for case in cases:
        label = "%s/%s stake=%s unit=%s r=%s" % (
            case["side"], case["result"], case["stakeUnits"], case["unitValueCents"], case.get("ruleLabel"))
        try:
            result = settlement.settle(case["side"], case["result"], case["stakeUnits"],
                                       case["unitValueCents"], case["rules"])
            produced = {field: result[field] for field in FIELDS}
            if not case.get("ok"):
                failures.append("%s: JavaScript raised %s but Python returned %s"
                                % (label, case.get("errorName"), produced))
                continue
            expected = case["values"]
            for field in FIELDS:
                if produced[field] != expected[field]:
                    failures.append("%s: %s JavaScript=%r Python=%r"
                                    % (label, field, expected[field], produced[field]))
                    break
            compared += 1
        except settlement.SettlementError as error:
            if case.get("ok"):
                failures.append("%s: Python raised %s but JavaScript returned %s"
                                % (label, error, case.get("values")))
            else:
                compared += 1
        except Exception as error:  # noqa: BLE001
            failures.append("%s: unexpected Python error %s: %s" % (label, type(error).__name__, error))

    print("  compared %d settlement cases (%d vectors)" % (compared, len(cases)))

    session_count = 0
    for session in vectors.get("sessions", []):
        rebuilt = {
            "casino": session["casino"],
            "startingUnits": session["startingUnits"],
            "unitValueCents": session["unitValueCents"],
            "rules": session["rules"],
            "hands": [{"side": h["side"], "result": h["result"], "stakeUnits": h["stakeUnits"],
                       "outcome": h["outcome"]} for h in session["hands"]],
        }
        derived = settlement.derive(rebuilt)
        expected = session["derived"]
        for field in DERIVE_FIELDS:
            if derived[field] != expected[field]:
                failures.append("session %s: derived %s JavaScript=%r Python=%r"
                                % (session["casino"], field, expected[field], derived[field]))
                break
        session_count += 1
    print("  compared %d full session derivations" % session_count)

    # Sanity-check the Python rules in isolation too, so a broken vector file cannot hide a bug.
    sanity = [
        ("banker win is 0.95:1", settlement.settle("banker", "banker", 1, 500)["profitCents"], 475),
        ("player win is 1:1", settlement.settle("player", "player", 3, 500)["profitCents"], 1500),
        ("tie win is 8:1", settlement.settle("tie", "tie", 2, 500)["profitCents"], 8000),
        ("banker pushes on tie", settlement.settle("banker", "tie", 10, 500)["profitCents"], 0),
        ("player pushes on tie", settlement.settle("player", "tie", 10, 500)["outcome"], "push"),
        ("banker loss", settlement.settle("banker", "player", 10, 500)["profitCents"], -5000),
        ("pass is void", settlement.settle("pass", "banker", 0, 500)["outcome"], "void"),
        ("js_round matches Math.round at .5", settlement.js_round(12.5), 13),
    ]
    for name, actual, expected in sanity:
        if actual != expected:
            failures.append("sanity: %s -> %r, expected %r" % (name, actual, expected))
    print("  checked %d Python-only sanity rules" % len(sanity))

    if failures:
        print("\nFAIL — %d disagreement(s):" % len(failures))
        for line in failures[:25]:
            print("  " + line)
        return 1
    print("\nPASS — the browser and server settle every case identically\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
