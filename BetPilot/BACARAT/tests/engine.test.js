/* BetPilot — Baccarat engine tests
 * Run: node engine.test.js
 *
 * Every defect named in REVIEW_Baccarat_v1.0.0-20260928.md has a test here. If a test in the
 * "regression" groups fails, that review finding has come back.
 *
 * The multi-wager group covers the v2.1.0 rule: one wager per side, Banker and Player mutually
 * exclusive, Tie allowed alongside either.
 */
"use strict";

var path = require("path");
var Engine = require(path.join(__dirname, "..", "app", "web", "engine.js"));

var passed = 0;
var failed = 0;
var failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("  ok   " + name);
  } catch (error) {
    failed += 1;
    failures.push({ name: name, error: error });
    console.log("  FAIL " + name + "\n         " + error.message);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "assertion failed");
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || "assertEqual") + ": expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
  }
}

function assertThrows(fn, code, message) {
  var threw = null;
  try {
    fn();
  } catch (error) {
    threw = error;
  }
  if (!threw) throw new Error((message || "expected a throw") + " (nothing was thrown)");
  if (code && threw.code !== code) {
    throw new Error((message || "wrong error") + ": expected code " + code + ", got " + threw.code + " (" + threw.message + ")");
  }
}

/* Bet-side defaults for the tests: $5 per unit, 5% Banker commission, 8:1 Tie. */
function fresh(startingUnits, options) {
  var base = { casino: "Test Table", startingUnits: startingUnits === undefined ? 100 : startingUnits, unitValueCents: 500 };
  if (options) Object.keys(options).forEach(function (key) { base[key] = options[key]; });
  return Engine.createSession(base);
}

function play(session, side, stake, result) {
  return Engine.settleOpenBets(Engine.placeBet(session, side, stake), result);
}

console.log("\nSETTLEMENT — the rules that decide the money");
test("Banker bet on a Banker result pays 0.95:1 with cent-accurate commission", function () {
  var s = Engine.settle("banker", "banker", 1, 500);
  assertEqual(s.outcome, "win");
  assertEqual(s.commissionCents, 25, "5% of $5.00");
  assertEqual(s.profitCents, 475, "profit must be 475 cents, not a whole 500");
});
test("Banker bet on a Player result loses the stake", function () {
  var s = Engine.settle("banker", "player", 10, 500);
  assertEqual(s.outcome, "lose");
  assertEqual(s.profitCents, -5000);
});
test("Player bet on a Player result pays 1:1", function () {
  var s = Engine.settle("player", "player", 10, 500);
  assertEqual(s.outcome, "win");
  assertEqual(s.profitCents, 5000);
});
test("Player bet on a Banker result loses the stake", function () {
  assertEqual(Engine.settle("player", "banker", 4, 500).outcome, "lose");
});
test("Banker AND Player bets PUSH on a Tie (review H2/H3)", function () {
  ["banker", "player"].forEach(function (side) {
    var s = Engine.settle(side, "tie", 10, 500);
    assertEqual(s.outcome, "push", side + " on a Tie must push");
    assertEqual(s.profitCents, 0, side + " on a Tie must be money-neutral");
  });
});
test("Tie bet on a Tie result pays 8:1", function () {
  var s = Engine.settle("tie", "tie", 2, 500);
  assertEqual(s.outcome, "win");
  assertEqual(s.profitCents, 8000, "2 units x $5 x 8");
});
test("Tie bet on a Banker or Player result loses", function () {
  assertEqual(Engine.settle("tie", "banker", 1, 500).outcome, "lose");
  assertEqual(Engine.settle("tie", "player", 1, 500).outcome, "lose");
});
test("A no-bet hand is void and money-neutral", function () {
  var s = Engine.settle("pass", "banker", 0, 500);
  assertEqual(s.outcome, "void");
  assertEqual(s.profitCents, 0);
});
test("Settling a real bet without a result is refused", function () {
  assertThrows(function () { Engine.settle("banker", null, 1, 500); }, "missing-result");
});
test("A 9:1 Tie table is configurable", function () {
  var s = Engine.settle("tie", "tie", 1, 500, { tiePayout: 9 });
  assertEqual(s.profitCents, 4500);
});
test("A negative stake in stored data cannot flip a loss into a profit", function () {
  var s = Engine.settle("banker", "player", -10, 500);
  assertEqual(s.stakeCents, 0);
  assertEqual(s.profitCents, 0);
});

console.log("\nMULTI-WAGER — a Tie side bet alongside Banker or Player");
test("A Tie bet can be added on top of a Banker bet", function () {
  var session = Engine.placeBet(fresh(100), "banker", 10);
  session = Engine.placeBet(session, "tie", 1);
  assertEqual(Engine.openWagersOf(session).length, 2);
  assertEqual(Engine.openStakeCents(session), 5500, "10u + 1u at $5");
});
test("A Tie bet can be added on top of a Player bet", function () {
  var session = Engine.placeBet(fresh(100), "player", 4);
  session = Engine.placeBet(session, "tie", 2);
  assertEqual(Engine.openWagersOf(session).length, 2);
});
test("The same side cannot be bet twice on one hand", function () {
  var session = Engine.placeBet(fresh(100), "banker", 10);
  assertThrows(function () { Engine.placeBet(session, "banker", 5); }, "duplicate-wager");
  var withTie = Engine.placeBet(session, "tie", 1);
  assertEqual(Engine.openWagersOf(withTie).length, 2, "Tie must still be allowed alongside Banker");
  assertThrows(function () { Engine.placeBet(withTie, "tie", 1); }, "duplicate-wager", "Tie twice is refused");
});
test("Banker and Player cannot both be bet on one hand", function () {
  var session = Engine.placeBet(fresh(100), "banker", 10);
  assertThrows(function () { Engine.placeBet(session, "player", 10); }, "conflicting-wager");
  var player = Engine.placeBet(fresh(100), "player", 10);
  assertThrows(function () { Engine.placeBet(player, "banker", 10); }, "conflicting-wager");
});
test("Both wagers settle from one result: Banker 10u + Tie 1u, result Banker", function () {
  var session = Engine.placeBet(fresh(100), "banker", 10);
  session = Engine.placeBet(session, "tie", 1);
  session = Engine.settleOpenBets(session, "banker");
  var hand = Engine.derive(session).hands[0];
  assertEqual(hand.wagers.length, 2);
  assertEqual(hand.wagers[0].outcome, "win");
  assertEqual(hand.wagers[1].outcome, "lose");
  assertEqual(hand.profitCents, 4750 - 500, "Banker win less the losing Tie stake");
  assertEqual(hand.outcome, "win", "the hand nets a win");
  assertEqual(hand.stakeUnits, 11);
  assertEqual(hand.side, "banker+tie");
});
test("The hedge pays when the Tie lands: Banker 10u + Tie 1u, result Tie", function () {
  var session = Engine.placeBet(fresh(100), "banker", 10);
  session = Engine.placeBet(session, "tie", 1);
  session = Engine.settleOpenBets(session, "tie");
  var hand = Engine.derive(session).hands[0];
  assertEqual(hand.wagers[0].outcome, "push", "Banker pushes on a Tie");
  assertEqual(hand.wagers[1].outcome, "win");
  assertEqual(hand.profitCents, 4000, "8:1 on 1 unit");
  assertEqual(hand.outcome, "win");
});
test("A hedge that fails nets a bigger loss", function () {
  var session = Engine.placeBet(fresh(100), "banker", 10);
  session = Engine.placeBet(session, "tie", 1);
  session = Engine.settleOpenBets(session, "player");
  var hand = Engine.derive(session).hands[0];
  assertEqual(hand.profitCents, -5500);
  assertEqual(hand.outcome, "lose");
});
test("A hedged hand that nets exactly zero is a push for the hand", function () {
  var session = Engine.placeBet(fresh(100), "player", 1);
  session = Engine.placeBet(session, "tie", 1);
  session = Engine.settleOpenBets(session, "player");
  var hand = Engine.derive(session).hands[0];
  // player 1u wins +1u (500c), tie 1u loses -500c => net 0
  assertEqual(hand.profitCents, 0);
  assertEqual(hand.outcome, "push");
});
test("The bankroll check counts every open wager", function () {
  var session = Engine.placeBet(fresh(10), "banker", 6); // 6u = $30 of a $50 bankroll
  assertThrows(function () { Engine.placeBet(session, "tie", 5); }, "stake-over-bankroll");
  var ok = Engine.placeBet(session, "tie", 4); // 6u + 4u = exactly the bankroll
  assertEqual(Engine.openStakeCents(ok), 5000);
});
test("Removing one wager leaves the others open", function () {
  var session = Engine.placeBet(fresh(100), "banker", 5);
  session = Engine.placeBet(session, "tie", 1);
  session = Engine.removeWager(session, "tie");
  assertEqual(Engine.openWagersOf(session).length, 1);
  assertEqual(Engine.openWagersOf(session)[0].side, "banker");
  assertThrows(function () { Engine.removeWager(session, "tie"); }, "no-open-wager");
});
test("Cancelling clears every open wager", function () {
  var session = Engine.placeBet(fresh(100), "banker", 5);
  session = Engine.placeBet(session, "tie", 1);
  session = Engine.cancelOpenBets(session);
  assertEqual(Engine.openWagersOf(session).length, 0);
  assertEqual(Engine.derive(session).hands.length, 0, "cancelling must not touch history");
});
test("A no-bet hand cannot be recorded while any wager is open", function () {
  var session = Engine.placeBet(fresh(100), "banker", 10);
  assertThrows(function () { Engine.recordPass(session, "player"); }, "bet-already-open");
});
test("A hand still settles exactly once with multiple wagers", function () {
  var session = Engine.placeBet(fresh(100), "banker", 10);
  session = Engine.placeBet(session, "tie", 1);
  session = Engine.settleOpenBets(session, "banker");
  var bankrollAfter = Engine.derive(session).bankrollCents;
  assertThrows(function () { Engine.settleOpenBets(session, "banker"); }, "no-open-bet");
  assertEqual(Engine.derive(session).bankrollCents, bankrollAfter);
  assertEqual(Engine.derive(session).hands.length, 1);
});

console.log("\nREGRESSION H3 — a push must not move the bankroll or the P/L");
test("Push leaves bankroll and net P/L exactly unchanged", function () {
  var session = Engine.placeBet(fresh(100), "banker", 10);
  session = Engine.settleOpenBets(session, "tie");
  var d = Engine.derive(session);
  assertEqual(d.bankrollCents, 50000, "bankroll must stay at 100 units");
  assertEqual(d.netCents, 0, "net P/L must stay 0");
  assertEqual(d.pushes, 1);
  assertEqual(d.hands[0].outcome, "push");
});
test("A session of only pushes ends exactly where it started", function () {
  var session = fresh(50);
  for (var i = 0; i < 5; i += 1) {
    session = play(session, i % 2 ? "player" : "banker", 3, "tie");
  }
  assertEqual(Engine.derive(session).bankrollCents, 25000);
});

console.log("\nREGRESSION H2 — the outcome is derived, never typed");
test("There is no way to record an outcome directly; only wagers + result", function () {
  var api = Object.keys(Engine);
  assert(api.indexOf("recordOutcome") === -1, "a recordOutcome-style API must not exist");
});
test("Betting Banker and recording a Player result loses money", function () {
  var session = play(fresh(100), "banker", 10, "player");
  var d = Engine.derive(session);
  assertEqual(d.netCents, -5000, "a wrong side must cost the stake");
  assertEqual(d.losses, 1);
  assertEqual(d.wins, 0);
});
test("A win is never counted for a mismatched side/result pair", function () {
  var session = play(fresh(100), "banker", 10, "player");
  assertEqual(Engine.derive(session).winRate, 0);
});

console.log("\nREGRESSION H4 — one hand cannot be settled twice");
test("Settling twice is refused (no double payout)", function () {
  var session = play(fresh(100), "player", 10, "player");
  var afterFirst = Engine.derive(session).bankrollCents;
  assertThrows(function () { Engine.settleOpenBets(session, "player"); }, "no-open-bet");
  assertEqual(Engine.derive(session).bankrollCents, afterFirst, "bankroll must not move on the second attempt");
  assertEqual(Engine.derive(session).hands.length, 1);
});
test("A hand record is immutable once created", function () {
  var session = play(fresh(100), "player", 10, "player");
  session.hands[0].wagers[0].profitCents = 999999; // simulate tampering with the stored value
  assertEqual(Engine.derive(session).netCents, 5000, "derive() must recompute, not trust the file");
});

console.log("\nREGRESSION M2 — stakes are bounded by the bankroll");
test("A stake larger than the bankroll is refused", function () {
  var session = play(fresh(10), "banker", 10, "player"); // now 0 units
  assertThrows(function () { Engine.placeBet(session, "banker", 1); }, "stake-over-bankroll");
});
test("A runaway double-up cannot exceed the bankroll or the ceiling", function () {
  var session = fresh(100);
  var stake = 10;
  for (var i = 0; i < 12; i += 1) stake *= 2; // 40960 units, the old doubleUnit() path
  assertThrows(function () { Engine.placeBet(session, "banker", stake); }, "stake-over-bankroll");
  assertThrows(function () { Engine.placeBet(session, "banker", 200000); }, "stake-too-large");
});
test("Zero, negative and fractional stakes are refused (1 unit stays the minimum)", function () {
  var session = fresh(100);
  [0, -5, 1.5, 0.5, "10", null].forEach(function (bad) {
    assertThrows(function () { Engine.placeBet(session, "banker", bad); }, "bad-stake", "stake " + JSON.stringify(bad));
  });
  assertEqual(Engine.placeBet(session, "banker", 1).openWagers[0].stakeUnits, 1, "1 unit is allowed");
});
test("Starting units of zero means no bet can be placed", function () {
  var session = fresh(0);
  assertThrows(function () { Engine.placeBet(session, "banker", 1); }, "stake-over-bankroll");
});
test("A negative or non-integer starting bankroll is refused at creation", function () {
  assertThrows(function () { Engine.createSession({ startingUnits: -500, unitValueCents: 500 }); }, "bad-start");
  assertThrows(function () { Engine.createSession({ startingUnits: 10.5, unitValueCents: 500 }); }, "bad-start");
  assertThrows(function () { Engine.createSession({ startingUnits: 10, unitValueCents: 0 }); }, "bad-unit-value");
});

console.log("\nREGRESSION M3/M4 — clean state transitions");
test("Undo removes exactly one hand and restores the prior bankroll", function () {
  var session = play(fresh(100), "banker", 10, "banker");
  var afterWin = Engine.derive(session).bankrollCents;
  var undone = Engine.undoLastHand(session);
  assertEqual(Engine.derive(undone).bankrollCents, 50000, "undo must return to the starting bankroll");
  assertEqual(Engine.derive(undone).hands.length, 0);
  assert(afterWin > 50000, "the win should have increased the bankroll before undo");
});
test("Undo is refused when there is nothing to undo", function () {
  assertThrows(function () { Engine.undoLastHand(fresh(100)); }, "nothing-to-undo");
});
test("A session cannot end with an open bet", function () {
  var session = Engine.placeBet(fresh(100), "player", 5);
  assertThrows(function () { Engine.endSession(session); }, "bet-already-open");
  var hedged = Engine.placeBet(session, "tie", 1);
  assertThrows(function () { Engine.endSession(hedged); }, "bet-already-open");
});
test("An ended session refuses further changes", function () {
  var session = Engine.endSession(fresh(100));
  assertEqual(session.status, "ended");
  assertThrows(function () { Engine.placeBet(session, "banker", 1); }, "session-ended");
  assertThrows(function () { Engine.settleOpenBets(session, "banker"); }, "session-ended");
});

console.log("\nREGRESSION M15/M16 — P&L is always derived from the session itself");
test("End-of-session P/L never invents a baseline", function () {
  var session = Engine.recordPass(fresh(0), "banker");
  session = Engine.endSession(session);
  assertEqual(Engine.derive(session).netCents, 0);
  assertEqual(Engine.summary(session).netCents, 0);
});
test("Bankroll always equals starting capital plus net P/L", function () {
  var session = play(fresh(20), "banker", 5, "banker");
  session = play(session, "tie", 1, "banker");
  var d = Engine.derive(session);
  assertEqual(d.bankrollCents, d.startingCents + d.netCents);
  assertEqual(Engine.summary(session).bankrollCents, d.bankrollCents);
});

console.log("\nSTATISTICS");
test("Counts, win rate, commission and streaks are computed correctly", function () {
  var session = fresh(100);
  var script = [
    ["banker", "banker"], ["banker", "banker"], ["banker", "player"],
    ["player", "tie"], ["tie", "tie"], ["banker", "tie"], ["player", "player"]
  ];
  script.forEach(function (pair) {
    session = play(session, pair[0], 2, pair[1]);
  });
  var d = Engine.derive(session);
  assertEqual(d.hands.length, 7);
  // results: banker, banker, player, tie, tie, tie, player
  assertEqual(d.wins, 4, "banker, banker + tie-bet-on-tie + player");
  assertEqual(d.losses, 1, "banker-vs-player only (banker-vs-tie pushes)");
  assertEqual(d.pushes, 2, "player-vs-tie and banker-vs-tie");
  assertEqual(d.voids, 0);
  assertEqual(d.wagers, 7, "one wager per hand here");
  assertEqual(d.bankerResults, 2);
  assertEqual(d.playerResults, 2);
  assertEqual(d.tieResults, 3);
  assertEqual(d.commissionCents, 100, "two Banker wins at 2 units x $5 x 5%");
  assertEqual(d.stakedUnits, 14);
  assertEqual(d.winRate, 57.14, "4 of 7 settled hands");
});
test("Wagers are counted separately from hands when a hand is hedged", function () {
  var session = play(fresh(100), "banker", 2, "banker");
  session = Engine.placeBet(session, "player", 2);
  session = Engine.placeBet(session, "tie", 1);
  session = Engine.settleOpenBets(session, "player");
  var d = Engine.derive(session);
  assertEqual(d.hands.length, 2);
  assertEqual(d.wagers, 3, "1 wager on hand 1, 2 on hand 2");
  assertEqual(d.stakedUnits, 5);
});
test("A no-bet hand is counted separately and never as a win or loss", function () {
  var session = Engine.recordPass(fresh(100), "banker");
  var d = Engine.derive(session);
  assertEqual(d.totalHands, 1);
  assertEqual(d.voids, 1);
  assertEqual(d.wins, 0);
  assertEqual(d.losses, 0);
  assertEqual(d.netCents, 0);
  assertEqual(d.last20.join(","), "banker", "a no-bet hand still contributes to the bead plate");
});
test("Max drawdown tracks the worst fall from a peak", function () {
  var session = play(fresh(100), "banker", 10, "banker"); // +47.50
  session = play(session, "player", 10, "banker");        // -50.00
  assertEqual(Engine.derive(session).maxDrawdownCents, 5000);
});
test("Currency and unit formatting is exact, including half units", function () {
  assertEqual(Engine.formatCents(475), "$4.75");
  assertEqual(Engine.formatCents(-5000), "-$50.00");
  assertEqual(Engine.formatCents(5), "$0.05");
  assertEqual(Engine.formatUnits(475, 500), "+0.95u");
  assertEqual(Engine.formatUnits(875, 500), "+1.75u");
  assertEqual(Engine.formatUnits(-5000, 500), "-10u");
  var session = play(fresh(100), "banker", 1, "banker");
  assertEqual(Engine.derive(session).netUnits, 0.95, "a 1-unit Banker win is +0.95u");
});

console.log("\nPERSISTENCE");
test("A session survives a JSON round-trip with identical derivations", function () {
  var session = play(fresh(100), "banker", 4, "banker");
  session = Engine.recordPass(session, "player");
  var restored = Engine.fromJSON(Engine.toJSON(session));
  var before = Engine.derive(session);
  var after = Engine.derive(restored);
  assertEqual(after.bankrollCents, before.bankrollCents);
  assertEqual(after.netCents, before.netCents);
  assertEqual(after.hands.length, before.hands.length);
  assertEqual(after.commissionCents, before.commissionCents);
  assertEqual(restored.casino, "Test Table");
});
test("Open wagers survive a round-trip", function () {
  var session = Engine.placeBet(fresh(100), "tie", 2);
  session = Engine.placeBet(session, "player", 3);
  var restored = Engine.fromJSON(Engine.toJSON(session));
  assertEqual(Engine.openWagersOf(restored).length, 2);
  assertEqual(Engine.openStakeCents(restored), 2500, "2u + 3u at $5");
});
test("A v2 single-openBet file is still read correctly", function () {
  var legacy = JSON.stringify({
    schema: 2, id: "old", casino: "Legacy", status: "active", startedAt: "2026-09-01T10:00:00",
    rules: Engine.DEFAULT_RULES, startingUnits: 50, unitValueCents: 500, seq: 2,
    hands: [], openBet: { side: "banker", stakeUnits: 4, stakeCents: 2000, placedAt: "2026-09-01T10:05:00" }
  });
  var restored = Engine.fromJSON(legacy);
  assertEqual(Engine.openWagersOf(restored).length, 1);
  assertEqual(Engine.openWagersOf(restored)[0].side, "banker");
  assertEqual(Engine.openStakeCents(restored), 2000);
});
test("A v2 single-wager hand is still derived correctly", function () {
  var legacy = JSON.stringify({
    schema: 2, id: "old", casino: "Legacy", status: "active", startedAt: "2026-09-01T10:00:00",
    rules: Engine.DEFAULT_RULES, startingUnits: 100, unitValueCents: 500, seq: 2,
    hands: [{ side: "banker", result: "banker", stakeUnits: 2, outcome: "lose", at: "2026-09-01T10:01:00" }]
  });
  var d = Engine.derive(Engine.fromJSON(legacy));
  assertEqual(d.hands.length, 1);
  assertEqual(d.hands[0].wagers.length, 1);
  assertEqual(d.hands[0].outcome, "win", "recomputed, not the stored 'lose'");
  assertEqual(d.hands[0].outcomeMismatch, true, "the mismatch is visible in the audit field");
  assertEqual(d.netCents, 950);
  assertEqual(d.bankrollCents, 50950);
});
test("A tampered stored outcome is flagged and ignored", function () {
  var session = play(fresh(100), "banker", 10, "player"); // a loss
  var text = Engine.toJSON(session).replace('"outcome": "lose"', '"outcome": "win"');
  var d = Engine.derive(Engine.fromJSON(text));
  assertEqual(d.hands[0].outcome, "lose", "recomputed outcome must win");
  assertEqual(d.netCents, -5000);
});
test("Corrupt or unrecognised stored data is refused, not guessed at", function () {
  assertThrows(function () { Engine.fromJSON("{not json"); }, "bad-json");
  assertThrows(function () { Engine.fromJSON('{"hands":"nope"}'); }, "bad-shape");
  assertThrows(function () { Engine.fromJSON('{"hands":[{"side":"dragon","result":"banker","stakeUnits":1}]}'); }, "bad-side");
  assertThrows(function () { Engine.fromJSON('{"hands":[{"wagers":[{"side":"dragon","stakeUnits":1}],"result":"banker"}]}'); }, "bad-side");
});
test("CSV export lists one row per hand with a running bankroll and the wager breakdown", function () {
  var session = play(fresh(100), "banker", 10, "banker");
  session = Engine.recordPass(session, "tie");
  var lines = Engine.toCsv(session).trim().split("\n");
  assertEqual(lines.length, 3, "header plus two hands");
  var header = lines[0].split(",");
  assertEqual(header[header.length - 1], "wagers");
  assert(lines[1].indexOf("banker,10,banker,win") !== -1, "hand row: " + lines[1]);
  assertEqual(lines[1].split(",")[10], "54750", "running bankroll after the win");
  assertEqual(lines[1].split(",").pop(), "banker:10", "wager breakdown");
  assert(lines[2].indexOf("pass,0,tie,void") !== -1, "no-bet row: " + lines[2]);
});
test("A hedged hand exports both wagers on one row", function () {
  var session = Engine.placeBet(fresh(100), "banker", 10);
  session = Engine.placeBet(session, "tie", 1);
  session = Engine.settleOpenBets(session, "tie");
  var row = Engine.toCsv(session).trim().split("\n")[1];
  assertEqual(row.split(",").pop(), "banker:10;tie:1");
});

console.log("\nINPUT VALIDATION");
test("Unknown sides and results are refused with a code", function () {
  assertThrows(function () { Engine.placeBet(fresh(100), "dragon", 1); }, "bad-side");
  assertThrows(function () { Engine.settle("banker", "super-six", 1, 500); }, "bad-result");
  assertThrows(function () { Engine.placeBet(fresh(100), "pass", 1); }, "use-pass", "a pass belongs in recordPass");
});
test("Invalid rule values are refused", function () {
  assertThrows(function () { Engine.createSession({ startingUnits: 10, unitValueCents: 500, rules: { commissionRate: 1.5 } }); }, "bad-rules");
  assertThrows(function () { Engine.createSession({ startingUnits: 10, unitValueCents: 500, rules: { tiePayout: -8 } }); }, "bad-rules");
});
test("An unknown OCR mode falls back to manual", function () {
  assertEqual(Engine.createSession({ startingUnits: 10, unitValueCents: 500, mode: "telepathy" }).mode, "manual");
});

console.log("\nPURITY");
test("State-changing helpers never mutate their input session", function () {
  var original = fresh(100);
  var snapshot = JSON.stringify(original);
  Engine.placeBet(original, "banker", 5);
  assertEqual(JSON.stringify(original), snapshot, "placeBet mutated the input session");
  var withWagers = Engine.placeBet(Engine.placeBet(original, "banker", 5), "tie", 1);
  Engine.removeWager(withWagers, "tie");
  Engine.cancelOpenBets(withWagers);
  Engine.derive(withWagers);
  assertEqual(JSON.stringify(original), snapshot, "an action mutated the original session");
});

console.log("\n" + (failed === 0 ? "PASS" : "FAIL") + " — " + passed + " passed, " + failed + " failed\n");
if (failed > 0) {
  failures.forEach(function (item) {
    console.log("FAILED: " + item.name + "\n  " + item.error.stack.split("\n").slice(0, 4).join("\n  "));
  });
  process.exit(1);
}
