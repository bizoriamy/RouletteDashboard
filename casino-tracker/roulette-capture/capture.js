/**
 * Roulette Capture — bookmarklet script
 * =======================================
 *
 * HOW IT WORKS
 *   Loaded by the bookmarklet on the casino page. It tries to auto-detect
 *   numbers from the page DOM. If none found (game is likely in an iframe),
 *   it shows a clear manual-entry overlay — you type what you see.
 *
 *   Always lets you verify before sending.
 *
 * INSTALLATION
 *   1. Run capture-server.py
 *   2. Open http://localhost:8081/ → drag the Capture link to bookmarks bar
 *   3. Click it when on the casino page → type the number → Send
 */
const CAPTURE_SERVER = "http://localhost:8081";

(function () {
  if (window.__ROULETTE_CAPTURE_LOADED) return;
  window.__ROULETTE_CAPTURE_LOADED = true;

  const API_SPIN = CAPTURE_SERVER + "/api/spin";
  const HIGHLIGHT = "#e63946";

  let selectedNumber = null;
  let overlayEl = null;
  let isDragging = false;
  let dragX = 0, dragY = 0;

  // ── Shortcuts ──
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.from((c || document).querySelectorAll(s)); }

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (k === "style") Object.assign(e.style, v);
      else if (k === "dataset") Object.assign(e.dataset, v);
      else if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "className") e.className = v;
      else e.setAttribute(k, v);
    }
    if (children) {
      if (typeof children === "string") e.innerHTML = children;
      else for (const c of children) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return e;
  }

  // ── Quick number pad buttons ──
  const QUICK_NUMS = [0, 1, 2, 3, 4, 5, 7, 8, 10, 11, 14, 17, 19, 20, 23, 25, 28, 29, 32, 34, 36];

  // ── Roulette number colors ──
  const REDS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

  function numColor(n) {
    if (n === 0) return "green";
    return REDS.has(n) ? "red" : "black";
  }

  // Get the computed background color as a keyword
  function bgKeyword(el) {
    const c = getComputedStyle(el).backgroundColor; // "rgb(230, 57, 70)" etc
    const m = c.match(/\d+/g);
    if (!m) return "";
    const [r, g, b] = m.map(Number);
    // "red" — high R, low G/B (roulette red ~= 230,57,70)
    if (r > 180 && g < 100 && b < 100) return "red";
    // "green" — low R, med-high G, low B (roulette green ~= 45,106,79)
    if (g > 60 && g < 200 && r < 80 && b < 100) return "green";
    // "black" — all low (roulette black ~= 34,34,34)
    if (r < 60 && g < 60 && b < 60) return "black";
    // "dark" — very dark
    if (r < 40 && g < 40 && b < 40) return "dark";
    return "";
  }

  // ── Find numbers on this page ──
  function scanPage() {
    const found = new Set();
    let best = { n: null, score: -1, el: null };

    // Check elements that LOOK like winning-number badges:
    // colored background + circular-ish + single number text
    for (const el of $$("*")) {
      const t = (el.textContent || "").trim();
      if (!/^[0-9]{1,2}$/.test(t)) continue;
      const n = parseInt(t, 10);
      if (n < 0 || n > 36) continue;
      if (el.children.length > 0) continue; // leaf elements only
      found.add(n);

      const style = getComputedStyle(el);
      const bg = bgKeyword(el);
      const fs = parseInt(style.fontSize, 10) || 0;
      const isBold = style.fontWeight >= 600;
      const borderRadius = parseInt(style.borderRadius, 10) || 0;
      const dim = Math.max(el.offsetWidth, el.offsetHeight);

      // STRONG signal: colored circle badge (looks like a casino winning number)
      let score = 0;
      if (bg === "red" || bg === "black" || bg === "green") {
        score += 500; // correct casino color
        if (borderRadius >= dim / 3) score += 300; // round/circular shape
        if (fs >= 20) score += 200; // large text
      }
      if (isBold) score += 50;
      score += fs * 2;

      if (score > best.score) { best = { n, score, el }; }
    }

    // If no colored badge found, fall back to class-name heuristics + text walk
    if (best.score <= 0) {
      const keywords = ["result", "number", "win", "last", "history", "outcome", "display", "board", "score", "slot", "digit"];
      for (const el of $$("*")) {
        const id = (el.id || "").toLowerCase();
        const cls = (el.className && typeof el.className === "string") ? el.className.toLowerCase() : "";
        if (!keywords.some(k => id.includes(k) || cls.includes(k))) continue;
        const t = (el.textContent || "").trim();
        if (!/^[0-9]{1,2}$/.test(t)) continue;
        const n = parseInt(t, 10);
        if (n < 0 || n > 36) continue;
        found.add(n);
        const s = el.children.length === 0 ? 200 : 80;
        if (s > best.score) { best = { n, score: s, el }; }
      }

      // Walk all text nodes for isolated numbers
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
      while (walk.nextNode()) {
        const node = walk.currentNode;
        if (!node.parentElement || /^(SCRIPT|STYLE)$/i.test(node.parentElement.tagName)) continue;
        const t = (node.textContent || "").trim();
        if (t.length < 1 || t.length > 6 || !/^[0-9]{1,2}$/.test(t)) continue;
        const n = parseInt(t, 10);
        if (n < 0 || n > 36) continue;
        found.add(n);
        const fs = parseInt(getComputedStyle(node.parentElement).fontSize, 10) || 0;
        const bold = getComputedStyle(node.parentElement).fontWeight >= 700 ? 2 : 1;
        const s = fs * bold;
        if (s > best.score) { best = { n, score: s, el: node.parentElement }; }
      }

      // Check aria-live regions
      for (const r of $$('[aria-live]')) {
        const t = (r.textContent || "").trim();
        if (/^[0-9]{1,2}$/.test(t)) {
          const n = parseInt(t, 10);
          if (n >= 0 && n <= 36) {
            found.add(n);
            if (150 > best.score) best = { n, score: 150, el: r };
          }
        }
      }
    }

    return {
      all: [...found].sort((a, b) => a - b),
      best: best.n,
      bestEl: best.el,
    };
  }

  // ── Send number to server ──
  async function sendNum(n) {
    try {
      const r = await fetch(API_SPIN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: n, method: "bookmarklet" }),
      });
      const d = await r.json();
      if (d.ok) { status("✓ Sent: " + n, "ok"); return true; }
      else { status("✗ " + (d.error || "unknown"), "err"); return false; }
    } catch (e) {
      status("✗ Server unreachable at " + CAPTURE_SERVER, "err");
      return false;
    }
  }

  function status(msg, type) {
    const el = $("#rc-st");
    if (!el) return;
    el.textContent = msg;
    el.className = "rc-st rc-" + (type || "");
    clearTimeout(el._t);
    if (type === "ok") el._t = setTimeout(() => { el.textContent = ""; el.className = "rc-st"; }, 3000);
  }

  // ── Build overlay ──
  function build() {
    const scan = scanPage();
    selectedNumber = null;

    // Highlight best candidate on page
    if (scan.bestEl) {
      scan.bestEl.style.outline = "3px solid " + HIGHLIGHT;
      scan.bestEl.style.outlineOffset = "2px";
    }

    // ── Container ──
    overlayEl = el("div", {
      id: "rc-overlay",
      style: {
        all: "initial", position: "fixed", zIndex: 2147483647,
        top: "40px", right: "20px", width: "300px",
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        fontSize: "14px", lineHeight: "1.4",
        color: "#e0e0e0", background: "#1a1a2e",
        borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        border: "1px solid #2d2d5e", padding: "0",
        cursor: "move", userSelect: "none",
      },
    });

    // ── Header ──
    overlayEl.appendChild(el("div", {
      style: {
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 16px 0", cursor: "move",
      },
    }, [
      el("strong", { style: { color: HIGHLIGHT, fontSize: "15px", letterSpacing: "0.5px" } }, ["🎰 Capture"]),
      el("button", {
        style: { background: "none", border: "none", color: "#888", fontSize: "20px", cursor: "pointer", padding: "0 4px", lineHeight: "1" },
        on: { click: destroy },
      }, ["✕"]),
    ]));

    // ── If numbers were found, show chips ──
    if (scan.all.length > 0) {
      overlayEl.appendChild(el("div", {
        style: { fontSize: "11px", color: "#888", padding: "10px 16px 4px" },
      }, ["Numbers on page (click to select):"]));

      const wrap = el("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px", padding: "4px 16px 8px" } });
      for (const n of scan.all) {
        const isBest = n === scan.best;
        wrap.appendChild(el("button", {
          className: "rc-chip",
          dataset: { n },
          style: {
            padding: "4px 12px", borderRadius: "6px",
            border: isBest ? "2px solid " + HIGHLIGHT : "1px solid #3a3a6e",
            background: isBest ? HIGHLIGHT : "transparent",
            color: isBest ? "#fff" : "#ccc",
            fontSize: "15px", fontWeight: "700", cursor: "pointer",
          },
          on: { click: () => pick(n) },
        }, [String(n)]));
      }
      overlayEl.appendChild(wrap);
    }

    // ── Manual input section (always shown, prominent) ──
    const inputSection = el("div", {
      style: { padding: scan.all.length > 0 ? "0 16px 8px" : "10px 16px 8px" },
    });

    if (scan.all.length === 0) {
      // No numbers found — explain why and emphasize manual entry
      inputSection.appendChild(el("div", {
        style: {
          background: "#16213e", borderRadius: "8px", padding: "12px",
          marginBottom: "10px", textAlign: "center",
        },
      }, [
        el("div", { style: { fontSize: "13px", color: "#ffb347", fontWeight: "700", marginBottom: "4px" } }, ["🔍 No numbers detected"]),
        el("div", { style: { fontSize: "11px", color: "#888", lineHeight: "1.6" } }, [
          "The game may be in an embedded frame. ",
          "Type the winning number manually below, or open ",
          el("a", {
            href: CAPTURE_SERVER + "/capture.html",
            target: "_blank",
            style: { color: HIGHLIGHT, textDecoration: "underline", cursor: "pointer" },
          }, ["Capture Tab"]),
          " in a separate window.",
        ]),
      ]));
    }

    // Big input
    const inputRow = el("div", { style: { display: "flex", gap: "8px", marginBottom: "8px" } });

    const inp = el("input", {
      id: "rc-inp", type: "number", min: "0", max: "36", placeholder: "0–36",
      style: {
        flex: "1", padding: "10px 14px", borderRadius: "8px",
        border: "2px solid #3a3a6e", background: "#0d1b2a",
        color: "#fff", fontSize: "20px", fontWeight: "900",
        outline: "none", fontFamily: "inherit", textAlign: "center",
      },
      on: {
        input: () => {
          const v = parseInt(inp.value, 10);
          if (!isNaN(v) && v >= 0 && v <= 36) { selectedNumber = v; $$(".rc-chip").forEach(c => { c.style.background = parseInt(c.dataset.n) === v ? HIGHLIGHT : "transparent"; c.style.color = parseInt(c.dataset.n) === v ? "#fff" : "#ccc"; }); }
        },
        keydown: (e) => { if (e.key === "Enter") send(); },
      },
    });
    inputRow.appendChild(inp);

    // Quick number pad (compact row of common numbers)
    const padWrap = el("div", { style: { marginBottom: "8px" } });
    padWrap.appendChild(el("div", { style: { fontSize: "10px", color: "#555", marginBottom: "2px" } }, ["Quick pick:"]));
    const pad = el("div", { style: { display: "flex", flexWrap: "wrap", gap: "3px" } });
    for (const n of QUICK_NUMS) {
      pad.appendChild(el("button", {
        style: {
          padding: "2px 6px", borderRadius: "3px", border: "1px solid #2d2d5e",
          background: "transparent", color: "#888", fontSize: "11px",
          fontWeight: "600", cursor: "pointer",
        },
        on: { click: () => { pick(n); inp.value = n; inp.dispatchEvent(new Event("input")); inp.focus(); } },
      }, [String(n)]));
    }
    padWrap.appendChild(pad);
    inputSection.appendChild(inputRow);
    inputSection.appendChild(padWrap);

    overlayEl.appendChild(inputSection);

    // ── Send button (BIG) ──
    const btnRow = el("div", { style: { padding: "0 16px 8px" } });
    const sendBtn = el("button", {
      id: "rc-send", style: {
        width: "100%", padding: "12px", borderRadius: "8px",
        border: "none", background: HIGHLIGHT, color: "#fff",
        fontSize: "16px", fontWeight: "800", cursor: "pointer",
        letterSpacing: "0.5px",
      },
      on: {
        click: send,
        mouseenter: () => { sendBtn.style.background = "#c1121f"; },
        mouseleave: () => { sendBtn.style.background = HIGHLIGHT; },
      },
    }, ["⬆ Send to Dashboard"]);
    btnRow.appendChild(sendBtn);
    overlayEl.appendChild(btnRow);

    // ── Quick tip ──
    if (scan.all.length === 0) {
      overlayEl.appendChild(el("div", {
        style: {
          margin: "0 16px 6px", padding: "8px 10px", background: "#0d1b2a",
          borderRadius: "6px", fontSize: "11px", color: "#666", textAlign: "center",
        },
      }, ["💡 Tip: Type the number from the game, then press Enter or Send"]));
    }

    // ── Status ──
    overlayEl.appendChild(el("div", {
      id: "rc-st", style: {
        padding: "0 16px 12px", fontSize: "12px", textAlign: "center",
        minHeight: "16px", color: "#888",
      },
    }));

    // ── Footer ──
    overlayEl.appendChild(el("div", {
      style: {
        fontSize: "10px", color: "#444", textAlign: "center",
        borderTop: "1px solid #2d2d5e", padding: "8px",
      },
    }, ["Drag to move · Type number · Enter to send · " +
        el("a", { href: CAPTURE_SERVER + "/capture.html", target: "_blank", style: { color: "#666", textDecoration: "underline" } }, ["Open in Tab"]).outerText
    ]));

    // ── Drag ──
    overlayEl.addEventListener("mousedown", (e) => {
      if (e.target.closest("button, input, a")) return;
      isDragging = true;
      const r = overlayEl.getBoundingClientRect();
      dragX = e.clientX - r.left; dragY = e.clientY - r.top;
      overlayEl.style.cursor = "grabbing";
      overlayEl.style.transition = "none";
    });
    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      overlayEl.style.left = (e.clientX - dragX) + "px";
      overlayEl.style.top = (e.clientY - dragY) + "px";
      overlayEl.style.right = "auto";
    });
    document.addEventListener("mouseup", () => {
      if (!isDragging) return;
      isDragging = false;
      overlayEl.style.cursor = "move";
      overlayEl.style.transition = "";
    });

    document.body.appendChild(overlayEl);

    // Auto-focus input
    setTimeout(() => inp.focus(), 100);

    // ── Helpers ──
    function pick(n) {
      selectedNumber = n;
      inp.value = n;
      $$(".rc-chip").forEach(c => {
        const match = parseInt(c.dataset.n) === n;
        c.style.background = match ? HIGHLIGHT : "transparent";
        c.style.color = match ? "#fff" : "#ccc";
        c.style.borderColor = match ? HIGHLIGHT : "#3a3a6e";
        c.dataset.selected = match ? "true" : "";
      });
      inp.focus();
    }

    async function send() {
      const n = selectedNumber;
      if (n === null || n === undefined) {
        // Try to parse input directly
        const v = parseInt(inp.value, 10);
        if (!isNaN(v) && v >= 0 && v <= 36) { selectedNumber = v; }
        else { status("Type a number 0–36 first", "err"); return; }
      }
      sendBtn.disabled = true;
      sendBtn.textContent = "Sending...";
      const ok = await sendNum(selectedNumber);
      sendBtn.disabled = false;
      sendBtn.textContent = "⬆ Send to Dashboard";
      if (ok) { inp.value = ""; selectedNumber = null; }
    }
  }

  function destroy() {
    if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
    for (const e of document.querySelectorAll('[style*="' + HIGHLIGHT + '"]')) {
      e.style.outline = ""; e.style.outlineOffset = "";
    }
    window.__ROULETTE_CAPTURE_LOADED = false;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
