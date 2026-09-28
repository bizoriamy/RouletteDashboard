"""BetPilot — OCR provider connectivity check.

Run: python provider_check.py

Makes ONE real call to the configured provider with a synthetic result image, to prove that the key,
the endpoint, the model id and the JSON parsing all work together. The image is drawn here, so this
never touches a casino screen and costs a fraction of a cent.

It exits 0 when the provider answered with parseable JSON — even if the answer is "no result", which
is the correct reply for a synthetic image. The key is never printed.
"""
import io
import os
import sys

TESTS_DIR = os.path.normcase(os.path.realpath(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.normcase(os.path.realpath(os.path.join(TESTS_DIR, "..", "app"))))

import ocr  # noqa: E402


def synthetic_result_image(result="banker"):
    """A crude but recognisable result display: a coloured panel with the word on it."""
    from PIL import Image, ImageDraw
    colours = {"banker": (200, 20, 40), "player": (30, 100, 220), "tie": (20, 120, 70), None: (60, 60, 60)}
    image = Image.new("RGB", (420, 160), (12, 12, 18))
    draw = ImageDraw.Draw(image)
    draw.rectangle([16, 16, 404, 144], fill=colours.get(result, (60, 60, 60)))
    label = (result or "no result").upper()
    try:
        draw.text((40, 70), "RESULT: %s" % label, fill=(255, 255, 255))
    except Exception:  # noqa: BLE001 - the label is decoration; the colour is the signal
        pass
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def main():
    availability = ocr.describe_availability()
    print("provider:   %s" % availability["provider"])
    print("secrets:    %s" % availability["secretsFile"])
    for name, info in availability["providers"].items():
        print("  %-9s key present: %-5s model: %s" % (name, info["configured"], info["model"]))
    if not availability["available"]:
        print("\nOCR is not ready. Missing: %s" % "; ".join(availability["missing"]))
        return 2

    print("\nMaking one real call with a synthetic image (a red panel reading RESULT: BANKER)...")
    try:
        reader = ocr.make_reader()
        raw = reader(synthetic_result_image("banker"))
    except Exception as error:  # noqa: BLE001 - report exactly what failed
        print("FAIL — the provider call did not complete: %s: %s" % (type(error).__name__, error))
        return 1

    print("raw reply:  %s" % (raw or "").strip()[:200])
    try:
        parsed = ocr.parse_result_json(raw)
    except ocr.OcrError as error:
        print("FAIL — the reply was not usable: %s" % error)
        return 1

    print("parsed:     result=%r confidence=%s evidence=%r"
          % (parsed["result"], parsed["confidence"], parsed["evidence"][:80]))
    if parsed["result"] == "banker":
        print("\nPASS — the key works and the model read the synthetic panel correctly.")
    else:
        print("\nPASS — the key works: the provider answered with parseable JSON. The model did not "
              "call this synthetic panel 'banker' (result=%r), which is acceptable here; what this "
              "check proves is that the key, endpoint, model and parser are all working." % parsed["result"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
