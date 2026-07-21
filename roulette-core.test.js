const assert = require("node:assert/strict");
const { RouletteEngine, classify, classifyTwelve } = require("./roulette-core.js");

assert.deepEqual(classify(0), []);
assert.deepEqual(classify(14), ["low", "even", "red"]);
assert.deepEqual(classify(31), ["high", "odd", "black"]);
assert.deepEqual(classifyTwelve(0), []);
assert.deepEqual(classifyTwelve(14), ["dozen2", "column2"]);
assert.throws(() => new RouletteEngine().addSpin(37));

const engine = new RouletteEngine({ startingBankroll: 1000, evenSystem: "martingale" });
[2, 4, 0, 6].forEach((n) => engine.addSpin(n));
assert.equal(engine.getState().trackers.odd.status, "triggered");
engine.startBet("odd");
assert.throws(() => engine.startBet("even"));
engine.addSpin(8);
assert.equal(engine.getState().activeSessions[0].stage, 1);
assert.equal(engine.getState().activeSessions[0].stake, 2);
engine.addSpin(17);
assert.equal(engine.getState().activeSessions.length, 0);
assert.equal(engine.getState().realizedPL, 1);
assert.equal(engine.getState().pendingResults[0].reason, "won");
engine.acknowledgeResult(engine.getState().pendingResults[0].id);
assert.equal(engine.getState().pendingResults.length, 0);
engine.undoLastSpin();
assert.equal(engine.getState().activeSessions[0].stage, 1);
assert.equal(engine.getState().realizedPL, 0);

const ignored = new RouletteEngine();
[2, 4, 6, 8].forEach((n) => ignored.addSpin(n));
ignored.ignore("odd");
assert.equal(ignored.getState().trackers.odd.status, "ignored");
ignored.resume("odd");
assert.equal(ignored.getState().trackers.odd.status, "triggered");
ignored.startBet("odd");
assert.equal(ignored.getState().trackers.odd.status, "active");

const concurrent = new RouletteEngine({ evenSystem: "martingale" });
[0, 0, 0, 0].forEach((n) => concurrent.addSpin(n));
concurrent.startBet("low"); concurrent.startBet("odd"); concurrent.startBet("red");
assert.equal(concurrent.getState().activeSessions.length, 3);
assert.throws(() => concurrent.startBet("high"));
concurrent.addSpin(14);
assert.equal(concurrent.getState().activeSessions.map((s) => s.side).join(","), "odd");

const burst = new RouletteEngine({ evenSystem: "martingale" });
[2, 4, 6, 8].forEach((n) => burst.addSpin(n));
burst.startBet("odd");
[2, 4, 6, 8, 10, 12, 14, 16].forEach((n) => burst.addSpin(n));
assert.equal(burst.getState().pendingResults[0].reason, "max-stage-loss");
assert.equal(burst.getState().pendingResults[0].pl, -255);
assert.equal(burst.getState().activeSessions.length, 0);

const restored = RouletteEngine.fromSnapshot(burst.exportSnapshot());
assert.deepEqual(restored.getState(), burst.getState());
assert.throws(() => RouletteEngine.fromSnapshot({ version: 99 }));

const legacySnapshotEngine = new RouletteEngine({ evenSystem: "martingale" });
[2, 4, 6, 8].forEach((n) => legacySnapshotEngine.addSpin(n));
legacySnapshotEngine.startBet("odd");
legacySnapshotEngine.addSpin(2);
const legacySnapshot = legacySnapshotEngine.exportSnapshot();
delete legacySnapshot.config.evenSystem;
legacySnapshot.events.filter((event) => event.type === "start").forEach((event) => delete event.system);
const legacyRestored = RouletteEngine.fromSnapshot(legacySnapshot);
assert.equal(legacyRestored.getState().activeSessions[0].system, "martingale");
assert.equal(legacyRestored.getState().activeSessions[0].stake, 2);
assert.equal(legacyRestored.getState().config.evenSystem, "two-win");

restored.setThreshold("odd", 6);
restored.resetSession();
assert.equal(restored.getState().spinCount, 0);
assert.equal(restored.getState().completedSessions.length, 0);
assert.equal(restored.getState().trackers.odd.threshold, 6);
assert.equal(restored.exportSnapshot().events.length, 0);

const french = new RouletteEngine({ tableRule: "la-partage", evenSystem: "martingale" });
[2, 4, 6, 8].forEach((n) => french.addSpin(n));
french.startBet("odd");
french.addSpin(0);
assert.equal(french.getState().activeSessions[0].stage, 1);
assert.equal(french.getState().activeSessions[0].stake, 2);
assert.equal(french.getState().activeSessions[0].pl, -0.5);
assert.equal(french.getState().activeSessions[0].outcomes[0], "half-loss");
french.addSpin(17);
assert.equal(french.getState().realizedPL, 1.5);

const frenchFinalZero = new RouletteEngine({ tableRule: "la-partage", evenSystem: "martingale" });
[2, 4, 6, 8].forEach((n) => frenchFinalZero.addSpin(n));
frenchFinalZero.startBet("odd");
[2, 4, 6, 8, 10, 12, 14].forEach((n) => frenchFinalZero.addSpin(n));
frenchFinalZero.addSpin(0);
assert.equal(frenchFinalZero.getState().activeSessions.length, 0);
assert.equal(frenchFinalZero.getState().pendingResults[0].reason, "max-stage-loss");
assert.equal(frenchFinalZero.getState().pendingResults[0].pl, -191);
assert.equal(frenchFinalZero.getState().pendingResults[0].outcomes.at(-1), "half-loss");

const standardZero = new RouletteEngine({ evenSystem: "martingale" });
[2, 4, 6, 8].forEach((n) => standardZero.addSpin(n));
standardZero.startBet("odd");
standardZero.addSpin(0);
assert.equal(standardZero.getState().activeSessions[0].stage, 1);

const twoWin = new RouletteEngine();
[2, 4, 6, 8].forEach((n) => twoWin.addSpin(n));
twoWin.startBet("odd");
assert.equal(twoWin.getState().activeSessions[0].system, "two-win");
assert.equal(twoWin.getState().activeSessions[0].stake, 1);
assert.equal(twoWin.getState().exposure, 8);
twoWin.addSpin(17);
assert.equal(twoWin.getState().activeSessions[0].winStreak, 1);
assert.equal(twoWin.getState().activeSessions[0].stake, 2);
twoWin.addSpin(2);
assert.equal(twoWin.getState().activeSessions[0].winStreak, 0);
assert.equal(twoWin.getState().activeSessions[0].stake, 1);
twoWin.addSpin(19);
twoWin.addSpin(21);
assert.equal(twoWin.getState().activeSessions.length, 0);
assert.equal(twoWin.getState().completedSessions[0].reason, "target-reached");
assert.equal(twoWin.getState().completedSessions[0].pl, 2);

const twoWinStopped = new RouletteEngine();
[2, 4, 6, 8].forEach((n) => twoWinStopped.addSpin(n));
twoWinStopped.startBet("odd");
[2, 4, 6, 8, 10, 12, 14, 16].forEach((n) => twoWinStopped.addSpin(n));
assert.equal(twoWinStopped.getState().activeSessions.length, 0);
assert.equal(twoWinStopped.getState().pendingResults[0].reason, "max-bets-stopped");
assert.equal(twoWinStopped.getState().pendingResults[0].pl, -8);
assert.equal(twoWinStopped.getState().pendingResults[0].stakes.every((stake) => stake === 1), true);

const twoWinFrench = new RouletteEngine({ tableRule: "la-partage" });
[2, 4, 6, 8].forEach((n) => twoWinFrench.addSpin(n));
twoWinFrench.startBet("odd");
twoWinFrench.addSpin(17);
twoWinFrench.addSpin(0);
assert.equal(twoWinFrench.getState().activeSessions[0].pl, 0);
assert.equal(twoWinFrench.getState().activeSessions[0].winStreak, 0);
assert.equal(twoWinFrench.getState().activeSessions[0].stake, 1);
assert.equal(twoWinFrench.getState().activeSessions[0].outcomes.at(-1), "half-loss");

const dealer = new RouletteEngine();
dealer.addSpin(1);
dealer.markDealerChange();
assert.equal(dealer.getState().dealerChanges[0].dealer, 2);
assert.equal(dealer.getState().dealerChanges[0].afterSpin, 1);

const fibonacci = new RouletteEngine({ twelveStartingBankroll: 500, twelveBaseUnit: 2 });
[0, 0, 0, 0, 0, 0].forEach((n) => fibonacci.addSpin(n));
assert.equal(fibonacci.getState().twelveTrackers.column1.status, "triggered");
fibonacci.startTwelveBet("column1");
fibonacci.startTwelveBet("column2");
assert.throws(() => fibonacci.startTwelveBet("column3"));
fibonacci.addSpin(1);
assert.equal(fibonacci.getState().completedFibSessions[0].side, "column1");
assert.equal(fibonacci.getState().completedFibSessions[0].pl, 4);
assert.equal(fibonacci.getState().activeFibSessions[0].side, "column2");
assert.equal(fibonacci.getState().activeFibSessions[0].stage, 1);
assert.equal(fibonacci.getState().activeFibSessions[0].stake, 2);
assert.equal(fibonacci.getState().fibBankroll, 502);

const fibBurst = new RouletteEngine({ twelveStartingBankroll: 200 });
[0, 0, 0, 0, 0, 0].forEach((n) => fibBurst.addSpin(n));
fibBurst.startTwelveBet("dozen1");
[25, 25, 25, 25, 25, 25, 25, 25].forEach((n) => fibBurst.addSpin(n));
assert.equal(fibBurst.getState().completedFibSessions[0].reason, "max-stage-loss");
assert.equal(fibBurst.getState().completedFibSessions[0].pl, -54);
assert.equal(fibBurst.getState().fibBankroll, 146);

console.log("roulette-core tests passed");
