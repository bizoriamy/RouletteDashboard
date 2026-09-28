// BetPilot — Baccarat Module — JavaScript
// Version: v1.0.0-20260928-Baccarat
// Separate from Roulette (OCR/). Baccarat only.
// No external API calls in this file — reads config from baccarat_api_config.json
// Confirm user before recording results. No win guarantees.

(function () {
  "use strict";

  // --- STATE ---
  let session = {
    casino: "",
    bankroll: 0,
    tableType: "pragmatic-half",
    mode: "manual",
    hands: [],
    currentBet: 6, // default for test; user can adjust
    started: false,
    provider: "gemini" // from config — separated from Roulette DeepSeek
  };

  // --- INIT ---
  function init() {
    document.getElementById("current-provider").textContent = session.provider === "gemini" ? "Gemini 1.5 Flash" : "DeepSeek v4 Flash";
    document.getElementById("ocr-mode-display").textContent = "Mode: Manual Entry (recommended to start)";
    updateBalance();
  }

  // --- SESSION ---
  window.startSession = function () {
    const casino = document.getElementById("casino-name").value || "Pragmatic Baccarat";
    const bankroll = parseInt(document.getElementById("starting-bankroll").value) || 0;
    const table = document.getElementById("table-type").value || "pragmatic-half";
    const mode = document.getElementById("ocr-mode").value || "manual";

    session = {
      casino: casino,
      bankroll: bankroll,
      tableType: table,
      mode: mode,
      hands: [],
      currentBet: 10,
      started: true,
      provider: (document.getElementById("current-provider").textContent.indexOf("Gemini") >= 0) ? "gemini" : "deepseek"
    };

    // Show betting screen, hide setup (with transition)
    document.getElementById("session-setup").classList.remove("active");
    document.getElementById("betting-screen").classList.add("active");

    document.getElementById("display-casino").textContent = casino;
    document.getElementById("display-table").textContent = table.replace(/-/g, " ");
    document.getElementById("current-bankroll").textContent = bankroll;
    document.getElementById("current-units").textContent = session.currentBet;

    // Update provider label based on config (Gemini for Baccarat, DeepSeek for Roulette — separate)
    document.querySelector("#ocr-mode-display").textContent = "Mode: " + getModeLabel(mode) + " | Provider: " + (session.provider === "gemini" ? "Gemini 1.5 Flash" : "DeepSeek v4 Flash");

    // Disclaimer already visible (always required)
    updateStats();
  };

  function getModeLabel(mode) {
    const labels = {
      manual: "Manual Entry",
      observe: "Observe Only",
      confirm: "Confirm Before Entry",
      auto: "Automatic (with check)"
    };
    return labels[mode] || "Manual";
  }

  // --- BETTING ---
  window.adjustUnit = function (delta) {
    session.currentBet = Math.max(1, session.currentBet + delta);
    document.getElementById("current-units").textContent = session.currentBet;
  };

  window.doubleUnit = function () {
    session.currentBet *= 2;
    document.getElementById("current-units").textContent = session.currentBet;
  };

  window.clearBet = function () {
    session.currentBet = 10;
    document.getElementById("current-units").textContent = session.currentBet;
  };

  window.placeBet = function (side) {
    // Confirm with user (required — never automatic entry without confirmation)
    const confirmed = confirm("Confirm bet: " + side.toUpperCase() + " — " + session.currentBet + " units?\n\nDISCLAIMER: BetPilot does not guarantee wins. Game outcomes are random.");
    if (!confirmed) return;

    // Record the bet (not result — result comes separately)
    session.hands.push({ side: side, bet: session.currentBet, result: null, outcome: null, at: new Date().toLocaleString() });
    updateStats();
    document.getElementById("result-panel").classList.remove("hidden");
  };

  window.recordPass = function () {
    const confirmed = confirm("Confirm PASS (no bet this hand)?");
    if (!confirmed) return;
    session.hands.push({ side: "pass", bet: 0, result: null, outcome: null, at: new Date().toLocaleString() });
    updateStats();
  };

  // --- RESULT CONFIRMATION ---
  window.confirmResult = function (result) {
    // Confirm before entering (your requirement — never duplicate)
    if (session.hands.length === 0) {
      alert("No bet recorded. Place a bet first.");
      return;
    }
    // Get last hand that has no result yet
    const lastHand = session.hands[session.hands.length - 1];
    if (lastHand.result !== null) {
      alert("Result already recorded for this hand.");
      return;
    }

    const confirmed = confirm("Confirm result: " + result.toUpperCase() + " for last bet? (BetPilot does not predict outcomes.)");
    if (!confirmed) return;

    lastHand.result = result;
    document.getElementById("bet-summary").textContent = "Result: " + result.toUpperCase() + " — Confirm outcome below";
  };

  window.recordOutcome = function (outcome) {
    // outcome: win / push / lose
    const lastHand = session.hands[session.hands.length - 1];
    if (!lastHand || lastHand.result === null) {
      alert("Confirm result first (Banker/Player/Tie/Pass).");
      return;
    }
    lastHand.outcome = outcome;

    // Update bankroll (simple: banker pays 0.95, player 1:1, tie 8:1 — simplified for demo)
    const bet = lastHand.bet;
    if (outcome === "win") {
      if (lastHand.side === "banker") session.bankroll += Math.round(bet * 0.95);
      else if (lastHand.side === "player") session.bankroll += bet;
      else if (lastHand.side === "tie") session.bankroll += bet * 8;
    } else if (outcome === "push") {
      session.bankroll += bet; // push returns stake
    } else {
      session.bankroll -= bet;
    }

    // Hide result panel, reset for next
    document.getElementById("result-panel").classList.add("hidden");
    updateBalance();
    updateStats();
    updateHistory();
  };

  // --- STATS / HISTORY ---
  function updateStats() {
    const hands = session.hands;
    const wins = hands.filter(h => h.outcome === "win").length;
    const losses = hands.filter(h => h.outcome === "lose").length;
    const pushes = hands.filter(h => h.outcome === "push").length;
    const pl = hands.reduce((sum, h) => {
      if (h.outcome === "win") return sum + (h.side === "banker" ? Math.round(h.bet * 0.95) : (h.side === "tie" ? h.bet * 8 : h.bet));
      if (h.outcome === "push") return sum + h.bet;
      if (h.outcome === "lose") return sum - h.bet;
      return sum;
    }, 0);

    document.getElementById("stat-hands").textContent = hands.length;
    document.getElementById("stat-wins").textContent = wins;
    document.getElementById("stat-losses").textContent = losses;
    document.getElementById("stat-pushes").textContent = pushes;
    document.getElementById("stat-pl").textContent = (pl >= 0 ? "+" : "") + pl;
  }

  function updateBalance() {
    document.getElementById("current-bankroll").textContent = session.bankroll;
  }

  function updateHistory() {
    const list = document.getElementById("history-list");
    if (session.hands.length === 0) {
      list.innerHTML = '<p class="empty-state">No hands recorded yet. Place a bet and confirm a result.</p>';
      return;
    }
    list.innerHTML = session.hands.map((h, i) => {
      const sideLabel = h.side === "banker" ? "B" : (h.side === "player" ? "P" : (h.side === "tie" ? "T" : "PASS"));
      const resultLabel = h.result ? h.result.toUpperCase() : "—";
      const outcomeLabel = h.outcome ? (h.outcome === "win" ? "W" : (h.outcome === "lose" ? "L" : "P")) : "—";
      const outcomeClass = h.outcome === "win" ? "result-win" : (h.outcome === "lose" ? "result-lose" : (h.outcome === "push" ? "result-push" : ""));
      const sideClass = h.side === "banker" ? "side-banker" : (h.side === "player" ? "side-player" : (h.side === "tie" ? "side-tie" : "side-pass"));
      return `<div class="history-item" aria-label="Hand ${i + 1}">
        <div class="bet-info"><span class="side-badge ${sideClass}">${sideLabel}</span><span>${h.bet}u</span></div>
        <div><span>${resultLabel}</span> <span class="${outcomeClass}">${outcomeLabel}</span> <span style="color:#888;font-size:0.7rem">${h.at}</span></div>
      </div>`;
    }).join("");
  }

  window.endSession = function () {
    if (!session.started) return;
    const confirmed = confirm("End session? Export history? (This is a draft — export not fully implemented yet.)\n\nDISCLAIMER: BetPilot does not guarantee results.");
    if (confirmed) {
      // Show summary (future: real export to CSV/JSON)
      const total = session.hands.length;
      const pl = session.bankroll - (parseInt(document.getElementById("starting-bankroll").value) || 1000);
      alert("Session ended. Hands: " + total + ". Net P/L: " + (pl >= 0 ? "+" : "") + pl + " units.\n\nThis is a draft module — full export and reporting will be added.");
      session = { casino: "", bankroll: 1000, tableType: "pragmatic-half", mode: "manual", hands: [], currentBet: 10, started: false, provider: "gemini" };
      document.getElementById("betting-screen").classList.remove("active");
      document.getElementById("session-setup").classList.add("active");
      document.getElementById("current-units").textContent = "10";
      document.getElementById("current-bankroll").textContent = "1000";
      updateHistory();
    }
  };

  window.exportHistory = function () {
    alert("Export feature — draft. Will write CSV/JSON to local file in full release.\n\nRemember: BetPilot does not guarantee winnings. Use this for tracking only.");
  };

  // --- START ---
  init();
})();
