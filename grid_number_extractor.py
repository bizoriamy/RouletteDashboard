import argparse
import csv
import os
import re
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

import cv2
import numpy as np
import pytesseract
from PIL import Image, ImageTk

try:
    from tkinterdnd2 import DND_FILES, TkinterDnD
    DND_AVAILABLE = True
except Exception:
    DND_AVAILABLE = False
    TkinterDnD = tk.Tk


APP_TITLE = "Grid Number Extractor - Prototype"


def cluster_positions(values, gap=7):
    """Turn nearby line pixels into one representative coordinate."""
    values = sorted(int(v) for v in values)
    groups = []
    for v in values:
        if not groups or v - groups[-1][-1] > gap:
            groups.append([v])
        else:
            groups[-1].append(v)
    return [int(round(sum(g) / len(g))) for g in groups]


def detect_grid(image):
    """
    Adaptive grid detection.
    Primary method: long horizontal/vertical line morphology.
    Fallback: Hough lines.
    Returns x-boundaries and y-boundaries.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape

    # A low threshold keeps gray grid lines while still capturing bright digits.
    _, bw = cv2.threshold(gray, 40, 255, cv2.THRESH_BINARY)

    vlen = max(10, h // 30)
    hlen = max(10, w // 30)

    vkernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, vlen))
    hkernel = cv2.getStructuringElement(cv2.MORPH_RECT, (hlen, 1))

    vlines = cv2.morphologyEx(bw, cv2.MORPH_OPEN, vkernel)
    hlines = cv2.morphologyEx(bw, cv2.MORPH_OPEN, hkernel)

    vp = (vlines > 0).sum(axis=0)
    hp = (hlines > 0).sum(axis=1)

    # Require long continuous support.
    vx = np.where(vp > max(20, int(h * 0.12)))[0]
    hy = np.where(hp > max(20, int(w * 0.12)))[0]

    # The screenshot-style grids often have 2-pixel borders. Merge those first.
    xb = cluster_positions(vx, gap=6)
    yb = cluster_positions(hy, gap=6)

    def collapse_double_edges(pos):
        if not pos:
            return pos
        out = [pos[0]]
        for p in pos[1:]:
            if p - out[-1] <= 8:
                out[-1] = int(round((out[-1] + p) / 2))
            else:
                out.append(p)
        return out

    xb = collapse_double_edges(xb)
    yb = collapse_double_edges(yb)

    def reasonable(bounds, limit):
        if len(bounds) < 3:
            return False
        diffs = np.diff(bounds)
        if np.any(diffs < 8):
            return False
        med = np.median(diffs)
        return bool(np.all((diffs > med * 0.55) & (diffs < med * 1.8)) and
                    bounds[0] < limit * 0.15 and bounds[-1] > limit * 0.85)

    if reasonable(xb, w) and reasonable(yb, h):
        return xb, yb

    # Hough fallback for grids with weaker borders.
    edges = cv2.Canny(gray, 50, 150)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=max(25, min(w, h)//8),
                            minLineLength=int(min(w, h) * 0.45), maxLineGap=5)
    xs, ys = [], []
    if lines is not None:
        for x1, y1, x2, y2 in lines[:, 0]:
            dx, dy = abs(x2-x1), abs(y2-y1)
            if dy > dx * 5:
                xs.append((x1+x2)/2)
            elif dx > dy * 5:
                ys.append((y1+y2)/2)

    xb2 = cluster_positions(xs, gap=8)
    yb2 = cluster_positions(ys, gap=8)
    xb2 = collapse_double_edges(xb2)
    yb2 = collapse_double_edges(yb2)

    if reasonable(xb2, w) and reasonable(yb2, h):
        return xb2, yb2

    raise ValueError(
        "Could not reliably detect the grid. Try an image with visible cell borders "
        "or use a tightly cropped screenshot."
    )


def clean_ocr_text(text):
    text = re.sub(r"[^0-9]", "", text or "")
    if not text:
        return None
    try:
        value = int(text)
    except ValueError:
        return None
    # This prototype is intended for 0-36 style number grids.
    if 0 <= value <= 36:
        return value
    # Handle common OCR over-reads such as 039 -> 39 by refusing it.
    return None


def preprocess_cell(cell):
    # Use max channel so red/green/white digits remain bright against black.
    x = np.max(cell, axis=2).astype(np.uint8)

    # Remove a little border area.
    h, w = x.shape
    pad_x = max(1, int(w * 0.12))
    pad_y = max(1, int(h * 0.12))
    x = x[pad_y:h-pad_y, pad_x:w-pad_x]

    # Normalize to a predictable OCR size.
    x = cv2.resize(x, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)

    # Light thresholding works well for bright digits on dark backgrounds.
    x = cv2.threshold(x, 60, 255, cv2.THRESH_BINARY)[1]
    return x


def ocr_cell(cell):
    bw = preprocess_cell(cell)
    config = "--psm 10 -c tessedit_char_whitelist=0123456789"
    text = pytesseract.image_to_string(bw, config=config).strip()
    value = clean_ocr_text(text)

    # Second pass only when the first result is missing/invalid.
    if value is None:
        gray = cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY)
        pad_x = max(1, int(gray.shape[1] * 0.12))
        pad_y = max(1, int(gray.shape[0] * 0.12))
        gray = gray[pad_y:-pad_y, pad_x:-pad_x]
        gray = cv2.resize(gray, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
        gray = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY, 11, 2
        )
        text2 = pytesseract.image_to_string(
            gray, config=config
        ).strip()
        value = clean_ocr_text(text2)

    return value


def process_image(path, progress=None):
    image = cv2.imread(path)
    if image is None:
        raise ValueError("Unable to open image.")

    xb, yb = detect_grid(image)
    cols = len(xb) - 1
    rows = len(yb) - 1

    if rows < 1 or cols < 1:
        raise ValueError("The detected grid has no cells.")

    results = []
    uncertain = []

    total = rows * cols
    done = 0

    for r in range(rows):
        row = []
        for c in range(cols):
            x1, x2 = xb[c], xb[c+1]
            y1, y2 = yb[r], yb[r+1]

            # Stay inside the cell and avoid the border.
            crop = image[
                min(y1+1, y2):max(y1+1, y2-1),
                min(x1+1, x2):max(x1+1, x2-1)
            ]
            value = ocr_cell(crop)
            row.append(value if value is not None else "?")

            if value is None:
                uncertain.append((r+1, c+1))

            done += 1
            if progress:
                progress(done, total)

        results.append(row)

    return results, (rows, cols), uncertain, image


def csv_text(results):
    return "\n".join(",".join(str(v) for v in row) for row in results)


class App:
    def __init__(self):
        self.root = TkinterDnD() if DND_AVAILABLE else tk.Tk()
        self.root.title(APP_TITLE)
        self.root.geometry("1100x700")
        self.root.minsize(900, 600)

        self.image_path = None
        self.preview_photo = None
        self.results = None
        self.uncertain = []

        self._build_ui()

        if DND_AVAILABLE:
            self.root.drop_target_register(DND_FILES)
            self.root.dnd_bind("<<Drop>>", self.on_drop)

    def _build_ui(self):
        outer = ttk.Frame(self.root, padding=10)
        outer.pack(fill="both", expand=True)

        title = ttk.Label(
            outer, text="Grid Number Extractor",
            font=("Segoe UI", 18, "bold")
        )
        title.pack(anchor="w")

        subtitle = ttk.Label(
            outer,
            text="Drop an image, process the grid, then copy the CSV result.",
        )
        subtitle.pack(anchor="w", pady=(0, 8))

        paned = ttk.Panedwindow(outer, orient="horizontal")
        paned.pack(fill="both", expand=True)

        left = ttk.Frame(paned, padding=8)
        right = ttk.Frame(paned, padding=8)
        paned.add(left, weight=1)
        paned.add(right, weight=1)

        ttk.Label(left, text="Image").pack(anchor="w")
        self.preview = tk.Canvas(left, background="#111111", highlightthickness=0)
        self.preview.pack(fill="both", expand=True, pady=6)

        buttons = ttk.Frame(left)
        buttons.pack(fill="x")
        ttk.Button(buttons, text="Choose Image", command=self.choose_image).pack(side="left")
        ttk.Button(buttons, text="Process", command=self.start_process).pack(side="left", padx=6)
        ttk.Button(buttons, text="Clear", command=self.clear).pack(side="left")

        ttk.Label(right, text="CSV Output").pack(anchor="w")
        self.output = tk.Text(
            right, wrap="none", font=("Consolas", 11),
            undo=False
        )
        self.output.pack(fill="both", expand=True, pady=6)

        bottom = ttk.Frame(right)
        bottom.pack(fill="x")
        ttk.Button(bottom, text="Copy CSV", command=self.copy_csv).pack(side="left")
        ttk.Button(bottom, text="Save CSV", command=self.save_csv).pack(side="left", padx=6)

        self.status = tk.StringVar(value="Ready")
        ttk.Label(outer, textvariable=self.status).pack(anchor="w", pady=(8, 0))

    def choose_image(self):
        path = filedialog.askopenfilename(
            title="Select grid image",
            filetypes=[
                ("Image files", "*.png *.jpg *.jpeg *.bmp *.webp"),
                ("All files", "*.*"),
            ],
        )
        if path:
            self.load_image(path)

    def on_drop(self, event):
        paths = self.root.tk.splitlist(event.data)
        if paths:
            self.load_image(paths[0])

    def load_image(self, path):
        self.image_path = path
        self.show_preview(path)
        self.status.set(os.path.basename(path))

    def show_preview(self, path):
        im = Image.open(path).convert("RGB")
        canvas_w = max(300, self.preview.winfo_width())
        canvas_h = max(300, self.preview.winfo_height())
        im.thumbnail((canvas_w - 10, canvas_h - 10), Image.Resampling.LANCZOS)
        self.preview_photo = ImageTk.PhotoImage(im)
        self.preview.delete("all")
        self.preview.create_image(
            canvas_w//2, canvas_h//2,
            image=self.preview_photo, anchor="center"
        )

    def start_process(self):
        if not self.image_path:
            messagebox.showwarning("No image", "Choose or drop an image first.")
            return

        self.output.delete("1.0", "end")
        self.status.set("Processing...")

        def worker():
            try:
                def progress(done, total):
                    pct = int(done * 100 / total)
                    self.root.after(0, lambda: self.status.set(
                        f"Processing {done}/{total} cells ({pct}%)..."
                    ))

                results, shape, uncertain, _ = process_image(
                    self.image_path, progress
                )
                self.results = results
                self.uncertain = uncertain
                text = csv_text(results)

                def finish():
                    self.output.insert("1.0", text)
                    rows, cols = shape
                    if uncertain:
                        self.status.set(
                            f"Done: {rows} rows × {cols} columns = {rows*cols} cells. "
                            f"{len(uncertain)} cell(s) need review."
                        )
                    else:
                        self.status.set(
                            f"Done: {rows} rows × {cols} columns = {rows*cols} cells."
                        )

                self.root.after(0, finish)

            except Exception as e:
                self.root.after(0, lambda: messagebox.showerror(
                    "Processing error", str(e)
                ))
                self.root.after(0, lambda: self.status.set("Processing failed."))

        threading.Thread(target=worker, daemon=True).start()

    def copy_csv(self):
        text = self.output.get("1.0", "end-1c")
        if not text.strip():
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(text)
        self.root.update()
        self.status.set("CSV copied to clipboard.")

    def save_csv(self):
        text = self.output.get("1.0", "end-1c")
        if not text.strip():
            return
        path = filedialog.asksaveasfilename(
            defaultextension=".csv",
            filetypes=[("CSV files", "*.csv"), ("All files", "*.*")]
        )
        if path:
            Path(path).write_text(text + "\n", encoding="utf-8-sig")
            self.status.set(f"Saved: {path}")

    def clear(self):
        self.image_path = None
        self.results = None
        self.uncertain = []
        self.output.delete("1.0", "end")
        self.preview.delete("all")
        self.status.set("Ready")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("image", nargs="?", help="Optional image to process immediately.")
    args = parser.parse_args()

    app = App()
    if args.image and os.path.exists(args.image):
        app.load_image(args.image)

    app.root.mainloop()


if __name__ == "__main__":
    main()
