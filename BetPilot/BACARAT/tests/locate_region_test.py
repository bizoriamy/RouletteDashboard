"""BetPilot — tests for locating the table on screen (ocr.locate_sample + apply_region_to_profile).

Synthesises a screen with a known table pasted at a known position, then checks the locator recovers
that position from the table's screenshot alone. Offline: no API, no live screen.

    python tests\\locate_region_test.py
"""
import json
import os
import sys

import numpy as np

TESTS_DIR = os.path.normcase(os.path.realpath(os.path.dirname(os.path.abspath(__file__))))
MODULE_DIR = os.path.normcase(os.path.realpath(os.path.join(TESTS_DIR, "..")))
sys.path.insert(0, os.path.join(TESTS_DIR, "..", "app"))

import cv2  # noqa: E402
import ocr  # noqa: E402

passed = []
failed = []


def check(name, condition, detail=""):
    if condition:
        passed.append(name)
        print("  ok   %s" % name)
    else:
        failed.append((name, detail))
        print("  FAIL %s  <- %s" % (name, detail))


def make_table(width=680, height=170):
    """A stand-in for a baccarat table screenshot: coloured panels with a distinctive layout."""
    table = np.full((height, width, 3), 40, dtype=np.uint8)
    cv2.rectangle(table, (0, 0), (width - 1, height - 1), (170, 150, 120), -1)
    cv2.rectangle(table, (150, 40), (250, height - 1), (140, 60, 20), -1)      # PLAYER panel
    cv2.rectangle(table, (310, 40), (410, height - 1), (70, 140, 60), -1)      # TIE panel
    cv2.rectangle(table, (420, 40), (520, height - 1), (40, 30, 190), -1)      # BANKER panel
    cv2.rectangle(table, (140, 60), (180, 110), (120, 40, 30), -1)             # side-pair block
    cv2.putText(table, "9", (352, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (200, 120, 40), 2)
    cv2.putText(table, "7", (452, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (60, 60, 200), 2)
    return table


def make_screen(width=1920, height=1080, seed=7):
    """A noisy desktop: unique texture, so a match can only come from the table itself."""
    rng = np.random.default_rng(seed)
    screen = rng.integers(30, 90, size=(height, width, 3), dtype=np.uint8)
    for index in range(0, width, 160):
        cv2.line(screen, (index, 0), (index, height - 1), (120, 120, 130), 3)
    return screen


def paste(screen, table, x, y):
    screen[y:y + table.shape[0], x:x + table.shape[1]] = table
    return screen


def to_png_bytes(image):
    ok, buffer = cv2.imencode(".png", image)
    assert ok
    return buffer.tobytes()


def temp_path(name):
    folder = os.path.join(MODULE_DIR, "data", "calibration")
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, name)


def main():
    print("\nREGION LOCATOR — finds a saved table screenshot on the screen")
    table = make_table()
    table_path = temp_path("test-table.png")
    with open(table_path, "wb") as handle:
        handle.write(to_png_bytes(table))

    # 1. Same scale, known position.
    screen = paste(make_screen(), table, 1180, 430)
    result = ocr.locate_sample(to_png_bytes(screen), [table_path],
                               scales=[0.9, 0.95, 1.0, 1.05, 1.1])
    check("finds the table at the same scale", result["found"] and result["score"] > 0.95,
          "score %.3f" % result["score"])
    check("reports the right position",
          abs(result["region"][0] - 1180) <= 2 and abs(result["region"][1] - 430) <= 2,
          result["region"])
    check("reports the size of the sample",
          abs(result["region"][2] - table.shape[1]) <= 2 and abs(result["region"][3] - table.shape[0]) <= 2,
          result["region"])
    check("names the sample it matched", result["sample"] == "test-table.png", result["sample"])

    # 2. The window was resized since the sample was taken.
    resized = cv2.resize(table, (int(table.shape[1] * 0.8), int(table.shape[0] * 0.8)),
                         interpolation=cv2.INTER_AREA)
    screen = paste(make_screen(seed=11), resized, 700, 220)
    result = ocr.locate_sample(to_png_bytes(screen), [table_path],
                               scales=[0.7, 0.75, 0.8, 0.85, 0.9])
    check("finds a table rendered 20% smaller", result["found"] and result["score"] > 0.9,
          "score %.3f" % result["score"])
    check("places it correctly at that scale",
          abs(result["region"][0] - 700) <= 3 and abs(result["region"][1] - 220) <= 3, result["region"])
    check("reports the scale it found", abs(result["scale"] - 0.8) <= 0.06, result["scale"])

    # 3. The table is not on screen: refuse, and explain why.
    result = ocr.locate_sample(to_png_bytes(make_screen(seed=23)), [table_path],
                               scales=[0.9, 1.0, 1.1])
    check("refuses when the table is absent", result["found"] is False, result)
    check("says why it refused", "not appear to be on screen" in result["reason"], result["reason"])
    check("and reports the score it saw", result["score"] < 0.60, result["score"])

    # 4. No samples at all.
    result = ocr.locate_sample(to_png_bytes(make_screen(seed=31)), [])
    check("refuses with no samples to look for",
          result["found"] is False and "No usable sample" in result["reason"], result["reason"])

    # 5. Writing a profile: refused for a malformed region, accepted for a good one.
    profile = temp_path("test-profile.json")
    with open(profile, "w", encoding="utf-8") as handle:
        json.dump({"id": "test", "region": [0, 0, 100, 100], "calibrated": False}, handle)
    for bad in ([1, 2, 3], "nonsense", [1, 2, 3, "4"], None):
        try:
            ocr.apply_region_to_profile(profile, bad)
            check("a malformed region is refused (%r)" % (bad,), False, "it was written")
        except ocr.OcrError:
            check("a malformed region is refused (%r)" % (bad,), True)
    written = ocr.apply_region_to_profile(profile, [1180, 430, 680, 170], "test-table.png", 0.987)
    check("a located region is written into the profile", written["region"] == [1180, 430, 680, 170],
          written["region"])
    check("the profile is marked calibrated", written["calibrated"] is True, written["calibrated"])
    check("the provenance is recorded",
          written["calibratedFrom"] == "test-table.png" and written["matchScore"] == 0.987, written)
    with open(profile, "r", encoding="utf-8") as handle:
        reloaded = json.load(handle)
    check("it survives a reload", reloaded["region"] == [1180, 430, 680, 170], reloaded)
    os.remove(profile)
    os.remove(table_path)

    print("\n%s — %d passed, %d failed\n" % ("PASS" if not failed else "FAIL", len(passed), len(failed)))
    for name, detail in failed:
        print("  FAILED: %s  <- %s" % (name, detail))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
