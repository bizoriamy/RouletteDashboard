const assert = require("assert");
const F = require("./freddy-engine.js");

function manager(config = {}) {
  return new F.FreddyManager({ config: { startingBankroll:300, baseUnit:1, cycleTarget:999, lossLimit:200, maxLevel:12, ...config } });
}

{
  const m = manager(); m.start("red"); m.addSpin(1);
  const t = m.getState().active[0];
  assert.equal(t.sessionProfit, 1);
  assert.equal(t.levelIndex, 1);
  assert.equal(t.positionIndex, 0);
  assert.equal(t.direction, "rtl");
}
{
  const m = manager(); m.start("red"); m.addSpin(2);
  const t = m.getState().active[0];
  assert.equal(t.sessionProfit, -1);
  assert.equal(t.levelIndex, 1);
  assert.equal(t.direction, "ltr");
}
{
  const m = manager({ tableRule:"la-partage" }); m.start("red"); m.addSpin(0);
  const t = m.getState().active[0];
  assert.equal(t.sessionProfit, -0.5);
  assert.equal(t.levelIndex, 0);
  assert.equal(t.positionIndex, 0);
}
{
  const m = manager(); m.start("dozen1"); m.addSpin(12);
  assert.equal(m.getState().active[0].sessionProfit, 2);
}
{
  const m = manager({ cycleTarget:1 }); m.start("red"); m.addSpin(1);
  const t = m.getState().active[0];
  assert.equal(t.completedCycles, 1);
  assert.equal(t.levelIndex, 0);
  assert.equal(t.cycleProfit, 0);
}
{
  const m = manager(); m.start("red");
  assert.throws(() => m.start("black"), /Stop Red/);
  m.start("odd"); m.start("low");
  assert.throws(() => m.start("even"), /Stop Odd/);
  m.start("dozen1"); m.start("dozen2"); m.start("column1"); m.start("column2");
  assert.throws(() => m.start("dozen3"), /seven Freddy slots/);
}
{
  const m = manager(); m.start("dozen1"); m.start("dozen2");
  assert.throws(() => m.start("dozen3"), /Only 2 dozen/);
}
{
  const m = manager(); m.start("red"); m.addSpin(1); m.addSpin(2);
  assert.equal(m.getState().spinCount, 2);
  assert(m.undoLastSpin());
  assert.equal(m.getState().spinCount, 1);
  assert.equal(m.getState().active[0].sessionProfit, 1);
}
{
  const m = manager();
  m.addSpin(1); m.addSpin(2); m.addSpin(3);
  assert.deepEqual(m.getState().frequencies.red, { hits:2, misses:0, longestMiss:1 });
  assert.deepEqual(m.getState().frequencies.even, { hits:1, misses:1, longestMiss:1 });
}
{
  const m = manager(); m.start("column1"); m.addSpin(1); m.stop("column1");
  const sync = m.getSyncData();
  assert.equal(sync.sessions.length, 1);
  assert.equal(sync.steps.length, 1);
  assert.equal(sync.sessions[0].result, 2);
  assert.equal(sync.steps[0].stakeUnits, 1);
}
{
  const m = manager(); m.start("odd"); m.addSpin(1); m.resetSession();
  let state = m.getState();
  assert.equal(state.spinCount, 0);
  assert.equal(state.completed.length, 0);
  assert.equal(state.previousSession.length, 1);
  assert.equal(state.previousSession[0].side, "odd");
  m.resetSession();
  state = m.getState();
  assert.equal(state.previousSession.length, 1, "empty reset preserves last non-empty previous session");
  assert.equal(state.previousSession[0].side, "odd");
  assert.equal(m.getSyncData().sessions.length, 0);
}
{
  const m = manager({ maxLevel:12 }); m.start("red");
  [2, 4, 6, 8].forEach(number => m.addSpin(number));
  let tracker = m.getState().active[0];
  assert.equal(tracker.paused, true);
  assert.equal(tracker.pauseReason, "four-consecutive-losses");
  assert.equal(tracker.consecutiveFullLosses, 4);
  assert.equal(m.getState().totalExposure, 0);
  const ledgerLength = tracker.ledger.length;
  m.addSpin(10);
  assert.equal(m.getState().active[0].ledger.length, ledgerLength);
  m.resolveSafetyPause("red", "reset");
  tracker = m.getState().active[0];
  assert.equal(tracker.paused, false);
  assert.equal(tracker.levelIndex, 0);
  assert.equal(tracker.positionIndex, 0);
  assert.equal(tracker.cycleProfit, 0);
  assert.equal(tracker.sessionProfit, -11);
  m.addSpin(1);
  assert(m.undoLastSpin());
  tracker = m.getState().active[0];
  assert.equal(tracker.paused, false);
  assert.equal(tracker.levelIndex, 0);
}
{
  const m = manager({ tableRule:"la-partage" }); m.start("red");
  [2, 4, 6, 0, 8, 10, 11].forEach(number => m.addSpin(number));
  assert.equal(m.getState().active[0].paused, false);
  assert.equal(m.getState().active[0].consecutiveFullLosses, 3);
}

console.log("Freddy engine tests passed.");
