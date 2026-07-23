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
  window.liveDashboard = { engine, storage, googleSync, hotStreets, exportSnapshot: () => engine.exportSnapshot() };
})();
