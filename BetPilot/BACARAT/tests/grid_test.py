"""BetPilot — tests for reading the result off the history grid (no model call).

The user's observation is the design: the white grid of B/P/T circles on the left of the panels shows
a hand's result before the panels finish flashing, and each marker's colour IS the result. So the grid
can be read locally, in one frame, for nothing.

Run: python grid_test.py
"""
import io
import os
import sys

import numpy as np

TESTS_DIR = os.path.normcase(os.path.realpath(os.path.dirname(os.path.abspath(__file__))))
APP_DIR = os.path.normcase(os.path.realpath(os.path.join(TESTS_DIR, "..", "app")))
sys.path.insert(0, APP_DIR)

import cv2  # noqa: E402
import ocr  # noqa: E402
from PIL import Image  # noqa: E402

passed = []
failed = []


def check(name, condition, detail=""):
    if condition:
        passed.append(name)
        print("  ok   %s" % name)
    else:
        failed.append((name, detail))
        print("  FAIL %s  <- %s" % (name, detail))


# Proper RGB colours, as the table draws them: red = Banker, blue = Player, green = Tie.
RGB = {"B": (220, 40, 60), "P": (30, 90, 220), "T": (30, 150, 80)}


def grid_pil(markers, width=250, height=165):
    """A white history grid with coloured circles at the given pixel positions."""
    canvas = np.full((height, width, 3), 246, np.uint8)
    cv2.rectangle(canvas, (0, 0), (width - 1, height - 1), (205, 205, 205), 1)
    for row in range(1, height // 14):
        cv2.line(canvas, (0, row * 14), (width, row * 14), (232, 232, 232), 1)
    for col in range(1, width // 16):
        cv2.line(canvas, (col * 16, 0), (col * 16, height), (232, 232, 232), 1)
    for side, centre_x, centre_y in markers:
        # The canvas is an RGB array, and cv2.circle writes the tuple as given, so pass RGB directly:
        # reversing it here drew blue where red was meant and made the reader look wrong.
        cv2.circle(canvas, (centre_x, centre_y), 7, RGB[side], -1)
    return Image.fromarray(canvas)


def grid_image(markers, width=250, height=165):
    """The same grid as PNG bytes, which is what the reader receives from a capture."""
    buffer = io.BytesIO()
    grid_pil(markers, width, height).save(buffer, format="PNG")
    return buffer.getvalue()


def png(image):
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def column(sides, start_row=0):
    """Markers filling one column top to bottom — the order the real grid uses."""
    return [(side, 8, 8 + 14 * (start_row + index)) for index, side in enumerate(sides)]


def main():
    print("\nGRID MARKERS — the result is a colour, so no model is needed")
    found = ocr.grid_markers(grid_image(column(["B", "P", "T", "B", "P"])))
    check("every marker on the grid is found", len(found) == 5, found)
    check("and each one is classified as a side",
          sorted(side for side, _x, _y in found) == ["B", "B", "P", "P", "T"], found)
    check("red is Banker, blue is Player, green is Tie",
          ocr.GRID_SIDE_BY_COLOUR == {"B": "banker", "P": "player", "T": "tie"},
          ocr.GRID_SIDE_BY_COLOUR)
    check("an empty grid yields no markers", ocr.grid_markers(grid_image([])) == [], "markers found")
    check("the pale grid lines are not mistaken for markers",
          len(ocr.grid_markers(grid_image(column(["B"])))) == 1, "line detected as a marker")

    print("\nGRID WATCHER — one new marker is one hand")
    frames = {"image": grid_image(column(["B", "P", "T"]))}
    watcher = ocr.GridWatcher(capture=lambda region: frames["image"])
    decision = watcher.scan((0, 0, 10, 10), set())
    check("the first look only establishes a baseline", decision["status"] == "unchanged", decision)

    frames["image"] = grid_image(column(["B", "P", "T", "P"]))
    decision = watcher.scan((0, 0, 10, 10), set())
    check("one new marker is a candidate", decision["status"] == "candidate", decision)
    check("its colour is the result", decision["result"] == "player", decision)
    check("it needs no model call at all", decision.get("singleRead") is True and decision.get("readMs") == 0,
          decision)
    check("it says what it saw, in words",
          "new P marker" in decision.get("evidence", ""), decision.get("evidence"))
    signature = decision.get("signature")
    check("it carries a signature for the duplicate guard", bool(signature), signature)

    decision = watcher.scan((0, 0, 10, 10), set())
    check("the same grid is not read twice", decision["status"] == "unchanged", decision)

    decision = watcher.scan((0, 0, 10, 10), {signature})
    check("a marker already recorded is refused as a duplicate",
          decision["status"] in ("unchanged", "duplicate"), decision)

    print("\nGRID WATCHER — the awkward cases")
    frames["image"] = grid_image(column(["B", "P", "T", "P", "B"]))
    decision = watcher.scan((0, 0, 10, 10), set())
    check("the next hand in the same column is read too",
          decision["status"] == "candidate" and decision["result"] == "banker", decision)

    # A new shoe: many markers appear at once. That is a reset, never a result.
    frames["image"] = grid_image(column(["T", "T", "P", "B", "B", "P"]) + [("P", 24, 7), ("T", 40, 7), ("B", 56, 7)])
    decision = watcher.scan((0, 0, 10, 10), set())
    check("a re-drawn grid is treated as a baseline, not a result",
          decision["status"] == "unchanged" and decision["result"] is None, decision)
    check("and it says so", "baseline reset" in (decision.get("note") or ""), decision.get("note"))

    # A region with no grid in it must refuse rather than invent.
    watcher = ocr.GridWatcher(capture=lambda region: png(Image.new("RGB", (200, 120), (20, 20, 20))))
    decision = watcher.scan((0, 0, 10, 10), set())
    check("a region with no grid refuses rather than guess",
          decision["status"] == "unclear" and decision["result"] is None, decision)

    print("\nGRID CALIBRATION — found automatically, no second measurement needed")
    # A dark screen with the plate pasted where the real one sits: immediately left of the panels.
    screen = Image.new("RGB", (900, 400), (60, 60, 90))
    plate = grid_pil(column(["B", "P", "T"]), width=250, height=165)
    plate_x, plate_y = 60, 80
    screen.paste(plate, (plate_x, plate_y))

    def fake_capture(area):
        # Crop exactly the requested area, as a real capture does — returning the whole screen made
        # the offsets meaningless and the region land in the wrong place (this test caught that).
        x, y, width, height = [int(value) for value in area]
        return png(screen.crop((x, y, x + width, y + height)))

    # Panels at x=360, so looking 340 to the left starts the probe at x=20 and the plate is found at
    # its real position, 60,80.
    region = ocr.find_grid_region([360, plate_y, 200, 120], capture=fake_capture, look_left=340)
    check("the white plate left of the panels is found", region is not None, region)
    if region:
        check("it starts where the plate starts",
              abs(region[0] - plate_x) <= 6 and abs(region[1] - plate_y) <= 6, region)
        check("and covers the plate's size",
              abs(region[2] - 250) <= 12 and abs(region[3] - 165) <= 12, region)
    blank = Image.new("RGB", (900, 400), (60, 60, 90))

    def blank_capture(area):
        x, y, width, height = [int(value) for value in area]
        return png(blank.crop((x, y, x + width, y + height)))

    check("with no plate in view it returns nothing",
          ocr.find_grid_region([360, 80, 200, 120], capture=blank_capture) is None)

    print("\n%s — %d passed, %d failed\n" % ("PASS" if not failed else "FAIL", len(passed), len(failed)))
    for name, detail in failed:
        print("  FAILED: %s  <- %s" % (name, detail))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
