(function (root) {
  "use strict";

  const STORAGE_KEY = "roulette-live-dashboard-v1";
  const SESSION_KEY = "roulette-live-session-v1";

  class DashboardStorage {
    constructor(storage = root.localStorage) {
      this.storage = storage;
      this.lastError = null;
    }

    load(Engine) {
      try {
        const raw = this.storage.getItem(STORAGE_KEY);
        if (!raw) return new Engine();
        return Engine.fromSnapshot(JSON.parse(raw));
      } catch (error) {
        this.lastError = error;
        return new Engine();
      }
    }

    save(engine) {
      try {
        this.storage.setItem(STORAGE_KEY, JSON.stringify(engine.exportSnapshot()));
        this.lastError = null;
        return true;
      } catch (error) {
        this.lastError = error;
        return false;
      }
    }

    clear() {
      this.storage.removeItem(STORAGE_KEY);
    }

    sessionInfo() {
      try {
        const saved = JSON.parse(this.storage.getItem(SESSION_KEY));
        if (saved?.number && saved?.id) return saved;
      } catch {}
      return this.saveSessionInfo({ number: 1, id: root.crypto?.randomUUID?.() || String(Date.now()), startedAt: new Date().toISOString() });
    }

    saveSessionInfo(info) {
      this.storage.setItem(SESSION_KEY, JSON.stringify(info));
      return info;
    }

    startNextSession() {
      const current = this.sessionInfo();
      return this.saveSessionInfo({ number: current.number + 1, id: root.crypto?.randomUUID?.() || String(Date.now()), startedAt: new Date().toISOString() });
    }
  }

  root.DashboardStorage = { DashboardStorage, STORAGE_KEY, SESSION_KEY };
})(typeof globalThis !== "undefined" ? globalThis : this);
