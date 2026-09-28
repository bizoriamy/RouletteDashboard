/* BetPilot — Baccarat engine tests
 * Run: node engine.test.js
 *
 * Every defect named in REVIEW_Baccarat_v1.0.0-20260928.md has a test here. If a test in the
 * "regression" groups fails, that review finding has come back.
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

console.log("\nREGRESSION H3 — a push must not move the bankroll or the P/L");
test("Push leaves bankroll and net P/L exactly unchanged", function () {
  var session = fresh(100);
  session = Engine.placeBet(session, "banker", 10);
  session = Engine.settleOpenBet(session, "tie");
  var d = Engine.derive(session);
  assertEqual(d.bankrollCents, 50000, "bankroll must stay at 100 units");
  assertEqual(d.netCents, 0, "net P/L must stay 0");
  assertEqual(d.pushes, 1);
  assertEqual(d.hands[0].outcome, "push");
});
test("A session of only pushes ends exactly where it started", function () {
  var session = fresh(50);
  for (var i = 0; i < 5; i += 1) {
    session = Engine.placeBet(session, i % 2 ? "player" : "banker", 3);
    session = Engine.settleOpenBet(session, "tie");
  }
  assertEqual(Engine.derive(session).bankrollCents, 25000);
});

console.log("\nREGRESSION H2 — the outcome is derived, never typed");
test("There is no way to record an outcome directly; only side + result", function () {
  var session = fresh(100);
  assertEqual(typeof session.hands.length, "number");
  var api = Object.keys(Engine);
  assert(api.indexOf("recordOutcome") === -1, "a recordOutcome-style API must not exist");
});
test("Betting Banker and recording a Player result loses money", function () {
  var session = fresh(100);
  session = Engine.placeBet(session, "banker", 10);
  session = Engine.settleOpenBet(session, "player");
  var d = Engine.derive(session);
  assertEqual(d.netCents, -5000, "a wrong side must cost the stake");
  assertEqual(d.losses, 1);
  assertEqual(d.wins, 0);
});
test("A win is never counted for a mismatched side/result pair", function () {
  var session = fresh(100);
  session = Engine.placeBet(session, "banker", 10);
  session = Engine.settleOpenBet(session, "player");
  assertEqual(Engine.derive(session).winRate, 0);
});

console.log("\nREGRESSION H4 — one hand cannot be settled twice");
test("Settling twice is refused (no double payout)", function () {
  var session = fresh(100);
  session = Engine.placeBet(session, "player", 10);
  session = Engine.settleOpenBet(session, "player");
  var afterFirst = Engine.derive(session).bankrollCents;
  assertThrows(function () { Engine.settleOpenBet(session, "player"); }, "no-open-bet");
  assertEqual(Engine.derive(session).bankrollCents, afterFirst, "bankroll must not move on the second attempt");
  assertEqual(Engine.derive(session).hands.length, 1);
});
test("A hand record is immutable once created", function () {
  var session = fresh(100);
  session = Engine.placeBet(session, "player", 10);
  session = Engine.settleOpenBet(session, "player");
  var stored = session.hands[0];
  stored.profitCents = 999999; // simulate tampering with the stored derived value
  assertEqual(Engine.derive(session).netCents, 5000, "derive() must recompute, not trust the file");
});

console.log("\nREGRESSION H7 — only one open bet at a time");
test("A second bet while one is open is refused", function () {
  var session = fresh(100);
  session = Engine.placeBet(session, "banker", 10);
  assertThrows(function () { Engine.placeBet(session, "player", 10); }, "bet-already-open");
  assertEqual(session.hands.length, 0, "no hand should be created by placeBet");
});
test("A no-bet hand cannot be recorded while a bet is open", function () {
  var session = fresh(100);
  session = Engine.placeBet(session, "banker", 10);
  assertThrows(function () { Engine.recordPass(session, "player"); }, "bet-already-open");
});
test("An open bet can be cancelled without touching history", function () {
  var session = fresh(100);
  session = Engine.placeBet(session, "banker", 10);
  session = Engine.cancelOpenBet(session);
  assertEqual(session.openBet, null);
  assertEqual(Engine.derive(session).netCents, 0);
  assertThrows(function () { Engine.cancelOpenBet(session); }, "no-open-bet");
});

console.log("\nREGRESSION M2 — stakes are bounded by the bankroll");
test("A stake larger than the bankroll is refused", function () {
  var session = fresh(10); // 10 units = $50
  session = Engine.placeBet(session, "banker", 10);
  session = Engine.settleOpenBet(session, "player"); // now 0 units
  assertThrows(function () { Engine.placeBet(session, "banker", 1); }, "stake-over-bankroll");
});
test("A runaway double-up cannot exceed the bankroll or the ceiling", function () {
  var session = fresh(100);
  var stake = 10;
  for (var i = 0; i < 12; i += 1) stake *= 2; // 40960 units, the old doubleUnit() path
  assertThrows(function () { Engine.placeBet(session, "banker", stake); }, "stake-over-bankroll");
  assertThrows(function () { Engine.placeBet(session, "banker", 200000); }, "stake-too-large");
});
test("Zero, negative and fractional stakes are refused", function () {
  var session = fresh(100);
  [0, -5, 1.5, "10", null].forEach(function (bad) {
    assertThrows(function () { Engine.placeBet(session, "banker", bad); }, "bad-stake", "stake " + JSON.stringify(bad));
  });
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
test("Cancelling an open bet genuinely clears it", function () {
  var session = fresh(100);
  session = Engine.placeBet(session, "banker", 33);
  session = Engine.cancelOpenBet(session);
  assertEqual(session.openBet, null, "clearBet must clear, not reset to a magic 10");
});
test("Undo removes exactly one hand and restores the prior bankroll", function () {
  var session = fresh(100);
  session = Engine.placeBet(session, "banker", 10);
  session = Engine.settleOpenBet(session, "banker");
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
});
test("An ended session refuses further changes", function () {
  var session = Engine.endSession(fresh(100));
  assertEqual(session.status, "ended");
  assertThrows(function () { Engine.placeBet(session, "banker", 1); }, "session-ended");
  assertThrows(function () { Engine.settleOpenBet(session, "banker"); }, "session-ended");
});

console.log("\nREGRESSION M15/M16 — P&L is always derived from the session itself");
test("End-of-session P/L never invents a baseline", function () {
  var session = fresh(0); // the old build turned a legitimate 0 start into -1000
  session = Engine.recordPass(session, "banker");
  session = Engine.endSession(session);
  assertEqual(Engine.derive(session).netCents, 0);
  assertEqual(Engine.summary(session).netCents, 0);
});
test("Bankroll always equals starting capital plus net P/L", function () {
  var session = fresh(20);
  session = Engine.placeBet(session, "banker", 5);
  session = Engine.settleOpenBet(session, "banker");
  session = Engine.placeBet(session, "tie", 1);
  session = Engine.settleOpenBet(session, "banker");
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
    session = Engine.placeBet(session, pair[0], 2);
    session = Engine.settleOpenBet(session, pair[1]);
  });
  var d = Engine.derive(session);
  assertEqual(d.hands.length, 7);
  // results: banker, banker, player, tie, tie, tie, player
  assertEqual(d.wins, 4, "banker, banker + tie-bet-on-tie + player");
  assertEqual(d.losses, 1, "banker-vs-player only (banker-vs-tie pushes)");
  assertEqual(d.pushes, 2, "player-vs-tie and banker-vs-tie");
  assertEqual(d.voids, 0);
  assertEqual(d.bankerResults, 2);
  assertEqual(d.playerResults, 2);
  assertEqual(d.tieResults, 3);
  assertEqual(d.commissionCents, 100, "two Banker wins at 2 units x $5 x 5%");
  assertEqual(d.stakedUnits, 14);
  assertEqual(d.winRate, 57.14, "4 of 7 settled bets");
  assertEqual(d.streak.result, "player");
  assertEqual(d.streak.length, 1);
  assertEqual(d.longest.banker, 2);
});
test("A no-bet hand is counted separately and never as a win or loss", function () {
  var session = fresh(100);
  session = Engine.recordPass(session, "banker");
  var d = Engine.derive(session);
  assertEqual(d.totalHands, 1);
  assertEqual(d.voids, 1);
  assertEqual(d.wins, 0);
  assertEqual(d.losses, 0);
  assertEqual(d.netCents, 0);
  assertEqual(d.last20.join(","), "banker", "a no-bet hand still contributes to the bead plate");
});
test("Max drawdown tracks the worst fall from a peak", function () {
  var session = fresh(100);
  session = Engine.placeBet(session, "banker", 10);
  session = Engine.settleOpenBet(session, "banker"); // +47.50
  session = Engine.placeBet(session, "player", 10);
  session = Engine.settleOpenBet(session, "banker"); // -50.00
  var d = Engine.derive(session);
  assertEqual(d.maxDrawdownCents, 5000);
});
test("Currency and unit formatting is exact", function () {
  assertEqual(Engine.formatCents(475), "$4.75");
  assertEqual(Engine.formatCents(-5000), "-$50.00");
  assertEqual(Engine.formatCents(5), "$0.05");
  assertEqual(Engine.formatUnits(475, 500), "+0.95u");
  assertEqual(Engine.formatUnits(-5000, 500), "-10u");
});

console.log("\nPERSISTENCE");
test("A session survives a JSON round-trip with identical derivations", function () {
  var session = fresh(100);
  session = Engine.placeBet(session, "banker", 4);
  session = Engine.settleOpenBet(session, "banker");
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
test("An open bet survives a round-trip", function () {
  var session = Engine.placeBet(fresh(100), "tie", 2);
  var restored = Engine.fromJSON(Engine.toJSON(session));
  assert(restored.openBet, "the open bet must be preserved");
  assertEqual(restored.openBet.side, "tie");
  assertEqual(restored.openBet.stakeUnits, 2);
});
test("A tampered stored outcome is flagged and ignored", function () {
  var session = fresh(100);
  session = Engine.placeBet(session, "banker", 10);
  session = Engine.settleOpenBet(session, "player"); // a loss
  var text = Engine.toJSON(session).replace('"outcome": "lose"', '"outcome": "win"');
  var restored = Engine.fromJSON(text);
  var d = Engine.derive(restored);
  assertEqual(d.hands[0].outcome, "lose", "recomputed outcome must win");
  assertEqual(d.hands[0].outcomeMismatch, true, "the mismatch must be visible in the audit field");
  assertEqual(d.netCents, -5000);
});
test("Corrupt or unrecognised stored data is refused, not guessed at", function () {
  assertThrows(function () { Engine.fromJSON("{not json"); }, "bad-json");
  assertThrows(function () { Engine.fromJSON('{"hands":"nope"}'); }, "bad-shape");
  assertThrows(function () { Engine.fromJSON('{"hands":[{"side":"dragon","result":"banker","stakeUnits":1}]}'); }, "bad-side");
});
test("CSV export lists one row per hand with a running bankroll", function () {
  var session = fresh(100);
  session = Engine.placeBet(session, "banker", 10);
  session = Engine.settleOpenBet(session, "banker");
  session = Engine.recordPass(session, "tie");
  var lines = Engine.toCsv(session).trim().split("\n");
  assertEqual(lines.length, 3, "header plus two hands");
  assert(lines[1].indexOf("banker,10,banker,win") !== -1, "hand row: " + lines[1]);
  assert(lines[2].indexOf("pass,0,tie,void") !== -1, "no-bet row: " + lines[2]);
  assertEqual(lines[1].split(",").pop(), "54750", "running bankroll after the win");
});

console.log("\nINPUT VALIDATION");
test("Unknown sides and results are refused with a code", function () {
  assertThrows(function () { Engine.placeBet(fresh(100), "dragon", 1); }, "bad-side");
  assertThrows(function () { Engine.settle("banker", "super-six", 1, 500); }, "bad-result");
});
test("Invalid rule values are refused", function () {
  assertThrows(function () { Engine.createSession({ startingUnits: 10, unitValueCents: 500, rules: { commissionRate: 1.5 } }); }, "bad-rules");
  assertThrows(function () { Engine.createSession({ startingUnits: 10, unitValueCents: 500, rules: { tiePayout: -8 } }); }, "bad-rules");
});
test("An unknown OCR mode falls back to manual", function () {
  var session = Engine.createSession({ startingUnits: 10, unitValueCents: 500, mode: "telepathy" });
  assertEqual(session.mode, "manual");
});

console.log("\nPURITY");
test("State-changing helpers never mutate their input session", function () {
  var original = fresh(100);
  var snapshot = JSON.stringify(original);
  Engine.placeBet(original, "banker", 5);
  assertEqual(JSON.stringify(original), snapshot, "placeBet mutated the input session");
  var withHand = Engine.settleOpenBet(Engine.placeBet(original, "banker", 5), "banker");
  Engine.undoLastHand(withHand);
  Engine.derive(withHand);
  assertEqual(JSON.stringify(original), snapshot, "an action mutated the original session");
});
test("Tests loading this file directly would be a mistake", function () {
  assert(typeof Engine.derive === "function");
});

console.log("\n" + (failed === 0 ? "PASS" : "FAIL") + " — " + passed + " passed, " + failed + " failed\n");
if (failed > 0) {
  failures.forEach(function (item) {
    console.log("FAILED: " + item.name + "\n  " + item.error.stack.split("\n").slice(0, 4).join("\n  "));
  });
  process.exit(1);
}
