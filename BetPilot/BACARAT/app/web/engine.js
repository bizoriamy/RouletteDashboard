/* BetPilot — Baccarat engine
 * Pure logic: no DOM, no network, no timers. Runs in the browser and in Node.
 *
 * Design rule (this is the whole point of the rebuild):
 *   The user records two INPUTS — the wager(s) and the casino result.
 *   The outcome (win/lose/push), the commission and every P&L figure are DERIVED.
 *   Nothing derived is ever typed by the user, and no derived value is trusted on load.
 *
 * A hand may carry more than one wager, because real tables allow a Tie side bet alongside
 * Banker or Player. The rules:
 *   one wager per side; Banker and Player are mutually exclusive; Tie is optional.
 *
 * Money is kept in integer cents. Stakes are whole units, minimum 1. Derived figures can be
 * fractional units (a 1-unit Banker win is +0.95u) and are displayed to two decimals.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BaccaratEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SIDES = ["banker", "player", "tie", "pass"];
  var BET_SIDES = ["banker", "player", "tie"];
  var RESULTS = ["banker", "player", "tie"];

  var DEFAULT_RULES = {
    commissionRate: 0.05, // Banker commission (0.05 => pays 0.95:1)
    playerPayout: 1,      // Player pays 1:1
    tiePayout: 8          // Tie pays 8:1 (some tables 9:1) — configurable
  };

  var LIMITS = {
    maxUnits: 100000,          // hard ceiling per wager
    maxUnitValueCents: 100000, // $1000 per unit
    maxHands: 10000
  };

  var SCHEMA_VERSION = 3;

  function EngineError(message, code) {
    var error = new Error(message);
    error.name = "EngineError";
    error.code = code || "invalid";
    return error;
  }

  function isInt(value) {
    return typeof value === "number" && isFinite(value) && Math.floor(value) === value;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function round2(value) {
    return Math.round(value * 100) / 100;
  }

  function normalizeResult(result) {
    if (result === null || result === undefined || result === "") return null;
    var value = String(result).toLowerCase();
    if (RESULTS.indexOf(value) === -1) {
      throw EngineError('Result must be banker, player, tie or null (got "' + result + '")', "bad-result");
    }
    return value;
  }

  function normalizeSide(side) {
    var value = String(side || "").toLowerCase();
    if (SIDES.indexOf(value) === -1) {
      throw EngineError('Bet side must be banker, player, tie or pass (got "' + side + '")', "bad-side");
    }
    return value;
  }

  function normalizeRules(rules) {
    var merged = {
      commissionRate: DEFAULT_RULES.commissionRate,
      playerPayout: DEFAULT_RULES.playerPayout,
      tiePayout: DEFAULT_RULES.tiePayout
    };
    if (rules) {
      Object.keys(merged).forEach(function (key) {
        if (rules[key] === undefined || rules[key] === null) return;
        var number = Number(rules[key]);
        if (!isFinite(number) || number < 0) {
          throw EngineError("Rule " + key + " must be a non-negative number", "bad-rules");
        }
        merged[key] = number;
      });
    }
    if (merged.commissionRate >= 1) {
      throw EngineError("Commission rate must be below 1", "bad-rules");
    }
    return merged;
  }

  /* ---------------------------------------------------------------- settlement */

  /**
   * The single place where one wager and the casino result become money.
   * Baccarat rules: Banker/Player wagers PUSH on a Tie; a Tie wager wins only on a Tie.
   */
  function settle(side, result, stakeUnits, unitValueCents, rules) {
    var normalizedSide = normalizeSide(side);
    var normalizedResult = normalizeResult(result);
    var normalizedRules = normalizeRules(rules);
    // Tolerant on purpose: derive() re-runs this over stored history, and a negative or
    // non-integer stake in a tampered file must clamp to zero rather than flip a loss into
    // a profit.
    var stake = isInt(stakeUnits) && stakeUnits > 0 ? stakeUnits : 0;
    var unitCents = isInt(unitValueCents) && unitValueCents > 0 ? unitValueCents : 0;
    var stakeCents = normalizedSide === "pass" ? 0 : stake * unitCents;

    if (normalizedSide === "pass") {
      return {
        side: normalizedSide,
        result: normalizedResult,
        outcome: "void",
        stakeUnits: 0,
        stakeCents: 0,
        profitCents: 0,
        commissionCents: 0,
        note: "No bet on this hand"
      };
    }

    if (normalizedResult === null) {
      throw EngineError("A result is required to settle a " + normalizedSide + " bet", "missing-result");
    }

    var outcome;
    if (normalizedResult === "tie") {
      outcome = normalizedSide === "tie" ? "win" : "push";
    } else {
      outcome = normalizedSide === normalizedResult ? "win" : "lose";
    }

    var profitCents = 0;
    var commissionCents = 0;

    if (outcome === "win") {
      if (normalizedSide === "banker") {
        // Commission is shaved off the PROFIT only: 0.95:1 => profit = stake * (1 - rate).
        commissionCents = Math.round(stakeCents * normalizedRules.commissionRate);
        profitCents = stakeCents - commissionCents;
      } else if (normalizedSide === "player") {
        profitCents = Math.round(stakeCents * normalizedRules.playerPayout);
      } else {
        profitCents = Math.round(stakeCents * normalizedRules.tiePayout);
      }
    } else if (outcome === "lose") {
      profitCents = -stakeCents;
    } else {
      profitCents = 0; // push: the stake comes back, the hand is neutral
    }

    return {
      side: normalizedSide,
      result: normalizedResult,
      outcome: outcome,
      stakeUnits: stake,
      stakeCents: stakeCents,
      profitCents: profitCents,
      commissionCents: commissionCents,
      note: outcome === "push" ? "Push — stake returned" : ""
    };
  }

  /* ------------------------------------------------------------------- session */

  function createSession(options) {
    var input = options || {};
    var startingUnits = input.startingUnits === undefined ? 0 : input.startingUnits;
    var unitValueCents = input.unitValueCents === undefined ? 500 : input.unitValueCents;

    if (!isInt(startingUnits) || startingUnits < 0) {
      throw EngineError("Starting units must be a whole number of 0 or more", "bad-start");
    }
    if (!isInt(unitValueCents) || unitValueCents <= 0 || unitValueCents > LIMITS.maxUnitValueCents) {
      throw EngineError("Unit value must be a whole number of cents between 1 and " + LIMITS.maxUnitValueCents, "bad-unit-value");
    }

    return {
      schema: SCHEMA_VERSION,
      id: String(input.id || ""),
      casino: String(input.casino || "").slice(0, 80),
      provider: String(input.provider || "").slice(0, 40),
      layout: String(input.layout || "").slice(0, 60),
      mode: ["manual", "observe", "confirm", "auto"].indexOf(input.mode) === -1 ? "manual" : input.mode,
      status: "active",
      startedAt: input.startedAt || new Date().toISOString(),
      endedAt: null,
      rules: normalizeRules(input.rules),
      startingUnits: startingUnits,
      unitValueCents: unitValueCents,
      seq: 1,
      hands: [],
      openWagers: []
    };
  }

  function assertSession(session) {
    if (!session || typeof session !== "object" || !Array.isArray(session.hands)) {
      throw EngineError("Not a Baccarat session", "bad-session");
    }
    return session;
  }

  function assertActive(session) {
    assertSession(session);
    if (session.status !== "active") {
      throw EngineError("This session has ended", "session-ended");
    }
    return session;
  }

  /** The wagers waiting on a result. Accepts the v2 single `openBet` shape as well. */
  function openWagersOf(session) {
    if (!session) return [];
    if (Array.isArray(session.openWagers)) return session.openWagers;
    if (session.openBet) return [session.openBet];
    return [];
  }

  /**
   * A stored hand as a list of wagers. Handles the v2 single-wager shape
   * ({side, stakeUnits}) so older session files and the settlement vectors stay valid.
   */
  function handWagersOf(hand) {
    if (hand && Array.isArray(hand.wagers) && hand.wagers.length) {
      return hand.wagers.map(function (wager) {
        return { side: wager.side, stakeUnits: wager.stakeUnits };
      });
    }
    return [{ side: hand.side, stakeUnits: hand.stakeUnits }];
  }

  function openStakeCents(session) {
    return openWagersOf(session).reduce(function (total, wager) {
      var units = isInt(wager.stakeUnits) && wager.stakeUnits > 0 ? wager.stakeUnits : 0;
      return total + units * session.unitValueCents;
    }, 0);
  }

  /* ------------------------------------------------------------------- deriving */

  function derive(session) {
    assertSession(session);
    var rules = normalizeRules(session.rules);
    var unitValueCents = isInt(session.unitValueCents) ? session.unitValueCents : 0;
    var startingUnits = isInt(session.startingUnits) ? session.startingUnits : 0;

    var totals = {
      hands: 0, wagers: 0, wins: 0, losses: 0, pushes: 0, voids: 0,
      stakedUnits: 0, netCents: 0, commissionCents: 0,
      bankerResults: 0, playerResults: 0, tieResults: 0
    };
    var sequence = [];
    var equity = [];
    var runningCents = 0;
    var peakCents = 0;
    var maxDrawdownCents = 0;

    // Outcomes are recomputed from the recorded inputs on every derive() call, so a hand-edited or
    // legacy state file cannot inject a fake win.
    var hands = session.hands.map(function (hand, index) {
      var wagers = handWagersOf(hand).map(function (wager) {
        var settled = settle(wager.side, hand.result, wager.stakeUnits, unitValueCents, rules);
        return {
          side: settled.side,
          stakeUnits: settled.stakeUnits,
          stakeCents: settled.stakeCents,
          outcome: settled.outcome,
          profitCents: settled.profitCents,
          commissionCents: settled.commissionCents
        };
      });

      var stakeUnits = wagers.reduce(function (sum, wager) { return sum + wager.stakeUnits; }, 0);
      var stakeCents = wagers.reduce(function (sum, wager) { return sum + wager.stakeCents; }, 0);
      var commissionCents = wagers.reduce(function (sum, wager) { return sum + wager.commissionCents; }, 0);
      var profitCents = wagers.reduce(function (sum, wager) { return sum + wager.profitCents; }, 0);
      var isPass = wagers.length === 1 && wagers[0].side === "pass";

      // The hand's outcome is the NET of its wagers: a Banker win hedged with a losing Tie bet is
      // still a winning hand, but a smaller one.
      var outcome = isPass ? "void" : (profitCents > 0 ? "win" : (profitCents < 0 ? "lose" : "push"));

      var enriched = {
        n: index + 1,
        at: hand.at || null,
        source: hand.source === "ocr" ? "ocr" : "manual",
        wagers: wagers,
        result: normalizeResult(hand.result),
        outcome: outcome,
        isPass: isPass,
        stakeUnits: stakeUnits,
        stakeCents: stakeCents,
        profitCents: profitCents,
        commissionCents: commissionCents,
        // convenience for single-wager displays and CSV
        side: isPass ? "pass" : (wagers.length === 1 ? wagers[0].side : wagers.map(function (w) { return w.side; }).join("+")),
        // audit only — never used in maths
        recordedOutcome: hand.outcome || null,
        outcomeMismatch: Boolean(hand.outcome && hand.outcome !== outcome)
      };

      totals.hands += 1;
      totals.commissionCents += commissionCents;
      if (isPass) {
        totals.voids += 1;
      } else {
        totals.wagers += wagers.length;
        totals.stakedUnits += stakeUnits;
      }
      if (outcome === "win") totals.wins += 1;
      else if (outcome === "lose") totals.losses += 1;
      else if (outcome === "push") totals.pushes += 1;

      if (enriched.result === "banker") totals.bankerResults += 1;
      else if (enriched.result === "player") totals.playerResults += 1;
      else if (enriched.result === "tie") totals.tieResults += 1;

      totals.netCents += profitCents;
      runningCents += profitCents;
      equity.push(runningCents);
      if (runningCents > peakCents) peakCents = runningCents;
      var drawdown = peakCents - runningCents;
      if (drawdown > maxDrawdownCents) maxDrawdownCents = drawdown;

      if (enriched.result) sequence.push(enriched.result);
      return enriched;
    });

    var bankrollCents = startingUnits * unitValueCents + totals.netCents;
    var settledHands = totals.wins + totals.losses + totals.pushes;

    return {
      hands: hands,
      sequence: sequence,
      equityCents: equity,
      bankrollCents: bankrollCents,
      bankrollUnits: unitValueCents ? round2(bankrollCents / unitValueCents) : 0,
      startingCents: startingUnits * unitValueCents,
      netCents: totals.netCents,
      netUnits: unitValueCents ? round2(totals.netCents / unitValueCents) : 0,
      commissionCents: totals.commissionCents,
      stakedUnits: totals.stakedUnits,
      wagers: totals.wagers,
      bets: totals.wagers,
      totalHands: totals.hands,
      wins: totals.wins,
      losses: totals.losses,
      pushes: totals.pushes,
      voids: totals.voids,
      bankerResults: totals.bankerResults,
      playerResults: totals.playerResults,
      tieResults: totals.tieResults,
      winRate: settledHands ? round2((totals.wins / settledHands) * 100) : 0,
      maxDrawdownCents: maxDrawdownCents,
      peakCents: peakCents,
      last20: sequence.slice(-20),
      streak: currentStreak(sequence),
      longest: longestStreaks(sequence)
    };
  }

  function currentStreak(sequence) {
    if (!sequence.length) return { result: null, length: 0 };
    var result = sequence[sequence.length - 1];
    var length = 1;
    for (var i = sequence.length - 2; i >= 0; i -= 1) {
      if (sequence[i] !== result) break;
      length += 1;
    }
    return { result: result, length: length };
  }

  function longestStreaks(sequence) {
    var map = { banker: 0, player: 0, tie: 0 };
    var current = { result: null, length: 0 };
    sequence.forEach(function (result) {
      if (result === current.result) {
        current.length += 1;
      } else {
        current = { result: result, length: 1 };
      }
      if (current.length > map[result]) map[result] = current.length;
    });
    return map;
  }

  function bankrollCents(session) {
    return derive(session).bankrollCents;
  }

  function unitsToCents(units, unitValueCents) {
    return units * unitValueCents;
  }

  /* -------------------------------------------------------------- state changes
   * Every change returns a NEW session (the input is never mutated), which makes
   * undo trivially correct and keeps the server's stored state as the single truth.
   */

  function assertWagerAllowed(session, side) {
    var existing = openWagersOf(session);
    if (existing.some(function (wager) { return wager.side === "pass"; })) {
      throw EngineError("This hand is marked as a pass — remove it before placing a bet", "pass-open");
    }
    if (existing.some(function (wager) { return wager.side === side; })) {
      throw EngineError("A " + side + " bet is already on this hand", "duplicate-wager");
    }
    if (side === "banker" || side === "player") {
      var opposite = side === "banker" ? "player" : "banker";
      if (existing.some(function (wager) { return wager.side === opposite; })) {
        throw EngineError("Banker and Player cannot both be bet on the same hand", "conflicting-wager");
      }
    }
  }

  function placeBet(session, side, stakeUnits) {
    var next = clone(assertActive(session));
    var normalizedSide = normalizeSide(side);

    if (!Array.isArray(next.openWagers)) next.openWagers = openWagersOf(next);

    if (normalizedSide === "pass") {
      // PASS opens the hand with nothing at risk, so the table's result can still be recorded when
      // it lands. The result then fills the bead plate and the result statistics; the bankroll does
      // not move and the hand is never counted as a win or a loss.
      // Validate the request shape before the hand's state, so a staked pass reports the stake.
      if (isInt(stakeUnits) && stakeUnits !== 0) {
        throw EngineError("A pass has no stake — there is no money at risk", "bad-stake");
      }
      var open = openWagersOf(next);
      if (open.some(function (wager) { return wager.side === "pass"; })) {
        throw EngineError("This hand is already marked as a pass", "duplicate-wager");
      }
      if (open.length) {
        throw EngineError("This hand already has a bet on it — remove it before passing", "conflicting-wager");
      }
      next.openWagers = [{
        side: "pass",
        stakeUnits: 0,
        stakeCents: 0,
        placedAt: new Date().toISOString()
      }];
      return next;
    }

    assertWagerAllowed(next, normalizedSide);
    if (!isInt(stakeUnits) || stakeUnits < 1) {
      throw EngineError("Stake must be a whole number of 1 unit or more", "bad-stake");
    }
    if (stakeUnits > LIMITS.maxUnits) {
      throw EngineError("Stake exceeds the " + LIMITS.maxUnits + "-unit ceiling", "stake-too-large");
    }

    var available = bankrollCents(next);
    var stakeCents = unitsToCents(stakeUnits, next.unitValueCents);
    var committed = openStakeCents(next);
    if (committed + stakeCents > available) {
      throw EngineError(
        "This would commit " + formatCents(committed + stakeCents) + " of a " + formatCents(available) +
        " bankroll (already open: " + formatCents(committed) + ")",
        "stake-over-bankroll"
      );
    }

    next.openWagers.push({
      side: normalizedSide,
      stakeUnits: stakeUnits,
      stakeCents: stakeCents,
      placedAt: new Date().toISOString()
    });
    return next;
  }

  function removeWager(session, side) {
    var next = clone(assertActive(session));
    var normalizedSide = normalizeSide(side);
    var wagers = openWagersOf(next).filter(function (wager) { return wager.side !== normalizedSide; });
    if (wagers.length === openWagersOf(next).length) {
      throw EngineError("There is no open " + normalizedSide + " bet on this hand", "no-open-wager");
    }
    next.openWagers = wagers;
    return next;
  }

  function cancelOpenBets(session) {
    var next = clone(assertActive(session));
    if (!openWagersOf(next).length) {
      throw EngineError("There is no open bet to cancel", "no-open-bet");
    }
    next.openWagers = [];
    return next;
  }

  function settleOpenBets(session, result, meta) {
    var next = clone(assertActive(session));
    var wagers = openWagersOf(next);
    if (!wagers.length) {
      throw EngineError("There is no open bet to settle", "no-open-bet");
    }
    if (next.hands.length >= LIMITS.maxHands) {
      throw EngineError("This session has reached its hand limit", "too-many-hands");
    }
    var normalizedResult = normalizeResult(result);
    if (normalizedResult === null) {
      throw EngineError("A result is required to settle this hand", "missing-result");
    }

    // Settle every open wager at once: one hand, one result, one settlement.
    var settledWagers = wagers.map(function (wager) {
      var settled = settle(wager.side, normalizedResult, wager.stakeUnits, next.unitValueCents, next.rules);
      return {
        side: settled.side,
        stakeUnits: settled.stakeUnits,
        stakeCents: settled.stakeCents,
        outcome: settled.outcome,
        profitCents: settled.profitCents,
        commissionCents: settled.commissionCents
      };
    });
    var info = meta || {};
    next.hands.push({
      wagers: settledWagers,
      result: normalizedResult,
      source: info.source === "ocr" ? "ocr" : "manual",
      at: info.at || new Date().toISOString()
    });
    next.openWagers = [];
    next.seq += 1;
    return next;
  }

  function recordPass(session, result, meta) {
    var next = clone(assertActive(session));
    if (openWagersOf(next).length) {
      throw EngineError("Settle or cancel the open bet before recording a no-bet hand", "bet-already-open");
    }
    var info = meta || {};
    next.hands.push({
      wagers: [{ side: "pass", stakeUnits: 0 }],
      result: normalizeResult(result),
      source: info.source === "ocr" ? "ocr" : "manual",
      at: info.at || new Date().toISOString()
    });
    next.openWagers = [];
    next.seq += 1;
    return next;
  }

  function undoLastHand(session) {
    var next = clone(assertActive(session));
    if (!next.hands.length) {
      throw EngineError("There is nothing to undo", "nothing-to-undo");
    }
    next.hands.pop();
    next.seq = Math.max(1, next.hands.length + 1);
    return next;
  }

  function endSession(session) {
    var next = clone(assertSession(session));
    if (openWagersOf(next).length) {
      throw EngineError("Settle or cancel the open bet before ending the session", "bet-already-open");
    }
    next.status = "ended";
    next.endedAt = new Date().toISOString();
    return next;
  }

  function reopenSession(session) {
    var next = clone(assertSession(session));
    next.status = "active";
    next.endedAt = null;
    return next;
  }

  /* ------------------------------------------------------------- serialization */

  function toJSON(session) {
    return JSON.stringify(session, null, 2);
  }

  function fromJSON(text) {
    var parsed;
    try {
      parsed = typeof text === "string" ? JSON.parse(text) : text;
    } catch (error) {
      throw EngineError("Stored session is not valid JSON", "bad-json");
    }
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.hands)) {
      throw EngineError("Stored session has an unrecognised shape", "bad-shape");
    }
    // Rebuild through the public API so every rule is re-applied; derived values in the file
    // are ignored in favour of recomputation. Both hand shapes are accepted.
    var session = createSession({
      id: parsed.id,
      casino: parsed.casino,
      provider: parsed.provider,
      layout: parsed.layout,
      mode: parsed.mode,
      startedAt: parsed.startedAt,
      startingUnits: parsed.startingUnits,
      unitValueCents: parsed.unitValueCents,
      rules: parsed.rules
    });
    session.hands = parsed.hands.map(function (hand) {
      return {
        wagers: handWagersOf(hand).map(function (wager) {
          return {
            side: normalizeSide(wager.side),
            stakeUnits: isInt(wager.stakeUnits) ? wager.stakeUnits : 0
          };
        }),
        result: normalizeResult(hand.result),
        outcome: hand.outcome || null,
        source: hand.source === "ocr" ? "ocr" : "manual",
        at: hand.at || null
      };
    });
    session.seq = session.hands.length + 1;
    session.openWagers = openWagersOf(parsed).map(function (wager) {
      return {
        side: normalizeSide(wager.side),
        stakeUnits: isInt(wager.stakeUnits) ? wager.stakeUnits : 0,
        stakeCents: isInt(wager.stakeCents) ? wager.stakeCents : 0,
        placedAt: wager.placedAt || null
      };
    });
    if (parsed.status === "ended") {
      session.status = "ended";
      session.endedAt = parsed.endedAt || null;
    }
    return session;
  }

  /* ------------------------------------------------------------------- reporting */

  function formatCents(cents) {
    var value = isFinite(cents) ? cents : 0;
    var sign = value < 0 ? "-" : "";
    var absolute = Math.abs(value);
    var dollars = Math.floor(absolute / 100);
    var rest = String(absolute % 100).padStart(2, "0");
    return sign + "$" + dollars + "." + rest;
  }

  function formatUnits(cents, unitValueCents) {
    if (!unitValueCents) return "0";
    var units = round2((isFinite(cents) ? cents : 0) / unitValueCents);
    return (units > 0 ? "+" : "") + units + "u";
  }

  function wagerLabel(hand) {
    return hand.wagers
      .filter(function (wager) { return wager.side !== "pass"; })
      .map(function (wager) { return wager.side + ":" + wager.stakeUnits; })
      .join(";");
  }

  function toCsv(session) {
    var derived = derive(session);
    var header = ["hand", "at", "source", "side", "stake_units", "result", "outcome",
      "stake_cents", "commission_cents", "profit_cents", "bankroll_cents", "wagers"];
    var running = derived.startingCents;
    var rows = derived.hands.map(function (hand) {
      running += hand.profitCents;
      return [
        hand.n,
        hand.at || "",
        hand.source,
        hand.side,
        hand.stakeUnits,
        hand.result || "",
        hand.outcome,
        hand.stakeCents,
        hand.commissionCents,
        hand.profitCents,
        running,
        wagerLabel(hand)
      ].join(",");
    });
    return header.join(",") + "\n" + rows.join("\n") + (rows.length ? "\n" : "");
  }

  function summary(session) {
    var derived = derive(session);
    return {
      casino: session.casino,
      provider: session.provider,
      layout: session.layout,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      status: session.status,
      unitValueCents: session.unitValueCents,
      startingUnits: session.startingUnits,
      hands: derived.totalHands,
      wagers: derived.wagers,
      bets: derived.bets,
      wins: derived.wins,
      losses: derived.losses,
      pushes: derived.pushes,
      voids: derived.voids,
      winRate: derived.winRate,
      stakedUnits: derived.stakedUnits,
      commissionCents: derived.commissionCents,
      netCents: derived.netCents,
      netUnits: derived.netUnits,
      bankrollCents: derived.bankrollCents,
      bankrollUnits: derived.bankrollUnits,
      maxDrawdownCents: derived.maxDrawdownCents,
      bankerResults: derived.bankerResults,
      playerResults: derived.playerResults,
      tieResults: derived.tieResults,
      longest: derived.longest
    };
  }

  return {
    SIDES: SIDES,
    BET_SIDES: BET_SIDES,
    RESULTS: RESULTS,
    DEFAULT_RULES: DEFAULT_RULES,
    LIMITS: LIMITS,
    SCHEMA_VERSION: SCHEMA_VERSION,
    EngineError: EngineError,
    settle: settle,
    createSession: createSession,
    derive: derive,
    bankrollCents: bankrollCents,
    openWagersOf: openWagersOf,
    handWagersOf: handWagersOf,
    openStakeCents: openStakeCents,
    placeBet: placeBet,
    removeWager: removeWager,
    cancelOpenBets: cancelOpenBets,
    settleOpenBets: settleOpenBets,
    recordPass: recordPass,
    undoLastHand: undoLastHand,
    endSession: endSession,
    reopenSession: reopenSession,
    toJSON: toJSON,
    fromJSON: fromJSON,
    toCsv: toCsv,
    summary: summary,
    formatCents: formatCents,
    formatUnits: formatUnits
  };
});
