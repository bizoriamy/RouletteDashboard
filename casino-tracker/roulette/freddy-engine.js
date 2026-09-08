(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RouletteFreddy = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TRIANGLE = [
    [1], [2], [3], [5, 3], [8, 5], [12, 8], [17, 12, 8],
    [23, 17, 12], [30, 23, 17, 12], [38, 30, 23, 17],
    [47, 38, 30, 23, 17], [57, 47, 38, 30, 23],
    [68, 57, 47, 38, 30, 23], [80, 68, 57, 47, 38, 30],
    [93, 80, 68, 57, 47, 38, 30], [107, 93, 80, 68, 57, 47, 38],
    [122, 107, 93, 80, 68, 57, 47, 38], [138, 122, 107, 93, 80, 68, 57, 47],
    [155, 138, 122, 107, 93, 80, 68, 57, 47], [173, 155, 138, 122, 107, 93, 80, 68, 57],
    [192, 173, 155, 138, 122, 107, 93, 80, 68, 57]
  ];
  const SIDES = ["red", "black", "odd", "even", "high", "low", "dozen1", "dozen2", "dozen3", "column1", "column2", "column3"];
  const LABELS = { red:"Red", black:"Black", odd:"Odd", even:"Even", high:"High", low:"Low", dozen1:"1st Dozen", dozen2:"2nd Dozen", dozen3:"3rd Dozen", column1:"Column 1", column2:"Column 2", column3:"Column 3" };
  const OPPOSITES = { red:"black", black:"red", odd:"even", even:"odd", high:"low", low:"high" };
  const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  const STORAGE_KEY = "roulette-freddy-v1";
  const DEFAULT_CONFIG = Object.freeze({
    startingBankroll: 300,
    baseUnit: 1,
    cycleTarget: 5,
    lossLimit: 100,
    maxLevel: 12,
    tableRule: "la-partage",
    maxActive: 7,
    maxEven: 3,
    maxDozens: 2,
    maxColumns: 2
  });

  const clone = value => JSON.parse(JSON.stringify(value));
  const half = value => {
    const scaled = Math.round(Number(value) * 2);
    if (!Number.isFinite(scaled)) throw new Error("Amount must be a number.");
    return scaled;
  };
  const units = value => value / 2;
  const groupOf = side => side.startsWith("dozen") ? "dozen" : side.startsWith("column") ? "column" : "even";
  const isTwelve = side => groupOf(side) !== "even";

  function validateSpin(number) {
    if (!Number.isInteger(number) || number < 0 || number > 36) throw new RangeError("Spin must be an integer from 0 to 36.");
    return number;
  }

  function wins(side, number) {
    validateSpin(number);
    if (number === 0) return false;
    if (side === "red") return RED.has(number);
    if (side === "black") return !RED.has(number);
    if (side === "odd") return number % 2 === 1;
    if (side === "even") return number % 2 === 0;
    if (side === "low") return number <= 18;
    if (side === "high") return number >= 19;
    if (side.startsWith("dozen")) return Math.ceil(number / 12) === Number(side.slice(-1));
    if (side.startsWith("column")) return ((number - 1) % 3) + 1 === Number(side.slice(-1));
    throw new Error("Unknown Freddy selection.");
  }

  function normalizeConfig(input = {}) {
    const config = { ...DEFAULT_CONFIG, ...input };
    config.startingBankroll = units(half(config.startingBankroll));
    config.baseUnit = Math.max(0.01, Number(config.baseUnit) || 1);
    config.cycleTarget = Math.max(0.5, units(half(config.cycleTarget)));
    config.lossLimit = Math.max(0.5, units(half(config.lossLimit)));
    config.maxLevel = Math.max(1, Math.min(TRIANGLE.length, Math.trunc(Number(config.maxLevel) || 12)));
    config.tableRule = config.tableRule === "standard" ? "standard" : "la-partage";
    // Slot limits are part of the application layout, not user settings.
    // Force the current limits so older saved snapshots upgrade automatically.
    config.maxActive = 7;
    config.maxEven = 3;
    config.maxDozens = 2;
    config.maxColumns = 2;
    return config;
  }

  function newTracker(side, config, spinIndex) {
    return {
      id: `${side}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      side, label: LABELS[side], group: groupOf(side), config: clone(config),
      startedAfterSpin: spinIndex, status: "active", levelIndex: 0, positionIndex: 0, direction: "ltr",
      balanceHalf: half(config.startingBankroll), cycleProfitHalf: 0, sessionProfitHalf: 0,
      peakBalanceHalf: half(config.startingBankroll), maxDrawdownHalf: 0, completedCycles: 0,
      wins: 0, fullLosses: 0, halfLosses: 0, zeros: 0, highestLevel: 1, largestStake: 0,
      totalWagered: 0, stopReason: "", endedAfterSpin: null, ledger: []
      , consecutiveFullLosses: 0, paused: false, pauseReason: "", safetyCheckpoints: 0,
      lastSafetyAction: "", safetyDecisions: []
    };
  }

  function moveAfterWin(tracker) {
    const row = TRIANGLE[tracker.levelIndex];
    let nextLevel;
    if (row.length === 1) {
      nextLevel = tracker.levelIndex + 1;
      if (nextLevel >= tracker.config.maxLevel) return false;
      tracker.levelIndex = nextLevel;
      if (tracker.direction === "ltr") {
        tracker.positionIndex = TRIANGLE[nextLevel].length - 1;
        tracker.direction = "rtl";
      } else {
        tracker.positionIndex = 0;
        tracker.direction = "ltr";
      }
      return true;
    }
    if (tracker.direction === "ltr" && tracker.positionIndex < row.length - 1) {
      tracker.positionIndex += 1;
      return true;
    }
    if (tracker.direction === "rtl" && tracker.positionIndex > 0) {
      tracker.positionIndex -= 1;
      return true;
    }
    nextLevel = tracker.levelIndex + 1;
    if (nextLevel >= tracker.config.maxLevel) return false;
    tracker.levelIndex = nextLevel;
    if (tracker.direction === "ltr") {
      tracker.positionIndex = TRIANGLE[nextLevel].length - 1;
      tracker.direction = "rtl";
    } else {
      tracker.positionIndex = 0;
      tracker.direction = "ltr";
    }
    return true;
  }

  function moveAfterLoss(tracker) {
    const nextLevel = tracker.levelIndex + 1;
    if (nextLevel >= tracker.config.maxLevel) return false;
    tracker.levelIndex = nextLevel;
    tracker.positionIndex = 0;
    tracker.direction = "ltr";
    return true;
  }

  function settleTracker(tracker, number, spinIndex, at) {
    if (tracker.paused) return null;
    const value = TRIANGLE[tracker.levelIndex][tracker.positionIndex];
    const stakeHalf = value * 2;
    if (stakeHalf > tracker.balanceHalf) {
      tracker.status = "stopped"; tracker.stopReason = "insufficient-bankroll"; tracker.endedAfterSpin = spinIndex - 1;
      return null;
    }
    const before = {
      level: tracker.levelIndex, position: tracker.positionIndex, direction: tracker.direction,
      balanceHalf: tracker.balanceHalf, cycleProfitHalf: tracker.cycleProfitHalf
    };
    const twelve = isTwelve(tracker.side);
    const result = wins(tracker.side, number) ? "win"
      : (!twelve && number === 0 && tracker.config.tableRule === "la-partage") ? "half-loss" : "full-loss";
    const deltaHalf = result === "win" ? stakeHalf * (twelve ? 2 : 1) : result === "half-loss" ? -(stakeHalf / 2) : -stakeHalf;
    tracker.balanceHalf += deltaHalf;
    tracker.sessionProfitHalf += deltaHalf;
    tracker.cycleProfitHalf += deltaHalf;
    tracker.totalWagered += value;
    tracker.largestStake = Math.max(tracker.largestStake, value);
    if (number === 0) tracker.zeros += 1;
    if (result === "win") tracker.wins += 1;
    else if (result === "half-loss") tracker.halfLosses += 1;
    else tracker.fullLosses += 1;
    tracker.consecutiveFullLosses = result === "full-loss"
      ? Number(tracker.consecutiveFullLosses || 0) + 1
      : 0;
    tracker.peakBalanceHalf = Math.max(tracker.peakBalanceHalf, tracker.balanceHalf);
    tracker.maxDrawdownHalf = Math.max(tracker.maxDrawdownHalf, tracker.peakBalanceHalf - tracker.balanceHalf);

    let movement;
    let cycleReset = false;
    if (result === "win" && tracker.cycleProfitHalf >= half(tracker.config.cycleTarget)) {
      tracker.completedCycles += 1; tracker.cycleProfitHalf = 0; tracker.levelIndex = 0; tracker.positionIndex = 0; tracker.direction = "ltr";
      movement = "cycle-reset"; cycleReset = true;
    } else if (result === "win") {
      movement = moveAfterWin(tracker) ? "win-move" : "maximum-level";
    } else if (result === "half-loss") {
      movement = "remain";
    } else {
      movement = moveAfterLoss(tracker) ? "loss-descend" : "maximum-level";
    }
    tracker.highestLevel = Math.max(tracker.highestLevel, tracker.levelIndex + 1);
    if (result === "full-loss" && tracker.consecutiveFullLosses >= 4) {
      tracker.paused = true;
      tracker.pauseReason = "four-consecutive-losses";
      tracker.safetyCheckpoints = Number(tracker.safetyCheckpoints || 0) + 1;
      movement = "safety-pause";
    } else if (movement === "maximum-level") {
      tracker.status = "stopped"; tracker.stopReason = "maximum-level"; tracker.endedAfterSpin = spinIndex;
    } else if (tracker.balanceHalf <= half(tracker.config.startingBankroll - tracker.config.lossLimit)) {
      tracker.status = "stopped"; tracker.stopReason = "loss-limit"; tracker.endedAfterSpin = spinIndex;
    }
    const record = {
      spinIndex, at, number, result, stakeUnits: value, deltaUnits: units(deltaHalf),
      balanceBefore: units(before.balanceHalf), balanceAfter: units(tracker.balanceHalf),
      cycleProfitBefore: units(before.cycleProfitHalf), cycleProfitAfter: units(tracker.cycleProfitHalf),
      levelBefore: before.level + 1, positionBefore: before.position + 1, directionBefore: before.direction,
      levelAfter: tracker.levelIndex + 1, positionAfter: tracker.positionIndex + 1, directionAfter: tracker.direction,
      movement, cycleReset, stopReason: tracker.stopReason
    };
    tracker.ledger.push(record);
    return record;
  }

  class FreddyManager {
    constructor(options = {}, storage = null) {
      this.storage = storage;
      this.config = normalizeConfig(options.config);
      this.inputs = [];
      this.active = {};
      this.completed = [];
      this.previousSession = [];
      this.listeners = new Set();
      if (options.snapshot) this.restore(options.snapshot);
    }

    static load(storage) {
      try {
        const raw = storage?.getItem(STORAGE_KEY);
        return raw ? new FreddyManager({ snapshot: JSON.parse(raw) }, storage) : new FreddyManager({}, storage);
      } catch { return new FreddyManager({}, storage); }
    }

    restore(snapshot) {
      this.config = normalizeConfig(snapshot.config);
      this.inputs = clone(snapshot.inputs || []);
      this.active = clone(snapshot.active || {});
      this.completed = clone(snapshot.completed || []);
      this.previousSession = clone(snapshot.previousSession || []);
      Object.values(this.active).forEach(tracker => {
        tracker.consecutiveFullLosses = Number(tracker.consecutiveFullLosses || 0);
        tracker.paused = Boolean(tracker.paused);
        tracker.pauseReason = tracker.pauseReason || "";
        tracker.safetyCheckpoints = Number(tracker.safetyCheckpoints || 0);
        tracker.lastSafetyAction = tracker.lastSafetyAction || "";
        tracker.safetyDecisions = clone(tracker.safetyDecisions || []);
      });
    }

    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    notify_() {
      this.save();
      const state = this.getState();
      this.listeners.forEach(listener => listener(state));
    }
    save() { try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.exportSnapshot())); return true; } catch { return false; } }
    exportSnapshot() { return clone({ version: 1, config: this.config, inputs: this.inputs, active: this.active, completed: this.completed, previousSession: this.previousSession }); }

    applySettings(settings) { this.config = normalizeConfig({ ...this.config, ...settings }); this.notify_(); }

    start(side) {
      if (!SIDES.includes(side)) throw new Error("Unknown Freddy selection.");
      if (this.active[side]) throw new Error(`${LABELS[side]} is already active.`);
      const active = Object.values(this.active);
      if (active.length >= this.config.maxActive) throw new Error("All seven Freddy slots are in use.");
      if (OPPOSITES[side] && this.active[OPPOSITES[side]]) throw new Error(`Stop ${LABELS[OPPOSITES[side]]} before starting ${LABELS[side]}.`);
      const group = groupOf(side);
      const groupLimit = group === "dozen" ? this.config.maxDozens : group === "column" ? this.config.maxColumns : this.config.maxEven;
      if (active.filter(t => t.group === group).length >= groupLimit) throw new Error(`Only ${groupLimit} ${group} trackers may run together.`);
      this.active[side] = newTracker(side, this.config, this.inputs.length);
      this.notify_();
      return this.active[side];
    }

    stop(side, reason = "manual-stop") {
      const tracker = this.active[side];
      if (!tracker) throw new Error(`${LABELS[side]} is not active.`);
      tracker.status = "stopped"; tracker.stopReason = reason; tracker.endedAfterSpin = this.inputs.length;
      this.completed.push(tracker); delete this.active[side]; this.notify_(); return tracker;
    }

    toggle(side) { return this.active[side] ? this.stop(side) : this.start(side); }

    resolveSafetyPause(side, action) {
      const tracker = this.active[side];
      if (!tracker || !tracker.paused) throw new Error(`${LABELS[side]} has no safety checkpoint waiting.`);
      if (action === "stop") return this.stop(side, "four-loss-safety-stop");
      if (action !== "reset" && action !== "continue") throw new Error("Choose reset, continue, or stop.");
      tracker.paused = false;
      tracker.pauseReason = "";
      tracker.consecutiveFullLosses = 0;
      tracker.lastSafetyAction = action;
      tracker.safetyDecisions = tracker.safetyDecisions || [];
      tracker.safetyDecisions.push({ spinIndex: this.inputs.length, action });
      if (action === "reset") {
        tracker.levelIndex = 0;
        tracker.positionIndex = 0;
        tracker.direction = "ltr";
        tracker.cycleProfitHalf = 0;
      }
      this.notify_();
      return tracker;
    }

    addSpin(number, at = new Date().toISOString()) {
      validateSpin(number);
      this.inputs.push({ number, at });
      const spinIndex = this.inputs.length;
      for (const side of Object.keys(this.active)) {
        const tracker = this.active[side];
        settleTracker(tracker, number, spinIndex, at);
        if (tracker.status === "stopped") { this.completed.push(tracker); delete this.active[side]; }
      }
      this.notify_();
    }

    undoLastSpin() {
      if (!this.inputs.length) return false;
      const snapshot = this.exportSnapshot();
      const starts = [
        ...Object.values(snapshot.active).map(t => ({ side:t.side, start:t.startedAfterSpin, config:t.config, end:null, safetyDecisions:t.safetyDecisions||[] })),
        ...snapshot.completed.map(t => ({ side:t.side, start:t.startedAfterSpin, config:t.config, end:t.endedAfterSpin, reason:t.stopReason, safetyDecisions:t.safetyDecisions||[] }))
      ];
      this.inputs.pop(); this.active = {}; this.completed = [];
      const inputs = clone(this.inputs); this.inputs = [];
      for (let index = 0; index <= inputs.length; index++) {
        starts.filter(s => s.start === index).forEach(s => { this.config = normalizeConfig(s.config); if (!this.active[s.side]) this.active[s.side] = newTracker(s.side, s.config, index); });
        if (index < inputs.length) {
          this.addSpin(inputs[index].number, inputs[index].at);
          starts.forEach(s => (s.safetyDecisions || []).filter(d => d.spinIndex === index + 1).forEach(d => {
            if (this.active[s.side]?.paused) this.resolveSafetyPause(s.side, d.action);
          }));
        }
        starts.filter(s => s.end === index + 1 && s.reason === "manual-stop").forEach(s => { if (this.active[s.side]) this.stop(s.side, s.reason); });
      }
      this.config = normalizeConfig(snapshot.config); this.notify_(); return true;
    }

    resetSession() {
      this.endActive("session-ended");
      if (this.completed.length) this.previousSession = clone(this.completed);
      this.inputs = []; this.active = {}; this.completed = []; this.notify_();
    }

    endActive(reason = "session-ended") {
      Object.keys(this.active).forEach(side => this.stop(side, reason));
    }

    frequencies_() {
      const result = {};
      for (const side of SIDES) {
        let hits = 0, misses = 0, longestMiss = 0;
        for (const spin of this.inputs) {
          if (wins(side, spin.number)) { hits += 1; misses = 0; }
          else { misses += 1; longestMiss = Math.max(longestMiss, misses); }
        }
        result[side] = { hits, misses, longestMiss };
      }
      return result;
    }

    getState() {
      const active = Object.values(this.active).map(t => ({
        ...clone(t), balance: units(t.balanceHalf), sessionProfit: units(t.sessionProfitHalf),
        cycleProfit: units(t.cycleProfitHalf), maxDrawdown: units(t.maxDrawdownHalf),
        currentValue: TRIANGLE[t.levelIndex][t.positionIndex],
        currentMoney: TRIANGLE[t.levelIndex][t.positionIndex] * t.config.baseUnit
      }));
      return {
        config: clone(this.config), spinCount: this.inputs.length, frequencies: this.frequencies_(),
        active, completed: clone(this.completed), previousSession: clone(this.previousSession), totalExposure: active.reduce((sum,t)=>sum+(t.paused?0:t.currentValue),0),
        totalMoneyExposure: active.reduce((sum,t)=>sum+(t.paused?0:t.currentMoney),0)
      };
    }

    getSyncData() {
      const trackers = [...this.completed, ...Object.values(this.active)];
      const steps = [];
      trackers.forEach(tracker => tracker.ledger.forEach((record, index) => steps.push({
        id: `${tracker.id}:S${index + 1}`, trackerId: tracker.id, side: tracker.side,
        ...record, baseUnit: tracker.config.baseUnit
      })));
      return {
        sessions: this.completed.map(tracker => ({
          id: tracker.id, side: tracker.side, startedAfterSpin: tracker.startedAfterSpin,
          endedAfterSpin: tracker.endedAfterSpin, result: units(tracker.sessionProfitHalf),
          finalBankroll: units(tracker.balanceHalf), cycles: tracker.completedCycles,
          highestLevel: tracker.highestLevel, largestStake: tracker.largestStake,
          maxDrawdown: units(tracker.maxDrawdownHalf), stopReason: tracker.stopReason,
          startingBankroll: tracker.config.startingBankroll, baseUnit: tracker.config.baseUnit,
          cycleTarget: tracker.config.cycleTarget, maxLevel: tracker.config.maxLevel,
          tableRule: isTwelve(tracker.side) ? "12-number · 2:1" : tracker.config.tableRule
        })),
        steps
      };
    }

    backtest(numbers, config = this.config) {
      const results = [];
      for (const side of SIDES) {
        const tracker = newTracker(side, normalizeConfig(config), 0);
        for (let i = 0; i < numbers.length && tracker.status === "active"; i++) settleTracker(tracker, validateSpin(Number(numbers[i])), i + 1, "");
        results.push({
          side, label: LABELS[side], spins: tracker.ledger.length, netUnits: units(tracker.sessionProfitHalf),
          finalBankroll: units(tracker.balanceHalf), cycles: tracker.completedCycles, maxDrawdown: units(tracker.maxDrawdownHalf),
          highestLevel: tracker.highestLevel, largestStake: tracker.largestStake, stopReason: tracker.stopReason || tracker.pauseReason || "completed"
        });
      }
      return results.sort((a,b) => b.netUnits - a.netUnits);
    }
  }

  return { FreddyManager, TRIANGLE, SIDES, LABELS, OPPOSITES, STORAGE_KEY, DEFAULT_CONFIG, wins, isTwelve, settleTracker, normalizeConfig };
});
