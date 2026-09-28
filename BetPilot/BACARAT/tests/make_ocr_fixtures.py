"""BetPilot — synthetic Baccarat display fixtures.

Run: python make_ocr_fixtures.py

Draws the ways a casino might show a hand result — big text, tiny text, single letters, a strip of
past results, Chinese labels, a low-contrast panel, a card-value mock — into data/samples-synthetic/.
ocr_check.py can then read the whole folder at once:

    python app\\tools\\ocr_check.py --all --samples-dir data\\samples-synthetic

Each filename states the result the model SHOULD read, so a wrong reading is visible immediately.
These are synthetic on purpose: they probe the prompt's generality without waiting for a real
screenshot, and they never leave this machine (data/ is excluded from the repository).
"""
import os
import sys

APP_DIR = os.path.normcase(os.path.realpath(os.path.dirname(os.path.abspath(__file__))))
MODULE_DIR = os.path.normcase(os.path.realpath(os.path.join(APP_DIR, "..")))
OUT_DIR = os.path.join(MODULE_DIR, "data", "samples-synthetic")

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\arial.ttf",
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\calibrib.ttf",
]
CJK_FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\simsun.ttc",
]

RED = (200, 20, 40)
BLUE = (30, 100, 220)
GREEN = (20, 120, 70)
DARK = (12, 12, 18)
WHITE = (255, 255, 255)


def load_font(size, cjk=False):
    from PIL import ImageFont
    for path in (CJK_FONT_CANDIDATES if cjk else FONT_CANDIDATES):
        if os.path.isfile(path):
            try:
                return ImageFont.truetype(path, size), os.path.basename(path)
            except OSError:
                continue
    return ImageFont.load_default(), "PIL default (no TrueType font found)"


def centre_text(draw, width, height, text, font, fill):
    try:
        box = draw.textbbox((0, 0), text, font=font)
        text_width, text_height = box[2] - box[0], box[3] - box[1]
    except AttributeError:  # very old Pillow
        text_width, text_height = draw.textsize(text, font=font)
    draw.text(((width - text_width) / 2, (height - text_height) / 2 - 2), text, font=font, fill=fill)


def centre_box(draw, x0, y0, x1, y1, text, font, fill=(255, 255, 255)):
    """Centre text inside a rectangle — for hand-total boxes."""
    try:
        box = draw.textbbox((0, 0), text, font=font)
        width, height = box[2] - box[0], box[3] - box[1]
    except AttributeError:  # very old Pillow
        width, height = draw.textsize(text, font=font)
    draw.text((x0 + (x1 - x0 - width) / 2, y0 + (y1 - y0 - height) / 2 - 2), text, font=font, fill=fill)


def write(image, name):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name)
    image.save(path, format="PNG")
    return path


def main():
    from PIL import Image, ImageDraw

    big_font, font_name = load_font(30)
    small_font, _ = load_font(11)
    tiny_font, _ = load_font(9)
    cjk_font, cjk_name = load_font(34, cjk=True)
    made = []

    # 01 — the easy case: a bold word on a coloured panel.
    image = Image.new("RGB", (420, 160), DARK)
    draw = ImageDraw.Draw(image)
    draw.rectangle([16, 16, 404, 144], fill=RED)
    centre_text(draw, 420, 160, "BANKER", big_font, WHITE)
    made.append(write(image, "01-text-large-expected-BANKER.png"))

    # 02 — the same idea, but tiny: does small text survive?
    image = Image.new("RGB", (160, 48), DARK)
    draw = ImageDraw.Draw(image)
    draw.rectangle([4, 4, 156, 44], fill=BLUE)
    centre_text(draw, 160, 48, "PLAYER", small_font, WHITE)
    made.append(write(image, "02-text-small-expected-PLAYER.png"))

    # 03 — single letters, the abbreviation some tables use.
    image = Image.new("RGB", (120, 60), DARK)
    draw = ImageDraw.Draw(image)
    draw.ellipse([30, 5, 90, 55], fill=GREEN)
    centre_text(draw, 120, 60, "T", big_font, WHITE)
    made.append(write(image, "03-letter-expected-TIE.png"))

    # 04 — a strip of past results; the newest is last and it is BLUE (Player).
    strip = [RED, RED, BLUE, RED, BLUE, RED, RED, BLUE]
    image = Image.new("RGB", (60 + 34 * len(strip), 56), DARK)
    draw = ImageDraw.Draw(image)
    for index, colour in enumerate(strip):
        x = 14 + 34 * index
        draw.ellipse([x, 12, x + 30, 42], fill=colour)
    made.append(write(image, "04-strip-newest-expected-PLAYER.png"))

    # 05 — Chinese labels, common on Asian tables: 庄 = Banker.
    image = Image.new("RGB", (140, 90), DARK)
    draw = ImageDraw.Draw(image)
    draw.rectangle([10, 10, 130, 80], fill=(30, 30, 36))
    centre_text(draw, 140, 90, "庄", cjk_font, RED)
    made.append(write(image, "05-chinese-expected-BANKER.png"))

    # 06 — a card-value mock: Banker 9 beats Player 7.
    image = Image.new("RGB", (240, 90), DARK)
    draw = ImageDraw.Draw(image)
    draw.rectangle([8, 8, 116, 82], fill=RED)
    draw.rectangle([124, 8, 232, 82], fill=BLUE)
    centre_text(draw, 124, 90, "B 9", big_font, WHITE)
    draw.text((128, 40), "", font=big_font, fill=WHITE)
    centre_text(draw, 356, 90, "P 7", big_font, WHITE)
    made.append(write(image, "06-cards-b9-beats-p7-expected-BANKER.png"))

    # 07 — low contrast: Player on a dark navy panel, barely lighter than its background.
    image = Image.new("RGB", (300, 80), (16, 20, 34))
    draw = ImageDraw.Draw(image)
    draw.rectangle([6, 6, 294, 74], fill=(22, 30, 52))
    centre_text(draw, 300, 80, "PLAYER", big_font, (60, 80, 130))
    made.append(write(image, "07-low-contrast-expected-PLAYER.png"))

    # 08 — a plain worded result, no panel.
    image = Image.new("RGB", (260, 70), DARK)
    draw = ImageDraw.Draw(image)
    centre_text(draw, 260, 70, "TIE", big_font, GREEN)
    made.append(write(image, "08-plain-expected-TIE.png"))

    # 09 — STRESS CASE, deliberately ungraded: a bare grid of coloured dots with no layout context.
    # Which dot is "newest" depends on a fill convention that is not visible in the picture, so a
    # refusal is a legitimate answer and grading it would be unfair. Kept because it exposed a real
    # limit: on an ambiguous image the model can spend its whole token budget reasoning and return
    # nothing, which the reader reports as "no result" rather than inventing one.
    image = Image.new("RGB", (360, 120), (28, 24, 20))
    draw = ImageDraw.Draw(image)
    for index in range(6):  # decoy dots
        x = 20 + 58 * index
        draw.ellipse([x, 20, x + 26, 46], fill=(RED, BLUE, RED, GREEN, RED, BLUE)[index])
    draw.ellipse([300, 78, 326, 104], fill=RED)  # one further dot, bottom-right
    made.append(write(image, "09-stress-decoy-grid.png"))

    # 10 — a Tie on a layout like the user's real table: equal totals, bright green Tie panel, both
    # side panels dimmed. This is the case a totals-based rule has to get right.
    image = Image.new("RGB", (560, 200), (222, 196, 168))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle([190, 6, 240, 52], radius=6, fill=(30, 80, 190))   # Player total: 7
    centre_box(draw, 190, 6, 240, 52, "7", big_font)
    draw.rounded_rectangle([400, 6, 450, 52], radius=6, fill=RED)             # Banker total: 7
    centre_box(draw, 400, 6, 450, 52, "7", big_font)
    draw.rectangle([150, 60, 250, 190], fill=(26, 34, 66))                   # Player panel, dimmed
    draw.text((158, 72), "PLAYER", font=small_font, fill=(120, 134, 170))
    draw.rectangle([310, 60, 410, 190], fill=(46, 176, 108))                 # Tie panel, bright
    draw.rectangle([362, 60, 410, 190], fill=(46, 176, 108))
    draw.text((325, 72), "TIE", font=small_font, fill=WHITE)
    draw.rectangle([420, 60, 520, 190], fill=(86, 26, 34))                   # Banker panel, dimmed
    draw.text((428, 72), "BANKER", font=small_font, fill=(150, 96, 96))
    made.append(write(image, "10-equal-totals-expected-TIE.png"))

    # 11 — a hand still being dealt: no totals and no settled cards. The only correct answer is "none".
    image = Image.new("RGB", (560, 200), (222, 196, 168))
    draw = ImageDraw.Draw(image)
    draw.rectangle([150, 60, 250, 190], outline=(90, 100, 140), width=2)
    draw.rectangle([310, 60, 410, 190], outline=(90, 140, 110), width=2)
    draw.rectangle([420, 60, 520, 190], outline=(140, 90, 90), width=2)
    centre_text(draw, 560, 40, "DEALING...", small_font, (60, 60, 70))
    draw.text((158, 120), "cards in motion", font=tiny_font, fill=(110, 110, 120))
    made.append(write(image, "11-hand-in-progress-expected-NONE.png"))

    print("wrote %d fixtures to %s" % (len(made), OUT_DIR))
    print("font: %s | CJK font: %s" % (font_name, cjk_name))
    for path in made:
        print("  %-46s %s" % (os.path.basename(path), "intended result: " + os.path.basename(path).split("-")[-1].replace(".png", "")))
    if "default" in font_name.lower():
        print("\nWARNING: no TrueType font found, so the text fixtures are drawn with a tiny bitmap "
              "font. Install nothing; just be aware the large-text cases will look small.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
