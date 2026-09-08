(function () {
  "use strict";

  // ── Config ──────────────────────────────────────────────
  const CHANNEL = "roulette-quick-entry-v1";
  const RED_NUMS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  const colorOf = (n) => (n === 0 ? "green" : RED_NUMS.has(n) ? "red" : "black");

  const STREETS = [
    { label: "1-3",   nums: [1, 2, 3] },
    { label: "4-6",   nums: [4, 5, 6] },
    { label: "7-9",   nums: [7, 8, 9] },
    { label: "10-12", nums: [10, 11, 12] },
    { label: "13-15", nums: [13, 14, 15] },
    { label: "16-18", nums: [16, 17, 18] },
    { label: "19-21", nums: [19, 20, 21] },
    { label: "22-24", nums: [22, 23, 24] },
    { label: "25-27", nums: [25, 26, 27] },
    { label: "28-30", nums: [28, 29, 30] },
    { label: "31-33", nums: [31, 32, 33] },
    { label: "34-36", nums: [34, 35, 36] },
  ];

  const GROUPS = {
    d1: [1,2,3,4,5,6,7,8,9,10,11,12],
    d2: [13,14,15,16,17,18,19,20,21,22,23,24],
    d3: [25,26,27,28,29,30,31,32,33,34,35,36],
    c1: [1,4,7,10,13,16,19,22,25,28,31,34],
    c2: [2,5,8,11,14,17,20,23,26,29,32,35],
    c3: [3,6,9,12,15,18,21,24,27,30,33,36],
  };

  // ── DOM refs ────────────────────────────────────────────
  const board     = document.getElementById("board");
  const history   = document.getElementById("history");
  const input     = document.getElementById("num-input");
  const status    = document.getElementById("status");
  const layoutSel = document.getElementById("layout-select");
  const topmostCb = document.getElementById("topmost");

  // ── Local state ─────────────────────────────────────────
  let numbers = [];            // local spin history
  let connected = false;       // true when main dashboard sends state
  let currentLayout = localStorage.getItem("qe-layout") || "left";

  // ── BroadcastChannel ────────────────────────────────────
  const channel = new BroadcastChannel(CHANNEL);
  channel.addEventListener("message", onMessage);
  window.addEventListener("beforeunload", () => channel.close());
  function requestState() { channel.postMessage({ type: "request-state" }); }
  function postAction(action, number) {
    channel.postMessage({ type: "action", action, number });
  }

  // ── Build the board ─────────────────────────────────────
  function buildBoard() {
    board.innerHTML = "";

    // Zero cell
    const zero = document.createElement("button");
    zero.type = "button";
    zero.className = "cell num green cell-zero";
    zero.textContent = "0";
    zero.dataset.num = "0";
    zero.addEventListener("click", () => enterNumber(0));
    board.appendChild(zero);

    // Number cells (1-36)
    for (let n = 1; n <= 36; n++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cell num " + colorOf(n);
      btn.textContent = n;
      btn.dataset.num = String(n);
      btn.addEventListener("click", () => enterNumber(n));
      board.appendChild(btn);
    }

    // Street cells (embedded in grid)
    for (const street of STREETS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cell street";
      btn.textContent = street.label;
      btn.dataset.street = street.label;
      board.appendChild(btn);
    }

    // Group cells (D1-D3, C1-C3) — embedded in grid for alignment
    const groupOrder = ["d1","d2","d3","c1","c2","c3"];
    for (const key of groupOrder) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cell group";
      btn.dataset.key = key;
      btn.innerHTML = key.toUpperCase() + '<span class="gs"><b>H</b><i>0</i></span><span class="gs"><b>A</b><i>0</i></span>';
      board.appendChild(btn);
    }

    applyLayout(currentLayout);
  }

  // ── Layout switching ────────────────────────────────────
  function applyLayout(mode) {
    currentLayout = mode;
    layoutSel.value = mode;
    board.classList.toggle("layout-left", mode === "left");
    board.classList.toggle("layout-top", mode === "top");
    localStorage.setItem("qe-layout", mode);
    positionCells(mode);
  }

  function positionCells(mode) {
    const nums = board.querySelectorAll(".cell.num:not(.cell-zero)");
    const strs = board.querySelectorAll(".cell.street");
    const grps = board.querySelectorAll(".cell.group");

    nums.forEach(btn => {
      const n = Number(btn.dataset.num);
      if (mode === "left") {
        btn.style.gridColumn = String(Math.floor((n - 1) / 3) + 2);
        btn.style.gridRow    = String(3 - ((n - 1) % 3));
      } else {
        btn.style.gridColumn = String(((n - 1) % 3) + 1);
        btn.style.gridRow    = String(Math.floor((n - 1) / 3) + 2);
      }
      btn.style.removeProperty("width");
      btn.style.removeProperty("height");
    });

    strs.forEach((btn, i) => {
      if (mode === "left") {
        btn.style.gridColumn = String(i + 2);
        btn.style.gridRow    = "4";
      } else {
        btn.style.gridColumn = "4";
        btn.style.gridRow    = String(i + 2);
      }
    });

    grps.forEach((btn, i) => {
      const col = (i % 3) + 1;
      const rowBase = mode === "left" ? 5 : 14;
      const row = rowBase + Math.floor(i / 3);
      btn.style.gridColumn = String(col);
      btn.style.gridRow    = String(row);
      if (mode === "left") {
        btn.style.gridColumn = String(col * 3 - 1) + " / " + String(col * 3 + 2);
      }
    });
  }

  // ── Enter / Undo ────────────────────────────────────────
  function enterNumber(n) {
    // Add to local state
    numbers.push(n);
    saveLocal();

    // Update UI immediately
    renderHistory(numbers);
    updateBadges(numbers);

    // Send to main dashboard if connected
    postAction("spin", n);
    status.textContent = "Sent " + n;
    input.value = "";
    input.focus();
  }

  function submitTyped() {
    const raw = input.value.trim();
    const n = Number(raw);
    if (!/^\d{1,2}$/.test(raw) || !Number.isInteger(n) || n < 0 || n > 36) {
      status.textContent = "Enter 0-36";
      input.select();
      return;
    }
    enterNumber(n);
  }

  function undoLast() {
    if (numbers.length === 0) {
      status.textContent = "Nothing to undo";
      return;
    }
    numbers.pop();
    saveLocal();
    renderHistory(numbers);
    updateBadges(numbers);
    postAction("undo");
    status.textContent = "Undo sent";
    input.focus();
  }

  // ── Local persistence ───────────────────────────────────
  function saveLocal() {
    localStorage.setItem("qe-numbers", JSON.stringify(numbers));
  }
  function loadLocal() {
    try {
      const raw = localStorage.getItem("qe-numbers");
      if (raw) numbers = JSON.parse(raw);
    } catch (_) {}
  }

  // ── Badge update ────────────────────────────────────────
  function updateBadges(nums) {
    // Number hit counts
    const nh = {};
    for (let i = 0; i <= 36; i++) nh[i] = 0;

    // Street hit counts + last index
    const sh = {};
    const shLast = {};
    STREETS.forEach(s => { sh[s.label] = 0; shLast[s.label] = -1; });

    // Group hit counts + last index
    const gh = {};
    const ghLast = {};
    Object.keys(GROUPS).forEach(k => { gh[k] = 0; ghLast[k] = -1; });

    // Count
    const total = Array.isArray(nums) ? nums.length : 0;
    if (total > 0) {
      nums.forEach((n, idx) => {
        if (typeof n !== "number" || n < 0 || n > 36) return;
        nh[n]++;
        STREETS.forEach(s => {
          if (s.nums.includes(n)) { sh[s.label]++; shLast[s.label] = idx; }
        });
        Object.entries(GROUPS).forEach(([k, arr]) => {
          if (arr.includes(n)) { gh[k]++; ghLast[k] = idx; }
        });
      });
    }

    // Number badges
    board.querySelectorAll(".cell.num").forEach(btn => {
      const n = Number(btn.dataset.num);
      setBadge(btn, nh[n]);
    });

    // Street badges — H = hits, A = spins since last hit
    board.querySelectorAll(".cell.street").forEach(btn => {
      const label = btn.dataset.street;
      const hits = sh[label] || 0;
      const lastIdx = shLast[label];
      const absence = lastIdx === -1 ? total : (total - 1 - lastIdx);
      setBadge(btn, hits);
      // Store absence data for potential future use
      btn.dataset.absence = String(absence);
    });

    // Group stats — H = hits, A = spins since last hit
    board.querySelectorAll(".cell.group").forEach(btn => {
      const k = btn.dataset.key;
      const hits = gh[k] || 0;
      const lastIdx = ghLast[k];
      const absence = lastIdx === -1 ? total : (total - 1 - lastIdx);
      const spans = btn.querySelectorAll(".gs i");
      if (spans.length >= 2) {
        spans[0].textContent = hits;
        spans[1].textContent = absence;
      }
    });
  }

  function setBadge(el, count) {
    let b = el.querySelector(".badge");
    if (count > 0) {
      if (!b) { b = document.createElement("span"); b.className = "badge"; el.appendChild(b); }
      b.textContent = count;
    } else if (b) {
      b.remove();
    }
  }

  // ── History render ──────────────────────────────────────
  function renderHistory(nums) {
    if (!Array.isArray(nums) || !nums.length) {
      history.innerHTML = '<span style="color:#9ca3af">No spins yet</span>';
      return;
    }
    // Show last 20, newest on the left (reversed)
    const recent = nums.slice(-20).reverse();
    history.innerHTML = recent
      .map(n => `<span class="history-num ${colorOf(n)}">${n}</span>`)
      .join("");
    // Scroll to left (newest)
    history.scrollLeft = 0;
  }

  // ── Message handler (from main dashboard) ───────────────
  function onMessage(e) {
    if (e.data?.type !== "state") return;
    // Build version check
    const localVer = document.querySelector("footer span:last-child")?.textContent?.trim();
    if (e.data.build && localVer && e.data.build !== localVer) {
      window.location.reload();
      return;
    }
    const nums = Array.isArray(e.data.numbers) ? e.data.numbers : [];
    // Dashboard state overrides local
    numbers = nums;
    saveLocal();
    renderHistory(numbers);
    updateBadges(numbers);
    connected = true;
    status.textContent = "Connected";
    status.classList.add("connected");
  }

  // ── CSV Upload ──────────────────────────────────────────
  function handleCSV(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      const text = e.target.result;
      // Extract all numbers 0-36 from the CSV text
      const matches = text.match(/\b(\d{1,2})\b/g);
      if (!matches) {
        status.textContent = "No numbers found in file";
        return;
      }
      const parsed = [];
      matches.forEach(m => {
        const n = Number(m);
        if (n >= 0 && n <= 36) parsed.push(n);
      });
      if (parsed.length === 0) {
        status.textContent = "No valid numbers (0-36) found";
        return;
      }
      // Add all to local state
      numbers = numbers.concat(parsed);
      saveLocal();
      renderHistory(numbers);
      updateBadges(numbers);
      status.textContent = `Uploaded ${parsed.length} numbers`;
    };
    reader.readAsText(file);
  }
  // ── Topmost ─────────────────────────────────────────────
  async function applyTopmost() {
    const enabled = topmostCb.checked;
    localStorage.setItem("qe-topmost", String(enabled));

    // 1) Try local API (works when served by main dashboard's server)
    try {
      await fetch("/api/window/topmost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "quick", enabled }),
      });
      return; // API handled it
    } catch (_) {}

    // 2) Fallback: ask main dashboard via BroadcastChannel
    channel.postMessage({ type: "topmost", enabled });
  }

  // ── Event listeners ─────────────────────────────────────
  document.getElementById("btn-enter").addEventListener("click", submitTyped);
  document.getElementById("btn-undo").addEventListener("click", undoLast);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); submitTyped(); }
    if (e.key === "z" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undoLast(); }
  });
  layoutSel.addEventListener("change", () => applyLayout(layoutSel.value));
  topmostCb.addEventListener("change", applyTopmost);
  document.getElementById("csv-input").addEventListener("change", e => {
    if (e.target.files.length) handleCSV(e.target.files[0]);
    e.target.value = ""; // reset so same file can be re-uploaded
  });

  // ── Init ────────────────────────────────────────────────
  topmostCb.checked = localStorage.getItem("qe-topmost") !== "false";
  loadLocal();
  buildBoard();
  renderHistory(numbers);
  updateBadges(numbers);
  requestState();
  applyTopmost();
  input.focus();
  setInterval(requestState, 1500);
})();
