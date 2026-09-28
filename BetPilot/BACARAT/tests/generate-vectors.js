/* BetPilot — settlement vector generator
 *
 * Run: node generate-vectors.js
 *
 * Writes tests/settlement-vectors.json from the JavaScript engine. tests/settlement_test.py then
 * recomputes every case with the Python server-side rules and fails if the two disagree. The rules
 * exist twice (browser + server); this is the guard that stops them drifting apart.
 */
"use strict";

var fs = require("fs");
var path = require("path");
var Engine = require(path.join(__dirname, "..", "app", "web", "engine.js"));

var SIDES = ["banker", "player", "tie", "pass"];
var RESULTS = ["banker", "player", "tie", null];
var STAKES = [0, 1, 2, 10];
var UNIT_VALUES = [100, 500, 25];
var RULE_SETS = [
  { label: "default 5% / 8:1", rules: { commissionRate: 0.05, playerPayout: 1, tiePayout: 8 } },
  { label: "no commission / 9:1", rules: { commissionRate: 0, playerPayout: 1, tiePayout: 9 } },
  { label: "10% commission", rules: { commissionRate: 0.1, playerPayout: 1, tiePayout: 8 } }
];

var FIELDS = ["side", "result", "outcome", "stakeUnits", "stakeCents", "profitCents", "commissionCents"];

function pick(settled) {
  var out = {};
  FIELDS.forEach(function (field) { out[field] = settled[field]; });
  return out;
}

function buildCases() {
  var cases = [];
  SIDES.forEach(function (side) {
    RESULTS.forEach(function (result) {
      STAKES.forEach(function (stake) {
        UNIT_VALUES.forEach(function (unitValue) {
          RULE_SETS.forEach(function (ruleSet) {
            var entry = {
              side: side,
              result: result,
              stakeUnits: stake,
              unitValueCents: unitValue,
              rules: ruleSet.rules,
              ruleLabel: ruleSet.label
            };
            try {
              entry.ok = true;
              entry.values = pick(Engine.settle(side, result, stake, unitValue, ruleSet.rules));
            } catch (error) {
              entry.ok = false;
              entry.errorName = error.name;
            }
            cases.push(entry);
          });
        });
      });
    });
  });
  return cases;
}

var DERIVE_FIELDS = ["bankrollCents", "netCents", "commissionCents", "stakedUnits", "wagers", "bets", "totalHands",
  "wins", "losses", "pushes", "voids", "bankerResults", "playerResults", "tieResults", "winRate",
  "maxDrawdownCents", "sequence", "last20", "streak", "longest"];

/* A hand is described either the v2 way — [side, result, stake, storedOutcome] — or the v3 way,
   where the wagers are listed: { result, wagers: [[side, stake], ...] }. Both are vectorised so the
   server's Python copy has to agree on the legacy shape as well as the multi-wager one. */
function buildSessions() {
  var specs = [
    {
      casino: "Vector A", startingUnits: 100, unitValueCents: 500, rules: { commissionRate: 0.05, tiePayout: 8 },
      // the first hand carries a deliberately WRONG stored outcome to cover the mismatch path
      hands: [["banker", "banker", 2, "lose"], ["banker", "tie", 5, null], ["tie", "tie", 1, null],
              ["pass", "banker", 0, null], ["player", "player", 3, null], ["banker", "player", 4, null]]
    },
    {
      casino: "Vector B", startingUnits: 0, unitValueCents: 100, rules: { commissionRate: 0, tiePayout: 9 },
      hands: [["pass", "tie", 0, null], ["banker", "tie", 1, null], ["player", "tie", 1, null]]
    },
    {
      casino: "Vector C", startingUnits: 50, unitValueCents: 2500, rules: { commissionRate: 0.1, tiePayout: 8 },
      hands: [["banker", "banker", 1, null], ["banker", "banker", 1, null], ["tie", "tie", 1, null],
              ["player", "banker", 2, null], ["player", "player", 2, null]]
    },
    {
      casino: "Vector D (hedged hands)", startingUnits: 80, unitValueCents: 500,
      rules: { commissionRate: 0.05, tiePayout: 8 },
      openWagers: [{ side: "banker", stakeUnits: 3 }],
      hands: [
        { result: "banker", wagers: [["banker", 10], ["tie", 1]] },
        { result: "tie", wagers: [["banker", 10], ["tie", 1]] },
        { result: "player", wagers: [["player", 4], ["tie", 2]] },
        { result: "player", wagers: [["banker", 5], ["tie", 1]] },
        { result: "tie", wagers: [["tie", 3]] },
        { result: "banker", wagers: [["pass", 0]] }
      ]
    }
  ];

  return specs.map(function (spec) {
    var session = Engine.createSession({
      casino: spec.casino, startingUnits: spec.startingUnits, unitValueCents: spec.unitValueCents,
      rules: spec.rules
    });
    session.hands = spec.hands.map(function (hand, index) {
      var base = {
        result: hand.result || (Array.isArray(hand) ? hand[1] : null),
        source: index === 0 ? "ocr" : "manual",
        at: "2026-09-28T12:0" + index + ":00"
      };
      if (!Array.isArray(hand)) {
        base.wagers = hand.wagers.map(function (wager) { return { side: wager[0], stakeUnits: wager[1] }; });
      } else {
        base.side = hand[0];
        base.stakeUnits = hand[2];
        base.outcome = hand[3] || null;
      }
      return base;
    });
    session.seq = session.hands.length + 1;
    session.openWagers = (spec.openWagers || []).map(function (wager) {
      return { side: wager.side, stakeUnits: wager.stakeUnits };
    });

    var derived = Engine.derive(session);
    var values = {};
    DERIVE_FIELDS.forEach(function (field) { values[field] = derived[field]; });
    return {
      casino: spec.casino,
      startingUnits: spec.startingUnits,
      unitValueCents: spec.unitValueCents,
      rules: session.rules,
      openWagers: session.openWagers,
      hands: session.hands.map(function (hand) {
        return {
          side: hand.side, stakeUnits: hand.stakeUnits, wagers: hand.wagers,
          result: hand.result, outcome: hand.outcome
        };
      }),
      derived: values
    };
  });
}

var output = {
  generatedBy: "tests/generate-vectors.js",
  engine: "app/web/engine.js",
  settleCases: buildCases(),
  sessions: buildSessions()
};

var target = path.join(__dirname, "settlement-vectors.json");
fs.writeFileSync(target, JSON.stringify(output, null, 1) + "\n", "utf8");
console.log("wrote " + output.settleCases.length + " settlement cases and " + output.sessions.length +
  " session derivations to " + target);
