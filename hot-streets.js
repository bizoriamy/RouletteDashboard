(function (root) {
  "use strict";

  // 12 regular streets in European roulette
  const STREETS = [
    [1,2,3], [4,5,6], [7,8,9], [10,11,12],
    [13,14,15], [16,17,18], [19,20,21], [22,23,24],
    [25,26,27], [28,29,30], [31,32,33], [34,35,36]
  ];
  const STREET_LABELS = STREETS.map(s => `${s[0]}-${s[1]}-${s[2]}`);
  const STREET_STARTS = STREETS.map(s => s[0]);

  // Fibonacci progression (stages 1-5)
  const FIB = [1, 1, 2, 3, 5];
  const OBSERVATION_SPINS = 12;
  const CANDIDATE_COUNT = 6;
  const FINAL_COUNT = 4;
  const HISTORY_KEY = "roulette-hot-streets-history-v1";
  const STATE_KEY = "roulette-hot-streets-state-v1";

  /** Classify which street a number belongs to (0 = none) */
  function streetOf(number) {
    const n = Number(number);
    if (n < 1 || n > 36) return -1;
    return Math.floor((n - 1) / 3); // 0-11
  }

  /** Parse pasted text: one number per line, auto-fix o→0 */
  function parseNumbers(text) {
    return text.split(/[\r\n,]+/)
      .map(s => s.trim().replace(/[oO]/g, "0"))
      .filter(s => s.length > 0 && !isNaN(Number(s)))
      .map(Number)
      .filter(n => n >= 0 && n <= 36);
  }

  /** Rank streets by frequency in a number array */
  function rankStreets(numbers, mode = "hot") {
    const counts = new Array(12).fill(0);
    for (const num of numbers) {
      const si = streetOf(num);
      if (si >= 0) counts[si]++;
    }
    const indexed = counts.map((count, i) => ({ street: i, count, start: STREET_STARTS[i] }));
    indexed.sort((a, b) => mode === "hot" ? b.count - a.count || a.street - b.street : a.count - b.count || a.street - b.street);
    return indexed;
  }

  class HotStreets {
    constructor(options = {}) {
      this.history = this.load_(HISTORY_KEY, []);
      this.state = this.load_(STATE_KEY, this.freshState_());
      this.progression = options.progression ? [...options.progression] : [...FIB];
      this.baseUnit = Number(options.baseUnit) > 0 ? Number(options.baseUnit) : 1;
    }

    freshState_() {
      return {
        phase: "idle",        // idle | ready | observing | betting
        mode: "hot",          // hot | cold
        candidates: [],       // 6 candidate street indices
        scores: new Array(12).fill(0),
        observationSpin: 0,
        finalStreets: [],     // 4 final street indices
        betStage: 0,          // 0 = not betting, 1-5 = active stage
        cycleWins: 0,
        cycleBursts: 0,
        cyclePL: 0,
        totalPL: 0,
        totalCycles: 0,
        lastResult: null
      };
    }

    load_(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
    }

    save_() {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(this.history));
      localStorage.setItem(STATE_KEY, JSON.stringify(this.state));
    }

    /** Replace all history with parsed text */
    replaceHistory(text) {
      const nums = parseNumbers(text);
      if (nums.length < 12) throw new Error("Need at least 12 numbers to start.");
      this.history = nums;
      this.selectCandidates(this.state.mode);
      return nums.length;
    }

    /** Append a single spin to history */
    appendSpin(number) {
      const n = Number(number);
      if (isNaN(n) || n < 0 || n > 36) return;
      this.history.push(n);
      // Keep last 500 to avoid memory bloat
      if (this.history.length > 500) this.history = this.history.slice(-500);
      // If observing, score it
      if (this.state.phase === "observing") {
        this.scoreSpin_(n);
      } else if (this.state.phase === "betting") {
        this.checkBet_(n);
      }
      // deciding = waiting for user, don't process spins
      this.save_();
    }

    /** Select 6 candidate streets from history */
    selectCandidates(mode = "hot") {
      if (this.history.length < 12) throw new Error("Need at least 12 numbers.");
      const ranked = rankStreets(this.history, mode);
      this.state = this.freshState_();
      this.state.mode = mode;
      this.state.phase = "ready";
      this.state.candidates = ranked.slice(0, CANDIDATE_COUNT).map(r => r.street);
      this.save_();
    }

    /** Start observation phase */
    startObservation() {
      if (this.state.phase !== "ready") throw new Error("Select candidates first.");
      this.state.phase = "observing";
      this.state.observationSpin = 0;
      this.state.scores = new Array(12).fill(0);
      this.save_();
    }

    /** Score a spin during observation */
    scoreSpin_(number) {
      const si = streetOf(number);
      // Count every spin toward observation, but only score candidate streets
      if (si >= 0 && this.state.candidates.includes(si)) {
        this.state.scores[si]++;
      }
      this.state.observationSpin++;
      // After 12 spins, finalize and wait for user decision
      if (this.state.observationSpin >= OBSERVATION_SPINS) {
        this.finalize_();
      }
    }

    /** Finalize top 4 from candidates — phase becomes "deciding" (user chooses) */
    finalize_() {
      const scored = this.state.candidates.map(si => ({
        street: si,
        score: this.state.scores[si]
      }));
      const historyCounts = new Array(12).fill(0);
      for (const num of this.history) {
        const s = streetOf(num);
        if (s >= 0) historyCounts[s]++;
      }
      scored.sort((a, b) => b.score - a.score || historyCounts[b.street] - historyCounts[a.street] || a.street - b.street);
      this.state.finalStreets = scored.slice(0, FINAL_COUNT).map(s => s.street);
      this.state.phase = "deciding";
      this.save_();
    }

    /** User accepts — start betting */
    acceptBet() {
      if (this.state.phase !== "deciding") throw new Error("No observation to accept.");
      this.state.phase = "betting";
      this.state.betStage = 1;
      this.save_();
    }

    setProgression(arr) {
      if (!Array.isArray(arr) || !arr.every(n => n > 0)) throw new Error("Progression must be array of positive numbers.");
      this.progression = [...arr];
      this.save_();
    }

    setBaseUnit(val) {
      const u = Number(val);
      if (!(u > 0)) throw new Error("Base unit must be positive.");
      this.baseUnit = u;
    }

    /** User ignores — skip this cycle, pick new candidates */
    ignoreBet() {
      if (this.state.phase !== "deciding") throw new Error("No observation to ignore.");
      this.state.totalCycles++;
      this.resetCycle_();
      this.save_();
    }

    /** Check if current bet wins */
    checkBet_(number) {
      const si = streetOf(number);
      if (si < 0) { this.loseBet_(); return; }
      if (this.state.finalStreets.includes(si)) {
        this.winBet_();
      } else {
        this.loseBet_();
      }
    }

    winBet_() {
      const stake = this.progression[this.state.betStage - 1] * this.baseUnit;
      const profit = stake * 2; // street pays 11:1, 4 streets at 1/4 each = net +2 per unit
      this.state.cyclePL += profit;
      this.state.totalPL += profit;
      this.state.cycleWins++;
      this.state.totalCycles++;
      this.state.lastResult = "win";
      this.resetCycle_();
      this.save_();
    }

    loseBet_() {
      const stake = this.progression[this.state.betStage - 1] * this.baseUnit;
      this.state.cyclePL -= stake;
      this.state.totalPL -= stake;
      if (this.state.betStage >= this.progression.length) {
        // Burst
        this.state.cycleBursts++;
        this.state.totalCycles++;
        this.state.lastResult = "burst";
        this.resetCycle_();
      } else {
        this.state.betStage++;
      }
      this.save_();
    }

    resetCycle_() {
      this.state.phase = "ready";
      this.state.betStage = 0;
      this.state.observationSpin = 0;
      this.state.scores = new Array(12).fill(0);
      this.state.finalStreets = [];
      // Re-select candidates for next cycle
      if (this.history.length >= 12) {
        const ranked = rankStreets(this.history, this.state.mode);
        this.state.candidates = ranked.slice(0, CANDIDATE_COUNT).map(r => r.street);
      }
    }

    /** Get current state for UI */
    getState() {
      const s = this.state;
      const prog = this.progression;
      const totalBet = s.betStage > 0 ? prog.slice(0, s.betStage).reduce((a, b) => a + b, 0) * this.baseUnit : 0;
      const currentBet = s.betStage > 0 ? prog[s.betStage - 1] * this.baseUnit : 0;
      return {
        phase: s.phase,
        mode: s.mode,
        historyCount: this.history.length,
        candidates: s.candidates.map(si => ({
          street: si,
          start: STREET_STARTS[si],
          label: STREET_LABELS[si],
          score: s.scores[si]
        })),
        observationSpin: s.observationSpin,
        observationTotal: OBSERVATION_SPINS,
        finalStreets: s.finalStreets.map(si => ({
          street: si,
          start: STREET_STARTS[si],
          label: STREET_LABELS[si]
        })),
        betStage: s.betStage,
        betMax: this.progression.length,
        currentBet: currentBet,
        totalBet: totalBet,
        cyclePL: s.cyclePL,
        totalPL: s.totalPL,
        cycleWins: s.cycleWins,
        cycleBursts: s.cycleBursts,
        totalCycles: s.totalCycles,
        lastResult: s.lastResult,
        progression: [...this.progression],
        baseUnit: this.baseUnit
      };
    }

    /** Reset everything */
    reset() {
      this.history = [];
      this.state = this.freshState_();
      this.save_();
    }
  }

  root.RouletteHotStreets = { HotStreets, STREETS, STREET_LABELS, STREET_STARTS, FIB, parseNumbers, streetOf, rankStreets };
})(typeof globalThis !== "undefined" ? globalThis : this);
