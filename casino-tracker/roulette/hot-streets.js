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

  // Canonical 4-Streets progression: units placed on EACH street.
  // With four streets, the total hand wagers are 4, 4, 8, 12, 20 units.
  const FIB = [1, 1, 2, 3, 5];
  const OBSERVATION_SPINS = 12;
  const CANDIDATE_COUNT = 6;
  const FINAL_COUNT = 4;
  const MIN_HISTORY = 24;
  const HISTORY_KEY = "roulette-hot-streets-history-v1";
  const STATE_KEY = "roulette-hot-streets-state-v1";
  const SETTINGS_KEY = "roulette-hot-streets-settings-v1";
  const STATE_VERSION = 4;

  function sameProgression(a, b) {
    return Array.isArray(a) && a.length === b.length && a.every((n, i) => Number(n) === b[i]);
  }

  function storedProgression(settings) {
    const saved = settings && settings.progression;
    if (sameProgression(saved, [4, 4, 8, 12, 20, 32]) ||
        sameProgression(saved, [4, 4, 8, 12, 20])) {
      return [...FIB];
    }
    return Array.isArray(saved) && saved.every(n => Number(n) > 0)
      ? saved.map(Number)
      : [...FIB];
  }

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
      const settings = this.load_(SETTINGS_KEY, {});
      this.progression = options.progression ? [...options.progression] : storedProgression(settings);
      this.baseUnit = Number(options.baseUnit) > 0 ? Number(options.baseUnit) : Number(settings.baseUnit) > 0 ? Number(settings.baseUnit) : 1;
      if (this.state.version !== STATE_VERSION) {
        this.state = this.freshState_();
        if (this.history.length >= MIN_HISTORY) {
          const ranked = rankStreets(this.history, this.state.mode);
          this.state.phase = "ready";
          this.state.candidates = ranked.slice(0, CANDIDATE_COUNT).map(r => r.street);
        }
        this.save_();
      }
    }

    freshState_() {
      return {
        version: STATE_VERSION,
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
        lastResult: null,
        lastResultBet: 0,
        resultId: 0,
        nextCycleId: 1,
        currentCycleId: null,
        syncCycles: [],
        syncSteps: []
      };
    }

    load_(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
    }

    save_() {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(this.history));
      localStorage.setItem(STATE_KEY, JSON.stringify(this.state));
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ progression: this.progression, baseUnit: this.baseUnit }));
    }

    /** Replace all history with parsed text */
    replaceHistory(text) {
      const nums = parseNumbers(text);
      if (nums.length === 0) throw new Error("No valid roulette numbers found.");
      this.history = nums;
      this.prepareFromHistory_(this.state.mode);
      return nums.length;
    }

    /** Add older imported/OCR history before numbers already recorded live. */
    prependHistory(text) {
      const nums = parseNumbers(text);
      if (nums.length === 0) throw new Error("No valid roulette numbers found.");
      // Repeated roulette values are legitimate outcomes, so do not de-duplicate.
      this.history = [...nums, ...this.history];
      if (this.history.length > 500) this.history = this.history.slice(-500);
      this.prepareFromHistory_(this.state.mode);
      return { added: nums.length, total: this.history.length };
    }

    /** Append a single spin to history */
    appendSpin(number, liveSpinIndex = null) {
      const n = Number(number);
      if (isNaN(n) || n < 0 || n > 36) return;
      this.history.push(n);
      // Keep last 500 to avoid memory bloat
      if (this.history.length > 500) this.history = this.history.slice(-500);
      if (this.state.phase === "idle" && this.history.length >= MIN_HISTORY) {
        this.prepareFromHistory_(this.state.mode);
      }
      // If observing, score it
      if (this.state.phase === "observing") {
        this.scoreSpin_(n, liveSpinIndex);
      } else if (this.state.phase === "betting") {
        this.checkBet_(n, liveSpinIndex);
      }
      // deciding = waiting for user, don't process spins
      this.save_();
    }

    /** Select 6 candidate streets from history */
    selectCandidates(mode = "hot") {
      if (this.history.length < MIN_HISTORY) throw new Error(`Need at least ${MIN_HISTORY} numbers.`);
      const ranked = rankStreets(this.history, mode);
      const previous = this.state;
      this.state = this.freshState_();
      this.state.totalPL = previous.totalPL || 0;
      this.state.totalCycles = previous.totalCycles || 0;
      this.state.cycleWins = previous.cycleWins || 0;
      this.state.cycleBursts = previous.cycleBursts || 0;
      this.state.nextCycleId = previous.nextCycleId || 1;
      this.state.syncCycles = previous.syncCycles || [];
      this.state.syncSteps = previous.syncSteps || [];
      this.state.mode = mode;
      this.state.phase = "ready";
      this.state.candidates = ranked.slice(0, CANDIDATE_COUNT).map(r => r.street);
      this.save_();
    }

    prepareFromHistory_(mode = "hot") {
      const previous = this.state || this.freshState_();
      this.state = this.freshState_();
      this.state.mode = mode;
      this.state.totalPL = previous.totalPL || 0;
      this.state.totalCycles = previous.totalCycles || 0;
      this.state.cycleWins = previous.cycleWins || 0;
      this.state.cycleBursts = previous.cycleBursts || 0;
      this.state.nextCycleId = previous.nextCycleId || 1;
      this.state.syncCycles = previous.syncCycles || [];
      this.state.syncSteps = previous.syncSteps || [];
      if (this.history.length >= MIN_HISTORY) {
        const ranked = rankStreets(this.history, mode);
        this.state.phase = "ready";
        this.state.candidates = ranked.slice(0, CANDIDATE_COUNT).map(r => r.street);
      }
      this.save_();
    }

    /** Start observation phase */
    startObservation(liveSpinIndex = 0) {
      if (this.state.phase !== "ready") throw new Error("Select candidates first.");
      this.state.phase = "observing";
      this.state.observationSpin = 0;
      this.state.scores = new Array(12).fill(0);
      const cycleId = `C${Date.now().toString(36)}-${this.state.nextCycleId++}`;
      this.state.currentCycleId = cycleId;
      this.state.syncCycles.push({
        id: cycleId,
        mode: this.state.mode,
        historyCount: this.history.length,
        candidates: this.state.candidates.map(si => STREET_STARTS[si]),
        observationStartSpin: Number(liveSpinIndex) + 1,
        observationEndSpin: "",
        finalStreets: [],
        status: "Observing",
        resultSpin: "",
        resultNumber: "",
        cyclePL: 0
      });
      this.save_();
    }

    /** Score a spin during observation */
    scoreSpin_(number, liveSpinIndex = null) {
      const si = streetOf(number);
      // Count every spin toward observation, but only score candidate streets
      if (si >= 0 && this.state.candidates.includes(si)) {
        this.state.scores[si]++;
      }
      this.state.observationSpin++;
      // After 12 spins, finalize and wait for user decision
      if (this.state.observationSpin >= OBSERVATION_SPINS) {
        this.finalize_(liveSpinIndex);
      }
    }

    /** Finalize top 4 from candidates — phase becomes "deciding" (user chooses) */
    finalize_(liveSpinIndex = null) {
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
      const cycle = this.currentSyncCycle_();
      if (cycle) {
        cycle.observationEndSpin = Number(liveSpinIndex) || "";
        cycle.finalStreets = this.state.finalStreets.map(si => STREET_STARTS[si]);
        cycle.status = "Awaiting decision";
      }
      this.save_();
    }

    /** User accepts — start betting */
    acceptBet() {
      if (this.state.phase !== "deciding") throw new Error("No observation to accept.");
      this.state.phase = "betting";
      this.state.betStage = 1;
      this.state.activeProgression = [...this.progression];
      this.state.activeBaseUnit = this.baseUnit;
      const cycle = this.currentSyncCycle_();
      if (cycle) cycle.status = "Betting";
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
      this.save_();
    }

    /** User ignores — skip this cycle, pick new candidates */
    ignoreBet() {
      if (this.state.phase !== "deciding") throw new Error("No observation to ignore.");
      const cycle = this.currentSyncCycle_();
      if (cycle) cycle.status = "Ignored";
      this.state.totalCycles++;
      this.resetCycle_();
      this.save_();
    }

    /** Check if current bet wins */
    checkBet_(number, liveSpinIndex = null) {
      this.state.syncSpinNumber = number;
      this.state.syncSpinIndex = Number(liveSpinIndex) || "";
      const si = streetOf(number);
      if (si < 0) { this.loseBet_(); return; }
      if (this.state.finalStreets.includes(si)) {
        this.winBet_();
      } else {
        this.loseBet_();
      }
    }

    winBet_() {
      const progression = this.state.activeProgression || this.progression;
      const baseUnit = this.state.activeBaseUnit || this.baseUnit;
      const perStreet = progression[this.state.betStage - 1] * baseUnit;
      // Bet on all 4 streets. One wins (pays 11:1 = 12× per-street stake back).
      // Net: 12 - 4 = 8 × per-street stake
      const profit = perStreet * 8;
      this.recordSyncStep_("Win", profit);
      this.state.cyclePL += profit;
      this.state.totalPL += profit;
      this.state.cycleWins++;
      this.state.totalCycles++;
      this.state.lastResult = "win";
      this.state.lastResultBet = perStreet;
      this.state.resultId = (this.state.resultId || 0) + 1;
      this.finishSyncCycle_("Won");
      this.resetCycle_();
      this.startObservation(this.state.syncSpinIndex);
      this.save_();
    }

    loseBet_() {
      const progression = this.state.activeProgression || this.progression;
      const baseUnit = this.state.activeBaseUnit || this.baseUnit;
      const perStreet = progression[this.state.betStage - 1] * baseUnit;
      // Lose all 4 street bets
      const loss = perStreet * 4;
      this.recordSyncStep_("Loss", -loss);
      this.state.cyclePL -= loss;
      this.state.totalPL -= loss;
      if (this.state.betStage >= progression.length) {
        // Burst
        this.state.cycleBursts++;
        this.state.totalCycles++;
        this.state.lastResult = "burst";
        this.state.lastResultBet = perStreet;
        this.state.resultId = (this.state.resultId || 0) + 1;
        this.finishSyncCycle_("Burst");
        this.resetCycle_();
        this.startObservation(this.state.syncSpinIndex);
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
      this.state.activeProgression = null;
      this.state.activeBaseUnit = null;
      this.state.currentCycleId = null;
      // Re-select candidates for next cycle
      if (this.history.length >= MIN_HISTORY) {
        const ranked = rankStreets(this.history, this.state.mode);
        this.state.candidates = ranked.slice(0, CANDIDATE_COUNT).map(r => r.street);
      }
    }

    currentSyncCycle_() {
      return this.state.syncCycles.find(cycle => cycle.id === this.state.currentCycleId) || null;
    }

    recordSyncStep_(outcome, handPL) {
      const cycle = this.currentSyncCycle_();
      if (!cycle) return;
      const progression = this.state.activeProgression || this.progression;
      const baseUnit = this.state.activeBaseUnit || this.baseUnit;
      const perStreet = progression[this.state.betStage - 1] * baseUnit;
      this.state.syncSteps.push({
        id: `${cycle.id}:S${this.state.betStage}`,
        cycleId: cycle.id,
        stage: this.state.betStage,
        streets: this.state.finalStreets.map(si => STREET_STARTS[si]),
        perStreet,
        totalWager: perStreet * 4,
        spinIndex: this.state.syncSpinIndex,
        number: this.state.syncSpinNumber,
        numberStreet: streetOf(this.state.syncSpinNumber) >= 0 ? STREET_STARTS[streetOf(this.state.syncSpinNumber)] : 0,
        outcome,
        handPL,
        runningPL: this.state.cyclePL + handPL
      });
    }

    finishSyncCycle_(status) {
      const cycle = this.currentSyncCycle_();
      if (!cycle) return;
      cycle.status = status;
      cycle.resultSpin = this.state.syncSpinIndex;
      cycle.resultNumber = this.state.syncSpinNumber;
      cycle.cyclePL = this.state.cyclePL;
      const lastStep = this.state.syncSteps.at(-1);
      if (lastStep && lastStep.cycleId === cycle.id) cycle.cyclePL = lastStep.runningPL;
    }

    getSyncData() {
      return {
        cycles: JSON.parse(JSON.stringify(this.state.syncCycles || [])),
        steps: JSON.parse(JSON.stringify(this.state.syncSteps || []))
      };
    }

    /** Get current state for UI */
    getState() {
      const s = this.state;
      const prog = s.activeProgression || this.progression;
      const unit = s.activeBaseUnit || this.baseUnit;
      const totalBet = s.betStage > 0 ? prog.slice(0, s.betStage).reduce((a, b) => a + b, 0) * unit : 0;
      const currentBet = s.betStage > 0 ? prog[s.betStage - 1] * unit : 0;
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
        betMax: prog.length,
        currentBet: currentBet,
        totalBet: totalBet,
        cyclePL: s.cyclePL,
        totalPL: s.totalPL,
        cycleWins: s.cycleWins,
        cycleBursts: s.cycleBursts,
        totalCycles: s.totalCycles,
        lastResult: s.lastResult,
        lastResultBet: s.lastResultBet || 0,
        resultId: s.resultId || 0,
        progression: [...prog],
        baseUnit: unit
      };
    }

    /** Reset everything */
    reset() {
      this.history = [];
      this.state = this.freshState_();
      this.save_();
    }
  }

  root.RouletteHotStreets = { HotStreets, STREETS, STREET_LABELS, STREET_STARTS, FIB, MIN_HISTORY, parseNumbers, streetOf, rankStreets };
})(typeof globalThis !== "undefined" ? globalThis : this);
