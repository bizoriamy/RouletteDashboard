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
    tieStake: 1,
    topmost: false,
    screenScale: 1,
    drawnRegion: null,
    busy: false,
    ocr: null,        // last /api/baccarat/ocr/status payload
    ocrProfile: "",
    ocrProfileManual: false,
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
      "banker-stake", "player-stake", "tie-bet-stake", "tie-stake", "btn-tie-minus", "btn-tie-plus",
      "tie-stake-hint",
      "open-bets", "open-bets-list", "open-bets-total", "open-bet-hint", "btn-res-banker", "btn-res-player",
      "btn-res-tie", "btn-cancel-bets",
      "btn-undo", "btn-end", "link-export-csv", "link-export-json",
      "ocr-panel",
      "ocr-availability", "ocr-mode", "ocr-profile", "ocr-profile-state", "btn-ocr-start", "btn-ocr-stop", "btn-ocr-refresh",
      "btn-ocr-sample", "btn-ocr-locate", "btn-ocr-draw",
      "region-picker", "region-shot", "region-shot-wrap", "region-selection", "region-readout",
      "btn-region-use", "btn-region-cancel",
      "ocr-status", "ocr-counters", "ocr-accuracy", "ocr-preview-box", "ocr-preview", "ocr-preview-note",
      "ocr-pending", "ocr-pending-line", "ocr-pending-result",
      "btn-ocr-confirm", "btn-ocr-reject", "ocr-events-list", "ocr-event-count", "ocr-note", "mode-hint",
      "bead-plate", "bead-count", "stat-hands", "stat-wagers", "stat-wins", "stat-losses", "stat-pushes", "stat-voids",
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
    renderOpenBets(session, derived);
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

  function openWagers(session) {
    if (!session) return [];
    if (Array.isArray(session.openWagers)) return session.openWagers;
    return session.openBet ? [session.openBet] : [];
  }

  function committedUnits(session) {
    return openWagers(session).reduce(function (sum, wager) { return sum + (wager.stakeUnits || 0); }, 0);
  }

  function renderStake(session, derived) {
    var max = maxStakeUnits(session, derived);
    var committed = committedUnits(session);
    var remaining = Math.max(0, max - committed);
    var has = { banker: false, player: false, tie: false, pass: false };
    openWagers(session).forEach(function (wager) { has[wager.side] = true; });
    var anyOpen = openWagers(session).length > 0;
    var passOpen = has.pass;

    // The stake controls stay live while a hand is open, so a Tie side bet can be added with its own
    // stake. The ceiling shrinks to whatever the open wagers have not already committed.
    state.stake = Math.max(1, Math.min(state.stake, Math.max(1, remaining || 1)));
    el["stake-units"].value = state.stake;
    el["stake-units"].max = Math.max(1, remaining || 1);
    el["stake-echo"].textContent = state.stake + " unit" + (state.stake === 1 ? "" : "s") +
      " = " + money(state.stake * session.unitValueCents);

    // The Tie side bet has its OWN stake — insurance money, usually much smaller than the main bet —
    // so it is sized independently and shown on the Tie button.
    state.tieStake = Math.max(1, Math.min(state.tieStake, Math.max(1, remaining || 1)));
    el["tie-stake"].value = state.tieStake;
    el["tie-stake"].max = Math.max(1, remaining || 1);
    el["banker-stake"].textContent = state.stake;
    el["player-stake"].textContent = state.stake;
    el["tie-bet-stake"].textContent = state.tieStake;
    el["tie-stake-hint"].textContent = state.tieStake + "u = " + money(state.tieStake * session.unitValueCents) +
      " insurance" + (has.tie ? " (already placed)" : "");

    if (passOpen) {
      el["stake-hint"].textContent = "PASS on this hand — no money at risk";
    } else if (remaining < 1) {
      el["stake-hint"].textContent = committed
        ? committed + "u committed — bankroll fully committed"
        : "bankroll exhausted — no bet possible";
    } else if (committed) {
      el["stake-hint"].textContent = committed + "u committed · " + remaining + "u left";
    } else {
      el["stake-hint"].textContent = "max " + max + "u";
    }

    var busy = state.busy;
    var stakeLocked = busy || remaining < 1 || passOpen;
    ["btn-minus5", "btn-minus1", "btn-plus1", "btn-plus5", "btn-double", "btn-halve", "btn-clear"].forEach(function (id) {
      el[id].disabled = stakeLocked;
    });
    el["stake-units"].disabled = stakeLocked;

    el["btn-banker"].disabled = busy || passOpen || remaining < 1 || has.banker || has.player;
    el["btn-player"].disabled = busy || passOpen || remaining < 1 || has.player || has.banker;
    el["btn-tie"].disabled = busy || passOpen || remaining < 1 || has.tie;
    el["btn-pass"].disabled = busy || anyOpen || max < 1;

    var tieLocked = busy || passOpen || remaining < 1 || has.tie;
    el["tie-stake"].disabled = tieLocked;
    el["btn-tie-minus"].disabled = tieLocked;
    el["btn-tie-plus"].disabled = tieLocked;

    var slot = document.getElementById("bet-panel");
    if (slot) slot.dataset.open = anyOpen ? "true" : "false";
  }

  function renderOpenBets(session, derived) {
    var wagers = openWagers(session);
    var isPass = wagers.length === 1 && wagers[0].side === "pass";
    el["open-bets"].hidden = wagers.length === 0;
    if (!wagers.length) return;

    var totalUnits = committedUnits(session);
    el["open-bets-total"].textContent = isPass
      ? "no bet — bankroll untouched"
      : totalUnits + "u committed · " + money(totalUnits * session.unitValueCents);
    el["open-bet-hint"].textContent = isPass
      ? "Nothing is at risk on this hand. Record what the table showed and it goes into Hand History; the bankroll will not move and it will never count as a win or a loss."
      : "Record what the table showed. Banker and Player bets push on a Tie; a Tie bet wins on a Tie and loses on anything else.";

    var list = el["open-bets-list"];
    list.textContent = "";
    wagers.forEach(function (wager) {
      var item = document.createElement("li");
      var tag = document.createElement("span");
      tag.className = "tag " + wager.side;
      tag.textContent = wager.side === "pass" ? "PASS" : wager.side.toUpperCase();
      var stake = document.createElement("span");
      stake.className = "wager-stake";
      stake.textContent = wager.side === "pass"
        ? "no money at risk"
        : wager.stakeUnits + "u (" + money(wager.stakeUnits * session.unitValueCents) + ")";
      var note = document.createElement("span");
      note.className = "wager-note";
      note.textContent = wager.placedAt ? String(wager.placedAt).replace("T", " ") : "";
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn btn-ghost wager-remove";
      remove.textContent = "remove";
      remove.setAttribute("aria-label", "Remove the " + wager.side + " bet from this hand");
      remove.disabled = state.busy;
      remove.addEventListener("click", function () { removeWager(wager.side); });
      item.appendChild(tag);
      item.appendChild(stake);
      item.appendChild(note);
      item.appendChild(remove);
      list.appendChild(item);
    });

    ["btn-res-banker", "btn-res-player", "btn-res-tie", "btn-cancel-bets"].forEach(function (id) {
      el[id].disabled = state.busy;
    });
  }

  /* The Hand History grid is a fixed 10 x 10 box: up to 100 hands, filled left to right then top to
     bottom, colour only. Older hands drop off the front; the Bankroll table still lists everything. */
  var BEAD_CAPACITY = 100;

  function renderBeadPlate(derived) {
    var plate = el["bead-plate"];
    plate.textContent = "";
    var sequence = derived.sequence || [];
    var shown = sequence.slice(-BEAD_CAPACITY);
    var dropped = sequence.length - shown.length;

    el["bead-count"].textContent = sequence.length
      ? sequence.length + " hand" + (sequence.length === 1 ? "" : "s") +
        (dropped ? " · showing last " + shown.length : "")
      : "top → bottom, left → right";

    if (!shown.length) {
      // One dashed cell keeps the box visible and its size fixed before the first hand.
      var placeholder = document.createElement("span");
      placeholder.className = "bead empty";
      plate.appendChild(placeholder);
      return;
    }

    shown.forEach(function (result, index) {
      var bead = document.createElement("span");
      bead.className = "bead " + result;
      bead.title = "Hand " + (dropped + index + 1) + ": " + result;
      bead.setAttribute("aria-label", result);
      plate.appendChild(bead);
    });
  }

  function renderStats(derived) {
    el["stat-hands"].textContent = derived.totalHands;
    el["stat-wagers"].textContent = derived.wagers;
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
    var wagers = openWagers(session);
    var open = wagers.length > 0;

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
          var tagRow = document.createElement("span");
          tagRow.className = "tag-row";
          hand.wagers.forEach(function (wager) {
            var tag = document.createElement("span");
            tag.className = "tag " + wager.side;
            tag.textContent = wager.side === "pass" ? "PASS" : wager.side.toUpperCase();
            tagRow.appendChild(tag);
          });
          cell.appendChild(tagRow);
          if (hand.wagers.length > 1) {
            var breakdown = document.createElement("span");
            breakdown.className = "wager-detail";
            breakdown.textContent = hand.wagers.map(function (wager) {
              return wager.side + " " + wager.stakeUnits + "u " + wager.outcome;
            }).join(" · ");
            cell.appendChild(breakdown);
          }
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
      label.textContent = "Hand " + (derived.totalHands + 1) + ": " +
        wagers.map(function (wager) { return wager.side.toUpperCase() + " " + wager.stakeUnits + "u"; }).join(" + ") +
        " open — record the result to settle";
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

  // ---------------------------------------------------------------- drawing the region
  // The picture is scaled to fit the panel, so a rectangle drawn in display pixels is converted back
  // to screen pixels by dividing by the scale the server sent with the picture.
  function hideRegionPicker() {
    el["region-picker"].hidden = true;
    el["region-selection"].hidden = true;
    el["btn-region-use"].disabled = true;
    state.drawnRegion = null;
    state.dragFrom = null;
  }

  function drawSuggested(suggested) {
    var box = screenToRendered(suggested.region);
    state.drawnRegion = suggested.region.slice();
    if (box) {
      el["region-selection"].style.left = box.left + "px";
      el["region-selection"].style.top = box.top + "px";
      el["region-selection"].style.width = box.width + "px";
      el["region-selection"].style.height = box.height + "px";
    }
    el["region-selection"].dataset.suggested = "true";
    el["region-selection"].hidden = false;
    el["btn-region-use"].disabled = false;
    el["region-readout"].textContent = "Found the table from " + suggested.sample + " (match " +
      suggested.score.toFixed(2) + ") — capturing " + suggested.region.join(",") +
      ". Press Use this region, or drag to adjust it.";
    el["ocr-note"].textContent = "The box is already on your table. Press \"Use this region\" if " +
      "it looks right, or drag a better one.";
  }

  function showSuggestion(suggested) {
    if (!suggested || !suggested.region) return;
    // The picture may not be laid out yet, so the box cannot be positioned until it is.
    var image = el["region-shot"];
    if (image.complete && image.naturalWidth) {
      drawSuggested(suggested);
      return;
    }
    state.pendingSuggestion = suggested;
  }

  function openRegionPicker() {
    el["ocr-note"].textContent = "Taking a picture of the screen…";
    api("/api/baccarat/ocr/screen", {})
      .then(function (result) {
        var data = result.data || {};
        if (!data.ok) {
          toast(data.error || "The screen could not be captured.", "error");
          el["ocr-note"].textContent = data.error || "The screen could not be captured.";
          return;
        }
        state.screenScale = data.scale || 1;
        state.screenWidth = data.screenWidth;
        state.screenHeight = data.screenHeight;
        state.drawnRegion = null;
        state.dragFrom = null;
        el["region-shot"].src = data.image;
        el["region-selection"].hidden = true;
        el["region-selection"].dataset.suggested = "false";
        el["btn-region-use"].disabled = true;
        el["region-readout"].textContent = "Nothing drawn yet — drag a box on the picture.";
        el["ocr-note"].textContent = "Drag a box around the part of the table that shows the result.";
        el["region-picker"].hidden = false;

        // If a screenshot the user snipped can be found on screen, start from there: the box is drawn
        // on the table already and they only adjust it. This is what stops a box landing on the chat
        // panel or a blank page.
        // If a screenshot the user snipped can be found on screen, start from there: the box is drawn
        // on the table already and they only adjust it.
        showSuggestion(data.suggested);
      })
      .catch(function (error) {
        toast("The screen could not be captured: " + error.message, "error");
      });
  }

  // The picture is a scaled-down copy of the screen, and CSS may scale it again to fit the panel. So
  // a point on the RENDERED image maps to the screen by proportion alone: the ratio of the screen to
  // the rendered size. Dividing by the server's scale instead was wrong whenever CSS shrank the
  // picture — which it always does — and it mapped boxes onto the wrong part of the screen.
  function renderedToScreen(point) {
    var rect = el["region-shot"].getBoundingClientRect();
    if (!rect.width || !rect.height || !state.screenWidth || !state.screenHeight) return point;
    return {
      x: (point.x / rect.width) * state.screenWidth,
      y: (point.y / rect.height) * state.screenHeight
    };
  }

  function screenToRendered(region) {
    var rect = el["region-shot"].getBoundingClientRect();
    if (!rect.width || !rect.height || !state.screenWidth || !state.screenHeight) return null;
    return {
      left: (region[0] / state.screenWidth) * rect.width,
      top: (region[1] / state.screenHeight) * rect.height,
      width: (region[2] / state.screenWidth) * rect.width,
      height: (region[3] / state.screenHeight) * rect.height
    };
  }

  function imagePoint(event) {
    // Straight into screen coordinates: the caller never has to convert again.
    var rect = el["region-shot"].getBoundingClientRect();
    var point = {
      x: Math.min(Math.max(event.clientX - rect.left, 0), rect.width),
      y: Math.min(Math.max(event.clientY - rect.top, 0), rect.height)
    };
    var screen = renderedToScreen(point);
    return {
      x: Math.min(Math.max(screen.x, 0), state.screenWidth || screen.x),
      y: Math.min(Math.max(screen.y, 0), state.screenHeight || screen.y)
    };
  }

  function updateSelection(from, to) {
    // from/to are already screen coordinates; the box drawn on the picture is the inverse mapping.
    var region = [Math.round(Math.min(from.x, to.x)), Math.round(Math.min(from.y, to.y)),
      Math.round(Math.abs(to.x - from.x)), Math.round(Math.abs(to.y - from.y))];
    var box = screenToRendered(region);
    if (box) {
      el["region-selection"].style.left = box.left + "px";
      el["region-selection"].style.top = box.top + "px";
      el["region-selection"].style.width = box.width + "px";
      el["region-selection"].style.height = box.height + "px";
    }
    // Dragging replaces the suggested box, so it stops being marked as a suggestion.
    el["region-selection"].dataset.suggested = "false";
    el["region-selection"].hidden = false;

    if (region[2] < 20 || region[3] < 12) {
      state.drawnRegion = null;
      el["btn-region-use"].disabled = true;
      el["region-readout"].textContent = "That box is too small — drag a wider one.";
      return;
    }
    state.drawnRegion = region;
    el["btn-region-use"].disabled = false;
    el["region-readout"].textContent = "Will capture " + region[2] + "×" + region[3] +
      " pixels at " + region[0] + "," + region[1];
  }

  function useRegion() {
    var region = state.drawnRegion;
    if (!region) return;
    el["btn-region-use"].disabled = true;
    api("/api/baccarat/ocr/region", { profileId: el["ocr-profile"].value || null, region: region })
      .then(function (result) {
        var data = result.data || {};
        if (!data.ok) {
          toast(data.error || "That region was refused.", "error");
          el["ocr-note"].textContent = data.error || "That region was refused.";
          return;
        }
        var reading = data.reading || {};
        var verdict;
        if (reading.error) {
          verdict = " The test read could not run: " + reading.error;
        } else if (reading.result) {
          verdict = " It reads: " + String(reading.result).toUpperCase() + " at " +
            Number(reading.confidence).toFixed(2) + " confidence.";
        } else {
          verdict = " It saw no clear result — try a box that includes the hand totals.";
        }
        toast("Region saved: " + data.region.join(",") + (data.saved ? "" : " (no profile selected, so not saved)"),
          data.saved ? "good" : "error");
        el["ocr-note"].textContent = "Region " + data.region.join(",") +
          (data.saved ? " saved into " + data.profileId : " — no profile was selected, so nothing was saved") +
          "." + verdict + (data.cropPath ? " A picture of it was saved to " + data.cropPath + "." : "");
        hideRegionPicker();
        loadProfiles();
      })
      .catch(function (error) {
        toast("That region could not be saved: " + error.message, "error");
      })
      .then(function () { el["btn-region-use"].disabled = false; });
  }

  function wireRegionPicker() {
    el["btn-ocr-draw"].addEventListener("click", openRegionPicker);
    el["btn-region-cancel"].addEventListener("click", hideRegionPicker);
    el["btn-region-use"].addEventListener("click", useRegion);

    el["region-shot"].addEventListener("load", function () {
      if (state.pendingSuggestion) {
        drawSuggested(state.pendingSuggestion);
        state.pendingSuggestion = null;
      }
    });
    el["region-shot"].addEventListener("mousedown", function (event) {
      event.preventDefault();
      state.dragFrom = imagePoint(event);
      updateSelection(state.dragFrom, state.dragFrom);
    });
    el["region-shot"].addEventListener("mousemove", function (event) {
      if (!state.dragFrom) return;
      updateSelection(state.dragFrom, imagePoint(event));
    });
    // Listen on the window so a drag that leaves the picture still finishes cleanly.
    window.addEventListener("mouseup", function (event) {
      if (!state.dragFrom) return;
      updateSelection(state.dragFrom, imagePoint(event));
      state.dragFrom = null;
    });
  }

  function place(side) {
    // The Tie button uses the insurance stake, the other two use the main stake.
    var stake = side === "tie" ? state.tieStake : state.stake;
    return act({ action: "place", side: side, stakeUnits: stake });
  }

  /**
   * PASS opens the hand with nothing at risk so the table's result can still be recorded when it
   * lands. Nothing is logged until a result is chosen; "remove" or "Cancel all" logs nothing.
   */
  function passHand() {
    return act({ action: "place", side: "pass", stakeUnits: 0 });
  }

  function settle(result) {
    return act({ action: "settle", result: result });
  }

  function removeWager(side) {
    return act({ action: "remove", side: side });
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
    // Whatever was chosen before, the OCR profile now follows THIS session's provider and layout — the
    // setup screen and the reader must agree, or the reader watches another table's region.
    state.ocrProfileManual = false;
    syncOcrProfileToSession(true);
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

  function profileFor(provider, layout) {
    // The setup screen and the OCR panel both describe a provider + layout; they must agree, or the
    // reader ends up pointed at a different table's region than the one being played.
    var wanted = function (value) { return String(value || "").trim().toLowerCase(); };
    return (state.profiles || []).filter(function (profile) {
      return wanted(profile.provider) === wanted(provider) && wanted(profile.layout) === wanted(layout);
    })[0] || null;
  }

  function setupChoice() {
    var selected = el["input-layout"].selectedOptions[0];
    return {
      provider: selected ? (selected.dataset.provider || "") : "",
      layout: selected ? (selected.dataset.layout || "") : ""
    };
  }

  function syncOcrProfileToSession(force) {
    // A manual choice sticks for the session; anything else follows the setup screen, so "Pragmatic
    // Half Width" chosen at setup is the profile the reader uses.
    if (state.ocrProfileManual && !force) return false;
    var choice = setupChoice();
    var match = profileFor(choice.provider, choice.layout);
    if (!match) return false;
    if (el["ocr-profile"].value !== match.id) {
      el["ocr-profile"].value = match.id;
    }
    state.ocrProfile = match.id;
    renderProfileState();
    return true;
  }

  /**
   * Show what the reader is looking at. This is the answer to "why is there no result?": if the
   * picture is not the table — or is full of chat, or has no totals in it — it is visible here
   * instead of being a mystery.
   */
  function refreshPreview() {
    if (!el["ocr-panel"].open) return Promise.resolve();
    var profile = el["ocr-profile"].value || "";
    var since = state.previewSignature || "";
    return api("/api/baccarat/ocr/preview?profileId=" + encodeURIComponent(profile) +
               "&since=" + encodeURIComponent(since))
      .then(function (result) {
        var data = result.data || {};
        if (!data.ok) {
          el["ocr-preview-box"].hidden = true;
          return;
        }
        el["ocr-preview-box"].hidden = false;
        if (data.unchanged) {
          el["ocr-preview-note"].textContent = "Unchanged since " + (data.at || "").replace("T", " ") +
            " — " + (data.source || "") + ".";
          return;
        }
        el["ocr-preview"].src = data.image;
        state.previewSignature = data.signature;
        el["ocr-preview-note"].textContent = "What the reader sees — " + (data.source || "") +
          ", " + (data.at || "").replace("T", " ") + ". If this is not your table's totals and panels, "
          + "that is why there is no result.";
      })
      .catch(function () { el["ocr-preview-box"].hidden = true; });
  }

  function renderProfileState() {
    var list = state.profiles || [];
    var chosen = list.filter(function (profile) {
      return profile.id === el["ocr-profile"].value;
    })[0];
    if (!chosen) {
      el["ocr-profile-state"].textContent = "";
      return;
    }
    var region = (chosen.region || []).join(",");
    var session = state.session;
    var sessionChoice = session && session.status === "active"
      ? { provider: session.provider, layout: session.layout } : null;
    var sessionMatch = sessionChoice ? profileFor(sessionChoice.provider, sessionChoice.layout) : null;
    var follows = !!(sessionMatch && sessionMatch.id === chosen.id);
    var sessionLabel = sessionChoice
      ? String(sessionChoice.provider || "?") + " — " + String(sessionChoice.layout || "?") : "";
    var wholeScreen = chosen.region && state.screenWidth
      ? (chosen.region[2] * chosen.region[3]) >= 0.95 * state.screenWidth * state.screenHeight
      : false;
    if (sessionChoice && !sessionMatch) {
      el["ocr-profile-state"].textContent = "Your session is " + sessionLabel + ", but no calibration " +
        "profile matches it. Pick the profile you measured for this table, or calibrate it with " +
        "\"Draw the region\".";
      el["ocr-profile-state"].dataset.state = "not-ready";
    } else if (wholeScreen) {
      el["ocr-profile-state"].textContent = "NOT usable as it stands — this profile is pointed at your " +
        "whole screen (" + region + "), which always makes the reader too busy to answer. Press " +
        "\"Draw the region\", or choose the profile you calibrated for this table.";
      el["ocr-profile-state"].dataset.state = "not-ready";
    } else if (chosen.calibrated) {
      var how = chosen.calibratedFrom ? " from " + chosen.calibratedFrom : "";
      var score = (chosen.matchScore !== null && chosen.matchScore !== undefined)
        ? " (" + Number(chosen.matchScore).toFixed(2) + " match)" : "";
      el["ocr-profile-state"].textContent = "Calibrated" + how + score + " — capturing " + region +
        (follows ? ". Follows your session (" + sessionLabel + ")." : ".") +
        " If you move or resize the casino window, calibrate again.";
      el["ocr-profile-state"].dataset.state = "ready";
    } else {
      el["ocr-profile-state"].textContent = "NOT calibrated yet — it is still pointed at a guess (" +
        region + "). Press \"Draw the region\" or \"Find my table\" before expecting it to read.";
      el["ocr-profile-state"].dataset.state = "not-ready";
    }
  }

  function fillOcrProfiles(list) {
    state.profiles = list || [];
    var select = el["ocr-profile"];
    select.textContent = "";
    if (!list.length) {
      var option = document.createElement("option");
      option.value = "";
      option.textContent = "No calibration profiles found in config/";
      select.appendChild(option);
      el["ocr-profile-state"].textContent = "";
      return;
    }
    list.forEach(function (profile) {
      var option = document.createElement("option");
      option.value = profile.id;
      option.textContent = profile.label + (profile.calibrated ? "" : " (not calibrated)");
      select.appendChild(option);
    });
      if (state.ocrProfile) select.value = state.ocrProfile;
      // The setup screen may have been chosen before the profiles were loaded; align them now.
      syncOcrProfileToSession(false);
      renderProfileState();
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
        // Keep the picture of what the reader sees current, alongside the counters.
        refreshPreview();
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
    // How long a hand takes to come back: the number that says whether the reader is keeping up with
    // the table. A reading that arrives after the next hand has started is not useful.
    if (status.lastReadMs) {
      var last = (status.lastReadMs / 1000).toFixed(1) + "s";
      var average = status.avgReadMs ? " (avg " + (status.avgReadMs / 1000).toFixed(1) + "s)" : "";
      counters.push("last reading took " + last + average + (status.lastSingleRead ? ", one model call" : ""));
    }
    if (status.lastSource) {
      counters.push(status.lastSource === "grid"
        ? "reading the history grid (no model call)"
        : "reading the panels with the model");
    }
    if (status.lastScanAt) counters.push("last " + status.lastScanAt);
    el["ocr-counters"].textContent = counters.join(" · ");

    // How the reader has actually performed: the evidence for trusting Automatic mode.
    var stats = ocr.stats;
    if (stats && stats.readings) {
      var parts = [stats.readings + " reading" + (stats.readings === 1 ? "" : "s"),
        "accepted " + stats.accepted];
      if (stats.corrected) parts.push("corrected " + stats.corrected);
      if (stats.rejected) parts.push("rejected " + stats.rejected);
      if (stats.errors) parts.push("errors " + stats.errors);
      if (stats.autoSettled) parts.push("auto-settled " + stats.autoSettled);
      if (stats.accuracyPercent !== null && stats.accuracyPercent !== undefined) {
        parts.push(stats.accuracyPercent + "% needed no correction");
      }
      el["ocr-accuracy"].textContent = parts.join(" · ") + " — " + (stats.verdict || "");
      el["ocr-accuracy"].dataset.grade =
        (stats.accuracyPercent !== null && stats.accuracyPercent !== undefined && stats.accuracyPercent < 95)
          ? "poor" : "ok";
    } else {
      el["ocr-accuracy"].textContent = stats ? (stats.verdict || "") : "";
      el["ocr-accuracy"].dataset.grade = "";
    }

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
      // A reading waiting on approval must not be hidden behind a collapsed panel.
      el["ocr-panel"].open = true;
      el["ocr-pending-line"].textContent = "Read: " + String(pending.result || "?").toUpperCase() +
        " (confidence " + (pending.confidence === undefined ? "?" : pending.confidence) + ")" +
        // The note is the reader's own account, and it can misquote details even when the result is
        // right (measured: a real Tie described as "5 equals 5" while the boxes read 7 and 7). The
        // result is what gets recorded; the note is a hint to check against the table.
        (pending.evidence ? " — reader's note (may be imprecise): " + pending.evidence : "");
      el["ocr-pending-result"].value = pending.result || "banker";
    }

    var events = ocr.events || [];
    el["ocr-event-count"].textContent = events.length ? "(" + events.length + ")" : "";

    // The region a running reader watches is captured when Start is pressed. If the chosen profile has
    // been changed (or re-calibrated) since, say so: otherwise the reader silently watches the old
    // area and the user sees no results with no explanation.
    var status = ocr.status || {};
    var chosen = (state.profiles || []).filter(function (profile) {
      return profile.id === el["ocr-profile"].value;
    })[0];
    if (status.running && chosen && chosen.region && status.region &&
        chosen.region.join(",") !== status.region.join(",")) {
      el["ocr-note"].textContent = "Heads up: the reader is watching " + status.region.join(",") +
        " from when you pressed Start, but this profile now says " + chosen.region.join(",") +
        ". Press Stop, then Start reading, to make it use the new region.";
    }
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

    // The region picker is modal: Escape closes it and no other shortcut should fire while it is up.
    if (!el["region-picker"].hidden) {
      if (event.key === "Escape") {
        hideRegionPicker();
        event.preventDefault();
      }
      return;
    }

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
    if (openWagers(state.session).length) {
      if (key === "b") settle("banker");
      else if (key === "p") settle("player");
      else if (key === "t") settle("tie");
      else if (key === "escape") act({ action: "cancel" });
      else return;
    } else {
      if (key === "b") place("banker");
      else if (key === "p") place("player");
      else if (key === "t") place("tie");
      else if (key === "n") passHand();
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
    el["tie-stake"].addEventListener("change", function () {
      state.tieStake = Math.max(1, Math.floor(Number(el["tie-stake"].value) || 1));
      render();
    });
    el["btn-tie-minus"].addEventListener("click", function () {
      state.tieStake = Math.max(1, state.tieStake - 1);
      render();
    });
    el["btn-tie-plus"].addEventListener("click", function () {
      state.tieStake = state.tieStake + 1;
      render();
    });

    el["btn-banker"].addEventListener("click", function () { place("banker"); });
    el["btn-player"].addEventListener("click", function () { place("player"); });
    el["btn-tie"].addEventListener("click", function () { place("tie"); });
    el["btn-pass"].addEventListener("click", function () { passHand(); });

    el["btn-res-banker"].addEventListener("click", function () { settle("banker"); });
    el["btn-res-player"].addEventListener("click", function () { settle("player"); });
    el["btn-res-tie"].addEventListener("click", function () { settle("tie"); });
    el["btn-cancel-bets"].addEventListener("click", function () { act({ action: "cancel" }); });

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
    wireRegionPicker();
    el["btn-ocr-locate"].addEventListener("click", function () {
      // Calibration without dragging a box: match a saved sample against the live screen and write
      // the region into the profile. A poor match is refused rather than guessed.
      el["btn-ocr-locate"].disabled = true;
      el["ocr-note"].textContent = "Looking for the table on screen…";
      api("/api/baccarat/ocr/locate", { profileId: el["ocr-profile"].value || null })
        .then(function (result) {
          var data = result.data || {};
          if (data.found) {
            var reading = data.reading || {};
            var verdict;
            if (reading.error) {
              verdict = " The test read could not run: " + reading.error;
            } else if (reading.result) {
              verdict = " It reads: " + String(reading.result).toUpperCase() +
                " at " + Number(reading.confidence).toFixed(2) + " confidence.";
            } else {
              verdict = " It saw no clear result — check the saved crop before trusting this region.";
            }
            if (data.circular) {
              toast("That sample came from the region already in use — nothing was saved.", "error");
              el["ocr-note"].textContent = data.note ||
                "That sample was captured from the region already in use, so matching it only confirms it.";
              return;
            }
            toast("Table found at " + data.region.join(",") + " (match " + data.score.toFixed(2) + ")" +
              (reading.result ? " — reads " + String(reading.result).toUpperCase() : ""), "good");
            el["ocr-note"].textContent = "Found the table using " + data.sample + " — region " +
              data.region.join(",") + ", match " + data.score.toFixed(2) +
              (data.profileId ? ", written into " + data.profileId : ", but no profile was selected so nothing was saved") +
              "." + verdict +
              (data.cropPath ? " The matched area was saved to " + data.cropPath + "." : "");
            loadProfiles();
          } else {
            toast(data.reason || "The table was not found on screen.", "error");
            el["ocr-note"].textContent = data.reason ||
              "The table was not found. Open the Baccarat table so the result is visible and try again.";
          }
        })
        .catch(function (error) {
          toast("Could not look for the table: " + error.message, "error");
        })
        .then(function () { el["btn-ocr-locate"].disabled = false; });
    });
    el["btn-ocr-sample"].addEventListener("click", function () {
      // Captures what the reader would see and saves it, WITHOUT calling the model. Costs nothing,
      // records nothing, and is the picture to look at before trusting a calibration region.
      el["btn-ocr-sample"].disabled = true;
      api("/api/baccarat/ocr/sample", { profileId: el["ocr-profile"].value || null })
        .then(function (result) {
          var data = result.data || {};
          if (data.ok) {
            toast("Sample saved: " + data.path + "  (" + data.width + "x" + data.height + ")", "good");
            el["ocr-note"].textContent = "Saved " + data.path +
              (data.calibrated ? " — from a calibrated profile." : " — this profile is NOT calibrated yet.") +
              " Open it and check the region shows the hand result clearly.";
          } else {
            toast(data.error || "The sample could not be saved.", "error");
            el["ocr-note"].textContent = data.error || "The sample could not be saved.";
          }
        })
        .catch(function (error) {
          toast("The sample could not be saved: " + error.message, "error");
        })
        .then(function () { el["btn-ocr-sample"].disabled = false; });
    });
    el["btn-ocr-confirm"].addEventListener("click", function () {
      confirmOcr(true, el["ocr-pending-result"].value);
    });
    el["btn-ocr-reject"].addEventListener("click", function () { confirmOcr(false); });
    el["ocr-profile"].addEventListener("change", function () {
      state.ocrProfile = el["ocr-profile"].value;
      // A deliberate choice sticks until a new session starts, so it is not silently reverted.
      state.ocrProfileManual = true;
      renderProfileState();
    });
    el["input-layout"].addEventListener("change", function () {
      // Show the reader following the setup screen before the session is even started.
      if (!state.session || state.session.status !== "active") syncOcrProfileToSession(true);
    });
    el["ocr-panel"].addEventListener("toggle", function () {
      // Opening the panel should immediately show what the reader is looking at.
      if (el["ocr-panel"].open) refreshPreview();
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
