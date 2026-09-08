"""
Monte Carlo simulation of the Reverse Labouchère (cancellation) betting system
across four even-money games, comparing three stop rules.

Games (all pay 1:1 on win/loss):
  - Roulette (single-zero)      2.70% house edge
  - Roulette La Partage         1.35% house edge (half-loss on zero)
  - Baccarat Player             1.24% house edge (ties are pushes)
  - Sic Bo / Tai Sai Big-Small  2.78% house edge

Stop rules:
  - 1:1     bank when P/L >= +$250 (symmetric with the $250 max loss)
  - 1:2     bank when P/L >= +$500 (asymmetric)
  - Ratchet bank half at +$250, then let it run with a $125 trailing stop

Output is per-cycle, per-decision, and per-hour (using each game's typical
decisions/hour rate). Results are reproduced in:
    betting-systems-house-edge-analysis.md

Run:  python reverse_labouchere_sim.py
"""

import random

N = 300_000
random.seed(42)
START = [50, 50, 50, 50, 50]   # $50 units -> $250 max loss
TABLE_LIMIT = 500.0            # typical even-money table cap

# Games: probabilities of win / lose / half-loss / push (all pay 1:1 on win/loss)
GAMES = {
    "Roulette (single-0)":  dict(win=18/37,    lose=19/37,    half=0.0,     push=0.0,      rate=40),
    "Roulette La Partage":  dict(win=18/37,    lose=18/37,    half=1/37,    push=0.0,      rate=40),
    "Baccarat Player":      dict(win=0.446247, lose=0.458597, half=0.0,     push=0.095156, rate=80),
    "Sic Bo Big/Small":     dict(win=105/216,  lose=111/216,  half=0.0,     push=0.0,      rate=60),
}


def resolve(g):
    """Return the outcome of one decision: 'win', 'lose', 'half', or 'push'."""
    r = random.random()
    if r < g["win"]:
        return "win"
    r -= g["win"]
    if r < g["lose"]:
        return "lose"
    r -= g["lose"]
    if r < g["half"]:
        return "half"
    return "push"


def cycle(g, target=None, ratchet=False, trail=125.0):
    """Run one Reverse Labouchère cycle. Returns (final P/L, decisions)."""
    line = list(START)
    cash = 0.0
    peak = 0.0
    milestone = False
    decisions = 0

    while line:
        bet = line[0] if len(line) == 1 else line[0] + line[-1]
        if bet > TABLE_LIMIT:
            break
        decisions += 1
        if decisions > 5000:
            break

        out = resolve(g)
        if out == "win":
            cash += bet
            line.append(bet)
        elif out == "lose":
            cash -= bet
            if len(line) == 1:
                line.pop()
            else:
                line.pop(0)
                line.pop()
        elif out == "half":
            cash -= bet / 2.0
            if len(line) == 1:
                line.pop()
            else:
                line.pop(0)
                line.pop()
        # push -> nothing changes; the same bet is re-made next iteration

        if cash > peak:
            peak = cash

        if ratchet:
            if cash >= 250.0:
                milestone = True
            if milestone and (peak - cash) >= trail:
                break
        else:
            if cash >= target:
                break

    return cash, decisions


def simulate(g, **kw):
    """Run N cycles and return summary statistics for one game + stop rule."""
    res = [cycle(g, **kw) for _ in range(N)]
    pls = [r[0] for r in res]
    decs = [r[1] for r in res]
    wins = [p for p in pls if p > 0]

    avg = sum(pls) / N
    avg_dec = sum(decs) / N
    per_decision = avg / avg_dec

    return dict(
        p_win=len(wins) / N,
        avg=avg,
        avg_dec=avg_dec,
        per_decision=per_decision,
        per_hour=per_decision * g["rate"],
        avg_win=(sum(wins) / len(wins)) if wins else 0.0,
    )


RULES = [
    ("1:1 (+$250)",  {"target": 250.0}),
    ("1:2 (+$500)",  {"target": 500.0}),
    ("Ratchet $125", {"ratchet": True, "trail": 125.0}),
]


def main():
    print("Line 50-50-50-50-50 (max loss $250), $50 units\n")
    for gname, g in GAMES.items():
        print("%s  (decisions/hour = %d)" % (gname, g["rate"]))
        for name, kw in RULES:
            r = simulate(g, **kw)
            print("   %-13s win %6.2f%%   avg %+7.2f/cycle   %+6.2f/decision   %+7.0f/hr   avgWin %+7.2f   decisions %.1f"
                  % (name, r["p_win"] * 100, r["avg"], r["per_decision"], r["per_hour"], r["avg_win"], r["avg_dec"]))
        print()


if __name__ == "__main__":
    main()
