/**
 * European Roulette Analyzer -> Google Sheets bridge.
 * Deploy this file as a Google Apps Script web app owned by the Sheet owner.
 */
const SPREADSHEET_ID = '1HxkVoNdUIAP0TE2E_RBvw1Sg6aARbgypbUNRAyMJSdw';
const TOKEN_PROPERTY = 'ROULETTE_SYNC_TOKEN';
const LOG_SHEET = '_Sync Log';

const TABLES = Object.freeze({
  Spins: ['Spin ID', 'Date / Time', 'Number', 'Colour', 'Parity', 'Range', 'Table Session'],
  Triggers: ['Trigger ID', 'Date / Time', 'Side', 'Threshold', 'Trigger Spin', 'Trigger Number', 'Action', 'Start Absence'],
  'Bet Sessions': ['Session ID', 'Side', 'System / Trigger', 'Start Spin', 'End Spin', 'Stages', 'Result', 'P/L', 'End Reason', 'Base Unit / Concurrent Bets', 'Table Rule'],
  'Bet Steps': ['Session ID', 'Side', 'Stage', 'Stake', 'Spin ID', 'Number', 'Outcome', 'Running P/L'],
  '4-Street Cycles': ['Cycle ID', 'Table Session', 'Mode', 'History Count', 'Six Candidates', 'Observation Start Spin', 'Observation End Spin', 'Final Four Streets', 'Status', 'Result Spin', 'Result Number', 'Cycle P/L'],
  '4-Street Steps': ['Step ID', 'Cycle ID', 'Stage', 'Four Streets', 'Per-Street Stake', 'Total Wager', 'Spin ID', 'Winning Number', 'Winning Street', 'Outcome', 'Hand P/L', 'Running Cycle P/L'],
  Bankroll: ['Date / Time', 'Starting Bankroll', 'Current Bankroll', 'Realized P/L', 'Active P/L', 'Exposure', 'Unit Value', 'Won', 'Burst', 'Bankroll Group', 'Table Session'],
});

/** Run once from the Apps Script editor. The generated token is shown in the execution log. */
function setup() {
  const properties = PropertiesService.getScriptProperties();
  let token = properties.getProperty(TOKEN_PROPERTY);
  const created = !token;
  if (!token) {
    token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
    properties.setProperty(TOKEN_PROPERTY, token);
  }
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  Object.entries(TABLES).forEach(([name, headers]) => ensureSheet_(spreadsheet, name, headers));
  const log = ensureSheet_(spreadsheet, LOG_SHEET, ['Request ID', 'Received At', 'Session ID']);
  log.hideSheet();
  console.log((created ? 'NEW' : 'EXISTING') + '_ROULETTE_SYNC_TOKEN=' + token);
  return token;
}

/** Deliberately invalidate the dashboard token and generate a replacement. */
function rotateSyncToken() {
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty(TOKEN_PROPERTY, token);
  console.log('NEW_ROULETTE_SYNC_TOKEN=' + token);
  return token;
}
/** Run after adding new dashboard modules. Updates headers without changing the private token. */
function upgradeSchema() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  Object.entries(TABLES).forEach(([name, headers]) => ensureSheet_(spreadsheet, name, headers));
  const log = ensureSheet_(spreadsheet, LOG_SHEET, ['Request ID', 'Received At', 'Session ID']);
  log.hideSheet();
  console.log('Roulette Sheets schema upgraded. Existing sync token was not changed.');
}

function doGet() {
  return response_({ ok: true, service: 'European Roulette Analyzer sync', version: 1 });
}

function doPost(event) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const payload = JSON.parse((event && event.postData && event.postData.contents) || '{}');
    validatePayload_(payload);
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const log = ensureSheet_(spreadsheet, LOG_SHEET, ['Request ID', 'Received At', 'Session ID']);
    if (requestExists_(log, payload.requestId)) {
      return response_({ ok: true, duplicate: true, requestId: payload.requestId });
    }

    if (payload.replaceSession === true) deleteSessionRows_(spreadsheet, payload.sessionId);

    const written = {};
    Object.entries(payload.tables).forEach(([name, rows]) => {
      if (!Object.prototype.hasOwnProperty.call(TABLES, name)) throw new Error('Unknown table: ' + name);
      if (!Array.isArray(rows)) throw new Error(name + ' rows must be an array.');
      const sheet = ensureSheet_(spreadsheet, name, TABLES[name]);
      const normalized = rows.map(row => normalizeRow_(row, TABLES[name]));
      written[name] = name === 'Bankroll'
        ? replaceBankrollRows_(sheet, normalized, TABLES[name].length)
        : appendUniqueRows_(sheet, normalized, TABLES[name].length);
    });

    log.appendRow([payload.requestId, new Date(), payload.sessionId]);
    log.hideSheet();
    SpreadsheetApp.flush();
    return response_({ ok: true, requestId: payload.requestId, written });
  } catch (error) {
    return response_({ ok: false, error: String(error && error.message || error) });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function validatePayload_(payload) {
  const expected = PropertiesService.getScriptProperties().getProperty(TOKEN_PROPERTY);
  if (!expected) throw new Error('Run setup() before deploying the web app.');
  if (!payload || payload.token !== expected) throw new Error('Unauthorized request.');
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(String(payload.requestId || ''))) throw new Error('A valid requestId is required.');
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(String(payload.sessionId || ''))) throw new Error('A valid sessionId is required.');
  if (!payload.tables || typeof payload.tables !== 'object' || Array.isArray(payload.tables)) throw new Error('tables is required.');
}

function normalizeRow_(row, headers) {
  if (Array.isArray(row)) return headers.map((_, index) => safeCell_(row[index]));
  if (row && typeof row === 'object') return headers.map(header => safeCell_(row[header]));
  throw new Error('Each row must be an array or header-keyed object.');
}

function deleteSessionRows_(spreadsheet, sessionId) {
  const exactSessionColumn = { Spins: 7, Bankroll: 11, '4-Street Cycles': 2 };
  Object.keys(TABLES).forEach(name => {
    const sheet = spreadsheet.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return;
    const column = exactSessionColumn[name] || 1;
    const values = sheet.getRange(2, column, sheet.getLastRow() - 1, 1).getDisplayValues();
    for (let index = values.length - 1; index >= 0; index--) {
      const value = String(values[index][0] || '');
      const matches = exactSessionColumn[name] ? value === sessionId : value.indexOf(sessionId + ':') === 0;
      if (matches) sheet.deleteRow(index + 2);
    }
  });
}

/** Run once after installing this version to remove exact retry duplicates. */
function cleanupDuplicateRows() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const removed = {};
  Object.keys(TABLES).forEach(name => {
    const sheet = spreadsheet.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 3) {
      removed[name] = 0;
      return;
    }
    const width = TABLES[name].length;
    const dataRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, width);
    const rawValues = dataRange.getValues();
    const values = dataRange.getDisplayValues();
    const seen = new Set();
    const kept = [];
    for (let index = values.length - 1; index >= 0; index--) {
      const row = values[index];
      const key = name === 'Bankroll'
        ? `${row[9] || ''}\u001f${row[10] || ''}`
        : row.join('\u001f');
      if (!seen.has(key)) {
        seen.add(key);
        kept.push(rawValues[index]);
      }
    }
    kept.reverse();
    dataRange.clearContent();
    if (kept.length) sheet.getRange(2, 1, kept.length, width).setValues(kept);
    const count = values.length - kept.length;
    removed[name] = count;
  });
  SpreadsheetApp.flush();
  console.log('Duplicate cleanup complete: ' + JSON.stringify(removed));
  return removed;
}

function appendUniqueRows_(sheet, rows, width) {
  if (!rows.length) return 0;
  const existing = new Set();
  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getDisplayValues()
      .forEach(row => existing.add(row.join('\u001f')));
  }
  const unique = rows.filter(row => {
    const key = row.map(value => String(value)).join('\u001f');
    if (existing.has(key)) return false;
    existing.add(key);
    return true;
  });
  if (unique.length) sheet.getRange(sheet.getLastRow() + 1, 1, unique.length, width).setValues(unique);
  return unique.length;
}

function replaceBankrollRows_(sheet, rows, width) {
  if (!rows.length) return 0;
  rows.forEach(row => {
    if (sheet.getLastRow() >= 2) {
      const values = sheet.getRange(2, 10, sheet.getLastRow() - 1, 2).getDisplayValues();
      for (let index = values.length - 1; index >= 0; index--) {
        if (String(values[index][0]) === String(row[9]) &&
            String(values[index][1]) === String(row[10])) {
          sheet.deleteRow(index + 2);
        }
      }
    }
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, width).setValues([row]);
  });
  return rows.length;
}

function safeCell_(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const text = String(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function ensureSheet_(spreadsheet, name, headers) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (sheet.getMaxColumns() < headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  const current = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (current.join('\u001f') !== headers.join('\u001f')) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#19202b').setFontColor('#e6efff');
  }
  sheet.setFrozenRows(1);
  return sheet;
}

function requestExists_(logSheet, requestId) {
  if (logSheet.getLastRow() < 2) return false;
  return logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 1).createTextFinder(requestId).matchEntireCell(true).findNext() !== null;
}

function response_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
