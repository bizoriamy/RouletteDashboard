"""BetPilot — Baccarat OCR spot check.

Shows you exactly what the screen reader sees and what the model makes of it, one reading at a time.
This is the tool for judging a calibration region before you trust it in a live session.

    # collect a sample to look at (no API call, no cost)
    python app\\tools\\ocr_check.py --full --crop-only
    python app\\tools\\ocr_check.py --region 820,200,900,680 --crop-only

    # test your calibrated profile against the live screen
    python app\\tools\\ocr_check.py --profile baccarat-pragmatic-half-width-full-length

    # read an already-saved screenshot (what to do when sharing a sample for diagnosis)
    python app\\tools\\ocr_check.py --image data\\samples\\table.png

    # check stability: ask the same region three times
    python app\\tools\\ocr_check.py --profile <id> --repeat 3

Every run writes the exact crop that was sent to the model, so you can compare what the model saw with
what you see on screen. The API key is read from the private env file and never printed.
"""
import argparse
import io
import os
import sys
import time

APP_DIR = os.path.normcase(os.path.realpath(os.path.dirname(os.path.abspath(__file__))))
MODULE_DIR = os.path.normcase(os.path.realpath(os.path.join(APP_DIR, "..", "..")))
CONFIG_DIR = os.path.join(MODULE_DIR, "config")
SAMPLE_DIR = os.path.join(MODULE_DIR, "data", "samples")

# A casino may label its result in Chinese (庄 / 闲 / 和) and the model quotes what it sees. The
# Windows console is often CP1252, so an unprintable character would otherwise crash the tool with
# UnicodeEncodeError — exactly when you most want the diagnosis.
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(errors="replace")
    except (AttributeError, ValueError):
        pass

sys.path.insert(0, os.path.normcase(os.path.realpath(os.path.join(APP_DIR, ".."))))

import ocr  # noqa: E402


def parse_region(text):
    parts = [piece.strip() for piece in text.replace(" ", "").replace("x", ",").split(",")]
    if len(parts) != 4:
        raise SystemExit("--region needs four numbers: x,y,width,height")
    try:
        values = [int(piece) for piece in parts]
    except ValueError:
        raise SystemExit("--region needs whole numbers: x,y,width,height")
    if values[2] <= 0 or values[3] <= 0:
        raise SystemExit("Width and height must be positive.")
    return values


def region_from_profile(profile_id):
    path = os.path.join(CONFIG_DIR, profile_id if profile_id.endswith(".json") else profile_id + ".json")
    if not os.path.isfile(path):
        raise SystemExit("No such profile: %s\nRun app\\tools\\calibrate.py --list to see the ids." % path)
    import json
    with open(path, "r", encoding="utf-8") as handle:
        profile = json.load(handle)
    region = profile.get("region")
    if not (isinstance(region, list) and len(region) == 4):
        raise SystemExit("Profile %s has no usable region." % profile_id)
    print("profile:   %s (%s)" % (profile_id, "calibrated" if profile.get("calibrated") else "NOT calibrated"))
    return region


def full_screen_region():
    try:
        import pyautogui
        width, height = pyautogui.size()
    except Exception as error:  # noqa: BLE001
        raise SystemExit("Could not read the screen size: %s" % error)
    return [0, 0, width, height]


def load_image(path):
    with open(path, "rb") as handle:
        return handle.read()


def crop_size(image_bytes):
    try:
        from PIL import Image
        with Image.open(io.BytesIO(image_bytes)) as image:
            return image.size
    except Exception:  # noqa: BLE001
        return (0, 0)


def save_crop(image_bytes, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as handle:
        handle.write(image_bytes)
    return path


def build_reader(args):
    """The provider callable for this run, honouring --provider. Returns None if OCR cannot run."""
    config = ocr.load_config()
    if args.provider:
        config["provider"] = args.provider
        print("provider override: %s" % args.provider)
    try:
        return ocr.make_reader(config), config
    except Exception as error:  # noqa: BLE001
        print("OCR cannot run: %s" % error)
        return None, config


def expected_from_name(name):
    """A fixture named '...-expected-BANKER.png' states what the model should read.

    'expected-NONE' means the only correct answer is a refusal (a hand still being dealt, say).
    """
    stem = os.path.splitext(name)[0]
    marker = "expected-"
    if marker not in stem:
        return None
    value = stem.split(marker)[-1].strip().lower()
    return value if value in ("banker", "player", "tie", "none") else None


def run_folder(args):
    """Read every PNG in data/samples — the batch view for judging a set of real screenshots."""
    folder = args.samples_dir or SAMPLE_DIR
    if not os.path.isdir(folder):
        print("No such folder: %s" % folder)
        return 2
    files = sorted(name for name in os.listdir(folder) if name.lower().endswith(".png"))
    if not files:
        print("No PNGs in %s yet. Save your casino screenshots there and run this again." % folder)
        return 2
    print("Reading %d sample(s) from %s\n" % (len(files), folder))

    read, config = build_reader(args)
    if read is None:
        return 2

    usable = 0
    failed = 0
    graded_failed = 0
    stress = []
    graded = 0
    correct = 0
    wrong = []
    for name in files:
        path = os.path.join(folder, name)
        image_bytes = load_image(path)
        width, height = crop_size(image_bytes)
        line = "%-44s %4dx%-5d" % (name[:44], width, height)
        expected = expected_from_name(name)
        try:
            raw = read(image_bytes)
            parsed = ocr.parse_result_json(raw)
        except Exception as error:  # noqa: BLE001
            failed += 1
            if expected:
                graded_failed += 1
                print("%s FAILED (graded): %s" % (line, error))
            else:
                # An ungraded stress case may legitimately be unreadable; say so without failing.
                stress.append(name)
                print("%s unreadable (not graded): %s" % (line, error))
            continue
        usable += 1
        verdict = ""
        if args.grade and expected:
            graded += 1
            got = parsed["result"] or "none"
            if got == expected:
                correct += 1
                verdict = " CORRECT"
            else:
                verdict = " WRONG (expected %s)" % expected.upper()
                wrong.append((name, expected, parsed["result"]))
        print("%s %-7s conf %.2f  %s%s" % (line, str(parsed["result"]).upper(), parsed["confidence"],
                                           parsed["evidence"][:80], verdict))
        if args.repeat > 1:
            for attempt in range(2, args.repeat + 1):
                try:
                    again = ocr.parse_result_json(read(image_bytes))
                    print("%-44s %4s     repeat %d: %-7s conf %.2f" % ("", "", attempt,
                                                                       str(again["result"]).upper(),
                                                                       again["confidence"]))
                except Exception as error:  # noqa: BLE001
                    print("%-44s %4s     repeat %d FAILED: %s" % ("", "", attempt, error))

    print("\n%d of %d samples read (provider: %s)." % (usable, len(files), config.get("provider")))
    if stress:
        print("%d deliberately ambiguous stress case(s) came back unreadable: %s — that is the safe "
              "outcome, not a regression." % (len(stress), ", ".join(stress)))
    if failed - len(stress):
        print("%d graded call(s) failed outright — check the messages above." % (failed - len(stress)))
    if args.grade and graded:
        print("Graded %d fixture(s): %d correct, %d wrong." % (graded, correct, len(wrong)))
        for name, expected, got in wrong:
            print("  WRONG: %s -> read %s, expected %s" % (name, str(got).upper(), expected.upper()))
        if wrong or graded_failed:
            return 1
        print("Every graded fixture read correctly.")
        return 0
    print("Compare each reading against the sample. Any mismatch means the prompt or the crop "
          "needs work, and I want to see both.")
    return 0 if failed == len(stress) else 1


def main():
    parser = argparse.ArgumentParser(description="See what the Baccarat screen reader reads.")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--profile", help="use a calibration profile's region")
    source.add_argument("--region", help="region to capture: x,y,width,height")
    source.add_argument("--full", action="store_true", help="capture the whole screen")
    source.add_argument("--image", help="read an existing PNG instead of the screen")
    source.add_argument("--all", action="store_true", help="read every PNG in data/samples")
    parser.add_argument("--samples-dir", help="folder for --all (default data/samples)")
    parser.add_argument("--grade", action="store_true",
                        help="with --all, grade fixtures whose filename ends in '-expected-BANKER' etc.")
    parser.add_argument("--crop-only", action="store_true", help="capture and save only; do not call the model")
    parser.add_argument("--save", help="where to write the crop (default data/samples/ocr-check-<time>.png)")
    parser.add_argument("--provider", choices=["deepseek", "gemini"], help="override the provider for this run")
    parser.add_argument("--repeat", type=int, default=1, help="read the same crop N times to check stability")
    args = parser.parse_args()

    if args.all:
        return run_folder(args)

    if args.image:
        if not os.path.isfile(args.image):
            raise SystemExit("No such image: %s" % args.image)
        image_bytes = load_image(args.image)
        origin = "file %s" % args.image
        region = None
    else:
        if args.profile:
            region = region_from_profile(args.profile)
        elif args.region:
            region = parse_region(args.region)
        else:
            region = full_screen_region()
        if not args.profile:
            print("region:    %s" % (region,))
        try:
            image_bytes = ocr.capture_region(region)
        except Exception as error:  # noqa: BLE001
            raise SystemExit("Screen capture failed: %s\nOn Windows, run this from a normal user "
                             "session with the casino window visible." % error)
        origin = "screen region %s" % (region,)

    width, height = crop_size(image_bytes)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    # Only a live capture needs saving. Re-reading a saved file should not drop a copy of it back
    # into the folder, which would then be read again by the next --all run.
    if args.image and not args.save:
        save_path = args.image
        copied = False
    else:
        save_path = args.save or os.path.join(SAMPLE_DIR, "ocr-check-%s.png" % stamp)
        save_crop(image_bytes, save_path)
        copied = True

    print("source:    %s" % origin)
    print("crop:      %dx%d pixels" % (width, height))
    print("signature: %s" % ocr.region_signature(image_bytes))
    if copied:
        print("saved:     %s" % save_path)
        print("           ^ open this. If it does not show the result clearly, fix the region first.")

    if args.crop_only:
        print("\nCrop only — the model was not called.")
        return 0

    config = ocr.load_config()
    if args.provider:
        config["provider"] = args.provider
    availability = ocr.describe_availability()
    if not availability["available"]:
        print("\nOCR cannot run: %s" % "; ".join(availability["missing"]))
        return 2

    read, config = build_reader(args)
    if read is None:
        return 2

    print("\n--- readings (provider: %s) ---" % config.get("provider"))
    successes = 0
    for attempt in range(1, max(1, args.repeat) + 1):
        started = time.time()
        try:
            raw = read(image_bytes)
        except Exception as error:  # noqa: BLE001
            print("  %d. FAILED after %.1fs: %s: %s" % (attempt, time.time() - started,
                                                        type(error).__name__, error))
            continue
        elapsed = time.time() - started
        try:
            parsed = ocr.parse_result_json(raw)
        except ocr.OcrError as error:
            print("  %d. unreadable reply in %.1fs: %s" % (attempt, elapsed, error))
            print("     raw: %s" % (raw or "").strip()[:300])
            continue
        successes += 1
        print("  %d. %-7s confidence %.2f in %.1fs  %s" % (
            attempt, str(parsed["result"]).upper(), parsed["confidence"], elapsed,
            parsed["evidence"][:120]))

    print("")
    if successes == 0:
        print("No usable reading. If the crop above looks right, the prompt needs work — share the "
              "saved PNG and the raw reply.")
        return 1
    print("Parsed %d of %d. If the crop shows the result clearly and the reading matches it, this "
          "region is ready. Run the module and start OCR in Confirm mode." % (successes, max(1, args.repeat)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
