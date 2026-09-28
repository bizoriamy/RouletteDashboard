"""BetPilot — find the calibrated capture region automatically (command line).

Takes a screenshot the user already saved of their table, finds that exact patch on the live screen
and reports the region in screen coordinates — or writes it into a calibration profile. The same
matching runs behind the module's "Find my table" button.

    python app\\tools\\locate_region.py --find data\\samples\\real-02-expected-PLAYER.png
    python app\\tools\\locate_region.py --find <sample.png> --full <screenshot.png>
    python app\\tools\\locate_region.py --all --write-profile baccarat-pragmatic-half-width-full-length

The sample defines WHAT to read: whatever was snipped is what the module will capture. A match below
--min-score (default 0.60) is refused rather than written, because a wrong region makes the reader
read the wrong thing. The matched patch is saved so it can be checked by eye.
"""
import argparse
import json
import os
import sys
import time

APP_DIR = os.path.normcase(os.path.realpath(os.path.dirname(os.path.abspath(__file__))))
MODULE_DIR = os.path.normcase(os.path.realpath(os.path.join(APP_DIR, "..", "..")))
CONFIG_DIR = os.path.join(MODULE_DIR, "config")
SAMPLE_DIR = os.path.join(MODULE_DIR, "data", "samples")
CALIBRATION_DIR = os.path.join(MODULE_DIR, "data", "calibration")

sys.path.insert(0, os.path.normcase(os.path.realpath(os.path.join(APP_DIR, ".."))))

for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(errors="replace")
    except (AttributeError, ValueError):
        pass

import ocr  # noqa: E402


def parse_scales(text):
    """Accept '0.6-1.6' or '0.8,1.0,1.2'."""
    text = str(text).strip()
    if "-" in text and "," not in text:
        low, _, high = text.partition("-")
        return ocr._scales_between(float(low), float(high))
    return [float(piece) for piece in text.split(",") if piece.strip()]


def main():
    parser = argparse.ArgumentParser(description="Locate a saved table screenshot on the live screen.")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--find", help="the sample PNG to look for (it defines the region)")
    source.add_argument("--all", action="store_true", help="try every PNG in data/samples")
    parser.add_argument("--full", help="a saved full screenshot to search (default: capture now)")
    parser.add_argument("--scales", default="0.55-1.6", help="scale range to try, e.g. 0.6-1.6")
    parser.add_argument("--min-score", type=float, default=0.60, help="refuse below this match score")
    parser.add_argument("--write-profile", help="write the region into this calibration profile")
    parser.add_argument("--save-crop", help="save the matched patch here for eyeballing")
    parser.add_argument("--json", help="also write the result as JSON here")
    args = parser.parse_args()

    if args.find:
        if not os.path.isfile(args.find):
            raise SystemExit("No such sample: %s" % args.find)
        paths = [args.find]
    else:
        if not os.path.isdir(SAMPLE_DIR):
            raise SystemExit("No samples folder: %s" % SAMPLE_DIR)
        paths = sorted(os.path.join(SAMPLE_DIR, name) for name in os.listdir(SAMPLE_DIR)
                       if name.lower().endswith(".png"))
        if not paths:
            raise SystemExit("No PNGs in %s — press 'Save a screenshot sample' in the module first."
                             % SAMPLE_DIR)

    if args.full:
        if not os.path.isfile(args.full):
            raise SystemExit("No such screenshot: %s" % args.full)
        with open(args.full, "rb") as handle:
            screen_bytes = handle.read()
        origin = "file %s" % args.full
    else:
        try:
            screen_bytes = ocr.capture_full_screen()
        except Exception as error:  # noqa: BLE001
            raise SystemExit("Screen capture failed: %s: %s" % (type(error).__name__, error))
        origin = "live screen"

    print("looking for %d sample(s), searching %s" % (len(paths), origin))
    try:
        result = ocr.locate_sample(screen_bytes, paths, scales=parse_scales(args.scales),
                                   min_score=args.min_score)
    except ocr.OcrError as error:
        raise SystemExit("Could not search: %s" % error)

    print("\nbest match:  score %.3f (scale %.2f) using %s"
          % (result["score"], result["scale"] or 0, result["sample"]))
    if not result["found"]:
        print("REFUSED: %s" % result["reason"])
        return 1

    x, y, width, height = result["region"]
    print("region:      %d,%d,%d,%d" % (x, y, width, height))

    save_crop = args.save_crop or os.path.join(CALIBRATION_DIR, "found-%s.png" % time.strftime("%Y%m%d-%H%M%S"))
    os.makedirs(os.path.dirname(os.path.abspath(save_crop)), exist_ok=True)
    with open(save_crop, "wb") as handle:
        handle.write(ocr.crop_from_screen(screen_bytes, result["region"]))
    print("matched crop saved: %s  <- open this and confirm it shows the hand result" % save_crop)

    if args.write_profile:
        profile_path = os.path.join(CONFIG_DIR, args.write_profile.replace(".json", "") + ".json")
        ocr.apply_region_to_profile(profile_path, result["region"], result["sample"], result["score"])
        print("wrote region into %s (calibrated: true)" % profile_path)

    if args.json:
        os.makedirs(os.path.dirname(os.path.abspath(args.json)), exist_ok=True)
        with open(args.json, "w", encoding="utf-8") as handle:
            json.dump({"region": result["region"], "score": round(result["score"], 3),
                       "scale": result["scale"], "sample": result["sample"]}, handle, indent=2)
            handle.write("\n")

    print("\nNext: python app\\tools\\ocr_check.py --profile %s"
          % (args.write_profile or "<profile>"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
