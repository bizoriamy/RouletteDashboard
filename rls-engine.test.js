const assert = require("assert");
const { RLSEngine, classify, parseSequence } = require("./rls-engine.js");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

console.log("RLS Engine Tests\n");

// ── parseSequence ──
console.log("parseSequence");
test("parses comma-separated string", () => {
  assert.deepStrictEqual(parseSequence("4,3,2,1"), [4, 3, 2, 1]);
});
test("parses array of numbers", () => {
  assert.deepStrictEqual(parseSequence([10, 20, 30]), [10, 20, 30]);
});
test("rejects empty sequence", () => {
  assert.throws(() => parseSequence([]), /at least one/);
});
test("rejects non-positive numbers", () => {
  assert.throws(() => parseSequence([1, -2, 3]), /positive/);
});

// ── classify ──
console.log("\nclassify");
test("0 returns empty", () => {
  assert.deepStrictEqual(classify(0), []);
});
test("red numbers", () => {
  assert.ok(classify(1).includes("red"));
  assert.ok(classify(18).includes("red"));
});
test("black numbers", () => {
  assert.ok(classify(2).includes("black"));
});

// ── Engine defaults ──
console.log("\nRLSEngine defaults");
test("default config values", () => {
  const engine = new RLSEngine();
  const state = engine.getState();
  assert.strictEqual(state.config.side, "red");
  assert.strictEqual(state.config.mode, "fixed");
  assert.strictEqual(state.config.baseUnit, 1);
  assert.strictEqual(state.config.profitMultiplier, 1);
  assert.strictEqual(state.session, null);
});

// ── Session start/stop ──
console.log("\nSession lifecycle");
test("start session creates active session", () => {
  const engine = new RLSEngine({ sequence: [2, 2, 1, 1] });
  engine.startSession();
  const state = engine.getState();
  assert.strictEqual(state.session.status, "active");
  assert.deepStrictEqual(state.session.sequence, [2, 2, 1, 1]);
  assert.strictEqual(state.session.lossBudget, 6);
});

test("cannot start two sessions", () => {
  const engine = new RLSEngine({ sequence: [2, 2] });
  engine.startSession();
  assert.throws(() => engine.startSession(), /already active/);
});

test("stop session manually", () => {
  const engine = new RLSEngine({ sequence: [2, 2] });
  engine.startSession();
  engine.stopSession("manual");
  const state = engine.getState();
  assert.strictEqual(state.session, null);
  assert.strictEqual(state.history.length, 1);
  assert.strictEqual(state.history[0].stopReason, "manual");
});

// ── Win/loss mechanics ──
console.log("\nWin/loss mechanics");
test("win adds bet amount (in U) to end of sequence", () => {
  const engine = new RLSEngine({ sequence: [2, 2, 1, 1], baseUnit: 1, side: "red" });
  engine.startSession();
  engine.applySpin(1); // red → win
  const state = engine.getState();
  assert.deepStrictEqual(state.session.sequence, [2, 2, 1, 1, 3]);
  assert.strictEqual(state.session.pl, 3);
});

test("loss crosses off first and last", () => {
  const engine = new RLSEngine({ sequence: [4, 3, 2, 1, 3, 3, 6, 4], baseUnit: 1, side: "red" });
  engine.startSession();
  engine.applySpin(2); // black → loss
  const state = engine.getState();
  assert.deepStrictEqual(state.session.sequence, [3, 2, 1, 3, 3, 6]);
  assert.strictEqual(state.session.pl, -8);
});

test("la-partage on zero: half P/L but still strikes off 2 numbers", () => {
  const engine = new RLSEngine({ sequence: [3, 2, 1], baseUnit: 1, side: "red", laPartage: true });
  engine.startSession();
  engine.applySpin(0); // bet = (3+1)*1 = 4, half loss = 2, sequence strikes off first+last
  const state = engine.getState();
  assert.deepStrictEqual(state.session.sequence, [2]); // [3,2,1] → [2]
  assert.strictEqual(state.session.pl, -2);
});

test("loss with single element empties sequence", () => {
  const engine = new RLSEngine({ sequence: [5], baseUnit: 1, side: "red" });
  engine.startSession();
  engine.applySpin(2);
  const state = engine.getState();
  assert.strictEqual(state.session, null);
  assert.strictEqual(state.history[0].stopReason, "loss-limit");
});

test("la-partage on zero with single element empties sequence", () => {
  const engine = new RLSEngine({ sequence: [5], baseUnit: 1, side: "red", laPartage: true });
  engine.startSession();
  engine.applySpin(0); // bet = 5, half loss = 2.5, sequence empties
  const state = engine.getState();
  assert.strictEqual(state.session, null);
  assert.strictEqual(state.history[0].stopReason, "loss-limit");
  assert.strictEqual(state.history[0].pl, -2.5);
});

// ── Stop conditions ──
console.log("\nStop conditions");
test("loss-limit: sequence empty → stop", () => {
  const engine = new RLSEngine({ sequence: [1, 1], baseUnit: 1, side: "red" });
  engine.startSession();
  engine.applySpin(2); // loss → seq empty
  const state = engine.getState();
  assert.strictEqual(state.session, null);
  assert.strictEqual(state.history[0].stopReason, "loss-limit");
});

test("profit-target hit", () => {
  const engine = new RLSEngine({ sequence: [2, 2], baseUnit: 1, side: "red", profitMultiplier: 1 });
  engine.startSession();
  engine.applySpin(1); // win +4 → P/L = 4 ≥ budget 4
  const state = engine.getState();
  assert.strictEqual(state.session, null);
  assert.strictEqual(state.history[0].stopReason, "profit-target");
});

test("profit-target with 0.5x", () => {
  const engine = new RLSEngine({ sequence: [3, 3, 2, 2], baseUnit: 1, side: "red", profitMultiplier: 0.5 });
  engine.startSession();
  engine.applySpin(1); // win +5 → P/L = 5 ≥ budget 10 × 0.5
  const state = engine.getState();
  assert.strictEqual(state.session, null);
  assert.strictEqual(state.history[0].stopReason, "profit-target");
});

test("no profit target when null", () => {
  const engine = new RLSEngine({ sequence: [2, 2], baseUnit: 1, side: "red", profitMultiplier: null });
  engine.startSession();
  engine.applySpin(1); // win +4
  const state = engine.getState();
  assert.strictEqual(state.session.status, "active");
});

// ── SUBSEQUENT ROUNDS (the bug fix) ──
console.log("\nSubsequent rounds (regression)");
test("start after auto-stop works", () => {
  const engine = new RLSEngine({ sequence: [1, 1], baseUnit: 1, side: "red", profitMultiplier: null });
  engine.startSession();
  engine.applySpin(2); // loss → seq empty → auto-stop
  let state = engine.getState();
  assert.strictEqual(state.session, null);
  assert.strictEqual(state.history.length, 1);

  // Start second session
  engine.startSession();
  state = engine.getState();
  assert.strictEqual(state.session.status, "active");
  assert.deepStrictEqual(state.session.sequence, [1, 1]);
  assert.strictEqual(state.history.length, 1); // only old session in history
});

test("multiple rounds", () => {
  const engine = new RLSEngine({ sequence: [1, 1], baseUnit: 1, side: "red", profitMultiplier: null });
  // Round 1
  engine.startSession();
  engine.applySpin(2); // loss → auto-stop
  // Round 2
  engine.startSession();
  engine.applySpin(2); // loss → auto-stop
  // Round 3
  engine.startSession();
  engine.applySpin(1); // win
  let state = engine.getState();
  assert.strictEqual(state.session.status, "active");
  assert.strictEqual(state.history.length, 2);
  engine.stopSession("manual");
  state = engine.getState();
  assert.strictEqual(state.history.length, 3);
});

test("multiple rounds with profit target", () => {
  const engine = new RLSEngine({ sequence: [2, 2], baseUnit: 1, side: "red", profitMultiplier: 1 });
  // Round 1: win → profit target
  engine.startSession();
  engine.applySpin(1); // win +4 → target hit
  let state = engine.getState();
  assert.strictEqual(state.session, null);
  assert.strictEqual(state.history[0].stopReason, "profit-target");

  // Round 2: should start fresh
  engine.startSession();
  state = engine.getState();
  assert.strictEqual(state.session.status, "active");
  assert.deepStrictEqual(state.session.sequence, [2, 2]);
  assert.strictEqual(state.session.pl, 0);
});

// ── Follow/Against modes ──
console.log("\nBet side modes");
test("follow mode: bets same side as last winner", () => {
  const engine = new RLSEngine({ sequence: [5, 5, 5, 5, 5, 5], baseUnit: 1, side: "red", mode: "follow" });
  engine.startSession();
  // First spin: 1 (red) → follow means resolve to red for next bet
  engine.applySpin(1); // red → win +10
  let state = engine.getState();
  assert.strictEqual(state.session.resolvedSide, "red");
  assert.strictEqual(state.session.pl, 10);
});

test("against mode: bets opposite of last winner", () => {
  const engine = new RLSEngine({ sequence: [5, 5, 5, 5, 5, 5], baseUnit: 1, side: "red", mode: "against" });
  engine.startSession();
  // First spin: 1 (red) → against means resolve to black for next bet
  engine.applySpin(1); // red → first spin uses configured side (red) → win
  let state = engine.getState();
  assert.strictEqual(state.session.resolvedSide, "black");
});

test("fixed mode: always bets configured side", () => {
  const engine = new RLSEngine({ sequence: [5, 5, 5, 5, 5, 5], baseUnit: 1, side: "red", mode: "fixed" });
  engine.startSession();
  engine.applySpin(1); // red → win
  let state = engine.getState();
  assert.strictEqual(state.session.resolvedSide, "red");
  // After a black spin, still resolves to red
  engine.applySpin(2); // black → loss
  state = engine.getState();
  assert.strictEqual(state.session.resolvedSide, "red");
});

test("random mode: pre-resolved side used for bet, new random for next", () => {
  const engine = new RLSEngine({ sequence: [5, 5, 5, 5, 5, 5], baseUnit: 1, side: "red", mode: "random" });
  engine.startSession();
  // First spin uses config side "red" (no prior pre-resolve)
  // Mock Math.random for the pre-resolve AFTER the spin → 0.5 → index 3 → "high"
  const origRandom = Math.random;
  Math.random = () => 0.5;
  engine.applySpin(7); // 7 is red → WIN on "red", bet = (5+5)*1 = 10
  Math.random = origRandom;
  let state = engine.getState();
  assert.strictEqual(state.session.resolvedSide, "high"); // pre-resolved for NEXT spin
  assert.strictEqual(state.session.pl, 10);
});

test("random mode: each spin uses pre-resolved side from previous", () => {
  const engine = new RLSEngine({ sequence: [5, 5, 5, 5, 5, 5], baseUnit: 1, side: "red", mode: "random" });
  engine.startSession();
  const origRandom = Math.random;
  // Spin 1: uses config side "red", pre-resolve → 0.1 → index 0 → "low"
  Math.random = () => 0.1;
  engine.applySpin(7); // 7 is red → WIN, bet = 10, pl = 10
  let state = engine.getState();
  assert.strictEqual(state.session.resolvedSide, "low");
  assert.strictEqual(state.session.pl, 10);
  // Spin 2: uses pre-resolved "low", pre-resolve → 0.8 → index 4 → "black"
  Math.random = () => 0.8;
  engine.applySpin(2); // 2 is low → WIN on "low", bet = 5+10 = 15, pl = 25
  Math.random = origRandom;
  state = engine.getState();
  assert.strictEqual(state.session.resolvedSide, "black");
  assert.strictEqual(state.session.pl, 25);
});

test("random mode: snapshot round-trip preserves sequence and P/L", () => {
  const engine = new RLSEngine({ sequence: [5, 5, 5, 5, 5, 5], baseUnit: 1, side: "red", mode: "random" });
  engine.startSession();
  const origRandom = Math.random;
  Math.random = () => 0.5; // pre-resolve → "high" for next spin
  engine.applySpin(7); // 7 is red → win on config side "red"
  Math.random = origRandom;
  const snapshot = engine.exportSnapshot();
  const engine2 = RLSEngine.fromSnapshot(snapshot);
  const s1 = engine.getState();
  const s2 = engine2.getState();
  // resolvedSide may differ (pre-resolved randomly after each spin)
  assert.deepStrictEqual(s1.session.sequence, s2.session.sequence);
  assert.strictEqual(s1.session.pl, s2.session.pl);
  assert.strictEqual(s1.session.spins.length, s2.session.spins.length);
});

test("random mode: outcome is deterministic across rebuilds (regression)", () => {
  // Bug: a fresh Math.random roll on every rebuild changed past win/loss outcomes,
  // so the sequence grew/shrunk unpredictably. The actual side used must be
  // recorded in the event so rebuilds reproduce identical results.
  const engine = new RLSEngine({ sequence: [5, 5, 5, 5, 5, 5], baseUnit: 1, side: "red", mode: "random" });
  engine.startSession();
  const origRandom = Math.random;
  Math.random = () => 0.5; // pre-resolve for next spin
  engine.applySpin(7); // 7 is red → win on "red"
  Math.random = origRandom;
  const snapshot = engine.exportSnapshot();
  // Rebuild twice, independently, with different Math.random afterward
  const a = RLSEngine.fromSnapshot(snapshot);
  Math.random = () => 0.9;
  const b = RLSEngine.fromSnapshot(snapshot);
  Math.random = origRandom;
  const sa = a.getState().session;
  const sb = b.getState().session;
  assert.deepStrictEqual(sa.sequence, sb.sequence);
  assert.strictEqual(sa.pl, sb.pl);
  assert.strictEqual(sa.spins[0].won, sb.spins[0].won);
  assert.strictEqual(sa.spins[0].effectiveSide, sb.spins[0].effectiveSide);
});

// ── Undo ──
console.log("\nUndo");
test("undo removes last spin", () => {
  const engine = new RLSEngine({ sequence: [4, 3, 2, 1], baseUnit: 1, side: "red" });
  engine.startSession();
  engine.applySpin(1); // win
  let state = engine.getState();
  assert.strictEqual(state.session.spins.length, 1);
  engine.undoLastSpin();
  state = engine.getState();
  assert.strictEqual(state.session.spins.length, 0);
  assert.deepStrictEqual(state.session.sequence, [4, 3, 2, 1]);
  assert.strictEqual(state.session.pl, 0);
});

// ── Multi-step ──
console.log("\nMulti-step scenario");
test("loss then win then loss", () => {
  const engine = new RLSEngine({ sequence: [4, 3, 2, 1, 3, 3, 6, 4], baseUnit: 1, side: "red" });
  engine.startSession();
  engine.applySpin(2);  // black → loss -8
  let state = engine.getState();
  assert.deepStrictEqual(state.session.sequence, [3, 2, 1, 3, 3, 6]);
  assert.strictEqual(state.session.pl, -8);

  engine.applySpin(1);  // red → win +9
  state = engine.getState();
  assert.deepStrictEqual(state.session.sequence, [3, 2, 1, 3, 3, 6, 9]);
  assert.strictEqual(state.session.pl, 1);

  engine.applySpin(2);  // black → loss -12
  state = engine.getState();
  assert.deepStrictEqual(state.session.sequence, [2, 1, 3, 3, 6]);
  assert.strictEqual(state.session.pl, -11);
});

// ── setConfig ──
console.log("\nsetConfig");
test("change mode", () => {
  const engine = new RLSEngine({ sequence: [2, 2] });
  engine.setConfig("mode", "follow");
  assert.strictEqual(engine.getState().config.mode, "follow");
});
test("cannot change config while active", () => {
  const engine = new RLSEngine({ sequence: [2, 2] });
  engine.startSession();
  assert.throws(() => engine.setConfig("mode", "against"), /active/);
});

// ── Snapshot round-trip ──
console.log("\nSnapshot round-trip");
test("export and import snapshot", () => {
  const engine = new RLSEngine({ sequence: [3, 2, 1], baseUnit: 0.5, side: "black", mode: "follow" });
  engine.startSession();
  engine.applySpin(1); // win
  const snapshot = engine.exportSnapshot();
  assert.strictEqual(snapshot.version, 2);
  const engine2 = RLSEngine.fromSnapshot(snapshot);
  const s1 = engine.getState();
  const s2 = engine2.getState();
  assert.deepStrictEqual(s1.session.sequence, s2.session.sequence);
  assert.strictEqual(s1.session.pl, s2.session.pl);
  assert.strictEqual(s1.config.side, s2.config.side);
  assert.strictEqual(s1.config.mode, s2.config.mode);
});

test("v1 snapshot rejected", () => {
  assert.throws(() => RLSEngine.fromSnapshot({ version: 1, config: {}, events: [] }), /damaged/);
});

// ── funds-exhausted uses bankroll, not loss budget ──
console.log("\nfunds-exhausted check");
test("session continues with large bankroll when lossBudget depleted (user bug repro)", () => {
  // User's exact config: seq [1,3,2,4,2,3], unit 0.1, bankroll 100, profitTarget 1x
  // Path: W(1), L(2), L(2), L(2) → seq [4], pl=-1.1
  // Old: bankrollLeft = 1.5 + (-1.1) = 0.3999... < 0.4 → funds-exhausted!
  // Fixed: bankrollLeft = 100 + (-1.1) = 98.9 ≥ 0.4 → continues
  const engine = new RLSEngine({
    sequence: [1, 3, 2, 4, 2, 3], baseUnit: 0.1, side: "red",
    startingBankroll: 100, profitMultiplier: 1, laPartage: true,
  });
  engine.startSession();
  engine.applySpin(1);  // W(1): [1,3,2,4,2,3] → [1,3,2,4,2,3,4], pl=0.4
  engine.applySpin(2);  // L(2): → [3,2,4,2,3], pl=-0.1
  engine.applySpin(2);  // L(2): → [2,4,2], pl=-0.7
  engine.applySpin(2);  // L(2): → [4], pl=-1.1
  const s = engine.getState();
  assert.strictEqual(s.session.status, "active");
  assert.deepStrictEqual(s.session.sequence, [4]);
});

test("session stops when bankroll is truly too small", () => {
  // Same path but bankroll=1 → bankrollLeft = 1+(-1.1)=-0.1 < 0.4 → stops
  const engine = new RLSEngine({
    sequence: [1, 3, 2, 4, 2, 3], baseUnit: 0.1, side: "red",
    startingBankroll: 1, profitMultiplier: 1, laPartage: true,
  });
  engine.startSession();
  engine.applySpin(1);
  engine.applySpin(2);
  engine.applySpin(2);
  engine.applySpin(2);
  const s = engine.getState();
  assert.strictEqual(s.session, null);
  assert.strictEqual(s.history.length, 1);
  assert.strictEqual(s.history[0].stopReason, "funds-exhausted");
});

test("snapshot preserves startingBankroll", () => {
  const engine = new RLSEngine({
    sequence: [2, 2], baseUnit: 1, side: "red", startingBankroll: 50, profitMultiplier: null,
  });
  engine.startSession();
  engine.applySpin(1); // win
  const snapshot = engine.exportSnapshot();
  const engine2 = RLSEngine.fromSnapshot(snapshot);
  const s = engine2.getState();
  assert.strictEqual(s.session.startingBankroll, 50);
  assert.strictEqual(s.session.status, "active");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
