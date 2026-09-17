"""Fast dashboard-controlled OCR monitor for Pragmatic Roulette."""
import datetime as _datetime
import json
from pathlib import Path
import sys
import time
import urllib.error
import urllib.request
import uuid

from PIL import ImageChops, ImageStat

PROFILE = sys.argv[1] if len(sys.argv) > 1 else "default"
ENDPOINT = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:8765/api/ocr"

import app_monitor as monitor

LOCAL_POLL_SECONDS = 0.25
STABLE_SECONDS = 0.75
CHANGE_THRESHOLD = 2.0
STABLE_THRESHOLD = 0.6


def request_json(path, payload=None, timeout=5):
    url = ENDPOINT.rstrip("/") + path
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="GET" if payload is None else "POST")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def progress(phase, message=""):
    try:
        request_json("/progress", {"phase": phase, "message": message}, timeout=2)
    except Exception:
        pass


def compact(image):
    return image.convert("L").resize((96, 16))


def difference(first, second):
    return float(ImageStat.Stat(ImageChops.difference(compact(first), compact(second))).mean[0])


def capture_until_readable():
    while True:
        try:
            return monitor.capture_region()
        except Exception as error:
            progress("error", f"Screen capture failed: {error}")
            print(f"Screen capture failed: {error}", flush=True)
            time.sleep(2)


def signature_from_numbers(numbers):
    start = monitor.INDEX_OF_WINNING
    end = start + monitor.SIGNATURE_LENGTH
    return tuple(int(value) for value in numbers[start:end]) if len(numbers) >= end else None


def save_pending_crop(event_id, image):
    pending_dir = Path(__file__).resolve().parent / ".pending"
    pending_dir.mkdir(exist_ok=True)
    path = pending_dir / f"{event_id}.png"
    image.save(path, format="PNG")
    return str(path)


def dashboard_spin_count():
    try:
        status = request_json("/status", timeout=2)
        return int((status.get("dashboardState") or {}).get("spinCount", 0))
    except Exception:
        return 0


def wait_until_resolved(event_id):
    while True:
        try:
            pending = request_json("/status").get("pending")
            if not pending or pending.get("eventId") != event_id:
                return
        except Exception as error:
            print(f"Dashboard status unavailable while confirmation is pending: {error}", flush=True)
        time.sleep(0.75)


def main():
    print("Fast OCR dashboard monitor starting", flush=True)
    print(f"Profile: {PROFILE} | Region: {monitor.REGION}", flush=True)
    progress("baseline", "Reading initial history baseline")

    baseline_image = capture_until_readable()
    previous_sig = signature_from_numbers(monitor.extract_numbers_from_image(baseline_image))
    while previous_sig is None:
        progress("baseline", "Waiting for a readable initial history")
        time.sleep(2)
        baseline_image = capture_until_readable()
        previous_sig = signature_from_numbers(monitor.extract_numbers_from_image(baseline_image))

    baseline_spin_count = dashboard_spin_count()
    print(f"Baseline established (not entered): {' -> '.join(map(str, previous_sig))}", flush=True)
    progress("watching", "Watching history strip")
    last_state_refresh = time.monotonic()

    while True:
        image = capture_until_readable()
        if difference(baseline_image, image) < CHANGE_THRESHOLD:
            if time.monotonic() - last_state_refresh >= 1:
                baseline_spin_count = dashboard_spin_count()
                last_state_refresh = time.monotonic()
            time.sleep(LOCAL_POLL_SECONDS)
            continue

        change_started = time.monotonic()
        spin_count_before_change = baseline_spin_count
        progress("change-detected", "History changed; waiting for a stable image")
        stable_image = image
        stable_since = time.monotonic()
        while time.monotonic() - stable_since < STABLE_SECONDS:
            time.sleep(LOCAL_POLL_SECONDS)
            next_image = capture_until_readable()
            if difference(stable_image, next_image) >= STABLE_THRESHOLD:
                stable_image = next_image
                stable_since = time.monotonic()

        progress("reading", "Reading winning number")
        numbers = monitor.extract_numbers_from_image(stable_image)
        current_sig = signature_from_numbers(numbers)
        recognition_ms = int((time.monotonic() - change_started) * 1000)
        if current_sig is None:
            progress("error", "OCR could not read enough history numbers")
            print("OCR returned an incomplete history sequence.", flush=True)
            baseline_image = stable_image
            time.sleep(1)
            continue
        if current_sig == previous_sig:
            baseline_image = stable_image
            progress("watching", "Visual change contained no new roulette result")
            continue

        sequence_valid = tuple(current_sig[1:]) == tuple(previous_sig[:-1])
        event_id = "ocr-" + _datetime.datetime.now().strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:6]
        screenshot_path = ""
        try:
            screenshot_path = save_pending_crop(event_id, stable_image)
        except Exception as error:
            print(f"Could not preserve pending crop: {error}", flush=True)

        candidate = {
            "eventId": event_id,
            "profile": PROFILE,
            "number": int(current_sig[0]),
            "signature": list(current_sig),
            "previousSignature": list(previous_sig),
            "sequenceValid": sequence_valid,
            "baselineSpinCount": spin_count_before_change,
            "recognitionMs": recognition_ms,
            "detectedAt": _datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
            "screenshotPath": screenshot_path,
        }
        try:
            response = request_json("/candidate", candidate)
            if response.get("ok"):
                previous_sig = current_sig
                baseline_image = stable_image
                resolution = response.get("resolution", "pending")
                print(f"Candidate {current_sig[0]} resolved as {resolution} in {recognition_ms} ms.", flush=True)
                if resolution == "pending":
                    wait_until_resolved(event_id)
                progress("watching", "Watching history strip")
                baseline_spin_count = dashboard_spin_count()
            else:
                print(f"Candidate was not accepted: {response.get('error', 'unknown error')}", flush=True)
        except urllib.error.HTTPError as error:
            print(f"Dashboard rejected candidate: HTTP {error.code}", flush=True)
        except Exception as error:
            print(f"Dashboard candidate delivery failed: {error}", flush=True)
        time.sleep(LOCAL_POLL_SECONDS)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("OCR dashboard monitor stopped.", flush=True)
