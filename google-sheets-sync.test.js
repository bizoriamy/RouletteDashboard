"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadSync(saved = {}) {
  const values = new Map(Object.entries(saved));
  const context = {
    console,
    crypto: { randomUUID: () => "test-uuid" },
    localStorage: {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    },
    navigator: { onLine: true },
    fetch: async (url, opts) => opts?.method === "GET" ? { url } : { json: async () => ({ ok: true }) },
    setTimeout,
    Blob,
    URL,
  };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(require.resolve("./google-sheets-sync.js"), "utf8"), context);
  return { context, Sync: context.RouletteGoogleSync.GoogleSheetsSync };
}

(async () => {
  const empty = loadSync();
  const emptySync = new empty.Sync();
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
  assert.deepEqual(JSON.parse(JSON.stringify(sync.lastArchiveSummary())), { sessionNumber: 7, archivedAt: archive.archivedAt, spins: 3, sessionId: "session-id" });
  await sync.resyncLastArchive();

  console.log("google-sheets-sync tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
