"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadSync(saved = {}) {
  const values = new Map(Object.entries(saved));
  const posts = [];
  const context = {
    console,
    crypto: { randomUUID: () => "test-uuid" },
    localStorage: {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    },
    navigator: { onLine: true },
    fetch: async (url, opts) => {
      if (opts?.method === "GET") return { url };
      posts.push(JSON.parse(opts.body));
      return { json: async () => ({ ok: true }) };
    },
    setTimeout,
    Blob,
    URL,
  };
  context.globalThis = context;
  context.RouletteCore = require("./roulette-core.js");
  vm.runInNewContext(fs.readFileSync(require.resolve("./google-sheets-sync.js"), "utf8"), context);
  return { context, Sync: context.RouletteGoogleSync.GoogleSheetsSync, posts, values };
}

(async () => {
  const empty = loadSync();
  const emptySync = new empty.Sync();
  const engine = new empty.context.RouletteCore.RouletteEngine();
  engine.addSpin(17);
  const tables = emptySync.buildTables_(engine.exportSnapshot(), engine.getState(), {
    getSyncData: () => ({
      cycles: [{ id:"C1", mode:"hot", historyCount:24, candidates:[1,4,7,10,13,16], observationStartSpin:1, observationEndSpin:12, finalStreets:[1,4,7,10], status:"Won", resultSpin:13, resultNumber:1, cyclePL:8 }],
      steps: [{ id:"C1:S1", cycleId:"C1", stage:1, streets:[1,4,7,10], perStreet:1, totalWager:4, spinIndex:13, number:1, numberStreet:1, outcome:"Win", handPL:8, runningPL:8 }],
    }),
  });
  assert.equal(tables["4-Street Cycles"].length, 1);
  assert.equal(tables["4-Street Steps"].length, 1);
  assert.equal(tables["4-Street Cycles"][0][4], "1,4,7,10,13,16");

  const freddyTables = emptySync.buildTables_(
    engine.exportSnapshot(),
    engine.getState(),
    null,
    {
      getSyncData: () => ({
        sessions: [{
          id: "F1", side: "red", startedAfterSpin: 2, endedAfterSpin: 5,
          startingBankroll: 300, finalBankroll: 307, result: 7,
          cycles: 1, highestLevel: 4, largestStake: 5, maxDrawdown: 3,
          stopReason: "manual", baseUnit: 1, cycleTarget: 5,
          maxLevel: 12, tableRule: "la-partage",
        }],
        steps: [{
          id: "F1:S1", trackerId: "F1", side: "red", spinIndex: 3,
          number: 3, result: "win", levelBefore: 1, positionBefore: 1,
          directionBefore: "ltr", stakeUnits: 1, deltaUnits: 1,
          cycleProfitAfter: 1, balanceAfter: 301, movement: "right",
          levelAfter: 2, positionAfter: 1, directionAfter: "ltr",
          cycleReset: false, stopReason: "",
          baseUnit: 1, tableRule: "la-partage",
        }],
      }),
    }
  );
  assert.equal(freddyTables["Freddy Sessions"].length, 1);
  assert.equal(freddyTables["Freddy Steps"].length, 1);
  assert.equal(freddyTables["Freddy Sessions"][0][2], "Red");
  assert.equal(freddyTables["Freddy Sessions"][0][7], 7);
  assert.equal(freddyTables["Freddy Steps"][0][2], "Red");

  const streakEngine = new empty.context.RouletteCore.RouletteEngine({
    evenSystem: "streak-rider",
    evenProgression: [1, 2, 1, 2],
  });
  [2, 4, 6, 8].forEach((number) => streakEngine.addSpin(number));
  streakEngine.startBet("odd");
  streakEngine.addSpin(17);
  streakEngine.addSpin(2);
  const streakTables = emptySync.buildTables_(
    streakEngine.exportSnapshot(),
    streakEngine.getState()
  );
  assert.equal(streakTables["Bet Sessions"][0][2], "Streak Rider");
  assert.equal(streakTables["Bet Sessions"][0][6], "Stopped");
  assert.equal(streakTables["Bet Sessions"][0][8], "first-loss-stopped");

  let reported = null;
  emptySync.listener = (message, type) => { reported = { message, type }; };
  assert.equal(emptySync.lastArchiveSummary(), null);
  await assert.rejects(emptySync.resyncLastArchive(), /no archived session/i);
  assert.deepEqual(reported, { message: "There is no archived session to resync in this dashboard.", type: "error" });

  const archive = { id: "archive-id", sessionId: "session-id", sessionNumber: 7, archivedAt: "2026-07-19T00:00:00.000Z", tables: { Spins: [[1], [2], [3]] } };
  const loaded = loadSync({
    "roulette-google-sync-config-v1": JSON.stringify({ url: "https://script.google.com/macros/s/test/exec", token: "12345678901234567890", enabled: true }),
    "roulette-google-sync-archives-v1": JSON.stringify([archive]),
  });
  const sync = new loaded.Sync();
  assert.deepEqual(JSON.parse(JSON.stringify(sync.lastArchiveSummary())), { sessionNumber: 7, archivedAt: archive.archivedAt, spins: 3, sessionId: "session-id", pending: false, syncedAt: "", lastSyncError: "" });
  await sync.resyncLastArchive();
  assert.equal(sync.lastArchiveSummary().pending, false);

  const localFirst = loadSync({
    "roulette-google-sync-config-v1": JSON.stringify({ url: "https://script.google.com/macros/s/test/exec", token: "12345678901234567890", enabled: true }),
  });
  const localFirstSync = new localFirst.Sync();
  const localEngine = new localFirst.context.RouletteCore.RouletteEngine();
  localFirstSync.attach(localEngine, null, null, () => {});
  localEngine.addSpin(11);
  assert.equal(localFirst.posts.length, 0, "live spin entry must not trigger a network request");
  const pendingArchive = localFirstSync.archiveCurrentSession(localEngine, 12);
  assert.equal(localFirstSync.matchingPendingArchive(localEngine), pendingArchive);
  assert.equal(localFirstSync.pendingArchiveCount(), 1);
  assert.equal(localFirstSync.lastArchiveSummary().pending, true);
  assert.equal(localFirst.posts.length, 0, "local archive creation must not trigger a network request");
  await localFirstSync.syncPendingArchives();
  assert.equal(localFirst.posts.length, 1, "completed session must sync in one batch request");
  assert.equal(localFirst.posts[0].replaceSession, true);
  assert.equal(localFirst.posts[0].tables.Spins.length, 1);
  assert.equal(pendingArchive.pending, false);
  assert.equal(localFirstSync.pendingArchiveCount(), 0);
  assert.equal(localFirstSync.matchingPendingArchive(localEngine), null, "synchronized archives are not stale-live recovery candidates");

  const failed = loadSync({
    "roulette-google-sync-config-v1": JSON.stringify({ url: "https://script.google.com/macros/s/test/exec", token: "12345678901234567890", enabled: true }),
  });
  failed.context.fetch = async () => ({ json: async () => ({ ok: false, error: "Unauthorized request" }) });
  const failedSync = new failed.Sync();
  failedSync.listener = () => {};
  const failedEngine = new failed.context.RouletteCore.RouletteEngine();
  failedEngine.addSpin(22);
  const retainedArchive = failedSync.archiveCurrentSession(failedEngine, 13);
  await assert.rejects(failedSync.syncArchive(retainedArchive), /Unauthorized request/);
  assert.equal(retainedArchive.pending, true, "failed session must remain pending locally");
  assert.equal(retainedArchive.lastSyncError, "Unauthorized request");

  const proxyFailure = loadSync({
    "roulette-google-sync-config-v1": JSON.stringify({ url: "https://script.google.com/macros/s/test/exec", token: "12345678901234567890", enabled: true }),
  });
  proxyFailure.context.location = { protocol: "http:", host: "localhost:8765" };
  proxyFailure.context.fetch = async () => { throw new TypeError("Failed to fetch"); };
  const proxyFailureSync = new proxyFailure.Sync();
  const proxyFailureEngine = new proxyFailure.context.RouletteCore.RouletteEngine();
  proxyFailureEngine.addSpin(23);
  const proxyFailureArchive = proxyFailureSync.archiveCurrentSession(proxyFailureEngine, 14);
  await assert.rejects(proxyFailureSync.syncArchive(proxyFailureArchive), /Cannot reach the local sync proxy/);
  assert.equal(proxyFailureArchive.pending, true, "proxy failures must keep the archive pending");
  assert.match(proxyFailureArchive.lastSyncError, /Launch Live Dashboard\.bat/);

  const socketDeniedFallback = loadSync({
    "roulette-google-sync-config-v1": JSON.stringify({ url: "https://script.google.com/macros/s/test/exec", token: "12345678901234567890", enabled: true }),
  });
  socketDeniedFallback.context.location = { protocol: "http:", host: "localhost:8765" };
  const socketDeniedCalls = [];
  socketDeniedFallback.context.fetch = async (url, opts) => {
    socketDeniedCalls.push({ url, body: JSON.parse(opts.body) });
    if (url === "http://localhost:8765/api/sync") {
      return {
        clone: () => ({ json: async () => ({ ok: false, error: "Cannot reach Apps Script: [WinError 10013] forbidden by its access permissions" }) }),
        json: async () => ({ ok: false, error: "Cannot reach Apps Script: [WinError 10013] forbidden by its access permissions" }),
      };
    }
    return { json: async () => ({ ok: true }) };
  };
  const socketDeniedSync = new socketDeniedFallback.Sync();
  const socketDeniedEngine = new socketDeniedFallback.context.RouletteCore.RouletteEngine();
  socketDeniedEngine.addSpin(24);
  const socketDeniedArchive = socketDeniedSync.archiveCurrentSession(socketDeniedEngine, 15);
  await socketDeniedSync.syncArchive(socketDeniedArchive);
  assert.equal(socketDeniedCalls.length, 2, "WinError 10013 should retry through direct browser Apps Script upload");
  assert.equal(socketDeniedCalls[0].url, "http://localhost:8765/api/sync");
  assert.equal(socketDeniedCalls[1].url, "https://script.google.com/macros/s/test/exec");
  assert.equal(socketDeniedArchive.pending, false);

  const boundary = loadSync({
    "roulette-google-sync-config-v1": JSON.stringify({ url: "https://script.google.com/macros/s/test/exec", token: "12345678901234567890", enabled: true }),
    "roulette-google-sync-meta-v1": JSON.stringify({
      sessionId: "old-session",
      sessionFirstSpinAt: "2026-07-31T01:00:00.000Z",
      lastEventCount: 40,
      counts: { Spins: 38, Triggers: 0, "Bet Sessions": 0, "Bet Steps": 0, "4-Street Cycles": 0, "4-Street Steps": 0, "Freddy Sessions": 0, "Freddy Steps": 0 },
      bankrollSignature: "",
    }),
  });
  const boundarySync = new boundary.Sync();
  const newSessionEngine = new boundary.context.RouletteCore.RouletteEngine();
  [10, 15, 27, 19, 4].forEach((number) => newSessionEngine.addSpin(number));
  await boundarySync.sync(newSessionEngine);
  assert.equal(boundary.posts.at(-1).Spins, undefined);
  assert.equal(boundary.posts.at(-1).tables.Spins.length, 5);
  assert.notEqual(boundary.posts.at(-1).sessionId, "old-session");

  const legacy = loadSync({
    "roulette-google-sync-config-v1": JSON.stringify({ url: "https://script.google.com/macros/s/test/exec", token: "12345678901234567890", enabled: true }),
    "roulette-google-sync-meta-v1": JSON.stringify({
      sessionId: "partial-40-spin-session",
      lastEventCount: 40,
      counts: { Spins: 38, Triggers: 0, "Bet Sessions": 0, "Bet Steps": 0, "4-Street Cycles": 0, "4-Street Steps": 0, "Freddy Sessions": 0, "Freddy Steps": 36 },
      bankrollSignature: "",
    }),
  });
  const legacySync = new legacy.Sync();
  const recoveredEngine = new legacy.context.RouletteCore.RouletteEngine();
  Array.from({ length: 40 }, (_, index) => (index * 7) % 37).forEach((number) => recoveredEngine.addSpin(number));
  await legacySync.sync(recoveredEngine);
  assert.equal(legacy.posts.at(-1).tables.Spins.length, 40);
  assert.notEqual(legacy.posts.at(-1).sessionId, "partial-40-spin-session");

  console.log("google-sheets-sync tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
