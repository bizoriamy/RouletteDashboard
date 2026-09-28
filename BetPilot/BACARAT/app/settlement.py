"""BetPilot — Baccarat settlement rules (Python mirror of app/web/engine.js).

The server is the single source of truth, so it must be able to settle a hand without asking the
browser. That means these rules exist twice: once in JavaScript for the UI, once here. To stop the
two drifting apart, tests/settlement_test.py compares this implementation against vectors produced
by the JavaScript engine (tests/generate-vectors.js). If either side changes, that test fails.

Money is integer cents. Units are integers. Commission is shaved off the profit only.
"""
import math

SIDES = ("banker", "player", "tie", "pass")
BET_SIDES = ("banker", "player", "tie")
RESULTS = ("banker", "player", "tie")
OUTCOMES = ("win", "lose", "push", "void")

DEFAULT_RULES = {
    "commissionRate": 0.05,
    "playerPayout": 1,
    "tiePayout": 8,
}

LIMITS = {
    "maxUnits": 100000,
    "maxUnitValueCents": 100000,
    "maxHands": 10000,
}


class SettlementError(ValueError):
    """Raised when a side, result, stake or rule is not valid."""


def js_round(value):
    """Match JavaScript's Math.round (floor(x + 0.5)) so cents agree across both engines."""
    return int(math.floor(value + 0.5))


def normalize_side(side):
    value = str(side or "").lower()
    if value not in SIDES:
        raise SettlementError('Bet side must be banker, player, tie or pass (got "%s")' % side)
    return value


def normalize_result(result):
    if result is None or result == "":
        return None
    value = str(result).lower()
    if value not in RESULTS:
        raise SettlementError('Result must be banker, player, tie or null (got "%s")' % result)
    return value


def normalize_rules(rules):
    merged = dict(DEFAULT_RULES)
    for key in DEFAULT_RULES:
        if not rules or rules.get(key) is None:
            continue
        try:
            number = float(rules[key])
        except (TypeError, ValueError):
            raise SettlementError("Rule %s must be a number" % key)
        if not math.isfinite(number) or number < 0:
            raise SettlementError("Rule %s must be a non-negative number" % key)
        merged[key] = number
    if merged["commissionRate"] >= 1:
        raise SettlementError("Commission rate must be below 1")
    return merged


def settle(side, result, stake_units, unit_value_cents, rules=None):
    """Turn (bet side, casino result) into money. The only place outcomes are decided."""
    normalized_side = normalize_side(side)
    normalized_result = normalize_result(result)
    normalized_rules = normalize_rules(rules)

    stake = stake_units if isinstance(stake_units, int) and not isinstance(stake_units, bool) and stake_units > 0 else 0
    unit_cents = unit_value_cents if isinstance(unit_value_cents, int) and not isinstance(unit_value_cents, bool) and unit_value_cents > 0 else 0
    stake_cents = 0 if normalized_side == "pass" else stake * unit_cents

    if normalized_side == "pass":
        return {
            "side": "pass",
            "result": normalized_result,
            "outcome": "void",
            "stakeUnits": 0,
            "stakeCents": 0,
            "profitCents": 0,
            "commissionCents": 0,
            "note": "No bet on this hand",
        }

    if normalized_result is None:
        raise SettlementError("A result is required to settle a %s bet" % normalized_side)

    if normalized_result == "tie":
        outcome = "win" if normalized_side == "tie" else "push"
    else:
        outcome = "win" if normalized_side == normalized_result else "lose"

    profit_cents = 0
    commission_cents = 0

    if outcome == "win":
        if normalized_side == "banker":
            commission_cents = js_round(stake_cents * normalized_rules["commissionRate"])
            profit_cents = stake_cents - commission_cents
        elif normalized_side == "player":
            profit_cents = js_round(stake_cents * normalized_rules["playerPayout"])
        else:
            profit_cents = js_round(stake_cents * normalized_rules["tiePayout"])
    elif outcome == "lose":
        profit_cents = -stake_cents
    else:
        profit_cents = 0

    return {
        "side": normalized_side,
        "result": normalized_result,
        "outcome": outcome,
        "stakeUnits": stake,
        "stakeCents": stake_cents,
        "profitCents": profit_cents,
        "commissionCents": commission_cents,
        "note": "Push — stake returned" if outcome == "push" else "",
    }


def current_streak(sequence):
    if not sequence:
        return {"result": None, "length": 0}
    result = sequence[-1]
    length = 1
    for value in reversed(sequence[:-1]):
        if value != result:
            break
        length += 1
    return {"result": result, "length": length}


def longest_streaks(sequence):
    longest = {"banker": 0, "player": 0, "tie": 0}
    current_result = None
    current_length = 0
    for result in sequence:
        if result == current_result:
            current_length += 1
        else:
            current_result = result
            current_length = 1
        if current_length > longest.get(result, 0):
            longest[result] = current_length
    return longest


def open_wagers(session):
    """The wagers waiting on a result. Accepts the v2 single openBet shape as well."""
    if not session:
        return []
    wagers = session.get("openWagers")
    if isinstance(wagers, list):
        return wagers
    open_bet = session.get("openBet")
    return [open_bet] if open_bet else []


def hand_wagers(hand):
    """A stored hand as a list of wagers, accepting the v2 single-wager shape."""
    wagers = hand.get("wagers")
    if isinstance(wagers, list) and wagers:
        return [{"side": w.get("side"), "stakeUnits": w.get("stakeUnits")} for w in wagers]
    return [{"side": hand.get("side"), "stakeUnits": hand.get("stakeUnits")}]


def derive(session):
    """Recompute every figure from the recorded inputs. Stored derived values are never trusted."""
    rules = normalize_rules(session.get("rules"))
    unit_value_cents = session.get("unitValueCents") if isinstance(session.get("unitValueCents"), int) else 0
    starting_units = session.get("startingUnits") if isinstance(session.get("startingUnits"), int) else 0

    totals = {
        "hands": 0, "wagers": 0, "bets": 0, "wins": 0, "losses": 0, "pushes": 0, "voids": 0,
        "stakedUnits": 0, "netCents": 0, "commissionCents": 0,
        "bankerResults": 0, "playerResults": 0, "tieResults": 0,
    }
    sequence = []
    hands = []
    running_cents = 0
    peak_cents = 0
    max_drawdown_cents = 0

    for index, hand in enumerate(session.get("hands", [])):
        settled_wagers = []
        for wager in hand_wagers(hand):
            settled = settle(wager.get("side"), hand.get("result"), wager.get("stakeUnits"),
                             unit_value_cents, rules)
            settled_wagers.append({
                "side": settled["side"],
                "stakeUnits": settled["stakeUnits"],
                "stakeCents": settled["stakeCents"],
                "outcome": settled["outcome"],
                "profitCents": settled["profitCents"],
                "commissionCents": settled["commissionCents"],
            })

        stake_units = sum(wager["stakeUnits"] for wager in settled_wagers)
        stake_cents = sum(wager["stakeCents"] for wager in settled_wagers)
        commission_cents = sum(wager["commissionCents"] for wager in settled_wagers)
        profit_cents = sum(wager["profitCents"] for wager in settled_wagers)
        is_pass = len(settled_wagers) == 1 and settled_wagers[0]["side"] == "pass"
        # The hand's outcome is the NET of its wagers.
        if is_pass:
            outcome = "void"
        elif profit_cents > 0:
            outcome = "win"
        elif profit_cents < 0:
            outcome = "lose"
        else:
            outcome = "push"

        enriched = {
            "n": index + 1,
            "at": hand.get("at"),
            "source": "ocr" if hand.get("source") == "ocr" else "manual",
            "wagers": settled_wagers,
            "result": normalize_result(hand.get("result")),
            "outcome": outcome,
            "isPass": is_pass,
            "stakeUnits": stake_units,
            "stakeCents": stake_cents,
            "profitCents": profit_cents,
            "commissionCents": commission_cents,
            "side": "pass" if is_pass else ("+".join(wager["side"] for wager in settled_wagers)),
            "recordedOutcome": hand.get("outcome"),
            "outcomeMismatch": bool(hand.get("outcome") and hand.get("outcome") != outcome),
        }

        totals["hands"] += 1
        totals["commissionCents"] += commission_cents
        if is_pass:
            totals["voids"] += 1
        else:
            totals["wagers"] += len(settled_wagers)
            totals["stakedUnits"] += stake_units

        if outcome == "win":
            totals["wins"] += 1
        elif outcome == "lose":
            totals["losses"] += 1
        elif outcome == "push":
            totals["pushes"] += 1

        if enriched["result"] == "banker":
            totals["bankerResults"] += 1
        elif enriched["result"] == "player":
            totals["playerResults"] += 1
        elif enriched["result"] == "tie":
            totals["tieResults"] += 1

        totals["netCents"] += enriched["profitCents"]
        running_cents += enriched["profitCents"]
        peak_cents = max(peak_cents, running_cents)
        max_drawdown_cents = max(max_drawdown_cents, peak_cents - running_cents)

        if enriched["result"]:
            sequence.append(enriched["result"])
        hands.append(enriched)

    bankroll_cents = starting_units * unit_value_cents + totals["netCents"]
    settled_hands = totals["wins"] + totals["losses"] + totals["pushes"]

    return {
        "hands": hands,
        "sequence": sequence,
        "bankrollCents": bankroll_cents,
        "bankrollUnits": round(bankroll_cents / unit_value_cents, 2) if unit_value_cents else 0,
        "startingCents": starting_units * unit_value_cents,
        "netCents": totals["netCents"],
        "netUnits": round(totals["netCents"] / unit_value_cents, 2) if unit_value_cents else 0,
        "commissionCents": totals["commissionCents"],
        "stakedUnits": totals["stakedUnits"],
        "wagers": totals["wagers"],
        "bets": totals["wagers"],
        "totalHands": totals["hands"],
        "wins": totals["wins"],
        "losses": totals["losses"],
        "pushes": totals["pushes"],
        "voids": totals["voids"],
        "bankerResults": totals["bankerResults"],
        "playerResults": totals["playerResults"],
        "tieResults": totals["tieResults"],
        "winRate": round((totals["wins"] / settled_hands) * 100, 2) if settled_hands else 0,
        "maxDrawdownCents": max_drawdown_cents,
        "last20": sequence[-20:],
        "streak": current_streak(sequence),
        "longest": longest_streaks(sequence),
    }


def format_cents(cents):
    value = cents if isinstance(cents, (int, float)) else 0
    sign = "-" if value < 0 else ""
    absolute = abs(int(value))
    return "%s$%d.%02d" % (sign, absolute // 100, absolute % 100)
