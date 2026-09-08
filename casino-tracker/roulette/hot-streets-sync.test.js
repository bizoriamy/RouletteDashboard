"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const values = new Map();
const context = {
  console,
  Date,
  localStorage: {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  },
};
context.globalThis = context;
vm.runInNewContext(fs.readFileSync(require.resolve("./hot-streets.js"), "utf8"), context);

const { HotStreets, STREET_STARTS } = context.RouletteHotStreets;
const strategy = new HotStreets();
strategy.prependHistory("1,4,7,10,13,16,19,22,25,28,31,34,1,4,7,10,13,16,19,22,25,28,31,34");
strategy.startObservation(0);
for (let spin = 1; spin <= 12; spin++) strategy.appendSpin(spin, spin);

assert.equal(strategy.getState().phase, "deciding");
const finalStarts = strategy.state.finalStreets.map(index => STREET_STARTS[index]);
strategy.acceptBet();
strategy.appendSpin(finalStarts[0], 13);

const sync = strategy.getSyncData();
assert.equal(sync.cycles.length, 2);
assert.equal(sync.steps.length, 1);
assert.equal(sync.cycles[0].candidates.length, 6);
assert.deepEqual(sync.cycles[0].finalStreets, finalStarts);
assert.equal(sync.cycles[0].status, "Won");
assert.equal(sync.cycles[0].resultSpin, 13);
assert.equal(sync.cycles[1].status, "Observing");
assert.equal(sync.cycles[1].observationStartSpin, 14);
assert.equal(strategy.getState().phase, "observing");
assert.equal(strategy.getState().observationSpin, 0);
assert.equal(sync.steps[0].number, finalStarts[0]);
assert.equal(sync.steps[0].outcome, "Win");
assert.equal(sync.steps[0].handPL, 8);

values.clear();
const burstStrategy = new HotStreets({ progression: [1] });
burstStrategy.prependHistory("1,4,7,10,13,16,19,22,25,28,31,34,1,4,7,10,13,16,19,22,25,28,31,34");
burstStrategy.startObservation(0);
for (let spin = 1; spin <= 12; spin++) burstStrategy.appendSpin(spin, spin);
burstStrategy.acceptBet();
const losingStart = STREET_STARTS.find(start => !burstStrategy.state.finalStreets.includes(STREET_STARTS.indexOf(start)));
burstStrategy.appendSpin(losingStart, 13);
assert.equal(burstStrategy.getState().lastResult, "burst");
assert.equal(burstStrategy.getState().phase, "observing");
assert.equal(burstStrategy.getSyncData().cycles[0].status, "Burst");
assert.equal(burstStrategy.getSyncData().cycles[1].observationStartSpin, 14);

strategy.reset();
assert.equal(strategy.history.length, 0);
assert.equal(strategy.getSyncData().cycles.length, 0);

console.log("4-Street sync tests passed.");
