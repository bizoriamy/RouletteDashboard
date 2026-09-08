(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RLSEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VALID_SIDES = ["red", "black", "odd", "even", "low", "high"];
  const VALID_MODES = ["fixed", "follow", "against", "random"];
  const ALL_SIDES = ["low", "red", "odd", "high", "black", "even"];
  const PAIRS = { red: "black", black: "red", odd: "even", even: "odd", low: "high", high: "low" };
  const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

  function classify(number) {
    if (!Number.isInteger(number) || number < 0 || number > 36) throw new RangeError("Spin must be an integer from 0 to 36.");
    if (number === 0) return [];
    return [
      number <= 18 ? "low" : "high",
      number % 2 === 0 ? "even" : "odd",
      RED.has(number) ? "red" : "black"
    ];
  }

  function parseSequence(raw) {
    if (typeof raw === "string") raw = raw.split(/[,\s]+/).filter(Boolean);
    if (!Array.isArray(raw)) throw new TypeError("Sequence must be an array or comma-separated string.");
    const nums = raw.map(Number);
    if (nums.length === 0) throw new RangeError("Sequence must contain at least one number.");
    if (nums.some((n) => !Number.isFinite(n) || n <= 0)) throw new RangeError("All sequence numbers must be positive.");
    return nums;
  }

  // Round to avoid JS floating-point errors (e.g. 3.0000000000000004)
  function roundU(value) { return Math.round(value * 1e8) / 1e8; }

  class RLSEngine {
    constructor(options = {}) {
      this.config = {
        side: VALID_SIDES.includes(options.side) ? options.side : "red",
        mode: VALID_MODES.includes(options.mode) ? options.mode : "fixed",
        baseUnit: Number(options.baseUnit) > 0 ? Number(options.baseUnit) : 1,
        sequence: Array.isArray(options.sequence) ? [...options.sequence] : [4, 3, 2, 1, 3, 3, 6, 4],
        profitMultiplier: options.profitMultiplier === "none" || options.profitMultiplier === null ? null : (Number(options.profitMultiplier) >= 0 ? Number(options.profitMultiplier) : 1),
        laPartage: options.laPartage !== false,
        startingBankroll: Number(options.startingBankroll) >= 0 ? Number(options.startingBankroll) : 100,
      };
      this.events = [];
      this.listeners = new Set();
      this._rebuild();
    }

    static fromSnapshot(snapshot) {
      if (!snapshot || snapshot.version !== 2 || !snapshot.config || !Array.isArray(snapshot.events)) {
        throw new Error("Unsupported or damaged RLS data.");
      }
      const engine = new RLSEngine(snapshot.config);
      engine.events = JSON.parse(JSON.stringify(snapshot.events));
      engine._rebuild();
      return engine;
    }

    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    _notify() { const state = this.getState(); this.listeners.forEach((listener) => listener(state)); }
    _commit(event) { this.events.push(event); this._rebuild(); this._notify(); }

    setConfig(key, value) {
      if (this.session && this.session.status === "active") throw new Error("Cannot change settings while a session is active.");
      if (key === "side") {
        if (!VALID_SIDES.includes(value)) throw new RangeError("Invalid side.");
        this.config.side = value;
      } else if (key === "mode") {
        if (!VALID_MODES.includes(value)) throw new RangeError("Invalid mode. Use fixed, follow, against, or random.");
        this.config.mode = value;
      } else if (key === "baseUnit") {
        if (!(Number(value) > 0)) throw new RangeError("Base unit must be positive.");
        this.config.baseUnit = Number(value);
      } else if (key === "sequence") {
        const parsed = parseSequence(value);
        this.config.sequence = parsed;
      } else if (key === "profitMultiplier") {
        this.config.profitMultiplier = value === "none" || value === null ? null : Number(value);
      } else if (key === "laPartage") {
        this.config.laPartage = Boolean(value);
      } else if (key === "startingBankroll") {
        if (!(Number(value) >= 0)) throw new RangeError("Bankroll cannot be negative.");
        this.config.startingBankroll = Number(value);
      } else {
        throw new Error(`Unknown config key: ${key}`);
      }
      this._rebuild();
      this._notify();
    }

    startSession() {
      if (this.session && this.session.status === "active") throw new Error("A session is already active.");
      const seq = [...this.config.sequence];
      const lossBudget = seq.reduce((a, b) => a + b, 0) * this.config.baseUnit;
      this._commit({
        type: "start",
        sequence: seq,
        lossBudget,
        startingBankroll: this.config.startingBankroll,
        side: this.config.side,
        mode: this.config.mode,
        baseUnit: this.config.baseUnit,
        profitMultiplier: this.config.profitMultiplier,
        laPartage: this.config.laPartage,
        at: new Date().toISOString(),
      });
    }

    stopSession(reason = "manual") {
      if (!this.session || this.session.status !== "active") throw new Error("No active session.");
      this._commit({ type: "stop", reason, at: new Date().toISOString() });
    }

    applySpin(number) {
      if (!this.session || this.session.status !== "active") return;
      const event = { type: "spin", number: Number(number), at: new Date().toISOString() };
      // Record the side actually being bet on (the pre-resolved side) so rebuilds
      // are deterministic — otherwise a fresh random roll on each rebuild would
      // change past win/loss outcomes and corrupt the sequence.
      if (this.session.mode === "random") {
        event.resolvedSide = this.session.resolvedSide || this.session.side;
      }
      this._commit(event);
    }

    undoLastSpin() {
      const index = this.events.findLastIndex((e) => e.type === "spin");
      if (index < 0) return false;
      this.events.splice(index, 1);
      this._rebuild();
      this._notify();
      return true;
    }

    resetSession() {
      this.events = [];
      this._rebuild();
      this._notify();
    }

    _freshState() {
      return {
        session: null,
        history: [],
        nextSessionId: 1,
        lastSpinNumber: null,
      };
    }

    _rebuild() {
      const state = this._freshState();
      const pendingStops = [];

      for (const event of this.events) {
        if (event.type === "start") {
          // Archive any existing active session before starting new one
          if (state.session && state.session.status === "active") {
            state.session.status = "stopped";
            state.session.stopReason = "stale";
            state.session.endedAt = event.at;
            state.history.push({ ...state.session });
          }
          state.session = {
            id: state.nextSessionId++,
            status: "active",
            sequence: [...event.sequence],
            originalSequence: [...event.sequence],
            lossBudget: event.lossBudget,
            startingBankroll: event.startingBankroll ?? event.lossBudget,
            side: event.side,
            mode: event.mode || "fixed",
            baseUnit: event.baseUnit,
            profitMultiplier: event.profitMultiplier,
            laPartage: event.laPartage,
            pl: 0,
            spins: [],
            startedAt: event.at,
            stopReason: null,
            endedAt: null,
            resolvedSide: event.side,
          };
        }

        if (event.type === "stop" && state.session) {
          state.session.status = "stopped";
          state.session.stopReason = event.reason;
          state.session.endedAt = event.at;
          state.history.push({ ...state.session });
          state.session = null;
        }

        if (event.type === "spin" && state.session) {
          // Resolve side for follow/against modes BEFORE applying spin
          if ((state.session.mode === "follow" || state.session.mode === "against") && state.lastSpinNumber !== null) {
            const lastClasses = classify(state.lastSpinNumber);
            if (lastClasses.length > 0) {
              const sideConfig = state.session.side;
              if (["red", "black"].includes(sideConfig)) {
                state.session.resolvedSide = lastClasses.includes("red") ? "red" : "black";
              } else if (["odd", "even"].includes(sideConfig)) {
                state.session.resolvedSide = lastClasses.includes("odd") ? "odd" : "even";
              } else if (["low", "high"].includes(sideConfig)) {
                state.session.resolvedSide = lastClasses.includes("low") ? "low" : "high";
              }
              if (state.session.mode === "against") {
                state.session.resolvedSide = PAIRS[state.session.resolvedSide];
              }
            }
          } else if (state.session.mode === "fixed") {
            state.session.resolvedSide = state.session.side;
          } else if (state.session.mode === "random" && event.resolvedSide) {
            state.session.resolvedSide = event.resolvedSide;
          }
          // For the first spin with follow/against, resolvedSide stays as configured side

          this._applySpinToSession(state.session, event.number);
          state.lastSpinNumber = event.number;

          // Pre-resolve the NEXT bet's side using THIS spin's result
          if (state.session.status === "active" && (state.session.mode === "follow" || state.session.mode === "against")) {
            const thisClasses = classify(event.number);
            if (thisClasses.length > 0) {
              const sideConfig = state.session.side;
              if (["red", "black"].includes(sideConfig)) {
                state.session.resolvedSide = thisClasses.includes("red") ? "red" : "black";
              } else if (["odd", "even"].includes(sideConfig)) {
                state.session.resolvedSide = thisClasses.includes("odd") ? "odd" : "even";
              } else if (["low", "high"].includes(sideConfig)) {
                state.session.resolvedSide = thisClasses.includes("low") ? "low" : "high";
              }
              if (state.session.mode === "against") {
                state.session.resolvedSide = PAIRS[state.session.resolvedSide];
              }
            }
          } else if (state.session.status === "active" && state.session.mode === "random") {
            state.session.resolvedSide = ALL_SIDES[Math.floor(Math.random() * ALL_SIDES.length)];
          }

          // Check stop conditions — collect, don't push to events
          if (state.session.status === "active") {
            if (state.session.sequence.length === 0) {
              pendingStops.push({ sessionId: state.session.id, reason: "loss-limit", at: new Date().toISOString() });
            } else if (state.session.profitMultiplier !== null && state.session.pl >= state.session.lossBudget * state.session.profitMultiplier) {
              pendingStops.push({ sessionId: state.session.id, reason: "profit-target", at: new Date().toISOString() });
            } else if (state.session.pl < 0 && this._bankrollLeft(state.session) < this._currentBet(state.session)) {
              // Only stop on funds-exhausted when losing — never stop a winning session
              pendingStops.push({ sessionId: state.session.id, reason: "funds-exhausted", at: new Date().toISOString() });
            }
          }
        }
      }

      // Process pending stops AFTER the event loop — only for sessions that are still active
      for (const stop of pendingStops) {
        if (state.session && state.session.status === "active" && state.session.id === stop.sessionId) {
          state.session.status = "stopped";
          state.session.stopReason = stop.reason;
          state.session.endedAt = stop.at;
          state.history.push({ ...state.session });
          state.session = null;
          this.events.push({ type: "stop", reason: stop.reason, at: stop.at });
        }
      }

      Object.assign(this, state);
    }

    _applySpinToSession(session, number) {
      const present = new Set(classify(number));
      const effectiveSide = session.resolvedSide || session.side;
      const won = present.has(effectiveSide);
      const bet = this._currentBet(session);

      session.spins.push({
        number,
        won,
        bet,
        effectiveSide,
        plChange: 0,
      });

      const spinRecord = session.spins[session.spins.length - 1];

      if (won) {
        spinRecord.plChange = roundU(bet);
        session.pl = roundU(session.pl + bet);
        session.sequence.push(roundU(bet / session.baseUnit));
      } else if (number === 0 && session.laPartage) {
        const halfLoss = roundU(bet / 2);
        spinRecord.plChange = -halfLoss;
        session.pl = roundU(session.pl - halfLoss);
        // Zero still counts as a loss for sequence purposes
        if (session.sequence.length >= 2) {
          session.sequence.shift();
          session.sequence.pop();
        } else if (session.sequence.length === 1) {
          session.sequence = [];
        }
      } else {
        spinRecord.plChange = -bet;
        session.pl = roundU(session.pl - bet);
        if (session.sequence.length >= 2) {
          session.sequence.shift();
          session.sequence.pop();
        } else if (session.sequence.length === 1) {
          session.sequence = [];
        }
      }
    }

    _currentBet(session) {
      const seq = session.sequence;
      if (seq.length === 0) return 0;
      if (seq.length === 1) return seq[0] * session.baseUnit;
      return (seq[0] + seq[seq.length - 1]) * session.baseUnit;
    }

    _bankrollLeft(session) {
      return (session.startingBankroll ?? session.lossBudget) + session.pl;
    }

    getState() {
      const session = this.session ? { ...this.session, sequence: [...this.session.sequence] } : null;
      return JSON.parse(JSON.stringify({
        config: { ...this.config, sequence: [...this.config.sequence] },
        session,
        history: this.history,
        totalPL: this.history.reduce((sum, s) => sum + s.pl, 0),
        totalSessions: this.history.length,
      }));
    }

    exportSnapshot() {
      return {
        version: 2,
        config: JSON.parse(JSON.stringify(this.config)),
        events: JSON.parse(JSON.stringify(this.events)),
      };
    }
  }

  return { RLSEngine, classify, VALID_SIDES, VALID_MODES, ALL_SIDES, PAIRS, parseSequence };
});
