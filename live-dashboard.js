(function () {
  "use strict";
  const { RouletteEngine, SIDES, TWELVE_SIDES } = window.RouletteCore;
  const storage = new window.DashboardStorage.DashboardStorage();
  const engine = storage.load(RouletteEngine);
  let tableSession = storage.sessionInfo();
  const googleSync = new window.RouletteGoogleSync.GoogleSheetsSync();
  const title = (value) => value[0].toUpperCase() + value.slice(1);
  const money = (value) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  const grid = document.querySelector("#tracker-grid");
  const twelveGrid = document.querySelector("#twelve-grid");
  const sessions = document.querySelector("#active-sessions");
  const twelveSessions = document.querySelector("#twelve-sessions");
  const results = document.querySelector("#session-results");
  const notice = document.querySelector("#notice");
  const redNumbers = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const twelveLabels = { dozen1: "1st Dozen", dozen2: "2nd Dozen", dozen3: "3rd Dozen", column1: "Column 1", column2: "Column 2", column3: "Column 3" };
  const twelveNumbers = { dozen1: "1–12", dozen2: "13–24", dozen3: "25–36", column1: "1,4,7…34", column2: "2,5,8…35", column3: "3,6,9…36" };
  const label = (value) => twelveLabels[value] || title(value);
  let previousFibStakes = {};

  function numberColor(number) {
    if (number === 0) return "green";
    return redNumbers.has(number) ? "red" : "black";
  }

  function cardMarkup(side) {
    return `<article class="tracker-card" data-side="${side}">
      <div class="card-head"><span class="status-dot"></span><h2>${title(side)}</h2><span class="state-label"></span></div>
      <div class="progress"><strong class="absent">0</strong><span>of</span><input class="threshold" type="number" min="1" max="99" value="4" aria-label="${title(side)} absence threshold" /></div>
      <div class="card-detail">Tracking absence</div>
      <div class="card-actions"><button class="start primary" type="button">Start</button><button class="ignore" type="button">Ignore</button><button class="resume" type="button">Resume</button></div>
    </article>`;
  }
  grid.innerHTML = ["low", "even", "red", "high", "odd", "black"].map(cardMarkup).join("");
  twelveGrid.innerHTML = TWELVE_SIDES.map((side) => `<article class="tracker-card twelve-card" data-twelve-side="${side}">
    <div class="card-head"><span class="status-dot"></span><h2>${label(side)}</h2><span class="state-label"></span></div>
    <div class="progress"><strong class="absent">0</strong><span>of</span><input class="threshold" type="number" min="1" max="99" value="6" /></div>
    <div class="card-detail"></div>
    <div class="card-actions"><button class="start primary" type="button">Start</button><button class="ignore" type="button">Ignore</button><button class="resume" type="button">Resume</button></div>
  </article>`).join("");

  function say(message, isError = false) { notice.textContent = message; notice.classList.toggle("error", isError); }
  function attempt(action) { try { action(); say("Dashboard updated."); } catch (error) { say(error.message, true); } }

  grid.addEventListener("click", (event) => {
    const card = event.target.closest(".tracker-card"); if (!card) return;
    if (event.target.matches(".start")) attempt(() => engine.startBet(card.dataset.side));
    if (event.target.matches(".ignore")) attempt(() => engine.ignore(card.dataset.side));
    if (event.target.matches(".resume")) attempt(() => engine.resume(card.dataset.side));
  });
  grid.addEventListener("change", (event) => {
    if (!event.target.matches(".threshold")) return;
    attempt(() => engine.setThreshold(event.target.closest(".tracker-card").dataset.side, event.target.value));
  });
  twelveGrid.addEventListener("click", (event) => {
    const card = event.target.closest(".twelve-card"); if (!card) return;
    const side = card.dataset.twelveSide;
    if (event.target.matches(".start")) attempt(() => engine.startTwelveBet(side));
    if (event.target.matches(".ignore")) attempt(() => engine.ignoreTwelve(side));
    if (event.target.matches(".resume")) attempt(() => engine.resumeTwelve(side));
  });
  twelveGrid.addEventListener("change", (event) => {
    if (event.target.matches(".threshold")) attempt(() => engine.setTwelveThreshold(event.target.closest(".twelve-card").dataset.twelveSide, event.target.value));
  });

  document.querySelector("#spin-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.querySelector("#spin-input");
    attempt(() => { const number = Number(input.value); engine.addSpin(number); hotStreets.appendSpin(number); renderHotStreets(); input.value = ""; input.focus(); say(`Spin ${number} recorded.`); });
  });
  document.querySelector("#undo-button").addEventListener("click", () => {
    if (engine.undoLastSpin()) say("Last spin undone."); else say("There is no spin to undo.", true);
  });
  document.querySelector("#reset-session-button").addEventListener("click", async () => {
    const confirmed = window.confirm(`End Session ${tableSession.number} and start a new session? Its synchronized Google Sheets records will remain saved.`);
    if (!confirmed) return;
    googleSync.archiveCurrentSession(engine, tableSession.number);
    await googleSync.sync(engine);
    engine.resetSession();
    hotStreets.reset();
    googleSync.startNewSession();
    tableSession = storage.startNextSession();
    render(engine.getState());
    renderHotStreets();
    say(`Session ${tableSession.number - 1} ended. Session ${tableSession.number} is ready.`);
    document.querySelector("#spin-input").focus();
  });
  document.querySelector("#bankroll-input").addEventListener("change", (e) => attempt(() => engine.setStartingBankroll(e.target.value)));
  document.querySelector("#unit-input").addEventListener("change", (e) => attempt(() => engine.setBaseUnit(e.target.value)));
  document.querySelector("#twelve-bankroll-input").addEventListener("change", (e) => attempt(() => engine.setTwelveStartingBankroll(e.target.value)));
  document.querySelector("#twelve-unit-input").addEventListener("change", (e) => attempt(() => engine.setTwelveBaseUnit(e.target.value)));
  document.querySelector("#table-rule").addEventListener("change", (e) => attempt(() => engine.setTableRule(e.target.value)));
  document.querySelector("#trigger-threshold").addEventListener("change", (e) => attempt(() => {
    const threshold = Number(e.target.value);
    SIDES.forEach((side) => engine.setThreshold(side, threshold));
  }));
  document.querySelector("#twelve-trigger-threshold").addEventListener("change", (e) => attempt(() => {
    const threshold = Number(e.target.value);
    TWELVE_SIDES.forEach((side) => engine.setTwelveThreshold(side, threshold));
  }));
  document.querySelector("#dealer-change-button").addEventListener("click", () => {
    engine.markDealerChange();
    say(`Dealer ${engine.getState().dealerChanges.length + 1} started after spin ${engine.getState().spinCount}.`);
  });
  document.querySelector("#history-button").addEventListener("click", () => {
    window.open("history.html", "roulette-history", "width=1000,height=720,resizable=yes,scrollbars=yes");
  });
  document.querySelector("#sync-url").value = googleSync.config.url;
  document.querySelector("#sync-token").value = googleSync.config.token;
  const archiveSummary = googleSync.lastArchiveSummary();
  document.querySelector("#archive-summary").textContent = archiveSummary
    ? `Latest local archive: Session ${archiveSummary.sessionNumber || "unknown"} · ${archiveSummary.spins} spins · ${new Date(archiveSummary.archivedAt).toLocaleString()}`
    : "No local recovery archive exists in this dashboard file.";
  document.querySelector("#resync-archive").disabled = !archiveSummary;
  document.querySelector("#download-archive").disabled = !archiveSummary;
  document.querySelector("#save-sync").addEventListener("click", () => attempt(() => {
    googleSync.configure(document.querySelector("#sync-url").value, document.querySelector("#sync-token").value, true);
    googleSync.sync(engine);
    document.querySelector("#sync-status").textContent = "Connecting…";
  }));
  document.querySelector("#disable-sync").addEventListener("click", () => {
    googleSync.disable(); document.querySelector("#sync-status").textContent = "Disconnected"; say("Google Sheets synchronization disabled.");
  });
  document.querySelector("#resync-archive").addEventListener("click", async () => {
    const confirmed = window.confirm("Replace the Google Sheets rows for the most recently archived session? Use this only when a session is missing or incomplete.");
    if (!confirmed) return;
    try { await googleSync.resyncLastArchive(); } catch (error) { say(error.message, true); }
  });
  document.querySelector("#download-archive").addEventListener("click", () => attempt(() => googleSync.downloadLastArchive()));
  sessions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-cancel]"); if (button) attempt(() => engine.cancelBet(button.dataset.cancel));
  });
  twelveSessions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-cancel-fib]"); if (button) attempt(() => engine.cancelTwelveBet(button.dataset.cancelFib));
  });
  results.addEventListener("click", (event) => {
    const button = event.target.closest("[data-acknowledge]");
    if (button) attempt(() => engine.acknowledgeResult(button.dataset.acknowledge));
  });
  document.querySelector("#focus-mode-button").addEventListener("click", () => {
    document.body.classList.toggle("focus-mode");
    document.querySelector("#focus-mode-button").textContent = document.body.classList.contains("focus-mode") ? "Show dashboard" : "Focus mode";
  });

  function render(state) {
    document.querySelector("#session-number").textContent = `Session ${tableSession.number}`;
    document.querySelector("#spin-count").textContent = state.spinCount;
    const last = state.spins.at(-1)?.number;
    document.querySelector("#last-spin strong").textContent = last ?? "—";
    const recentSpins = state.spins.slice(-8).reverse();
    document.querySelector("#spin-history").innerHTML = recentSpins.length
      ? recentSpins.map((spin, index) => `<button type="button" class="history-number ${numberColor(spin.number)}${index === 0 ? " latest" : ""}" title="Spin ${spin.index}">${spin.number}</button>`).join("")
      : `<span class="history-empty">No spins yet</span>`;
    document.querySelector("#undo-button").disabled = state.spinCount === 0;
    for (const side of SIDES) {
      const tracker = state.trackers[side]; const card = grid.querySelector(`[data-side="${side}"]`);
      card.dataset.state = tracker.status;
      card.querySelector(".absent").textContent = tracker.absent;
      card.querySelector(".threshold").value = tracker.threshold;
      card.querySelector(".state-label").textContent = tracker.status === "active" ? "Active bet" : title(tracker.status);
      const active = state.activeSessions.find((session) => session.side === side);
      const blocked = state.locked[side];
      card.querySelector(".card-detail").textContent = active
        ? active.system === "two-win" ? `Bet ${active.stage + 1}/8 · wins ${active.winStreak}/2 · stake ${money(active.stake)}` : `Stage ${active.stage + 1}/${active.maxStages} · stake ${money(active.stake)}`
        : blocked ? "Locked by opposite bet" : tracker.status === "ignored" ? "Muted until this side appears" : "";
      card.querySelector(".start").disabled = tracker.status !== "triggered" || blocked || state.activeSessions.length >= 3;
      card.querySelector(".ignore").disabled = tracker.status !== "triggered";
      card.querySelector(".resume").disabled = tracker.status !== "ignored";
    }
    for (const side of TWELVE_SIDES) {
      const tracker = state.twelveTrackers[side]; const card = twelveGrid.querySelector(`[data-twelve-side="${side}"]`);
      const active = state.activeFibSessions.find((session) => session.side === side);
      const group = side.startsWith("dozen") ? "dozen" : "column";
      const groupCount = state.activeFibSessions.filter((session) => session.group === group).length;
      card.dataset.state = tracker.status;
      card.querySelector(".absent").textContent = tracker.absent;
      card.querySelector(".threshold").value = tracker.threshold;
      card.querySelector(".state-label").textContent = tracker.status === "active" ? "FIB" : title(tracker.status);
      card.querySelector(".card-detail").textContent = active ? `FIB S-${active.stage + 1}/8 · Bet ${money(active.stake)}` : "";
      card.querySelector(".start").disabled = tracker.status !== "triggered" || groupCount >= 2;
      card.querySelector(".ignore").disabled = tracker.status !== "triggered";
      card.querySelector(".resume").disabled = tracker.status !== "ignored";
    }
    const nextPanel = document.querySelector("#next-bets-panel");
    nextPanel.hidden = state.activeFibSessions.length === 0;
    document.querySelector("#next-bets").innerHTML = state.activeFibSessions.map((session) => {
      const changed = previousFibStakes[session.side] === undefined || previousFibStakes[session.side] !== session.stake;
      return `<article class="next-bet${changed ? " changed" : ""}"><div><span class="bet-name">${label(session.side)}</span><span class="bet-step">FIBONACCI · STEP ${session.stage + 1} OF 8 · P/L ${money(session.pl)}</span></div><strong class="bet-amount">${money(session.stake)}</strong></article>`;
    }).join("");
    previousFibStakes = Object.fromEntries(state.activeFibSessions.map((session) => [session.side, session.stake]));
    if (!state.activeFibSessions.length && document.body.classList.contains("focus-mode")) {
      document.body.classList.remove("focus-mode");
      document.querySelector("#focus-mode-button").textContent = "Focus mode";
    }

    document.querySelector("#slot-count").textContent = `${state.activeSessions.length} / 3`;
    sessions.innerHTML = state.activeSessions.length ? state.activeSessions.map((session) => `
      <article class="session-row"><strong class="session-side">${title(session.side)}</strong><span class="session-stat stage" title="Bet ${session.stage + 1} of ${session.maxStages}">${session.system === "two-win" ? `W-${session.winStreak}/2` : `S-${session.stage + 1}/${session.maxStages}`}</span><span class="session-stat stake">Bet ${money(session.stake)}</span><span class="session-stat pl ${session.pl < 0 ? "loss" : session.pl > 0 ? "win" : ""}">P/L ${money(session.pl)}</span><button data-cancel="${session.side}" type="button">Cancel</button></article>`).join("") : `<p class="empty-state">No active bets. Triggered cards will offer a manual start.</p>`;
    document.querySelector("#twelve-slot-count").textContent = `${state.activeFibSessions.length} / 4`;
    twelveSessions.innerHTML = state.activeFibSessions.length ? state.activeFibSessions.map((session) => `<article class="session-row fib-row"><strong class="session-side">${label(session.side)} <small class="fib-tag">FIB</small></strong><span class="session-stat stage">S-${session.stage + 1}/8</span><span class="session-stat stake">Bet ${money(session.stake)}</span><span class="session-stat pl ${session.pl < 0 ? "loss" : session.pl > 0 ? "win" : ""}">P/L ${money(session.pl)}</span><button data-cancel-fib="${session.side}" type="button">Cancel</button></article>`).join("") : `<p class="empty-state">No active Fibonacci bets.</p>`;
    results.innerHTML = state.pendingResults.map((session) => {
      const burst = session.reason === "max-stage-loss", stopped = session.reason === "max-bets-stopped";
      return `<article class="result-row ${burst ? "burst" : stopped ? "stopped" : "won"}">
        <strong>${label(session.side)} · ${session.system === "fibonacci" ? "FIB · " : session.system === "two-win" ? "TWO-WIN · " : ""}${burst ? "BURST" : stopped ? "STOPPED" : session.reason === "target-reached" ? "TARGET" : "WON"}</strong>
        <span>${session.system === "two-win" ? "B" : "S"}${session.stage + 1}/${session.maxStages || 8}</span>
        <span>P/L ${money(session.pl)}</span>
        <button data-acknowledge="${session.id}" type="button">Acknowledge</button>
      </article>`;
    }).join("");
    document.querySelector("#live-bankroll").textContent = money(state.bankroll);
    document.querySelector("#exposure").textContent = money(state.exposure);
    document.querySelector("#twelve-live-bankroll").textContent = money(state.fibBankroll);
    document.querySelector("#twelve-exposure").textContent = money(state.fibExposure);
    document.querySelector("#bankroll-input").value = state.config.startingBankroll;
    document.querySelector("#unit-input").value = state.config.baseUnit;
    document.querySelector("#twelve-bankroll-input").value = state.config.twelveStartingBankroll;
    document.querySelector("#twelve-unit-input").value = state.config.twelveBaseUnit;
    document.querySelector("#table-rule").value = state.config.tableRule;
    const thresholds = [...new Set(SIDES.map((side) => state.trackers[side].threshold))];
    if (thresholds.length === 1 && thresholds[0] >= 3 && thresholds[0] <= 5) document.querySelector("#trigger-threshold").value = String(thresholds[0]);
    const twelveThresholds = [...new Set(TWELVE_SIDES.map((side) => state.twelveTrackers[side].threshold))];
    if (twelveThresholds.length === 1) document.querySelector("#twelve-trigger-threshold").value = String(twelveThresholds[0]);
    document.querySelector("#dealer-change-button").textContent = `Dealer ${state.dealerChanges.length + 1} · Mark change`;
  }

  engine.subscribe((state) => {
    render(state);
    renderHotStreets();
    if (!storage.save(engine)) say("Dashboard updated, but automatic saving failed.", true);
  });

  // ── Hot Streets ──────────────────────────────────────────────
  const hotStreets = new window.RouletteHotStreets.HotStreets();
  let hsLastResult = null;
  const hsModal = document.querySelector("#hs-history-modal");
  const hsInput = document.querySelector("#hs-history-input");
  const hsParseStatus = document.querySelector("#hs-parse-status");

  function renderHotStreets() {
    const s = hotStreets.getState();

    // Notify on win/burst
    if (s.lastResult && s.lastResult !== hsLastResult) {
      if (s.lastResult === "win") say(`4-Streets WIN! +2 units · P/L ${s.totalPL >= 0 ? "+" : ""}${s.totalPL}`);
      else if (s.lastResult === "burst") say(`4-Streets BURST at Stage ${s.betMax} · P/L ${s.totalPL}`, true);
      hsLastResult = s.lastResult;
      setTimeout(() => { hsLastResult = null; }, 2000);
    }

    // Status line in summary
    const statusEl = document.querySelector("#hs-status");
    if (s.phase === "idle") statusEl.textContent = s.historyCount > 0 ? `${s.historyCount} numbers loaded` : "No history loaded";
    else if (s.phase === "ready") statusEl.textContent = `${s.historyCount} numbers · Candidates ready`;
    else if (s.phase === "observing") statusEl.textContent = `Observation ${s.observationSpin}/${s.observationTotal}`;
    else if (s.phase === "betting") statusEl.textContent = `Stage ${s.betStage}/${s.betMax} · P/L ${s.cyclePL >= 0 ? "+" : ""}${s.cyclePL}`;

    // History count
    document.querySelector("#hs-history-count").textContent = s.historyCount > 0
      ? `${s.historyCount} numbers in history`
      : "Paste table history to start";

    // Mode buttons
    document.querySelector("#hs-mode-hot").classList.toggle("primary", s.mode === "hot");
    document.querySelector("#hs-mode-cold").classList.toggle("primary", s.mode === "cold");

    // Candidates
    const candPanel = document.querySelector("#hs-candidates");
    const candList = document.querySelector("#hs-candidate-list");
    if (s.candidates.length > 0 && (s.phase === "ready" || s.phase === "observing" || s.phase === "betting")) {
      candPanel.hidden = false;
      document.querySelector("#hs-obs-label").textContent = s.phase === "observing"
        ? `Observation ${s.observationSpin}/${s.observationTotal}`
        : s.phase === "betting" ? "Betting phase" : "Ready";
      candList.innerHTML = s.candidates.map(c => {
        const scored = c.score > 0;
        return `<div class="hs-candidate-card${scored ? " hs-scored" : ""}">
          <div class="hs-cand-street">${c.start}</div>
          <div class="hs-cand-score">${c.score} pts</div>
        </div>`;
      }).join("");
    } else {
      candPanel.hidden = true;
    }

    // Final pack
    const finalPanel = document.querySelector("#hs-final");
    const betBanner = document.querySelector("#hs-bet-banner");
    const wasHidden = finalPanel.hidden || betBanner.hidden;
    const startBtn = document.querySelector("#hs-start-bet");
    if (s.finalStreets.length > 0 && s.phase === "betting") {
      finalPanel.hidden = false;
      betBanner.hidden = false;
      document.querySelector("#hs-bet-stage-label").textContent = `Stage ${s.betStage}/${s.betMax}`;
      document.querySelector("#hs-bet-info").textContent = `Bet ${s.currentBet} unit${s.currentBet !== 1 ? "s" : ""} per street`;
      document.querySelector("#hs-final-streets").innerHTML = s.finalStreets.map(f =>
        `<div class="hs-street-chip"><span>${f.start}</span><small>${f.label}</small></div>`
      ).join("");
      startBtn.disabled = true;
      startBtn.textContent = `Stage ${s.betStage} active`;
      startBtn.className = "primary";
      document.querySelector("#hs-ignore-bet").hidden = true;
    } else if (s.finalStreets.length > 0 && s.phase === "deciding") {
      finalPanel.hidden = false;
      betBanner.hidden = true;
      document.querySelector("#hs-bet-info").textContent = "Observation complete — your choice";
      document.querySelector("#hs-final-streets").innerHTML = s.finalStreets.map(f =>
        `<div class="hs-street-chip"><span>${f.start}</span><small>${f.label}</small></div>`
      ).join("");
      startBtn.disabled = false;
      startBtn.textContent = "Start Bet";
      startBtn.className = "primary";
      document.querySelector("#hs-ignore-bet").hidden = false;
      if (wasHidden) say(`Observation done — ${s.finalStreets.map(f => f.start).join(", ")} selected. Place bet?`);
    } else if (s.candidates.length > 0 && s.phase === "ready" && s.observationSpin === 0) {
      finalPanel.hidden = false;
      betBanner.hidden = true;
      document.querySelector("#hs-bet-info").textContent = "Ready to observe";
      document.querySelector("#hs-final-streets").innerHTML = `<span style="color:var(--muted);font-size:10px;grid-column:1/-1;">Press Start Observation</span>`;
      startBtn.disabled = false;
      startBtn.textContent = "Start Observation";
      startBtn.className = "primary";
      document.querySelector("#hs-ignore-bet").hidden = true;
    } else {
      finalPanel.hidden = true;
      betBanner.hidden = true;
      document.querySelector("#hs-ignore-bet").hidden = true;
    }

    // Cycle stats
    const statsPanel = document.querySelector("#hs-cycle-stats");
    if (s.totalCycles > 0) {
      statsPanel.hidden = false;
      document.querySelector("#hs-total-cycles").textContent = s.totalCycles;
      document.querySelector("#hs-total-wins").textContent = s.cycleWins;
      document.querySelector("#hs-total-bursts").textContent = s.cycleBursts;
      const plEl = document.querySelector("#hs-total-pl");
      plEl.textContent = `${s.totalPL >= 0 ? "+" : ""}${s.totalPL}`;
      plEl.style.color = s.totalPL >= 0 ? "var(--green)" : "var(--red)";
    } else {
      statsPanel.hidden = true;
    }
  }

  // Modal open/close
  document.querySelector("#hs-load-history").addEventListener("click", () => {
    hsInput.value = "";
    hsParseStatus.textContent = "";
    hsParseStatus.className = "hs-parse-status";
    hsModal.hidden = false;
    hsInput.focus();
  });
  document.querySelector("#hs-history-cancel").addEventListener("click", () => { hsModal.hidden = true; });
  hsModal.addEventListener("click", (e) => { if (e.target === hsModal) hsModal.hidden = true; });

  // Live parse preview
  hsInput.addEventListener("input", () => {
    const nums = window.RouletteHotStreets.parseNumbers(hsInput.value);
    if (nums.length === 0) {
      hsParseStatus.textContent = "";
      hsParseStatus.className = "hs-parse-status";
    } else {
      hsParseStatus.textContent = `✓ ${nums.length} numbers parsed`;
      hsParseStatus.className = "hs-parse-status ok";
    }
  });

  // Save history
  document.querySelector("#hs-history-save").addEventListener("click", () => {
    try {
      const count = hotStreets.replaceHistory(hsInput.value);
      hsModal.hidden = true;
      say(`${count} numbers loaded for 4-Streets strategy`);
      renderHotStreets();
    } catch (err) {
      hsParseStatus.textContent = err.message;
      hsParseStatus.className = "hs-parse-status err";
    }
  });

  // ── Image OCR ─────────────────────────────────────────────────
  const ocrStatus = document.querySelector("#hs-ocr-status");
  const imageInput = document.querySelector("#hs-image-input");

  // Dynamically load Tesseract.js from CDN
  function loadTesseract() {
    return new Promise((resolve, reject) => {
      if (window.Tesseract) return resolve(window.Tesseract);
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
      script.onload = () => resolve(window.Tesseract);
      script.onerror = () => reject(new Error("Failed to load Tesseract.js"));
      document.head.appendChild(script);
    });
  }

  document.querySelector("#hs-upload-image").addEventListener("click", () => {
    imageInput.value = "";
    imageInput.click();
  });

  imageInput.addEventListener("change", async () => {
    const file = imageInput.files[0];
    if (!file) return;

    ocrStatus.textContent = "Loading OCR engine...";
    ocrStatus.className = "hs-parse-status";

    try {
      const Tesseract = await loadTesseract();
      ocrStatus.textContent = "Reading numbers from image...";

      const { data: { text } } = await Tesseract.recognize(file, "eng", {
        // Only recognize digits and common separators
        tessedit_char_whitelist: "0123456789\n\r, ",
      });

      // Extract all numbers 0-36 from the OCR text
      const nums = text.split(/[\s,]+/)
        .map(s => s.trim().replace(/[oO]/g, "0"))
        .filter(s => s.length > 0 && !isNaN(Number(s)))
        .map(Number)
        .filter(n => n >= 0 && n <= 36);

      if (nums.length === 0) {
        ocrStatus.textContent = "No numbers found. Try a clearer screenshot.";
        ocrStatus.className = "hs-parse-status err";
        return;
      }

      // Fill textarea with extracted numbers
      hsInput.value = nums.join("\n");
      ocrStatus.textContent = `✓ Found ${nums.length} numbers from image`;
      ocrStatus.className = "hs-parse-status ok";

      // Trigger live parse preview
      hsInput.dispatchEvent(new Event("input"));
    } catch (err) {
      ocrStatus.textContent = `OCR failed: ${err.message}`;
      ocrStatus.className = "hs-parse-status err";
    }
  });

  // Mode toggle
  document.querySelector("#hs-mode-hot").addEventListener("click", () => {
    if (hotStreets.history.length < 12) { say("Load at least 12 numbers first.", true); return; }
    hotStreets.selectCandidates("hot");
    renderHotStreets();
  });
  document.querySelector("#hs-mode-cold").addEventListener("click", () => {
    if (hotStreets.history.length < 12) { say("Load at least 12 numbers first.", true); return; }
    hotStreets.selectCandidates("cold");
    renderHotStreets();
  });

  // Start observation / accept bet
  document.querySelector("#hs-start-bet").addEventListener("click", () => {
    try {
      if (hotStreets.state.phase === "ready" && hotStreets.state.observationSpin === 0) {
        hotStreets.startObservation();
        say("Observation started — watching candidate streets");
      } else if (hotStreets.state.phase === "deciding") {
        hotStreets.acceptBet();
        say(`BETTING — Stage 1: bet on ${hotStreets.state.finalStreets.map(si => window.RouletteHotStreets.STREET_STARTS[si]).join(", ")}`);
      }
      renderHotStreets();
    } catch (err) {
      say(err.message, true);
    }
  });

  // Ignore this cycle
  document.querySelector("#hs-ignore-bet").addEventListener("click", () => {
    try {
      hotStreets.ignoreBet();
      say("Observation ignored — new candidates selected");
      renderHotStreets();
    } catch (err) {
      say(err.message, true);
    }
  });

  // Reset
  document.querySelector("#hs-reset").addEventListener("click", () => {
    if (!window.confirm("Reset 4-Streets strategy? History will be cleared.")) return;
    hotStreets.reset();
    renderHotStreets();
    say("4-Streets strategy reset");
  });

  // ── End Hot Streets ──────────────────────────────────────────

  googleSync.attach(engine, (message, type) => {
    const status = document.querySelector("#sync-status"); status.textContent = message; status.classList.toggle("error", type === "error");
    say(message, type === "error");
  });
  setInterval(() => {
    const lastAt = engine.getState().spins.at(-1)?.at;
    const timer = document.querySelector("#idle-timer");
    if (!lastAt) { timer.textContent = "Waiting for first spin"; timer.classList.remove("warning"); return; }
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(lastAt).getTime()) / 1000));
    timer.textContent = `Idle ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}${seconds >= 75 ? " · Check table" : ""}`;
    timer.classList.toggle("warning", seconds >= 75);
  }, 1000);
  render(engine.getState());
  renderHotStreets();
  if (storage.lastError) say("Saved data could not be restored; a fresh dashboard was opened.", true);
  // ── Auto Capture (In-Page Overlay + Direct OCR) ──
  const AC_MAGNIFICATION = 4;
  const AC_REGION_KEY = "roulette-autocapture-region-v1";

  // Pre-load Tesseract so first capture doesn't wait for CDN
  let acTesseractPromise = null;
  function ensureTesseract() {
    if (!acTesseractPromise) acTesseractPromise = loadTesseract().catch(() => null);
    return acTesseractPromise;
  }
  ensureTesseract();

  let acVideo = document.getElementById("ac-video");
  let acStream = null;
  let acRegion = null;
  let acIntervalId = null;
  let acCaptureCount = 0;
  let acOverlayActive = false;  // true while overlay is open
  let acOverlayResolve = null;  // resolves when overlay finishes (region or cancel)

  // Restore saved region
  try { const d = localStorage.getItem(AC_REGION_KEY); if (d) acRegion = JSON.parse(d); } catch {}

  function acSaveRegion_() { localStorage.setItem(AC_REGION_KEY, JSON.stringify(acRegion)); }

  /** Draw the magnified image onto the preview canvas so the user can see what OCR sees */
  function debugShowCapture_(sourceCanvas) {
    const pv = document.querySelector("#ac-preview-canvas");
    if (!pv) return;
    const ctx = pv.getContext("2d");
    const s = Math.min(pv.width / sourceCanvas.width, pv.height / sourceCanvas.height);
    const dw = Math.round(sourceCanvas.width * s);
    const dh = Math.round(sourceCanvas.height * s);
    ctx.clearRect(0, 0, pv.width, pv.height);
    ctx.drawImage(sourceCanvas, 0, 0, dw, dh);
  }

  /** Open in-page overlay for region selection */
  async function acSelectRegion() {
    const overlay = document.getElementById("ac-overlay");
    const canvas = document.getElementById("ac-overlay-canvas");
    const ctx = canvas.getContext("2d");
    const hint = document.getElementById("ac-overlay-hint");
    const cancelBtn = document.getElementById("ac-overlay-cancel");

    // Show overlay
    overlay.hidden = false;
    acOverlayActive = true;
    hint.textContent = "Share your screen\u2026";

    try {
      // Get display stream (prompts user to select a window)
      acStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "never" }, audio: false });
      acVideo.srcObject = acStream;
      await acVideo.play();
      if (!acVideo.videoWidth) await new Promise(r => (acVideo.ontimeupdate = () => { if (acVideo.videoWidth) { acVideo.ontimeupdate = null; r(); } }));
    } catch (e) {
      hint.textContent = e.message === "canceled" ? "Cancelled" : `Error: ${e.message}`;
      setTimeout(() => { overlay.hidden = true; acOverlayActive = false; }, 2000);
      return;
    }

    // Set canvas size to video dimensions
    canvas.width = acVideo.videoWidth;
    canvas.height = acVideo.videoHeight;
    hint.textContent = "Draw rectangle around the winning number, then Enter";

    // Fit canvas to available space
    let acAnimId = null;
    let acSel = null;
    let acMouseDown = false;
    let acCaptureRect = null;

    function fitCanvas() {
      const wrap = canvas.parentElement;
      const s = Math.min(wrap.clientWidth / canvas.width, wrap.clientHeight / canvas.height, 1);
      canvas.style.width = Math.round(canvas.width * s) + "px";
      canvas.style.height = Math.round(canvas.height * s) + "px";
    }
    fitCanvas();
    new ResizeObserver(fitCanvas).observe(canvas.parentElement);

    // Draw video + selection rect
    function drawLoop() {
      if (!canvas.parentElement) return;
      try { ctx.drawImage(acVideo, 0, 0); } catch (_) {}
      if (acSel) {
        const x = Math.min(acSel.x1, acSel.x2), y = Math.min(acSel.y1, acSel.y2);
        const w = Math.abs(acSel.x2 - acSel.x1), h = Math.abs(acSel.y2 - acSel.y1);
        if (w > 0 && h > 0) {
          ctx.fillStyle = "rgba(0,255,136,0.08)"; ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = "#00ff88"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
        }
      }
      acAnimId = requestAnimationFrame(drawLoop);
    }
    drawLoop();

    function canvasPos(e) {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
    }

    canvas.addEventListener("mousedown", e => { const p = canvasPos(e); acSel = { x1: p.x, y1: p.y, x2: p.x, y2: p.y }; acMouseDown = true; });
    canvas.addEventListener("mousemove", e => { if (!acMouseDown || !acSel) return; const p = canvasPos(e); acSel.x2 = Math.max(0, Math.min(p.x, canvas.width)); acSel.y2 = Math.max(0, Math.min(p.y, canvas.height)); });
    canvas.addEventListener("mouseup", () => { acMouseDown = false; if (acSel && (Math.abs(acSel.x2 - acSel.x1) < 10 || Math.abs(acSel.y2 - acSel.y1) < 5)) acSel = null; });

    cancelBtn.onclick = cancelOverlay;
    function cancelOverlay() {
      if (acStream) { acStream.getTracks().forEach(t => t.stop()); acStream = null; }
      acVideo.srcObject = null;
      if (acAnimId) cancelAnimationFrame(acAnimId);
      overlay.hidden = true;
      acOverlayActive = false;
    }

    // Keyboard: Enter saves region, Escape cancels
    const keyHandler = e => {
      if (e.key === "Enter") {
        if (!acSel) { hint.textContent = "Draw a rectangle first"; return; }
        const cx = Math.round(Math.min(acSel.x1, acSel.x2)), cy = Math.round(Math.min(acSel.y1, acSel.y2));
        const cw = Math.round(Math.abs(acSel.x2 - acSel.x1)), ch = Math.round(Math.abs(acSel.y2 - acSel.y1));
        acCaptureRect = { cx, cy, cw, ch };
        acRegion = { x: cx, y: cy, w: cw, h: ch };
        acSaveRegion_();
        // Stream is already playing — don't re-assign srcObject (that resets the video)
        if (acAnimId) cancelAnimationFrame(acAnimId);
        document.removeEventListener("keydown", keyHandler);
        overlay.hidden = true;
        acOverlayActive = false;
        acUpdateUI_();
        const statusEl = document.querySelector("#ac-status");
        statusEl.textContent = `Region ${acRegion.w}\u00d7${acRegion.h} set`; statusEl.className = "";
        console.log(`[AutoCapture] Region set: ${JSON.stringify(acRegion)}`);
        // Do first capture immediately
        acCaptureFromScreen();
      } else if (e.key === "Escape") {
        cancelOverlay();
        document.removeEventListener("keydown", keyHandler);
      }
    };
    document.addEventListener("keydown", keyHandler);

    // Stream ended → close overlay
    acStream.getVideoTracks()[0]?.addEventListener("ended", () => {
      hint.textContent = "Stream ended \u2014 close and re-select region";
      setTimeout(() => { if (acOverlayActive) cancelOverlay(); }, 3000);
    });
  }

  /** Capture: grab frame from video, crop, magnify, OCR */
  async function acCaptureFromScreen() {
    const statusEl = document.querySelector("#ac-status");
    if (!acRegion) { statusEl.textContent = "No region set"; statusEl.className = "error"; return null; }
    if (!acVideo.srcObject) { statusEl.textContent = "No video stream. Re-select region."; statusEl.className = "error"; return null; }

    // Video diagnostics
    console.log(`[AutoCapture] Video: ${acVideo.videoWidth}\u00d7${acVideo.videoHeight}, readyState=${acVideo.readyState}, paused=${acVideo.paused}, track=${acStream?.getVideoTracks()?.[0]?.readyState}`);

    // Draw current video frame to offscreen canvas
    const { x: cx, y: cy, w: cw, h: ch } = acRegion;
    const ix = Math.round(cx), iy = Math.round(cy), iw = Math.max(1, Math.round(cw)), ih = Math.max(1, Math.round(ch));
    const cropC = document.createElement("canvas");
    cropC.width = iw; cropC.height = ih;
    const cropCtx = cropC.getContext("2d");
    cropCtx.drawImage(acVideo, ix, iy, iw, ih, 0, 0, iw, ih);

    // Check if the crop actually contains any non-blank pixels
    const imageData = cropCtx.getImageData(0, 0, iw, ih);
    let brightPx = 0, totalPx = imageData.data.length / 4;
    for (let i = 0; i < imageData.data.length; i += 4) {
      const lum = 0.299 * imageData.data[i] + 0.587 * imageData.data[i+1] + 0.114 * imageData.data[i+2];
      if (lum > 100) brightPx++;
    }
    console.log(`[AutoCapture] Crop: ${iw}\u00d7${ih}, bright pixels: ${brightPx}/${totalPx} (${(brightPx/totalPx*100).toFixed(1)}%)`);

    // Magnify at 3× for better accuracy
    const MAG = 3;
    const magC = document.createElement("canvas");
    magC.width = cropC.width * MAG;
    magC.height = cropC.height * MAG;
    const magCtx = magC.getContext("2d");
    magCtx.imageSmoothingEnabled = false;
    magCtx.drawImage(cropC, 0, 0, magC.width, magC.height);

    // Preview: show what OCR actually sees
    debugShowCapture_(magC);

    // OCR (Tesseract is pre-loaded by ensureTesseract())
    try {
      statusEl.textContent = "Initialising OCR\u2026"; statusEl.className = "";
      const T = await ensureTesseract();
      if (!T) { statusEl.textContent = "\u2717 Tesseract not available"; statusEl.className = "error"; return null; }

      // OCR with retry on empty/low-confidence result
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        await new Promise(r => requestAnimationFrame(r));
        cropCtx.drawImage(acVideo, ix, iy, iw, ih, 0, 0, iw, ih);
        magCtx.drawImage(cropC, 0, 0, magC.width, magC.height);
        debugShowCapture_(magC);
      }

      statusEl.textContent = `Recognizing${attempt > 0 ? " (retry)" : ""}\u2026`;
      statusEl.className = "";
      const t0 = performance.now();
      const result = await T.recognize(magC, "eng", {
        tessedit_char_whitelist: "0123456789",
        tessedit_pageseg_mode: "6",
        tessedit_ocr_engine_mode: "1"
      });
      const t1 = performance.now();
      console.log(`[AutoCapture] OCR took ${(t1 - t0).toFixed(0)}ms, confidence: ${result.data.confidence}`);
      const raw = result.data.text.trim();
      console.log(`[AutoCapture] OCR raw: "${raw}"`);
      // Strip any non-ASCII chars (Tesseract can output Unicode digits that [0-9] won't match)
      const cleaned = raw.replace(/[^\x20-\x7E]/g, "");

      // Find first valid number 0-36
      const m = cleaned.match(/\b([0-9]|[12][0-9]|3[0-6])\b/);
      if (m) {
        // Found a number — continue outside the loop
        const number = parseInt(m[1] || m[0], 10);
        const state = engine.getState();
        if (state.spins.length > 0 && state.spins[state.spins.length - 1].number === number) {
          console.log(`[AutoCapture] Dupe ${number} \u2014 skip`);
          const lastEl = document.querySelector("#ac-last"); lastEl.textContent = number;
          return number;
        }

        console.log(`[AutoCapture] \u2192 ${number}`);
        engine.addSpin(number);
        hotStreets.appendSpin(number);
        render(engine.getState());
        renderHotStreets();
        storage.save(engine);

        acCaptureCount++;
        document.querySelector("#ac-last").textContent = number;
        document.querySelector("#ac-count").textContent = `Captured: ${acCaptureCount}`;
        statusEl.textContent = `\u2713 ${number} at ${new Date().toLocaleTimeString()}`; statusEl.className = "";
        say(`Auto: ${number}`);
        return number;
      }
    }
    // All 3 attempts failed — return null
    return null;
  } catch (e) {
    statusEl.textContent = `\u2717 ${e.message}`; statusEl.className = "error";
    console.log("[AutoCapture] Error:", e.message);
    return null;
  }
}

  function acUpdateUI_() {
    const ready = acRegion !== null && acVideo.srcObject;
    document.querySelector("#ac-capture-now").disabled = !ready;
    document.querySelector("#ac-toggle").disabled = !ready;
    document.querySelector("#ac-interval").disabled = !ready;
    if (acRegion) {
      document.querySelector("#ac-region-label").textContent = `Region ${acRegion.w}\u00d7${acRegion.h}`;
      document.querySelector("#ac-preview-wrap").hidden = false;
      const pv = document.querySelector("#ac-preview-canvas");
      const scale = Math.min(120 / acRegion.w, 60 / acRegion.h);
      pv.width = Math.round(acRegion.w * scale);
      pv.height = Math.round(acRegion.h * scale);
      document.querySelector("#ac-preview-coords").textContent = `${acRegion.w}\u00d7${acRegion.h}`;
    } else {
      document.querySelector("#ac-region-label").textContent = "No region selected";
      document.querySelector("#ac-preview-wrap").hidden = true;
    }
  }

  // Restore region on load
  if (acRegion) { acUpdateUI_(); document.querySelector("#ac-status").textContent = "Region loaded. Select screen."; }

  // Event wiring
  document.querySelector("#ac-select-region").addEventListener("click", acSelectRegion);
  document.querySelector("#ac-capture-now").addEventListener("click", acCaptureFromScreen);
  document.querySelector("#ac-toggle").addEventListener("change", () => {
    const on = document.querySelector("#ac-toggle").checked;
    const ms = parseInt(document.querySelector("#ac-interval").value, 10) * 1000;
    if (acIntervalId) { clearInterval(acIntervalId); acIntervalId = null; }
    if (on) {
      if (!acRegion || !acVideo.srcObject) {
        document.querySelector("#ac-status").textContent = "Select region & share screen first";
        document.querySelector("#ac-status").className = "error";
        document.querySelector("#ac-toggle").checked = false; return;
      }
      console.log(`[AutoCapture] Every ${ms / 1000}s`); document.querySelector("#ac-status").textContent = "Auto active"; document.querySelector("#ac-status").className = "";
      acCaptureFromScreen(); acIntervalId = setInterval(acCaptureFromScreen, ms);
    } else { document.querySelector("#ac-status").textContent = "Paused"; document.querySelector("#ac-status").className = ""; }
  });

  // ── Session Summary (Streak Report) ──────────────────────
  const STREAK_BUCKETS = [
    { label: "< 4", min: 1, max: 3 },
    { label: "4\u20136", min: 4, max: 6 },
    { label: "6\u20138", min: 6, max: 8 },
    { label: "8\u201310", min: 8, max: 10 },
    { label: "10\u201312", min: 10, max: 12 },
    { label: "13+", min: 13, max: Infinity },
  ];
  const STREAK_CATEGORIES = [
    { key: "low", label: "Low (1\u201318)" },
    { key: "high", label: "High (19\u201336)" },
    { key: "even", label: "Even" },
    { key: "odd", label: "Odd" },
    { key: "red", label: "Red" },
    { key: "black", label: "Black" },
    { key: "dozen1", label: "1st Dozen" },
    { key: "dozen2", label: "2nd Dozen" },
    { key: "dozen3", label: "3rd Dozen" },
    { key: "column1", label: "1st Column" },
    { key: "column2", label: "2nd Column" },
    { key: "column3", label: "3rd Column" },
  ];

  function buildStreakReport(spins) {
    const { classify, classifyTwelve } = window.RouletteCore;
    const cats = STREAK_CATEGORIES.map(c => ({ ...c, streaks: [] }));
    const catMap = Object.fromEntries(cats.map(c => [c.key, c]));

    let current = Object.fromEntries(cats.map(c => [c.key, 0]));

    function flush(catKey) {
      const len = current[catKey];
      if (len === 0) return;
      const bucket = STREAK_BUCKETS.find(b => len >= b.min && len <= b.max);
      catMap[catKey].streaks.push({ length: len, bucket: bucket ? bucket.label : "13+" });
      current[catKey] = 0;
    }

    for (const spin of spins) {
      const n = Number(spin.number);
      if (n === 0) {
        // Zero breaks every streak
        for (const c of cats) flush(c.key);
        continue;
      }
      const present = new Set([...classify(n), ...classifyTwelve(n)]);
      for (const c of cats) {
        if (present.has(c.key)) {
          current[c.key]++;
        } else {
          flush(c.key);
        }
      }
    }
    // Flush any remaining streaks
    for (const c of cats) flush(c.key);

    // Build result: for each category, count streaks per bucket
    const buckets = STREAK_BUCKETS.map(b => b.label);
    const rows = cats.map(cat => {
      const counts = Object.fromEntries(buckets.map(b => [b, 0]));
      for (const s of cat.streaks) counts[s.bucket]++;
      return { label: cat.label, key: cat.key, counts, total: cat.streaks.length };
    });

    // Summary row: totals per bucket across all categories
    const summary = Object.fromEntries(buckets.map(b => [b, 0]));
    let grandTotal = 0;
    for (const row of rows) {
      for (const b of buckets) { summary[b] += row.counts[b]; grandTotal += row.counts[b]; }
    }

    return { buckets, rows, summary, grandTotal };
  }

  /** Collect all spins from archives + current session */
  function collectAllSpins() {
    const all = [];
    // Archived sessions (oldest first)
    for (const archive of (googleSync.archives || [])) {
      const rows = archive.tables?.Spins || [];
      for (const row of rows) {
        all.push({ number: Number(row[2]), at: row[1] });
      }
    }
    // Current session
    const state = engine.getState();
    for (const spin of state.spins) {
      all.push({ number: Number(spin.number), at: spin.at });
    }
    return all;
  }

  document.querySelector("#session-summary-button").addEventListener("click", () => {
    const allSpins = collectAllSpins();
    const report = buildStreakReport(allSpins);
    const modal = document.querySelector("#session-summary-modal");
    const tbody = modal.querySelector("tbody");
    const thead = modal.querySelector("thead tr");

    // Headers
    thead.innerHTML = `<th>Category</th>${report.buckets.map(b => `<th>${b}</th>`).join("")}<th>Total</th>`;

    // Body rows
    tbody.innerHTML = report.rows.map(row =>
      `<tr><td class="ss-cat">${row.label}</td>${report.buckets.map(b => `<td class="ss-num">${row.counts[b] || ""}</td>`).join("")}<td class="ss-num">${row.total}</td></tr>`
    ).join("");

    // Summary row (only show categories that had streaks)
    const hasData = report.rows.some(r => r.total > 0);
    if (hasData) {
      tbody.innerHTML += `<tr class="ss-summary"><td class="ss-cat"><strong>Total</strong></td>${report.buckets.map(b => `<td class="ss-num"><strong>${report.summary[b] || ""}</strong></td>`).join("")}<td class="ss-num"><strong>${report.grandTotal}</strong></td></tr>`;
    } else {
      tbody.innerHTML = `<tr><td colspan="${report.buckets.length + 2}" class="ss-empty">No spins yet</td></tr>`;
    }

    modal.querySelector("#ss-spin-count").textContent = `${allSpins.length} spins (${googleSync.archives?.length || 0} archived sessions + current)`;
    modal.hidden = false;
  });

  document.querySelector("#ss-modal-cancel").addEventListener("click", () => {
    document.querySelector("#session-summary-modal").hidden = true;
  });
  document.querySelector("#session-summary-modal").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) e.currentTarget.hidden = true;
  });

  window.liveDashboard = { engine, storage, googleSync, hotStreets, exportSnapshot: () => engine.exportSnapshot(), autoCaptureResult: acCaptureFromScreen };
})();
