# Grid Number Extractor — Windows Prototype

This is the first working prototype of the grid-to-CSV utility discussed.

## What it does

1. Open the Windows app.
2. Choose an image (or drag/drop if `tkinterdnd2` is installed).
3. Detect the grid automatically.
4. Split it into individual cells.
5. OCR each cell as a number from 0–36.
6. Display the result as CSV.
7. Copy the CSV directly to the clipboard.
8. Save the CSV as a file.

The prototype does NOT hard-code the sample image's 21×12 grid or its font size. Grid boundaries are detected from the image.

## Requirements on Windows

- Python 3.10+ recommended
- Tesseract OCR 5.x installed and available on PATH
- Python packages:
  - opencv-python
  - numpy
  - pillow
  - pytesseract
  - tkinterdnd2 (optional, for drag-and-drop)

Install packages:

    py -m pip install -r requirements.txt

Then run:

    py grid_number_extractor.py

You can also open an image immediately:

    py grid_number_extractor.py "C:\path\to\image.png"

## Tesseract note

Install Tesseract OCR separately on Windows and make sure `tesseract.exe` is on PATH.

If PATH is not available, add this near the top of `grid_number_extractor.py`:

    pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

## Prototype limitations

This version is intentionally focused on getting the end-to-end workflow working. OCR accuracy is not yet the final target.

The next recognition improvements should be:

- better per-cell preprocessing
- confidence scoring
- automatic retry using a second OCR strategy
- visual review of uncertain cells
- optional manual row/column hints
- a faster specialized digit recognizer
- eventually packaging as a standalone `.exe`

## First test image

The folder includes the image used during development:

`test_sample.jpeg`

For that sample, the grid detector should find approximately 21 rows × 12 columns.
