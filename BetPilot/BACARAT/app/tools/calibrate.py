"""BetPilot — Baccarat capture-region calibration.

    python app/tools/calibrate.py --list
    python app/tools/calibrate.py --profile baccarat-pragmatic-half-width-full-length
    python app/tools/calibrate.py --profile <id> --region 820,200,900,680     (no GUI)

Draw a box around the area of the casino screen that shows the hand result. The tool writes the
measured region back into config/<profile>.json, marks it `calibrated`, and saves a preview PNG of
exactly what the OCR will see.

Why this has to be you: the region depends on your screen resolution, your Windows display scale, and
where your casino puts its window. Every shipped region is a starting guess, and the module says so
until this tool has run.
"""
import argparse
import json
import os
import sys
import time

APP_DIR = os.path.normcase(os.path.realpath(os.path.dirname(os.path.abspath(__file__))))
MODULE_DIR = os.path.normcase(os.path.realpath(os.path.join(APP_DIR, "..", "..")))
CONFIG_DIR = os.path.join(MODULE_DIR, "config")
PREVIEW_DIR = os.path.join(MODULE_DIR, "data", "calibration")


def profile_path(profile_id):
    name = profile_id if profile_id.endswith(".json") else profile_id + ".json"
    return os.path.join(CONFIG_DIR, name)


def load_profile(profile_id):
    path = profile_path(profile_id)
    if not os.path.isfile(path):
        raise SystemExit("No such profile: %s\nRun --list to see the available ids." % path)
    with open(path, "r", encoding="utf-8") as handle:
        return path, json.load(handle)


def save_profile(path, profile):
    temporary = path + ".tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(profile, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    os.replace(temporary, path)


def list_profiles():
    if not os.path.isdir(CONFIG_DIR):
        print("No config/ directory yet.")
        return 0
    print("%-46s %-22s %-20s %s" % ("id", "region (x,y,w,h)", "calibrated", "label"))
    for name in sorted(os.listdir(CONFIG_DIR)):
        if not name.endswith(".json"):
            continue
        with open(os.path.join(CONFIG_DIR, name), "r", encoding="utf-8") as handle:
            profile = json.load(handle)
        # Same rule the server uses: a calibration profile is a file with a 4-part region.
        region = profile.get("region")
        if not (isinstance(region, list) and len(region) == 4):
            continue
        print("%-46s %-22s %-20s %s" % (
            os.path.splitext(name)[0],
            ",".join(str(value) for value in region),
            "yes" if profile.get("calibrated") else "NO",
            profile.get("label", ""),
        ))
    return 0


def select_with_cv2():
    import cv2
    import numpy as np
    import pyautogui
    shot = pyautogui.screenshot()
    frame = cv2.cvtColor(np.array(shot), cv2.COLOR_RGB2BGR)
    print("Drag a box around the result area, then press ENTER (or SPACE). Press c to cancel.")
    selected = cv2.selectROI("BetPilot Baccarat - select the result region", frame, showCrosshair=True,
                             fromCenter=False)
    cv2.destroyAllWindows()
    x, y, width, height = [int(value) for value in selected]
    if width <= 0 or height <= 0:
        raise SystemExit("Cancelled — nothing was changed.")
    return x, y, width, height


def select_with_tkinter():
    import tkinter
    from PIL import Image, ImageTk
    import pyautogui

    shot = pyautogui.screenshot()
    state = {"start": None, "rect": None, "done": False}

    root = tkinter.Tk()
    root.title("BetPilot Baccarat - drag a box around the result area, then press Enter")
    root.attributes("-fullscreen", True)
    root.attributes("-topmost", True)
    image = ImageTk.PhotoImage(shot)
    canvas = tkinter.Canvas(root, width=shot.width, height=shot.height, highlightthickness=0)
    canvas.pack(fill="both", expand=True)
    canvas.create_image(0, 0, anchor="nw", image=image)
    canvas.image = image

    def on_press(event):
        state["start"] = (event.x, event.y)
        if state["rect"]:
            canvas.delete(state["rect"])

    def on_drag(event):
        if not state["start"]:
            return
        if state["rect"]:
            canvas.delete(state["rect"])
        state["rect"] = canvas.create_rectangle(
            state["start"][0], state["start"][1], event.x, event.y, outline="#FFD700", width=3)

    def on_enter(_):
        state["done"] = True
        root.destroy()

    canvas.bind("<ButtonPress-1>", on_press)
    canvas.bind("<B1-Motion>", on_drag)
    root.bind("<Return>", on_enter)
    root.bind("<Escape>", lambda _event: root.destroy())
    canvas.create_text(20, 20, anchor="nw", fill="#FFD700",
                       text="Drag a box around the result area, then press ENTER. ESC cancels.",
                       font=("Segoe UI", 18, "bold"))
    root.mainloop()

    if not state["done"] or not state["rect"]:
        raise SystemExit("Cancelled — nothing was changed.")
    x1, y1, x2, y2 = canvas.coords(state["rect"])
    x, y = int(min(x1, x2)), int(min(y1, y2))
    width, height = int(abs(x2 - x1)), int(abs(y2 - y1))
    if width < 5 or height < 5:
        raise SystemExit("That box was too small. Nothing was changed.")
    return x, y, width, height


def parse_region(text):
    parts = [piece.strip() for piece in re_split(text)]
    if len(parts) != 4:
        raise SystemExit("--region needs four numbers: x,y,width,height")
    try:
        values = [int(piece) for piece in parts]
    except ValueError:
        raise SystemExit("--region needs whole numbers: x,y,width,height")
    if values[2] <= 0 or values[3] <= 0:
        raise SystemExit("Width and height must be positive.")
    return values


def re_split(text):
    return text.replace(" ", "").replace("x", ",").split(",")


def write_preview(profile_id, region):
    """Save exactly what the OCR would send, so the user can check it by eye."""
    try:
        import io
        import pyautogui
    except ImportError as error:
        print("Preview skipped: %s" % error)
        return None
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    x, y, width, height = region
    image = pyautogui.screenshot(region=(x, y, width, height))
    path = os.path.join(PREVIEW_DIR, "%s-preview.png" % profile_id)
    image.save(path)
    return path


def main():
    parser = argparse.ArgumentParser(description="Calibrate a Baccarat capture region.")
    parser.add_argument("--profile", help="profile id, e.g. baccarat-pragmatic-half-width-full-length")
    parser.add_argument("--region", help="manual region as x,y,width,height (skips the GUI)")
    parser.add_argument("--list", action="store_true", help="list the profiles and their calibration state")
    parser.add_argument("--no-preview", action="store_true", help="do not save a preview PNG")
    args = parser.parse_args()

    if args.list or not args.profile:
        return list_profiles()

    path, profile = load_profile(args.profile)

    if args.region:
        region = parse_region(args.region)
        source = "manual entry"
    else:
        try:
            region = select_with_cv2()
            source = "OpenCV ROI selection"
        except SystemExit:
            raise
        except Exception as error:  # noqa: BLE001 - fall back to tkinter, then explain
            print("OpenCV selection unavailable (%s); falling back to a Tk window." % error)
            try:
                region = select_with_tkinter()
                source = "Tk selection"
            except Exception as second:  # noqa: BLE001
                raise SystemExit(
                    "Could not open a selection window (%s).\n"
                    "Use --region x,y,width,height instead, for example:\n"
                    "  python app/tools/calibrate.py --profile %s --region 820,200,900,680"
                    % (second, args.profile))

    # Sanity-check the region against the actual screen so an impossible region is caught here
    # rather than silently producing black images during a session.
    try:
        import pyautogui
        screen_width, screen_height = pyautogui.size()
        x, y, width, height = region
        if x + width > screen_width or y + height > screen_height or x < 0 or y < 0:
            print("WARNING: region %s falls outside the screen (%dx%d)."
                  % (region, screen_width, screen_height))
    except Exception:  # noqa: BLE001
        screen_width = screen_height = None

    profile["region"] = list(region)
    profile["regionConvention"] = "x, y, width, height"
    profile["calibrated"] = True
    profile["calibratedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    profile["calibrationSource"] = source
    if screen_width:
        profile["screenAtCalibration"] = "%dx%d" % (screen_width, screen_height)
    save_profile(path, profile)

    print("Saved region %s to %s (%s)." % (region, os.path.basename(path), source))
    if not args.no_preview:
        preview = write_preview(args.profile, region)
        if preview:
            print("Preview of what the OCR will see: %s" % preview)
            print("Open it and confirm it shows the RESULT clearly. If it does not, calibrate again.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
