/* BetPilot — Baccarat UI
 *
 * This file is a VIEW. It sends the two inputs (bet side, casino result) and re-renders whatever
 * the server returns. It never decides an outcome, never computes a bankroll, and never stores a
 * session locally — that is how the old build drifted out of sync with its own numbers.
 */
(function () {
  "use strict";

  var Engine = window.BaccaratEngine;

  var state = {
    session: null,
    derived: null,
    profiles: [],
    stake: 1,
    topmost: false,
    busy: false,
    ocr: null,        // last /api/baccarat/ocr/status payload
    ocrProfile: "",
    ocrPoll: null,
    busyOcr: false
  };

  var el = {};
  function $(id) { return document.getElementById(id); }

  function collect() {
    [
      "build-badge", "conn-state", "btn-topmost", "toast-stack",
      "setup-screen", "table-screen", "ended-screen",
      "input-casino", "input-capital", "input-unit", "input-layout", "input-mode", "computed-units", "computed-hint",
      "btn-start", "setup-error", "archive-drawer", "archive-count", "archive-list",
      "hdr-casino", "hdr-layout", "hdr-unit", "hdr-mode",
      "bankroll-units", "bankroll-cash", "net-pl", "net-pl-cash", "staked", "commission",
      "stake-units", "stake-hint", "stake-echo", "btn-minus5", "btn-minus1", "btn-plus1", "btn-plus5",
      "btn-double", "btn-halve", "btn-clear",
      "bet-panel", "btn-banker", "btn-player", "btn-tie", "btn-pass", "tie-payout-label",
      "open-bet", "open-bet-text", "btn-res-banker", "btn-res-player", "btn-res-tie", "btn-cancel-bet",
      "btn-undo", "btn-end", "link-export-csv", "link-export-json",
      "ocr-availability", "ocr-mode", "ocr-profile", "btn-ocr-start", "btn-ocr-stop", "btn-ocr-refresh",
      "ocr-status", "ocr-counters", "ocr-pending", "ocr-pending-line", "ocr-pending-result",
      "btn-ocr-confirm", "btn-ocr-reject", "ocr-events-list", "ocr-event-count", "ocr-note", "mode-hint",
      "bead-plate", "stat-hands", "stat-wins", "stat-losses", "stat-pushes", "stat-voids",
      "stat-winrate", "stat-streak", "stat-longest", "stat-drawdown",
      "hands-count", "hands-body",
      "ended-lede", "ended-stats", "btn-new-session", "ended-export-csv", "ended-export-json",
      "foot-build"
    ].forEach(function (id) { el[id] = $(id); });
  }

  /* ------------------------------------------------------------------ helpers */

  function money(cents) { return Engine.formatCents(cents); }

  function units(cents, unitValueCents) {
    var sign = cents > 0 ? "+" : "";
    var value = unitValueCents ? Math.round((cents / unitValueCents) * 100) / 100 : 0;
    return sign + value + "u";
  }

  function signedClass(cents) {
    if (cents > 0) return "positive";
    if (cents < 0) return "negative";
    return "";
  }

  function toast(message, kind) {
    var node = document.createElement("div");
    node.className = "toast" + (kind ? " " + kind : "");
    node.textContent = message;
    el["toast-stack"].appendChild(node);
    setTimeout(function () {
      node.style.opacity = "0";
      node.style.transition = "opacity .4s";
      setTimeout(function () { node.remove(); }, 450);
    }, kind === "error" ? 6000 : 3200);
  }

  function setConn(status, text) {
    el["conn-state"].dataset.state = status;
    el["conn-state"].textContent = text;
  }

  function api(path, body) {
    var options = { headers: { "Content-Type": "application/json" } };
    if (body) {
      options.method = "POST";
      options.body = JSON.stringify(body);
    }
    return fetch(path, options).then(function (response) {
      return response.json().catch(function () { return { ok: false, error: "Server sent an unreadable reply." }; })
        .then(function (data) { return { status: response.status, data: data }; });
    });
  }

  /* ------------------------------------------------------------------- render */

  function render() {
    var session = state.session;
    var derived = state.derived;

    if (!session) {
      show("setup");
      el["setup-error"].textContent = "";
      renderOcr();
      return;
    }
    if (session.status === "ended") {
      renderEnded(session, derived);
      show("ended");
      renderOcr();
      return;
    }
    show("table");
    renderStrip(session, derived);
    renderStake(session, derived);
    renderOpenBet(session, derived);
    renderBeadPlate(derived);
    renderStats(derived);
    renderHands(session, derived);
    renderOcr();
  }

  function show(which) {
    el["setup-screen"].hidden = which !== "setup";
    el["table-screen"].hidden = which !== "table";
    el["ended-screen"].hidden = which !== "ended";
  }

  function renderStrip(session, derived) {
    el["hdr-casino"].textContent = session.casino || "(unnamed table)";
    el["hdr-layout"].textContent = [session.provider, session.layout].filter(Boolean).join(" · ") || "layout not set";
    el["hdr-unit"].textContent = money(session.unitValueCents) + " / unit";
    el["hdr-mode"].textContent = "Mode: " + session.mode;
    el["bankroll-units"].textContent = units(derived.bankrollCents - (derived.bankrollCents > 0 ? 0 : 0), session.unitValueCents)
      .replace(/^\+/, "");
    el["bankroll-cash"].textContent = money(derived.bankrollCents) + " (started " + money(derived.startingCents) + ")";
    el["net-pl"].textContent = units(derived.netCents, session.unitValueCents);
    el["net-pl"].className = "strip-value " + signedClass(derived.netCents);
    el["net-pl-cash"].textContent = money(derived.netCents) + " net";
    el["staked"].textContent = derived.stakedUnits + "u";
    el["commission"].textContent = money(derived.commissionCents) + " commission";
    el["tie-payout-label"].textContent = "pays " + session.rules.tiePayout + ":1";
    el["link-export-csv"].href = "/api/baccarat/export?format=csv";
    el["link-export-json"].href = "/api/baccarat/export?format=json";
    el["foot-build"].textContent = "BetPilot Baccarat " + (state.build || "");
  }

  function maxStakeUnits(session, derived) {
    return Math.floor(derived.bankrollCents / session.unitValueCents);
  }

  function renderStake(session, derived) {
    var max = maxStakeUnits(session, derived);
    var open = Boolean(session.openBet);
    state.stake = Math.max(1, Math.min(state.stake, Math.max(1, max)));
    el["stake-units"].value = state.stake;
    el["stake-units"].max = Math.max(1, max);
    el["stake-echo"].textContent = state.stake + " unit" + (state.stake === 1 ? "" : "s") + " = " + money(state.stake * session.unitValueCents);

    if (open) {
      el["stake-hint"].textContent = "locked while a bet is open";
    } else if (max < 1) {
      el["stake-hint"].textContent = "bankroll exhausted — no bet possible";
    } else {
      el["stake-hint"].textContent = "max " + max + "u";
    }

    var stakeLocked = open || max < 1 || state.busy;
    ["btn-minus5", "btn-minus1", "btn-plus1", "btn-plus5", "btn-double", "btn-halve", "btn-clear"].forEach(function (id) {
      el[id].disabled = stakeLocked;
    });
    el["stake-units"].disabled = stakeLocked;
    ["btn-banker", "btn-player", "btn-tie", "btn-pass"].forEach(function (id) {
      el[id].disabled = open || max < 1 || state.busy;
    });
  }

  function renderOpenBet(session, derived) {
    if (!session.openBet) {
      el["open-bet"].hidden = true;
      return;
    }
    el["open-bet"].hidden = false;
    var bet = session.openBet;
    var cash = bet.stakeUnits * session.unitValueCents;
    el["open-bet-text"].textContent = bet.side.toUpperCase() + " · " + bet.stakeUnits + "u (" + money(cash) + ") placed " + (bet.placedAt || "");
    ["btn-res-banker", "btn-res-player", "btn-res-tie", "btn-cancel-bet"].forEach(function (id) {
      el[id].disabled = state.busy;
    });
    el["bet-panel"].hidden = false;
  }

  function renderBeadPlate(derived) {
    var plate = el["bead-plate"];
    plate.textContent = "";
    if (!derived.sequence.length) {
      var empty = document.createElement("span");
      empty.className = "bead empty";
      empty.textContent = "—";
      plate.appendChild(empty);
      return;
    }
    derived.sequence.forEach(function (result) {
      var bead = document.createElement("span");
      bead.className = "bead " + result;
      bead.textContent = result.charAt(0).toUpperCase();
      bead.title = result;
      plate.appendChild(bead);
    });
  }

  function renderStats(derived) {
    el["stat-hands"].textContent = derived.totalHands;
    el["stat-wins"].textContent = derived.wins;
    el["stat-losses"].textContent = derived.losses;
    el["stat-pushes"].textContent = derived.pushes;
    el["stat-voids"].textContent = derived.voids;
    el["stat-winrate"].textContent = derived.winRate + "%";
    el["stat-streak"].textContent = derived.streak.result
      ? derived.streak.result + " ×" + derived.streak.length
      : "—";
    el["stat-longest"].textContent = derived.longest.banker + " / " + derived.longest.player + " / " + derived.longest.tie;
    el["stat-drawdown"].textContent = money(derived.maxDrawdownCents);
  }

  function renderHands(session, derived) {
    var body = el["hands-body"];
    body.textContent = "";
    var open = session.openBet;

    // Newest first: the hand you just recorded is the one you want to see.
    var running = derived.startingCents;
    var runningByHand = derived.hands.map(function (hand) {
      running += hand.profitCents;
      return running;
    });

    for (var i = derived.hands.length - 1; i >= 0; i -= 1) {
      var hand = derived.hands[i];
      var row = document.createElement("tr");

      var cells = [String(hand.n), null, hand.stakeUnits + "u", hand.result || "—", hand.outcome.toUpperCase(),
        (hand.profitCents > 0 ? "+" : "") + money(hand.profitCents), money(runningByHand[i])];

      cells.forEach(function (text, index) {
        var cell = document.createElement("td");
        if (index === 1) {
          var tag = document.createElement("span");
          tag.className = "tag " + hand.side;
          tag.textContent = hand.side === "pass" ? "PASS" : hand.side.charAt(0).toUpperCase();
          cell.appendChild(tag);
        } else if (index === 4) {
          var outcome = document.createElement("span");
          outcome.className = "outcome " + hand.outcome;
          outcome.textContent = text;
          cell.appendChild(outcome);
          if (hand.outcomeMismatch) {
            var flag = document.createElement("span");
            flag.className = "mismatch";
            flag.textContent = " (stored value disagreed; recomputed)";
            cell.appendChild(flag);
          }
        } else if (index === 5) {
          var pl = document.createElement("span");
          pl.className = "outcome " + (hand.profitCents > 0 ? "win" : hand.profitCents < 0 ? "lose" : "push");
          pl.textContent = text;
          cell.appendChild(pl);
        } else {
          cell.textContent = text;
          if (index === 0) cell.className = "num";
        }
        row.appendChild(cell);
      });
      body.appendChild(row);
    }

    if (open) {
      var openRow = document.createElement("tr");
      openRow.className = "open-row";
      var label = document.createElement("td");
      label.colSpan = 7;
      label.textContent = "Hand " + (derived.totalHands + 1) + ": " + open.side.toUpperCase() + " " + open.stakeUnits +
        "u open — record the result to settle it";
      openRow.appendChild(label);
      body.appendChild(openRow);
    }

    el["hands-count"].textContent = derived.totalHands + " hand" + (derived.totalHands === 1 ? "" : "s") +
      (open ? " · 1 open" : "");
  }

  function renderEnded(session, derived) {
    el["ended-lede"].textContent = [session.casino, session.provider, session.layout].filter(Boolean).join(" · ") +
      " — " + (session.endedAt || "") + " · started with " + money(derived.startingCents);
    var list = el["ended-stats"];
    list.textContent = "";
    var rows = [
      ["Hands recorded", derived.totalHands],
      ["Bets settled", derived.bets],
      ["Wins / losses / pushes", derived.wins + " / " + derived.losses + " / " + derived.pushes],
      ["No-bet hands", derived.voids],
      ["Win rate", derived.winRate + "%"],
      ["Banker results", derived.bankerResults],
      ["Player results", derived.playerResults],
      ["Tie results", derived.tieResults],
      ["Longest B / P / T streak", derived.longest.banker + " / " + derived.longest.player + " / " + derived.longest.tie],
      ["Units staked", derived.stakedUnits + "u"],
      ["Commission paid", money(derived.commissionCents)],
      ["Net P&L", units(derived.netCents, session.unitValueCents) + " (" + money(derived.netCents) + ")"],
      ["Final bankroll", money(derived.bankrollCents)],
      ["Max drawdown", money(derived.maxDrawdownCents)]
    ];
    rows.forEach(function (pair) {
      var wrap = document.createElement("div");
      var dt = document.createElement("dt");
      dt.textContent = pair[0];
      var dd = document.createElement("dd");
      dd.textContent = pair[1];
      wrap.appendChild(dt);
      wrap.appendChild(dd);
      list.appendChild(wrap);
    });
    el["ended-export-csv"].href = "/api/baccarat/export?format=csv";
    el["ended-export-json"].href = "/api/baccarat/export?format=json";
  }

  function renderArchive(sessions) {
    el["archive-count"].textContent = sessions.length ? "(" + sessions.length + ")" : "";
    var list = el["archive-list"];
    list.textContent = "";
    if (!sessions.length) {
      var empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No archived sessions yet.";
      list.appendChild(empty);
      return;
    }
    sessions.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "archive-row";
      var left = document.createElement("span");
      left.textContent = [item.casino || "(unnamed)", item.endedAt || item.startedAt].filter(Boolean).join(" · ");
      var right = document.createElement("span");
      right.textContent = item.hands + " hands · " + units(item.netCents, 500) + " · " + money(item.netCents);
      row.appendChild(left);
      row.appendChild(right);
      list.appendChild(row);
    });
  }

  /* ------------------------------------------------------------------ actions */

  function applyResponse(result) {
    if (result.data && result.data.session !== undefined && result.data.ok) {
      state.session = result.data.session;
      state.derived = result.data.derived;
      if (result.data.build) updateBuild(result.data.build);
      render();
      return true;
    }
    var message = (result.data && result.data.error) || "The server rejected that action.";
    toast(message, "error");
    return false;
  }

  function updateBuild(build) {
    state.build = build;
    el["build-badge"].textContent = build;
    el["foot-build"].textContent = "BetPilot Baccarat " + build;
  }

  function refresh() {
    return api("/api/baccarat/state").then(function (result) {
      if (!result.data || !result.data.ok) throw new Error("bad state");
      setConn("online", "server online");
      updateBuild(result.data.build);
      state.session = result.data.session;
      state.derived = result.data.derived;
      render();
    }).catch(function () {
      setConn("offline", "server offline");
      toast("Cannot reach the Baccarat server. Start it with the launcher, then reload this page.", "error");
    });
  }

  function act(body) {
    if (state.busy) return Promise.resolve(false);
    state.busy = true;
    render();
    return api("/api/baccarat/hand", body).then(function (result) {
      state.busy = false;
      var ok = applyResponse(result);
      if (!ok) render();
      return ok;
    }).catch(function () {
      state.busy = false;
      render();
      toast("The server did not answer. Nothing was recorded.", "error");
      return false;
    });
  }

  function adjustStake(delta) {
    state.stake = Math.max(1, state.stake + delta);
    render();
  }

  function place(side) {
    return act({ action: "place", side: side, stakeUnits: state.stake });
  }

  function settle(result) {
    return act({ action: "settle", result: result });
  }

  function drawOpenBet() {
    render();
  }

  /* --------------------------------------------------------------- setup flow */

  function computeUnits() {
    var cash = Math.max(0, Math.floor(Number(el["input-capital"].value) || 0));
    var unit = Math.max(1, Math.floor(Number(el["input-unit"].value) || 1));
    var total = Math.floor(cash / unit);
    el["computed-units"].textContent = total;
    el["computed-hint"].textContent = "$" + cash + " ÷ $" + unit + " = " + total + " units";
    el["computed-units"].dataset.units = total;
    el["computed-units"].dataset.unitCents = unit * 100;
  }

  function startSession() {
    computeUnits();
    var totalUnits = Number(el["computed-units"].dataset.units);
    var unitCents = Number(el["computed-units"].dataset.unitCents);
    if (totalUnits < 1) {
      el["setup-error"].textContent = "That capital is smaller than one unit, so no bet would be possible.";
      return;
    }
    el["setup-error"].textContent = "";
    var selected = el["input-layout"].selectedOptions[0];
    var payload = {
      casino: el["input-casino"].value,
      startingUnits: totalUnits,
      unitValueCents: unitCents,
      provider: selected ? selected.dataset.provider : "",
      layout: selected ? selected.dataset.layout : "",
      mode: el["input-mode"].value
    };
    api("/api/baccarat/session", payload).then(function (result) {
      if (result.status === 409 && result.data && result.data.code === "session-exists") {
        var replace = window.confirm("A session is already open.\n\nReplace it? The current session is archived first, so nothing is lost.");
        if (!replace) return;
        payload.force = true;
        return api("/api/baccarat/session", payload).then(function (forced) {
          applyResponse(forced);
          afterSessionStart(payload.mode);
        });
      }
      applyResponse(result);
      afterSessionStart(payload.mode);
      loadArchive();
    }).catch(function () {
      el["setup-error"].textContent = "Could not reach the server.";
    });
  }

  /** A mode chosen at setup must actually do something — the old build's selector did not. */
  function afterSessionStart(mode) {
    if (!mode || mode === "manual") return;
    el["ocr-mode"].value = mode;
    var profile = el["ocr-profile"].value;
    if (!profile) {
      toast("Session started in " + mode + " mode, but there is no calibration profile to read.", "error");
      return;
    }
    startOcr();
  }

  function loadProfiles() {
    return api("/api/baccarat/profiles").then(function (result) {
      var list = (result.data && result.data.profiles) || [];
      state.profiles = list;
      var select = el["input-layout"];
      select.textContent = "";
      if (!list.length) {
        var option = document.createElement("option");
        option.value = "";
        option.textContent = "No calibration profiles found in config/";
        option.dataset.provider = "";
        option.dataset.layout = "";
        select.appendChild(option);
        return;
      }
      list.forEach(function (profile) {
        var option = document.createElement("option");
        option.value = profile.id;
        option.textContent = profile.label + (profile.calibrated ? "" : " (not calibrated yet)");
        option.dataset.provider = profile.provider || "";
        option.dataset.layout = profile.layout || "";
        select.appendChild(option);
      });
      fillOcrProfiles(list);
    }).catch(function () { /* the setup screen still works without profiles */ });
  }

  function fillOcrProfiles(list) {
    var select = el["ocr-profile"];
    select.textContent = "";
    if (!list.length) {
      var option = document.createElement("option");
      option.value = "";
      option.textContent = "No calibration profiles found in config/";
      select.appendChild(option);
      return;
    }
    list.forEach(function (profile) {
      var option = document.createElement("option");
      option.value = profile.id;
      option.textContent = profile.label + (profile.calibrated ? "" : " (not calibrated)");
      select.appendChild(option);
    });
    if (state.ocrProfile) select.value = state.ocrProfile;
  }

  function loadArchive() {
    return api("/api/baccarat/history").then(function (result) {
      renderArchive((result.data && result.data.sessions) || []);
    }).catch(function () { /* optional */ });
  }

  /* -------------------------------------------------------------------- OCR */

  function ocrStatus(force) {
    if (state.busyOcr) return Promise.resolve();
    state.busyOcr = true;
    return api("/api/baccarat/ocr/status").then(function (result) {
      state.busyOcr = false;
      if (result.data && result.data.ok) {
        state.ocr = result.data;
        renderOcr();
      }
    }).catch(function () {
      state.busyOcr = false;
    });
  }

  function renderOcr() {
    var ocr = state.ocr;
    if (!ocr) {
      el["ocr-availability"].textContent = "checking…";
      return;
    }
    var status = ocr.status || {};
    var running = Boolean(status.running);
    var available = Boolean(ocr.available);

    el["ocr-availability"].textContent = available
      ? "provider: " + ocr.provider + " · ready"
      : "not available on this machine";
    el["ocr-availability"].className = "panel-hint " + (available ? "" : "bad");

    el["ocr-status"].textContent = status.message || (available ? "OCR is stopped." : "OCR cannot start yet.");
    var counters = [];
    if (status.scans) counters.push(status.scans + " scans");
    if (status.candidates) counters.push(status.candidates + " readings");
    if (status.duplicates) counters.push(status.duplicates + " duplicates ignored");
    if (status.lastScanAt) counters.push("last " + status.lastScanAt);
    el["ocr-counters"].textContent = counters.join(" · ");

    el["btn-ocr-start"].disabled = !available || running || !state.session || state.session.status !== "active";
    el["btn-ocr-stop"].disabled = !running;
    el["ocr-mode"].disabled = running;
    el["ocr-profile"].disabled = running;

    if (!available && ocr.missing && ocr.missing.length) {
      el["ocr-note"].textContent = "OCR cannot start yet. Missing: " + ocr.missing.join("; ") +
        ". Add the key to .secrets/ocr.env — never into this project.";
    } else if (status.error) {
      el["ocr-note"].textContent = "Last OCR error: " + status.error;
    }

    // The setup screen offers the OCR modes only when OCR can actually run.
    var modeSelect = el["input-mode"];
    Array.prototype.forEach.call(modeSelect.options, function (option) {
      if (option.value === "manual") return;
      option.disabled = !available;
    });
    el["mode-hint"].textContent = available
      ? "OCR is available. Observe records every result without betting; Confirm asks you first; Automatic settles only an open bet."
      : "OCR is not available in this Python environment, so only manual entry is offered.";

    var pending = ocr.pending;
    el["ocr-pending"].hidden = !pending;
    if (pending) {
      el["ocr-pending-line"].textContent = "Read: " + String(pending.result || "?").toUpperCase() +
        " (confidence " + (pending.confidence === undefined ? "?" : pending.confidence) + ") — " +
        (pending.evidence || "no evidence given");
      el["ocr-pending-result"].value = pending.result || "banker";
    }

    var events = ocr.events || [];
    el["ocr-event-count"].textContent = events.length ? "(" + events.length + ")" : "";
    var list = el["ocr-events-list"];
    list.textContent = "";
    events.slice().reverse().forEach(function (event) {
      var row = document.createElement("div");
      row.className = "ocr-event";
      var left = document.createElement("span");
      left.className = "action";
      left.textContent = (event.action || "?") + (event.result ? " → " + event.result : "");
      var right = document.createElement("span");
      right.textContent = (event.at || "").replace("T", " ") + (event.detail ? " · " + event.detail : "");
      row.appendChild(left);
      row.appendChild(right);
      list.appendChild(row);
    });

    // Keep polling only while something is happening.
    if (running && !state.ocrPoll) {
      state.ocrPoll = setInterval(function () { ocrStatus(); refreshQuiet(); }, 2000);
    } else if (!running && state.ocrPoll) {
      clearInterval(state.ocrPoll);
      state.ocrPoll = null;
    }
  }

  function refreshQuiet() {
    return api("/api/baccarat/state").then(function (result) {
      if (result.data && result.data.ok) {
        state.session = result.data.session;
        state.derived = result.data.derived;
        render();
      }
    }).catch(function () { /* the status poll already reports trouble */ });
  }

  function startOcr() {
    var profile = el["ocr-profile"].value;
    if (!profile) {
      toast("Choose a calibration profile first.", "error");
      return;
    }
    api("/api/baccarat/ocr/start", {
      mode: el["ocr-mode"].value,
      profileId: profile
    }).then(function (result) {
      if (result.data && result.data.ok) {
        toast("OCR started in " + el["ocr-mode"].value + " mode.", "good");
        ocrStatus();
      } else {
        toast((result.data && result.data.error) || "OCR could not start.", "error");
        ocrStatus();
      }
    }).catch(function () { toast("The server did not answer.", "error"); });
  }

  function stopOcr() {
    api("/api/baccarat/ocr/stop", {}).then(function () {
      ocrStatus();
      refreshQuiet();
    });
  }

  function confirmOcr(accept, result) {
    var body = { accept: accept };
    if (accept && result) body.result = result;
    api("/api/baccarat/ocr/confirm", body).then(function (response) {
      if (response.data && response.data.ok) {
        toast(accept ? "Recorded " + String(result || "").toUpperCase() + " from the screen." : "Reading rejected.",
          accept ? "good" : "");
      } else {
        toast((response.data && response.data.error) || "Could not record that reading.", "error");
      }
      ocrStatus();
      refreshQuiet();
    }).catch(function () { toast("The server did not answer.", "error"); });
  }

  function toggleTopmost() {
    var enabled = !state.topmost;
    api("/api/window/topmost", { target: "table", enabled: enabled }).then(function (result) {
      var data = result.data || {};
      if (!data.ok) {
        toast(data.error || "Could not change always-on-top.", "error");
        return;
      }
      state.topmost = enabled;
      el["btn-topmost"].setAttribute("aria-pressed", enabled ? "true" : "false");
      el["btn-topmost"].textContent = enabled ? "Always on top ✓" : "Always on top";
      if (data.matchedWindows === 0) {
        toast("No Baccarat window matched yet. Open the module in its own Chrome app window, then try again.");
      }
    }).catch(function () {
      toast("Always-on-top needs the local server.", "error");
    });
  }

  /* ----------------------------------------------------------------- keyboard */

  function typingInField(event) {
    var tag = (event.target.tagName || "").toLowerCase();
    return tag === "input" || tag === "select" || tag === "textarea";
  }

  function onKey(event) {
    if (typingInField(event) || event.ctrlKey || event.metaKey || event.altKey) return;

    // An OCR candidate awaiting approval takes priority: Enter confirms, Backspace rejects.
    if (state.ocr && state.ocr.pending) {
      if (event.key === "Enter") {
        confirmOcr(true, el["ocr-pending-result"].value);
        event.preventDefault();
        return;
      }
      if (event.key === "Backspace") {
        confirmOcr(false);
        event.preventDefault();
        return;
      }
    }

    if (!state.session || state.session.status !== "active") return;
    var key = event.key.toLowerCase();
    if (state.session.openBet) {
      if (key === "b") settle("banker");
      else if (key === "p") settle("player");
      else if (key === "t") settle("tie");
      else if (key === "escape") act({ action: "cancel" });
      else return;
    } else {
      if (key === "b") place("banker");
      else if (key === "p") place("player");
      else if (key === "t") place("tie");
      else if (key === "n") act({ action: "pass", result: null });
      else if (key === "u") act({ action: "undo" });
      else return;
    }
    event.preventDefault();
  }

  /* --------------------------------------------------------------------- init */

  function wire() {
    el["input-capital"].addEventListener("input", computeUnits);
    el["input-unit"].addEventListener("input", computeUnits);
    el["btn-start"].addEventListener("click", startSession);
    el["btn-topmost"].addEventListener("click", toggleTopmost);

    el["btn-minus5"].addEventListener("click", function () { adjustStake(-5); });
    el["btn-minus1"].addEventListener("click", function () { adjustStake(-1); });
    el["btn-plus1"].addEventListener("click", function () { adjustStake(1); });
    el["btn-plus5"].addEventListener("click", function () { adjustStake(5); });
    el["btn-double"].addEventListener("click", function () { state.stake = state.stake * 2; render(); });
    el["btn-halve"].addEventListener("click", function () { state.stake = Math.max(1, Math.floor(state.stake / 2)); render(); });
    el["btn-clear"].addEventListener("click", function () { state.stake = 1; render(); });
    el["stake-units"].addEventListener("change", function () {
      state.stake = Math.max(1, Math.floor(Number(el["stake-units"].value) || 1));
      render();
    });

    el["btn-banker"].addEventListener("click", function () { place("banker"); });
    el["btn-player"].addEventListener("click", function () { place("player"); });
    el["btn-tie"].addEventListener("click", function () { place("tie"); });
    el["btn-pass"].addEventListener("click", function () { act({ action: "pass", result: null }); });

    el["btn-res-banker"].addEventListener("click", function () { settle("banker"); });
    el["btn-res-player"].addEventListener("click", function () { settle("player"); });
    el["btn-res-tie"].addEventListener("click", function () { settle("tie"); });
    el["btn-cancel-bet"].addEventListener("click", function () { act({ action: "cancel" }); });

    el["btn-undo"].addEventListener("click", function () {
      if (window.confirm("Undo the last recorded hand? The numbers are recalculated from the remaining hands.")) {
        act({ action: "undo" });
      }
    });
    el["btn-end"].addEventListener("click", function () {
      if (window.confirm("End this session? It is archived to data/sessions/ and stays exportable.")) {
        api("/api/baccarat/end", {}).then(function (result) {
          applyResponse(result);
          loadArchive();
        });
      }
    });
    el["btn-new-session"].addEventListener("click", function () {
      state.session = null;
      state.derived = null;
      render();
      loadArchive();
    });

    document.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) refresh();
    });

    el["btn-ocr-start"].addEventListener("click", startOcr);
    el["btn-ocr-stop"].addEventListener("click", stopOcr);
    el["btn-ocr-refresh"].addEventListener("click", function () { ocrStatus(); refreshQuiet(); });
    el["btn-ocr-confirm"].addEventListener("click", function () {
      confirmOcr(true, el["ocr-pending-result"].value);
    });
    el["btn-ocr-reject"].addEventListener("click", function () { confirmOcr(false); });
    el["ocr-profile"].addEventListener("change", function () {
      state.ocrProfile = el["ocr-profile"].value;
    });
  }

  function init() {
    collect();
    computeUnits();
    wire();
    loadProfiles();
    loadArchive();
    ocrStatus();
    refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
