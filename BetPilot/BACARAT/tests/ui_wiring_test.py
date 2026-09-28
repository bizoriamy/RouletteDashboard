"""BetPilot — UI wiring test.

Run: python ui_wiring_test.py

Static checks between the three files that make up the module UI. These are the defects that shipped
in the old build and are invisible until someone clicks:

  * JavaScript referencing an element id that does not exist in the HTML (the old #min-bet crash);
  * markup calling a function that is never defined (the old setTableOcr ReferenceError);
  * CSS classes used but never defined, so a control silently renders wrong;
  * a second entry screen or a window.open handoff creeping back in.
"""
import os
import re
import sys

TESTS_DIR = os.path.normcase(os.path.realpath(os.path.dirname(os.path.abspath(__file__))))
WEB_DIR = os.path.normcase(os.path.realpath(os.path.join(TESTS_DIR, "..", "app", "web")))

HTML_PATH = os.path.join(WEB_DIR, "index.html")
UI_PATH = os.path.join(WEB_DIR, "ui.js")
ENGINE_PATH = os.path.join(WEB_DIR, "engine.js")
CSS_PATH = os.path.join(WEB_DIR, "baccarat.css")

# Classes that intentionally have no rule: semantic hooks and state flags handled by other rules.
ALLOWED_WITHOUT_RULE = {
    "active", "hidden", "open-row", "empty", "class", "field-readout", "stats-wide",
}

passed = []
failed = []


def check(name, condition, detail=""):
    if condition:
        passed.append(name)
        print("  ok   %s" % name)
    else:
        failed.append((name, detail))
        print("  FAIL %s%s" % (name, ("  <- " + str(detail)) if detail else ""))


def read(path):
    with open(path, "r", encoding="utf-8") as handle:
        return handle.read()


def main():
    html = read(HTML_PATH)
    ui = read(UI_PATH)
    engine = read(ENGINE_PATH)
    css = read(CSS_PATH)

    print("\nELEMENT IDS")
    html_ids = set(re.findall(r'id="([^"]+)"', html))
    ui_ids = set(re.findall(r'el\["([^"]+)"\]', ui))
    missing = sorted(ui_ids - html_ids)
    check("every element id used by ui.js exists in index.html", not missing, missing)
    check("index.html has no duplicate ids",
          len(re.findall(r'id="([^"]+)"', html)) == len(html_ids))
    check("the id list is substantial (sanity)", len(html_ids) > 40, len(html_ids))

    print("\nHANDLERS")
    inline = re.findall(r'on(?:click|submit|input|change)="([^"]+)"', html)
    check("index.html uses no inline event handlers at all (nothing can call an undefined function)",
          not inline, inline[:3])
    ui_functions = set(re.findall(r"function ([A-Za-z_$][\w$]*)\s*\(", ui))
    ui_listeners = set(re.findall(r'el\["([^"]+)"\]\.addEventListener', ui))
    listeners_without_function = sorted(
        name for name in ui_listeners if name not in html_ids
    )
    check("every element ui.js attaches a listener to exists", not listeners_without_function,
          listeners_without_function)
    check("the engine's public API is what ui.js expects",
          all(token in engine for token in ("settleOpenBet", "formatCents", "formatUnits")))
    engine_calls = set(re.findall(r"Engine\.([A-Za-z_$][\w$]*)\s*\(", ui))
    allowed_engine_calls = {"formatCents", "formatUnits"}
    check("the view only ever calls the engine's formatters, never its money logic",
          engine_calls <= allowed_engine_calls, sorted(engine_calls - allowed_engine_calls))
    check("ui.js never settles a hand itself",
          "Engine.settle(" not in ui and "settleOpenBet" not in ui)
    check("ui.js does not load or reimplement the settlement module",
          "import settlement" not in ui and "commissionRate" not in ui)

    print("\nCSS CLASSES")
    css_classes = set(re.findall(r"\.([A-Za-z][\w-]*)", css))
    html_classes = set()
    for attribute in re.findall(r'class="([^"]+)"', html):
        html_classes.update(attribute.split())
    js_classes = set()
    for attribute in re.findall(r'className\s*=\s*"([^"]+)"', ui):
        js_classes.update(attribute.split())
    for attribute in re.findall(r'classList\.add\("([^"]+)"\)', ui):
        js_classes.update(attribute.split())
    undefined = sorted(
        (html_classes | js_classes) - css_classes - ALLOWED_WITHOUT_RULE
    )
    check("every class used in markup or by ui.js has a CSS rule", not undefined, undefined)
    check("buttons that get disabled have a disabled style",
          "disabled" not in html or ".btn:disabled" in css or ":disabled" in css)
    check("form controls have a focus style",
          "<select" not in html or ":focus" in css)
    check("the statistics grid the view builds has a rule", ".stats" in css)

    print("\nSTRUCTURE")
    check("there is exactly one entry screen", html.count("<main") == 3,
          "%d main sections (setup, table, ended summary)" % html.count("<main"))
    check("no window.open handoff (the old build lost every value typed on the entry screen)",
          "window.open" not in html and "window.open" not in ui)
    check("no unusable always-on-top window flags", "alwaysOnTop" not in html and "chrome=no" not in html)
    check("the required disclaimer is present and prominent", "DISCLAIMER" in html)
    check("the page loads the engine before the view",
          html.index("engine.js") < html.index("ui.js"))
    check("only the module's own assets are referenced",
          not re.search(r'(src|href)="(https?:)?//', html), "external asset reference found")
    check("all local assets referenced by the page exist",
          all(os.path.isfile(os.path.join(WEB_DIR, name))
              for name in re.findall(r'(?:src|href)="([^":/]+\.(?:js|css))"', html)),
          re.findall(r'(?:src|href)="([^":/]+\.(?:js|css))"', html))

    print("\nLAYOUT REQUIREMENTS (from user feedback)")
    disclaimer_at = html.find("DISCLAIMER")
    table_at = html.find('id="table-screen"')
    ended_at = html.find('id="ended-screen"')
    check("the disclaimer is at the BOTTOM of the page, after the screens",
          disclaimer_at > table_at and disclaimer_at > ended_at,
          "disclaimer at %d, table at %d, ended at %d" % (disclaimer_at, table_at, ended_at))
    check("the disclaimer is not hidden or collapsed (compliance)",
          "bottom-bar" in html and ".bottom-bar" in css and "hidden" not in html[disclaimer_at - 80:disclaimer_at + 40])
    check("the page itself does not scroll",
          "overflow: hidden" in css and "height: 100%" in css,
          "html/body need a fixed viewport with internal scrolling only")
    check("inner regions are the only things that scroll",
          css.count("overflow-y: auto") >= 3, css.count("overflow-y: auto"))
    check("the disclaimer is a footer element", "<footer" in html)
    check("the stake control stays usable while a hand is open (to add a Tie side bet)",
          "remaining < 1 || has.banker" in ui or "has.banker" in ui)
    check("a wager can be removed individually", "removeWager" in ui and "action: \"remove\"" in ui)

    print("\nPANEL NAMES AND THE BEAD BOX")
    check("the panel titles are Hand History / Statistics / Bankroll",
          ">Hand History<" in html and ">Statistics<" in html and ">Bankroll<" in html,
          "titles must match the names the user chose")
    check("the old Bead plate title is gone", ">Bead plate<" not in html)
    check("the bead grid is a fixed 10 x 10 grid",
          "grid-template-rows: repeat(10, 14px)" in css and "grid-template-columns: repeat(10, 14px)" in css)
    check("the bead box holds 100 hands", "BEAD_CAPACITY = 100" in ui)
    check("beads carry no letters, only colour",
          'bead.textContent' not in ui and 'bead.className = "bead " + result' in ui)
    check("the grid fills TOP TO BOTTOM first, then left to right",
          "grid-auto-flow: column" in css,
          "column-major flow is what the user asked for")
    check("the dots are small (14px, not 24px)", ".bead {\n  width: 14px; height: 14px;" in css)
    check("the bead box does not scroll or grow",
          ".bead-plate" in css and "overflow" not in css.split(".bead-plate {")[1].split("}")[0]
          and "min-height" not in css.split(".bead-plate {")[1].split("}")[0])
    check("the grid shows the most recent hands and drops older ones",
          "slice(-BEAD_CAPACITY)" in ui, "the Bankroll table keeps the full history")
    check("a hand count is shown next to the grid", 'id="bead-count"' in html)
    check("the panel hint states the fill order the user asked for",
          "top → bottom, left → right" in html)

    print("\nNARROW WINDOW (half screen beside the casino)")
    check("the layout keeps two columns at half screen width",
          "grid-template-columns: minmax(292px, 336px) minmax(0, 1fr)" in css)
    check("it only stacks below 640px", "max-width: 640px" in css and "max-width: 900px" not in css)
    check("the secondary panels sit beside the betting column, not below it",
          "history-column" in html and ".history-column" in css and "grid-template-rows: auto auto minmax(0, 1fr)" in css)
    check("the Bankroll table scrolls sideways instead of clipping its columns",
          ".table-wrap { flex: 1 1 auto; min-height: 0; overflow: auto; }" in css,
          "at half width the P&L and bankroll columns must remain reachable")

    print("\n%s — %d passed, %d failed\n" % ("PASS" if not failed else "FAIL", len(passed), len(failed)))
    if failed:
        for name, detail in failed:
            print("FAILED: %s\n  %s" % (name, detail))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
