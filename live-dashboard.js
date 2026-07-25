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
  const twelveResults = document.querySelector("#twelve-session-results");
  const notice = document.querySelector("#notice");
  const redNumbers = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const twelveLabels = { dozen1: "1st Dozen", dozen2: "2nd Dozen", dozen3: "3rd Dozen", column1: "Column 1", column2: "Column 2", column3: "Column 3" };
  const twelveNumbers = { dozen1: "1â€“12", dozen2: "13â€“24", dozen3: "25â€“36", column1: "1,4,7â€¦34", column2: "2,5,8â€¦35", column3: "3,6,9â€¦36" };
  const label = (value) => twelveLabels[value] || title(value);
  let previousFibStakes = {};

  function numberColor(number) {
    if (number === 0) return "green";
    return redNumbers.has(number) ? "red" : "black";
  }

  function cardMarkup(side) {
    return `<article class="tracker-card" data-side="${side}">
      <div class="card-head"><span class="status-dot"></span><h2>${title(side)}</h2><span class="state-label"></span></div>
      <div class="progress"><strong class="absent">0</strong><span>misses</span></div>
      <div class="card-detail">Tracking absence</div>
      <div class="card-actions"><button class="start primary" type="button">Start</button><button class="ignore" type="button">Ignore</button><button class="resume" type="button">Resume</button></div>
    </article>`;
  }
  grid.innerHTML = ["low", "even", "red", "high", "odd", "black"].map(cardMarkup).join("");
  twelveGrid.innerHTML = TWELVE_SIDES.map((side) => `<article class="tracker-card twelve-card" data-twelve-side="${side}">
    <div class="card-head"><span class="status-dot"></span><h2>${label(side)}</h2><span class="state-label"></span></div>
    <div class="progress"><strong class="absent">0</strong><span>misses</span></div>
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
  twelveGrid.addEventListener("click", (event) => {
    const card = event.target.closest(".twelve-card"); if (!card) return;
    const side = card.dataset.twelveSide;
    if (event.target.matches(".start")) attempt(() => engine.startTwelveBet(side));
    if (event.target.matches(".ignore")) attempt(() => engine.ignoreTwelve(side));
    if (event.target.matches(".resume")) attempt(() => engine.resumeTwelve(side));
  });
  document.querySelector("#spin-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.querySelector("#spin-input");
    attempt(() => { const number = Number(input.value); engine.addSpin(number); hotStreets.appendSpin(number); renderHotStreets(); input.value = ""; say(`Spin ${number} recorded.`); });
    requestAnimationFrame(() => input.focus());
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
  // ── Google Sheets Sync (guard in case panel is missing) ──
  const syncUrlEl = document.querySelector("#sync-url");
  if (syncUrlEl) {
    syncUrlEl.value = googleSync.config.url;
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
  }
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
  twelveResults.addEventListener("click", (event) => {
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
    document.querySelector("#last-spin strong").textContent = last ?? "â€”";
    const recentSpins = state.spins.slice(-8).reverse();
    document.querySelector("#spin-history").innerHTML = recentSpins.length
      ? recentSpins.map((spin, index) => `<button type="button" class="history-number ${numberColor(spin.number)}${index === 0 ? " latest" : ""}" title="Spin ${spin.index}">${spin.number}</button>`).join("")
      : `<span class="history-empty">No spins yet</span>`;
    document.querySelector("#undo-button").disabled = state.spinCount === 0;
    for (const side of SIDES) {
      const tracker = state.trackers[side]; const card = grid.querySelector(`[data-side="${side}"]`);
      card.dataset.state = tracker.status;
      card.querySelector(".absent").textContent = tracker.absent;
      card.querySelector(".state-label").textContent = tracker.status === "active" ? "Active bet" : title(tracker.status);
      const active = state.activeSessions.find((session) => session.side === side);
      const blocked = state.locked[side];
      card.querySelector(".card-detail").textContent = active
        ? active.system === "two-win" ? `Bet ${active.stage + 1}/${(active.progression||[]).length} · wins ${active.winStreak}/2 · stake ${money(active.stake)}` : `Stage ${active.stage + 1}/${(active.progression||[]).length} · stake ${money(active.stake)}`
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
      card.querySelector(".state-label").textContent = tracker.status === "active" ? "FIB" : title(tracker.status);
      card.querySelector(".card-detail").textContent = active ? `S-${active.stage + 1}/${(active.progression||[]).length} · Bet ${money(active.stake)}` : "";
      card.querySelector(".start").disabled = tracker.status !== "triggered" || groupCount >= 2;
      card.querySelector(".ignore").disabled = tracker.status !== "triggered";
      card.querySelector(".resume").disabled = tracker.status !== "ignored";
    }
    const nextPanel = document.querySelector("#next-bets-panel");
    nextPanel.hidden = state.activeFibSessions.length === 0;
    document.querySelector("#next-bets").innerHTML = state.activeFibSessions.map((session) => {
      const changed = previousFibStakes[session.side] === undefined || previousFibStakes[session.side] !== session.stake;
      return `<article class="next-bet${changed ? " changed" : ""}"><div><span class="bet-name">${label(session.side)}</span><span class="bet-step">FIBONACCI · STEP ${session.stage + 1}/${(session.progression||[]).length} · P/L ${money(session.pl)}</span></div><strong class="bet-amount">${money(session.stake)}</strong></article>`;
    }).join("");
    previousFibStakes = Object.fromEntries(state.activeFibSessions.map((session) => [session.side, session.stake]));
    if (!state.activeFibSessions.length && document.body.classList.contains("focus-mode")) {
      document.body.classList.remove("focus-mode");
      document.querySelector("#focus-mode-button").textContent = "Focus mode";
    }

    document.querySelector("#slot-count").textContent = `${state.activeSessions.length} / 3`;
    sessions.innerHTML = state.activeSessions.length ? state.activeSessions.map((session) => `
      <article class="session-row"><strong class="session-side">${title(session.side)}</strong><span class="session-stat stage" title="Bet ${session.stage + 1} of ${(session.progression||[]).length}">${session.system === "two-win" ? `W-${session.winStreak}/2` : `S-${session.stage + 1}/${session.maxStages}`}</span><span class="session-stat stake">Bet ${money(session.stake)}</span><span class="session-stat pl ${session.pl < 0 ? "loss" : session.pl > 0 ? "win" : ""}">P/L ${money(session.pl)}</span><button data-cancel="${session.side}" type="button">Cancel</button></article>`).join("") : `<p class="empty-state">No active bets. Triggered cards will offer a manual start.</p>`;
    document.querySelector("#twelve-slot-count").textContent = `${state.activeFibSessions.length} / 4`;
    twelveSessions.innerHTML = state.activeFibSessions.length ? state.activeFibSessions.map((session) => `<article class="session-row fib-row"><strong class="session-side">${label(session.side)} <small class="fib-tag">FIB</small></strong><span class="session-stat stage">S-${session.stage + 1}/${(session.progression||[]).length}</span><span class="session-stat stake">Bet ${money(session.stake)}</span><span class="session-stat pl ${session.pl < 0 ? "loss" : session.pl > 0 ? "win" : ""}">P/L ${money(session.pl)}</span><button data-cancel-fib="${session.side}" type="button">Cancel</button></article>`).join("") : `<p class="empty-state">No active Fibonacci bets.</p>`;
    // ── Pending results (split by system) ──
    function renderResultRow(session) {
      const burst = session.reason === "max-stage-loss", stopped = session.reason === "max-bets-stopped";
      const tag = session.system === "fibonacci" ? "FIB · " : session.system === "two-win" ? "TWO-WIN · " : "";
      return `<article class="result-row ${burst ? "burst" : stopped ? "stopped" : "won"}">
        <strong>${label(session.side)} · ${tag}${burst ? "BURST" : stopped ? "STOPPED" : session.reason === "target-reached" ? "TARGET" : "WON"}</strong>
        <span>${session.system === "two-win" ? "B" : "S"}${session.stage + 1}/${(session.progression||[]).length}</span>
        <span>P/L ${money(session.pl)}</span>
        <button data-acknowledge="${session.id}" type="button">Acknowledge</button>
      </article>`;
    }
    const evenPending = state.pendingResults.filter(s => s.system !== "fibonacci");
    const fibPending = state.pendingResults.filter(s => s.system === "fibonacci");
    results.innerHTML = evenPending.length ? evenPending.map(renderResultRow).join("") : "";
    twelveResults.innerHTML = fibPending.length ? fibPending.map(renderResultRow).join("") : "";
    document.querySelector("#live-bankroll").textContent = money(state.bankroll);
    document.querySelector("#exposure").textContent = money(state.exposure);
    document.querySelector("#twelve-live-bankroll").textContent = money(state.fibBankroll);
    document.querySelector("#twelve-exposure").textContent = money(state.fibExposure);
    document.querySelector("#bankroll-input").value = state.config.startingBankroll;
    document.querySelector("#unit-input").value = state.config.baseUnit;
    document.querySelector("#twelve-bankroll-input").value = state.config.twelveStartingBankroll;
    document.querySelector("#twelve-unit-input").value = state.config.twelveBaseUnit;
    
    const thresholds = [...new Set(SIDES.map((side) => state.trackers[side].threshold))];
    if (thresholds.length === 1 && thresholds[0] >= 3 && thresholds[0] <= 5) document.querySelector("#trigger-threshold").value = String(thresholds[0]);
    const twelveThresholds = [...new Set(TWELVE_SIDES.map((side) => state.twelveTrackers[side].threshold))];
    if (twelveThresholds.length === 1) document.querySelector("#twelve-trigger-threshold").value = String(twelveThresholds[0]);
    document.querySelector("#dealer-change-button").textContent = `Dealer ${state.dealerChanges.length + 1} Â· Mark change`;
  }

  engine.subscribe((state) => {
    render(state);
    renderHotStreets();
    if (!storage.save(engine)) say("Dashboard updated, but automatic saving failed.", true);
  });

  // â”€â”€ Hot Streets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const hotStreets = new window.RouletteHotStreets.HotStreets();
  let hsLastResultId = 0;
  const hsModal = document.querySelector("#hs-history-modal");
  const hsInput = document.querySelector("#hs-history-input");
  const hsParseStatus = document.querySelector("#hs-parse-status");

  function renderHotStreets() {
    const s = hotStreets.getState();

    // Notify on win/burst
    if (s.lastResult && s.resultId && s.resultId !== hsLastResultId) {
      if (s.lastResult === "win") say(`4-Streets WIN! +${money(s.lastResultBet * 8)} units · P/L ${money(s.totalPL)}`);
      else if (s.lastResult === "burst") say(`4-Streets BURST at Stage ${s.betMax} · P/L ${money(s.totalPL)}`, true);
      hsLastResultId = s.resultId;
    }

    // Status line in summary
    const statusEl = document.querySelector("#hs-status");
    if (s.phase === "idle") statusEl.textContent = s.historyCount > 0 ? `${s.historyCount} numbers loaded` : "No history loaded";
    else if (s.phase === "ready") statusEl.textContent = `${s.historyCount} numbers · Candidates ready`;
    else if (s.phase === "observing") statusEl.textContent = `Observation ${s.observationSpin}/${s.observationTotal}`;
    else if (s.phase === "betting") statusEl.textContent = `Stage ${s.betStage}/${s.betMax} · P/L ${money(s.cyclePL)}`;

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
      document.querySelector("#hs-bet-info").textContent = `Bet ${money(s.currentBet)} units per street`;
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
      document.querySelector("#hs-bet-info").textContent = "Observation complete â€” your choice";
      document.querySelector("#hs-final-streets").innerHTML = s.finalStreets.map(f =>
        `<div class="hs-street-chip"><span>${f.start}</span><small>${f.label}</small></div>`
      ).join("");
      startBtn.disabled = false;
      startBtn.textContent = "Start Bet";
      startBtn.className = "primary";
      document.querySelector("#hs-ignore-bet").hidden = false;
      if (wasHidden) say(`Observation done â€” ${s.finalStreets.map(f => f.start).join(", ")} selected. Place bet?`);
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
      plEl.textContent = `${s.totalPL >= 0 ? "+" : ""}${money(s.totalPL)}`;
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
      hsParseStatus.textContent = `âœ“ ${nums.length} numbers parsed`;
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

  // â”€â”€   // -> Image OCR <-
  const ocrStatusEl = document.querySelector("#hs-ocr-status");
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

  document.querySelector("#hs-modal-upload").addEventListener("click", () => {
    imageInput.value = "";
    imageInput.click();
  });

  imageInput.addEventListener("change", async () => {
    const file = imageInput.files[0];
    if (!file) return;

    ocrStatusEl.textContent = "Loading OCR engine...";
    ocrStatusEl.className = "hs-parse-status";

    try {
      const Tesseract = await loadTesseract();
      ocrStatusEl.textContent = "Reading numbers from image...";

      const { data: { text } } = await Tesseract.recognize(file, "eng", {
        tessedit_char_whitelist: "0123456789\n\r, ",
      });

      // Extract all numbers 0-36
      const nums = text.split(/[\s,]+/)
        .map(s => s.trim().replace(/[oO]/g, "0"))
        .filter(s => s.length > 0 && !isNaN(Number(s)))
        .map(Number)
        .filter(n => n >= 0 && n <= 36);

      if (nums.length === 0) {
        ocrStatusEl.textContent = "No numbers found. Try a clearer screenshot.";
        ocrStatusEl.className = "hs-parse-status err";
        return;
      }

      hsInput.value = nums.join("\n");
      ocrStatusEl.textContent = "Found " + nums.length + " numbers from image";
      ocrStatusEl.className = "hs-parse-status ok";
      hsInput.dispatchEvent(new Event("input"));
    } catch (err) {
      ocrStatusEl.textContent = "OCR failed: " + err.message;
      ocrStatusEl.className = "hs-parse-status err";
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
        say("Observation started â€” watching candidate streets");
      } else if (hotStreets.state.phase === "deciding") {
        hotStreets.acceptBet();
        say(`BETTING â€” Stage 1: bet on ${hotStreets.state.finalStreets.map(si => window.RouletteHotStreets.STREET_STARTS[si]).join(", ")}`);
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
      say("Observation ignored â€” new candidates selected");
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

  // â”€â”€ End Hot Streets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  googleSync.attach(engine, (message, type) => {
    const status = document.querySelector("#sync-status"); if (status) { status.textContent = message; status.classList.toggle("error", type === "error"); }
    say(message, type === "error");
  });
  setInterval(() => {
    const lastAt = engine.getState().spins.at(-1)?.at;
    const timer = document.querySelector("#idle-timer");
    if (!lastAt) { timer.textContent = "Waiting for first spin"; timer.classList.remove("warning"); return; }
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(lastAt).getTime()) / 1000));
    timer.textContent = `Idle ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}${seconds >= 75 ? " Â· Check table" : ""}`;
    timer.classList.toggle("warning", seconds >= 75);
  }, 1000);
  render(engine.getState());
  renderHotStreets();
  if (storage.lastError) say("Saved data could not be restored; a fresh dashboard was opened.", true);
  // â”€â”€ Auto Capture (In-Page Overlay + Direct OCR) â”€â”€
    // â”€â”€ Session Summary (Streak Report) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  /** Absence streak buckets â€” non-overlapping */
  const STREAK_BUCKETS = [
    { label: "1\u20133", min: 1, max: 3 },
    { label: "4\u20135", min: 4, max: 5 },
    { label: "6\u20137", min: 6, max: 7 },
    { label: "8\u20139", min: 8, max: 9 },
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

  /**
   * Track ABSENCE streaks: how many consecutive spins a category goes
   * without hitting. Each time the category hits, the absence that just
   * ended is recorded and the counter resets.
   *
   * Returns bucket counts + per-category stats (max, avg, p90) so the
   * user can decide on waiting time and loss limits.
   */
  function buildStreakReport(spins) {
    const { classify, classifyTwelve } = window.RouletteCore;
    const cats = STREAK_CATEGORIES.map(c => ({ ...c, streaks: [] }));
    const catMap = Object.fromEntries(cats.map(c => [c.key, c]));

    // consecutive-miss counters, start at 0
    let current = Object.fromEntries(cats.map(c => [c.key, 0]));

    function flush(catKey) {
      const len = current[catKey];
      if (len === 0) return;
      const bucket = STREAK_BUCKETS.find(b => len >= b.min && len <= b.max);
      catMap[catKey].streaks.push({ length: len, bucket: bucket ? bucket.label : "13+" });
      current[catKey] = 0; // reset now that it hit
    }

    for (const spin of spins) {
      const n = Number(spin.number);
      if (n === 0) {
        // Zero doesn't belong to any dozen/column, so all absent
        for (const c of cats) current[c.key]++;
        continue;
      }
      const present = new Set([...classify(n), ...classifyTwelve(n)]);
      for (const c of cats) {
        if (present.has(c.key)) {
          flush(c.key);   // hit â†’ record the absence that just ended
        } else {
          current[c.key]++; // miss â†’ absence continues
        }
      }
    }
    // Do NOT flush at the end â€” ongoing absence is unresolved

    // Bucket counts & stats per category
    const buckets = STREAK_BUCKETS.map(b => b.label);
    const rows = cats.map(cat => {
      const counts = Object.fromEntries(buckets.map(b => [b, 0]));
      for (const s of cat.streaks) counts[s.bucket]++;

      const lengths = cat.streaks.map(s => s.length);
      const total = lengths.length;
      const max = total > 0 ? Math.max(...lengths) : 0;
      const avg = total > 0 ? lengths.reduce((a, b) => a + b, 0) / total : 0;

      // 90th percentile: 90 % of absence events are â‰¤ this length
      let p90 = 0;
      if (total > 0) {
        const sorted = [...lengths].sort((a, b) => a - b);
        p90 = sorted[Math.min(Math.ceil(0.9 * sorted.length) - 1, sorted.length - 1)];
      }

      return { label: cat.label, key: cat.key, counts, total, max, avg, p90 };
    });

    // Summary row
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
    thead.innerHTML = `<th>Category</th>${report.buckets.map(b => `<th>${b}</th>`).join("")}<th>Total</th><th>Max</th><th title="90th percentile &mdash; 90% of absences \u2264 this value">P90</th><th>Avg</th>`;

    // Body rows
    tbody.innerHTML = report.rows.map(row =>
      `<tr><td class="ss-cat">${row.label}</td>${report.buckets.map(b => `<td class="ss-num">${row.counts[b] || ""}</td>`).join("")}<td class="ss-num">${row.total}</td><td class="ss-stat">${row.max || ""}</td><td class="ss-stat">${row.p90 || ""}</td><td class="ss-stat">${row.avg ? row.avg.toFixed(1) : ""}</td></tr>`
    ).join("");

    // Summary row (only show categories that had streaks)
    const hasData = report.rows.some(r => r.total > 0);
    if (hasData) {
      tbody.innerHTML += `<tr class="ss-summary"><td class="ss-cat"><strong>Total</strong></td>${report.buckets.map(b => `<td class="ss-num"><strong>${report.summary[b] || ""}</strong></td>`).join("")}<td class="ss-num"><strong>${report.grandTotal}</strong></td><td colspan="3"></td></tr>`;
    } else {
      tbody.innerHTML = `<tr><td colspan="${report.buckets.length + 5}" class="ss-empty">No spins yet</td></tr>`;
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

  
  // ── Progression config wiring ──
  function syncProgPreset(presetSelect, amountsInput, engineSetter) {
    const val = presetSelect.value;
    if (val === "custom") {
      amountsInput.disabled = false;
      return;
    }
    amountsInput.value = val;
    amountsInput.disabled = true;
    const arr = val.split(",").map(Number);
    engineSetter(arr);
  }

  // Even-money progression
  const evenPreset = document.querySelector("#even-prog-preset");
  const evenAmounts = document.querySelector("#even-prog-amounts");
  if (!engine.config.evenProgression) engine.config.evenProgression = [1,2,4,8,16,32,64,128];
  if (!engine.config.twelveProgression) engine.config.twelveProgression = [1,1,2,3,5,8,13,21];
  evenAmounts.value = engine.config.evenProgression.join(",");
  // Set preset dropdown to match initial progression
  const evenOpts = Array.from(evenPreset.options).map(o => o.value);
  evenPreset.value = evenOpts.includes(evenAmounts.value) ? evenAmounts.value : "custom";
  evenAmounts.disabled = evenPreset.value !== "custom";

  evenPreset.addEventListener("change", () => syncProgPreset(evenPreset, evenAmounts, (arr) => engine.setEvenProgression(arr)));
  evenAmounts.addEventListener("change", () => {
    const arr = evenAmounts.value.split(",").map(s => Number(s.trim()));
    if (arr.every(n => n > 0)) { engine.setEvenProgression(arr); evenPreset.value = "custom"; evenAmounts.disabled = false; }
  });

  // Twelve-number progression
  const twelvePreset = document.querySelector("#twelve-prog-preset");
  const twelveAmounts = document.querySelector("#twelve-prog-amounts");
  twelveAmounts.value = engine.config.twelveProgression.join(",");
  const twelveOpts = Array.from(twelvePreset.options).map(o => o.value);
  twelvePreset.value = twelveOpts.includes(twelveAmounts.value) ? twelveAmounts.value : "custom";
  twelveAmounts.disabled = twelvePreset.value !== "custom";

  twelvePreset.addEventListener("change", () => syncProgPreset(twelvePreset, twelveAmounts, (arr) => engine.setTwelveProgression(arr)));
  twelveAmounts.addEventListener("change", () => {
    const arr = twelveAmounts.value.split(",").map(s => Number(s.trim()));
    if (arr.every(n => n > 0)) { engine.setTwelveProgression(arr); twelvePreset.value = "custom"; twelveAmounts.disabled = false; }
  });

  // ── 4-Streets progression config ──
  const hsPreset = document.querySelector("#hs-prog-preset");
  const hsAmounts = document.querySelector("#hs-prog-amounts");
  const hsUnit = document.querySelector("#hs-unit-input");
  hsAmounts.value = hotStreets.progression.join(",");
  const hsOpts = Array.from(hsPreset.options).map(o => o.value);
  hsPreset.value = hsOpts.includes(hsAmounts.value) ? hsAmounts.value : "custom";
  hsAmounts.disabled = hsPreset.value !== "custom";
  hsUnit.value = hotStreets.baseUnit;

  hsPreset.addEventListener("change", () => syncProgPreset(hsPreset, hsAmounts, (arr) => hotStreets.setProgression(arr)));
  hsAmounts.addEventListener("change", () => {
    const arr = hsAmounts.value.split(",").map(s => Number(s.trim()));
    if (arr.every(n => n > 0)) { hotStreets.setProgression(arr); hsPreset.value = "custom"; hsAmounts.disabled = false; }
  });
  hsUnit.addEventListener("change", () => {
    const u = Number(hsUnit.value);
    if (u > 0) { hotStreets.setBaseUnit(u); say(`4-Streets unit set to ${u}`); }
  });

  // ── 4-Streets backtest ──
  function backtestStreets(progression) {
    const allSpins = collectAllSpins();
    let wins = 0, bursts = 0, totalPL = 0, cycles = 0;
    const streetOf = window.RouletteHotStreets.streetOf;
    const FINAL_COUNT = 4;
    const OBSERVATION = 12;

    // For each batch of OBSERVATION spins, simulate selecting 4 streets
    // then betting the progression on the next spins until win or burst
    let i = 0;
    while (i + OBSERVATION < allSpins.length) {
      // Observation: count hits per street
      const counts = new Array(12).fill(0);
      for (let j = 0; j < OBSERVATION; j++) {
        const si = streetOf(Number(allSpins[i + j].number));
        if (si >= 0) counts[si]++;
      }
      // Pick top 4 streets
      const ranked = counts.map((c, si) => ({ si, c })).sort((a, b) => b.c - a.c);
      const finalStreets = ranked.slice(0, FINAL_COUNT).map(r => r.si);
      i += OBSERVATION;

      if (i >= allSpins.length) break;

      // Now bet progression
      let stage = 0;
      while (stage < progression.length && i < allSpins.length) {
        const stake = progression[stage];
        const si = streetOf(Number(allSpins[i].number));
        if (si >= 0 && finalStreets.includes(si)) {
          totalPL += stake * 2; // win
          wins++;
          break;
        } else {
          totalPL -= stake; // loss
          stage++;
          if (stage >= progression.length) {
            bursts++;
          }
        }
        i++;
      }
      cycles++;
      i++;
    }
    return { wins, bursts, totalPL, cycles, totalSpins: allSpins.length };
  }

  document.querySelector("#hs-backtest-btn").addEventListener("click", () => {
    const prog = document.querySelector("#hs-prog-amounts").value.split(",").map(Number);
    const unit = Number(document.querySelector("#hs-unit-input").value) || 1;
    const data = backtestStreets(prog);
    const el = document.querySelector("#hs-backtest");
    el.hidden = false;
    if (data.totalSpins === 0) {
      el.innerHTML = '<div class="bt-empty">No spin data available.</div>';
      return;
    }
    el.innerHTML = `<table><thead><tr><th>Wins</th><th>Bursts</th><th>Cycles</th><th>P/L (${unit}u)</th></tr></thead><tbody><tr class="bt-summary"><td>${data.wins}</td><td>${data.bursts}</td><td>${data.cycles}</td><td class="${data.totalPL >= 0 ? 'bt-pos' : 'bt-neg'}">${money(data.totalPL * unit)}</td></tr></tbody></table>`;
  });

  // ── Summary label updates in render ──
  // Patch render to update system summary labels
  const origRender = render;
  render = function(state) {
    origRender(state);
    const evenThresh = SIDES.map(s => state.trackers[s].threshold);
    document.querySelector("#even-summary").textContent = `Martingale \u00b7 trigger ${evenThresh[0] || 4} \u00b7 ${engine.config.evenProgression.join(",")}`;
    const twelveThresh = TWELVE_SIDES.map(s => state.twelveTrackers[s].threshold);
    document.querySelector("#twelve-summary").textContent = `Fibonacci \u00b7 trigger ${twelveThresh[0] || 6} \u00b7 ${engine.config.twelveProgression.join(",")}`;
  };

  // ── Backtest ──
  function runBacktestAll(sides, trigger, progression, isTwelve) {
    const allSpins = collectAllSpins();
    const { classify, classifyTwelve } = window.RouletteCore;
    const payout = isTwelve ? 2 : 1;
    const results = [];
    let totalBursts = 0, totalWins = 0, totalPL = 0;

    for (const side of sides) {
      let absent = 0, stage = 0, betting = false;
      let bursts = 0, wins = 0, pl = 0;
      const clsFn = isTwelve ? classifyTwelve : classify;

      for (const spin of allSpins) {
        const n = Number(spin.number);
        const present = n === 0 ? [] : clsFn(n);

        if (betting) {
          const stake = progression[stage] || progression[progression.length - 1];
          if (present.includes(side)) {
            pl += stake * payout;
            wins++;
            betting = false; stage = 0; absent = 0;
          } else {
            pl -= stake;
            stage++;
            if (stage >= progression.length) {
              bursts++;
              betting = false; stage = 0; absent = 0;
            } else {
              absent++;
            }
          }
          continue;
        }

        if (present.includes(side)) {
          absent = 0;
        } else {
          absent++;
          if (absent >= trigger && !betting) {
            betting = true; stage = 0;
          }
        }
      }

      results.push({ side: title(side), bursts, wins, pl });
      totalBursts += bursts; totalWins += wins; totalPL += pl;
    }

    return { results, totalBursts, totalWins, totalPL, totalSpins: allSpins.length };
  }

  function renderBacktest(container, data) {
    container.hidden = false;
    if (data.totalSpins === 0) {
      container.innerHTML = '<div class="bt-empty">No spin data available. Add spins or sync from Google Sheets.</div>';
      return;
    }
    const rows = data.results.map(r => `<tr><td>${r.side}</td><td>${r.bursts}</td><td>${r.wins}</td><td class="${r.pl >= 0 ? 'bt-pos' : 'bt-neg'}">${money(r.pl)}</td></tr>`).join("");
    container.innerHTML = `<table><thead><tr><th>Side</th><th>Bursts</th><th>Wins</th><th>P/L</th></tr></thead><tbody>${rows}<tr class="bt-summary"><td><strong>Total</strong></td><td><strong>${data.totalBursts}</strong></td><td><strong>${data.totalWins}</strong></td><td class="${data.totalPL >= 0 ? 'bt-pos' : 'bt-neg'}"><strong>${money(data.totalPL)}</strong></td></tr></tbody></table>`;
  }

  document.querySelector("#even-backtest-btn").addEventListener("click", () => {
    const trigger = Number(document.querySelector("#trigger-threshold").value);
    const prog = document.querySelector("#even-prog-amounts").value.split(",").map(Number);
    const data = runBacktestAll(SIDES, trigger, prog, false);
    renderBacktest(document.querySelector("#even-backtest"), data);
  });

  document.querySelector("#twelve-backtest-btn").addEventListener("click", () => {
    const trigger = Number(document.querySelector("#twelve-trigger-threshold").value);
    const prog = document.querySelector("#twelve-prog-amounts").value.split(",").map(Number);
    const data = runBacktestAll(TWELVE_SIDES, trigger, prog, true);
    renderBacktest(document.querySelector("#twelve-backtest"), data);
  });


window.liveDashboard = { engine, storage, googleSync, hotStreets, exportSnapshot: () => engine.exportSnapshot() };
})();
