(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RouletteCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SIDES = ["low", "high", "even", "odd", "red", "black"];
  const PAIRS = { low: "high", high: "low", even: "odd", odd: "even", red: "black", black: "red" };
  const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const DEFAULT_EVEN_PROGRESSION = [1, 2, 4, 8, 16, 32, 64, 128];
  const DEFAULT_TWELVE_PROGRESSION = [1, 1, 2, 3, 5, 8, 13, 21];
  const TWELVE_SIDES = ["dozen1", "dozen2", "dozen3", "column1", "column2", "column3"];
  const TWELVE_GROUP = { dozen1: "dozen", dozen2: "dozen", dozen3: "dozen", column1: "column", column2: "column", column3: "column" };

  function classify(number) {
    if (!Number.isInteger(number) || number < 0 || number > 36) throw new RangeError("Spin must be an integer from 0 to 36.");
    if (number === 0) return [];
    return [number <= 18 ? "low" : "high", number % 2 === 0 ? "even" : "odd", RED.has(number) ? "red" : "black"];
  }

  function classifyTwelve(number) {
    classify(number);
    if (number === 0) return [];
    return [`dozen${Math.ceil(number / 12)}`, `column${((number - 1) % 3) + 1}`];
  }

  class RouletteEngine {
    constructor(options = {}) {
      this.config = {
        thresholds: Object.fromEntries(SIDES.map((side) => [side, Number(options.thresholds?.[side]) || 4])),
        baseUnit: Number(options.baseUnit) > 0 ? Number(options.baseUnit) : 1,
        startingBankroll: Number(options.startingBankroll) >= 0 ? Number(options.startingBankroll) : 1000,
        tableRule: options.tableRule === "la-partage" ? "la-partage" : "standard",
        evenSystem: options.evenSystem === "martingale" ? "martingale" : "two-win",
        evenProgression: options.evenProgression || DEFAULT_EVEN_PROGRESSION,
        twelveProgression: options.twelveProgression || DEFAULT_TWELVE_PROGRESSION,
        maxStages: options.maxStages || 8,
        maxSessions: 3,
        twelveThresholds: Object.fromEntries(TWELVE_SIDES.map((side) => [side, Number(options.twelveThresholds?.[side]) || 6])),
        twelveBaseUnit: Number(options.twelveBaseUnit) > 0 ? Number(options.twelveBaseUnit) : 1,
        twelveStartingBankroll: Number(options.twelveStartingBankroll) >= 0 ? Number(options.twelveStartingBankroll) : 1000,
        maxTwelvePerGroup: Number(options.maxTwelvePerGroup) || 2,
        twelveProgression: options.twelveProgression || DEFAULT_TWELVE_PROGRESSION,
      };
      this.events = [];
      this.listeners = new Set();
      this._rebuild();
    }

    static fromSnapshot(snapshot) {
      if (!snapshot || snapshot.version !== 1 || !snapshot.config || !Array.isArray(snapshot.events)) {
        throw new Error("Unsupported or damaged dashboard data.");
      }
      // Migrate old saved configs that lack progression fields
      if (!snapshot.config.evenProgression) snapshot.config.evenProgression = DEFAULT_EVEN_PROGRESSION;
      if (!snapshot.config.twelveProgression) snapshot.config.twelveProgression = DEFAULT_TWELVE_PROGRESSION;
      if (!snapshot.config.maxStages) snapshot.config.maxStages = DEFAULT_EVEN_PROGRESSION.length;
      const engine = new RouletteEngine(snapshot.config);
      engine.events = JSON.parse(JSON.stringify(snapshot.events));
      engine._rebuild();
      return engine;
    }

    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    _notify() { const state = this.getState(); this.listeners.forEach((listener) => listener(state)); }
    _commit(event) { this.events.push(event); this._rebuild(); this._notify(); }

    addSpin(number) {
      const parsed = Number(number);
      classify(parsed);
      this._commit({ type: "spin", number: parsed, at: new Date().toISOString() });
    }
    startBet(side) {
      this._assertSide(side);
      const tracker = this.trackers[side];
      if (tracker.status !== "triggered") throw new Error(`${side} is not waiting to start.`);
      if (this.activeSessions.length >= this.config.maxSessions) throw new Error("All three betting slots are in use.");
      if (this.activeSessions.some((session) => session.side === PAIRS[side])) throw new Error(`${side} is locked by active ${PAIRS[side]}.`);
      this._commit({ type: "start", side, system: this.config.evenSystem, tableRule: this.config.tableRule, maxStages: this.config.maxStages, progression: [...this.config.evenProgression], baseUnit: this.config.baseUnit, at: new Date().toISOString() });
    }
    startTwelveBet(side) {
      this._assertTwelveSide(side);
      const tracker = this.twelveTrackers[side];
      const group = TWELVE_GROUP[side];
      if (tracker.status !== "triggered") throw new Error(`${side} is not waiting to start.`);
      if (this.activeFibSessions.filter((session) => session.group === group).length >= this.config.maxTwelvePerGroup) throw new Error(`Two ${group} betting slots are already in use.`);
      this._commit({ type: "start-fib", side, progression: [...this.config.twelveProgression], baseUnit: this.config.twelveBaseUnit, at: new Date().toISOString() });
    }
    ignore(side) {
      this._assertSide(side);
      if (this.trackers[side].status !== "triggered") throw new Error(`${side} is not triggered.`);
      this._commit({ type: "ignore", side, at: new Date().toISOString() });
    }
    resume(side) {
      this._assertSide(side);
      if (this.trackers[side].status !== "ignored") throw new Error(`${side} is not ignored.`);
      this._commit({ type: "resume", side, at: new Date().toISOString() });
    }
    ignoreTwelve(side) { this._assertTwelveSide(side); if (this.twelveTrackers[side].status !== "triggered") throw new Error(`${side} is not triggered.`); this._commit({ type: "ignore-fib", side, at: new Date().toISOString() }); }
    resumeTwelve(side) { this._assertTwelveSide(side); if (this.twelveTrackers[side].status !== "ignored") throw new Error(`${side} is not ignored.`); this._commit({ type: "resume-fib", side, at: new Date().toISOString() }); }
    cancelBet(side) {
      this._assertSide(side);
      if (!this.activeSessions.some((session) => session.side === side)) throw new Error(`${side} has no active session.`);
      this._commit({ type: "cancel", side, at: new Date().toISOString() });
    }
    cancelTwelveBet(side) { this._assertTwelveSide(side); if (!this.activeFibSessions.some((session) => session.side === side)) throw new Error(`${side} has no active session.`); this._commit({ type: "cancel-fib", side, at: new Date().toISOString() }); }
    acknowledgeResult(sessionId) {
      const id = Number(sessionId);
      if (!this.pendingResults.some((session) => session.id === id)) throw new Error("That result is no longer waiting for acknowledgement.");
      this._commit({ type: "acknowledge", sessionId: id, at: new Date().toISOString() });
    }
    undoLastSpin() {
      const index = this.events.findLastIndex((event) => event.type === "spin");
      if (index < 0) return false;
      this.events.splice(index, 1);
      this._rebuild(); this._notify(); return true;
    }
    resetSession() {
      this.events = [];
      this._rebuild();
      this._notify();
    }
    setThreshold(side, value) {
      this._assertSide(side);
      const threshold = Number(value);
      if (!Number.isInteger(threshold) || threshold < 1 || threshold > 99) throw new RangeError("Threshold must be from 1 to 99.");
      this.config.thresholds[side] = threshold;
      this._rebuild(); this._notify();
    }
    setTwelveThreshold(side, value) { this._assertTwelveSide(side); const threshold = Number(value); if (!Number.isInteger(threshold) || threshold < 1 || threshold > 99) throw new RangeError("Threshold must be from 1 to 99."); this.config.twelveThresholds[side] = threshold; this._rebuild(); this._notify(); }
    setBaseUnit(value) { const unit = Number(value); if (!(unit > 0)) throw new RangeError("Base unit must be positive."); this.config.baseUnit = unit; this._rebuild(); this._notify(); }
    setStartingBankroll(value) { const bankroll = Number(value); if (!(bankroll >= 0)) throw new RangeError("Bankroll cannot be negative."); this.config.startingBankroll = bankroll; this._rebuild(); this._notify(); }
    setTwelveBaseUnit(value) { const unit = Number(value); if (!(unit > 0)) throw new RangeError("12-number unit must be positive."); this.config.twelveBaseUnit = unit; this._rebuild(); this._notify(); }
    setTwelveStartingBankroll(value) { const bankroll = Number(value); if (!(bankroll >= 0)) throw new RangeError("12-number bankroll cannot be negative."); this.config.twelveStartingBankroll = bankroll; this._rebuild(); this._notify(); }
    setEvenProgression(arr) { if (!Array.isArray(arr) || !arr.every(n => n > 0)) throw new RangeError("Progression must be an array of positive numbers."); this.config.evenProgression = arr; this.config.maxStages = arr.length; this._rebuild(); this._notify(); }
    setTwelveProgression(arr) { if (!Array.isArray(arr) || !arr.every(n => n > 0)) throw new RangeError("Progression must be an array of positive numbers."); this.config.twelveProgression = arr; this._rebuild(); this._notify(); }
    applyEvenSettings({ startingBankroll, baseUnit, threshold, progression }) {
      const bankroll = Number(startingBankroll), unit = Number(baseUnit), trigger = Number(threshold);
      if (!(bankroll >= 0)) throw new RangeError("Starting bankroll cannot be negative.");
      if (!(unit > 0)) throw new RangeError("Base unit must be positive.");
      if (!Number.isInteger(trigger) || trigger < 1) throw new RangeError("Trigger must be a positive whole number.");
      if (!Array.isArray(progression) || !progression.length || !progression.every(n => Number(n) > 0)) throw new RangeError("Progression must contain positive numbers.");
      this.config.startingBankroll = bankroll;
      this.config.baseUnit = unit;
      SIDES.forEach((side) => { this.config.thresholds[side] = trigger; });
      this.config.evenProgression = progression.map(Number);
      this.config.maxStages = progression.length;
      this._rebuild();
      this._notify();
    }
    applyTwelveSettings({ startingBankroll, baseUnit, threshold, progression }) {
      const bankroll = Number(startingBankroll), unit = Number(baseUnit), trigger = Number(threshold);
      if (!(bankroll >= 0)) throw new RangeError("Starting bankroll cannot be negative.");
      if (!(unit > 0)) throw new RangeError("12-number unit must be positive.");
      if (!Number.isInteger(trigger) || trigger < 1) throw new RangeError("Trigger must be a positive whole number.");
      if (!Array.isArray(progression) || !progression.length || !progression.every(n => Number(n) > 0)) throw new RangeError("Progression must contain positive numbers.");
      this.config.twelveStartingBankroll = bankroll;
      this.config.twelveBaseUnit = unit;
      TWELVE_SIDES.forEach((side) => { this.config.twelveThresholds[side] = trigger; });
      this.config.twelveProgression = progression.map(Number);
      this._rebuild();
      this._notify();
    }
    setTableRule(value) { if (!["standard", "la-partage"].includes(value)) throw new RangeError("Unknown table rule."); if (this.activeSessions.length) throw new Error("Finish or cancel active bets before changing the table rule."); this.config.tableRule = value; this._rebuild(); this._notify(); }
    markDealerChange() { this._commit({ type: "dealer-change", at: new Date().toISOString() }); }
    _assertSide(side) { if (!SIDES.includes(side)) throw new Error(`Unknown side: ${side}`); }
    _assertTwelveSide(side) { if (!TWELVE_SIDES.includes(side)) throw new Error(`Unknown 12-number side: ${side}`); }

    _freshState() {
      return {
        spinCount: 0,
        spins: [],
        trackers: Object.fromEntries(SIDES.map((side) => [side, { side, absent: 0, status: "tracking", threshold: this.config.thresholds[side] }])),
        twelveTrackers: Object.fromEntries(TWELVE_SIDES.map((side) => [side, { side, absent: 0, status: "tracking", threshold: this.config.twelveThresholds[side] }])),
        activeSessions: [], completedSessions: [], activeFibSessions: [], completedFibSessions: [], dealerChanges: [], acknowledgedSessionIds: new Set(), realizedPL: 0, fibRealizedPL: 0, nextSessionId: 1, nextFibSessionId: 10001,
      };
    }

    _rebuild() {
      const state = this._freshState();
      for (const event of this.events) {
        if (event.type === "spin") this._applySpin(state, event);
        if (event.type === "start") this._applyStart(state, event);
        if (event.type === "start-fib") this._applyFibStart(state, event);
        if (event.type === "ignore") { const t = state.trackers[event.side]; if (t.status === "triggered") t.status = "ignored"; }
        if (event.type === "resume") {
          const t = state.trackers[event.side];
          if (t.status === "ignored") t.status = t.absent >= t.threshold ? "triggered" : "tracking";
        }
        if (event.type === "ignore-fib") { const t = state.twelveTrackers[event.side]; if (t.status === "triggered") t.status = "ignored"; }
        if (event.type === "resume-fib") { const t = state.twelveTrackers[event.side]; if (t.status === "ignored") t.status = t.absent >= t.threshold ? "triggered" : "tracking"; }
        if (event.type === "cancel") this._finishSession(state, event.side, "cancelled");
        if (event.type === "cancel-fib") this._finishFibSession(state, event.side, "cancelled");
        if (event.type === "acknowledge") state.acknowledgedSessionIds.add(event.sessionId);
        if (event.type === "dealer-change") state.dealerChanges.push({ dealer: state.dealerChanges.length + 2, afterSpin: state.spinCount, at: event.at });
      }
      state.pendingResults = [...state.completedSessions, ...state.completedFibSessions].filter((session) =>
        (session.reason === "won" || session.reason === "target-reached" || session.reason === "max-stage-loss" || session.reason === "max-bets-stopped") && !state.acknowledgedSessionIds.has(session.id));
      Object.assign(this, state);
    }

    _applySpin(state, event) {
      const number = Number(event.number);
      const present = new Set(classify(number));
      const twelvePresent = new Set(classifyTwelve(number));
      state.spinCount += 1;
      state.spins.push({ number, index: state.spinCount, at: event.at });

      for (const side of SIDES) {
        const tracker = state.trackers[side];
        if (present.has(side)) {
          tracker.absent = 0;
          if (!state.activeSessions.some((session) => session.side === side)) tracker.status = "tracking";
        } else {
          tracker.absent += 1;
          if (tracker.status === "tracking" && tracker.absent >= tracker.threshold) tracker.status = "triggered";
        }
      }
      for (const side of TWELVE_SIDES) {
        const tracker = state.twelveTrackers[side];
        if (twelvePresent.has(side)) {
          tracker.absent = 0;
          if (!state.activeFibSessions.some((session) => session.side === side)) tracker.status = "tracking";
        } else {
          tracker.absent += 1;
          if (tracker.status === "tracking" && tracker.absent >= tracker.threshold) tracker.status = "triggered";
        }
      }

      for (const session of [...state.activeSessions]) {
        session.numbers.push(number);
        const stake = (session.system === "two-win" ? session.nextStake : ((session.progression||DEFAULT_EVEN_PROGRESSION)[session.stage] || 1)) * (session.baseUnit || this.config.baseUnit);
        session.stakes.push(stake);
        if (session.system === "two-win") {
          const won = present.has(session.side);
          if (won) {
            session.pl += stake; session.outcomes.push("win"); session.plChanges.push(stake);
            session.winStreak += 1;
            if (session.winStreak === 2) { this._finishSession(state, session.side, "target-reached"); continue; }
            session.nextStake = 2;
          } else {
            const change = number === 0 && session.tableRule === "la-partage" ? -stake / 2 : -stake;
            session.pl += change; session.outcomes.push(number === 0 && session.tableRule === "la-partage" ? "half-loss" : "loss"); session.plChanges.push(change);
            session.winStreak = 0; session.nextStake = 1;
          }
          if (session.stage === session.maxStages - 1) this._finishSession(state, session.side, "max-bets-stopped");
          else session.stage += 1;
          continue;
        }
        if (present.has(session.side)) {
          session.pl += stake;
          session.outcomes.push("win"); session.plChanges.push(stake);
          this._finishSession(state, session.side, "won");
        } else if (number === 0 && session.tableRule === "la-partage") {
          session.pl -= stake / 2;
          session.outcomes.push("half-loss"); session.plChanges.push(-stake / 2);
          if (session.stage === session.maxStages - 1) this._finishSession(state, session.side, "max-stage-loss");
          else session.stage += 1;
        } else {
          session.pl -= stake;
          session.outcomes.push("loss"); session.plChanges.push(-stake);
          if (session.stage === session.maxStages - 1) this._finishSession(state, session.side, "max-stage-loss");
          else session.stage += 1;
        }
      }
      for (const session of [...state.activeFibSessions]) {
        session.numbers.push(number);
        const stake = ((session.progression||DEFAULT_TWELVE_PROGRESSION)[session.stage] || 1) * (session.baseUnit || this.config.twelveBaseUnit);
        session.stakes.push(stake);
        if (twelvePresent.has(session.side)) {
          const profit = stake * 2;
          session.pl += profit; session.outcomes.push("win"); session.plChanges.push(profit);
          this._finishFibSession(state, session.side, "won");
        } else {
          session.pl -= stake; session.outcomes.push("loss"); session.plChanges.push(-stake);
          if (session.stage === session.maxStages - 1) this._finishFibSession(state, session.side, "max-stage-loss");
          else session.stage += 1;
        }
      }
    }

    _applyStart(state, event) {
      const tracker = state.trackers[event.side];
      if (tracker.status !== "triggered" || state.activeSessions.length >= this.config.maxSessions) return;
      if (state.activeSessions.some((session) => session.side === PAIRS[event.side])) return;
      tracker.status = "active";
      state.activeSessions.push({ id: state.nextSessionId++, side: event.side, system: event.system || "martingale", stage: 0, maxStages: event.maxStages || this.config.maxStages, winStreak: 0, nextStake: 1, pl: 0, stakes: [], numbers: [], outcomes: [], plChanges: [], tableRule: event.tableRule || this.config.tableRule, startSpin: state.spinCount + 1, triggerAbsence: tracker.absent, startedAt: event.at, progression: event.progression || this.config.evenProgression, baseUnit: Number(event.baseUnit) > 0 ? Number(event.baseUnit) : this.config.baseUnit });
    }

    _applyFibStart(state, event) {
      const tracker = state.twelveTrackers[event.side];
      const group = TWELVE_GROUP[event.side];
      if (tracker.status !== "triggered" || state.activeFibSessions.filter((session) => session.group === group).length >= this.config.maxTwelvePerGroup) return;
      tracker.status = "active";
      state.activeFibSessions.push({ id: state.nextFibSessionId++, side: event.side, group, system: "fibonacci", stage: 0, maxStages: event.maxStages || (event.progression || this.config.twelveProgression).length, pl: 0, stakes: [], numbers: [], outcomes: [], plChanges: [], startSpin: state.spinCount + 1, triggerAbsence: tracker.absent, startedAt: event.at, progression: event.progression || this.config.twelveProgression, baseUnit: Number(event.baseUnit) > 0 ? Number(event.baseUnit) : this.config.twelveBaseUnit });
    }

    _finishSession(state, side, reason) {
      const index = state.activeSessions.findIndex((session) => session.side === side);
      if (index < 0) return;
      const [session] = state.activeSessions.splice(index, 1);
      session.reason = reason; session.endSpin = state.spinCount;
      state.completedSessions.push(session); state.realizedPL += session.pl;
      const tracker = state.trackers[side];
      tracker.status = tracker.absent >= tracker.threshold ? "ignored" : "tracking";
    }

    _finishFibSession(state, side, reason) {
      const index = state.activeFibSessions.findIndex((session) => session.side === side);
      if (index < 0) return;
      const [session] = state.activeFibSessions.splice(index, 1);
      session.reason = reason; session.endSpin = state.spinCount;
      state.completedFibSessions.push(session); state.fibRealizedPL += session.pl;
      const tracker = state.twelveTrackers[side];
      tracker.status = tracker.absent >= tracker.threshold ? "ignored" : "tracking";
    }

    getState() {
      const activePL = this.activeSessions.reduce((sum, session) => sum + session.pl, 0);
      const exposure = this.activeSessions.reduce((sum, session) => sum + (session.system === "two-win"
        ? session.nextStake + Math.max(0, session.maxStages - session.stage - 1)
        : ((session.progression||DEFAULT_EVEN_PROGRESSION).slice(session.stage, session.maxStages).reduce((a, b) => a + b, 0))) * (session.baseUnit || this.config.baseUnit), 0);
      const fibActivePL = this.activeFibSessions.reduce((sum, session) => sum + session.pl, 0);
      const fibExposure = this.activeFibSessions.reduce((sum, session) => sum + (session.progression||DEFAULT_TWELVE_PROGRESSION).slice(session.stage, session.maxStages).reduce((a, b) => a + b, 0) * (session.baseUnit || this.config.twelveBaseUnit), 0);
      const locked = Object.fromEntries(SIDES.map((side) => [side, this.activeSessions.some((session) => session.side === PAIRS[side])]));
      return JSON.parse(JSON.stringify({
        spinCount: this.spinCount, spins: this.spins, trackers: this.trackers, twelveTrackers: this.twelveTrackers, dealerChanges: this.dealerChanges,
        activeSessions: this.activeSessions.map((session) => ({ ...session, stake: (session.system === "two-win" ? session.nextStake : ((session.progression||DEFAULT_EVEN_PROGRESSION)[session.stage] || 1)) * (session.baseUnit || this.config.baseUnit) })),
        activeFibSessions: this.activeFibSessions.map((session) => ({ ...session, stake: ((session.progression||DEFAULT_TWELVE_PROGRESSION)[session.stage] || 1) * (session.baseUnit || this.config.twelveBaseUnit) })), completedFibSessions: this.completedFibSessions,
        completedSessions: this.completedSessions, pendingResults: this.pendingResults, config: this.config, locked,
        bankroll: this.config.startingBankroll + this.realizedPL + activePL,
        fibBankroll: this.config.twelveStartingBankroll + this.fibRealizedPL + fibActivePL,
        realizedPL: this.realizedPL, activePL, exposure, fibRealizedPL: this.fibRealizedPL, fibActivePL, fibExposure,
      }));
    }

    exportSnapshot() { return { version: 1, config: JSON.parse(JSON.stringify(this.config)), events: JSON.parse(JSON.stringify(this.events)) }; }
  }

  return { RouletteEngine, classify, classifyTwelve, SIDES, PAIRS, PROGRESSION: DEFAULT_EVEN_PROGRESSION, TWELVE_SIDES, TWELVE_GROUP, FIBONACCI: DEFAULT_TWELVE_PROGRESSION, DEFAULT_EVEN_PROGRESSION, DEFAULT_TWELVE_PROGRESSION };
});
