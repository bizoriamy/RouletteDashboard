# Betting Systems & House Edge — Reference Analysis

*Reverse Labouchère, stop rules, and a cross-game house-edge comparison.*
*Last updated: Sep 2026. Figures from Monte Carlo simulation (this project) and Wizard of Odds (house edges).*

> ⚠️ **Core conclusion, stated up front:** no betting system — including reverse
> Labouchère — overcomes the house edge. Every stop rule and every game in this
> document has a negative expected value. The only things you can choose are *how
> fast* you lose (game + stake) and *how* your losses are shaped (stop rule).

---

## 1. Reverse Labouchère — mechanics

A "positive progression" — stakes grow after **wins**, not losses.

- Write a line of positive numbers. Bet = first + last (or the sole number if one remains).
- **Win** → add the bet amount to the end of the line.
- **Loss** → cross off the first and last numbers.
- Line is exhausted → cycle ends at a **loss equal to the sum of the original line**. Start a new line or stop.

**Key property:** the sum of the line is your hard maximum loss per cycle (numbers are
only ever removed on losses). Profits are *unbounded in principle* — they depend on
choosing to stop during a winning streak.

**Requirement:** only works on a bet that pays exactly **1:1** and resolves in a single
step (win = +1 unit, loss = −1 unit). This is the filter that disqualifies several games
(see §3).

---

## 2. Stop rules (the "when to stop" question)

The reverse Labouchère has **no built-in stopping point** on the winning side — that is
its central weakness. Three rules were tested:

| Rule | Logic |
|---|---|
| **1:1 (symmetric)** | Bank when P/L ≥ +$250 (for a $250 line). Risk $250 to make $250. |
| **1:2 (asymmetric)** | Bank when P/L ≥ +$500. Risk $250 to make $500. |
| **Ratchet** | Bank half at +$250, then let the rest run with a $125 trailing stop. |

**Findings (all games, all rules):**

- **1:1 is the least-bad** — highest win rate and smallest loss per cycle, because it
  banks early and plays the fewest bets.
- **1:2 has the worst EV** — plays longest to reach the higher target, paying more edge.
- **Ratchet has the biggest upside** (uncapped tail — best simulated win was thousands)
  but pays the most house edge because it stays in the game longest.

The stop rule only reshapes *how* you lose (win rate vs. payout size vs. variance). It
never changes the sign.

---

## 3. House-edge comparison (verified via Wizard of Odds)

| Game | Bet | House edge | Fits reverse Labouchère? |
|---|---|---|---|
| Blackjack | Basic strategy | **~0.5%** (skill) | ❌ Not even-money |
| Baccarat | Player | **1.24%** | ✅ Cleanest 1:1 fit |
| Baccarat | Banker | 1.06% (pays 0.95:1) | ⚠️ Commission breaks the 1:1 line |
| Craps | Pass line | 1.41% | ❌ Multi-roll (avg 3.4 rolls) |
| Craps | Don't pass | 1.36% | ❌ Multi-roll |
| Craps | Odds bet | **0.00%** | ❌ Pays 6:5 / 3:2 / 2:1, not 1:1 |
| Roulette | Red/Black, single-zero | 2.70% | ✅ |
| Roulette | Red/Black + La Partage | 1.35% | ✅ |
| Sic Bo / Tai Sai | Big / Small | **2.78%** | ✅ (worst of the group) |

**Clean even-money bets, ranked by edge (best first):**

1. Baccarat Player — 1.24%
2. Roulette La Partage — 1.35%
3. Roulette single-zero — 2.70%
4. Sic Bo Big/Small — 2.78%

**Notes:**

- **Baccarat Banker (1.06%)** looks best, but the 5% commission means a win pays $0.95,
  not $1.00 — it quietly breaks the "add the full bet" line rule. Player is the honest
  even-money choice.
- **Craps odds (0.00%)** is the only true zero-edge bet in a casino, but it only rides on
  top of a pass/don't-pass bet and pays non-even-money — can't be folded into the line.
- **Blackjack (~0.5%)** has the lowest edge but is a *skill* game with variable payouts
  (3:2 naturals, doubles, splits) — the system doesn't map onto it.

---

## 4. Simulation results

*Monte Carlo, 300,000 cycles, seeded, Python. Line = 50-50-50-50-50 → **$250 max loss**,
$50 units. House-edge probabilities: single-zero roulette 18/37; La Partage half-loss on
zero; Baccarat Player 44.62% win / 9.52% push / 45.86% lose; Sic Bo 105/216 win.*

### 4a. Cost per hour by game (1:1 stop rule — the best rule)

| Game (decisions/hr) | House edge | Cost / decision | Cost / hour |
|---|---|---|---|
| Roulette + La Partage (40) | 1.35% | −$1.61 | **−$64/hr** ← lowest per hour |
| Baccarat Player (80) | 1.24% | **−$1.46** ← lowest per bet | −$117/hr |
| Roulette single-zero (40) | 2.70% | −$3.21 | −$128/hr |
| Sic Bo Big/Small (60) | 2.78% | −$3.36 | **−$202/hr** ← worst both ways |

**Edge vs. speed:** Baccarat Player has the lowest edge and cheapest *per-bet* cost, but
runs ~80 hands/hour — so it costs *more per hour* than the slower La Partage roulette.
Burn rate = **edge × stake × decisions/hour**.

### 4b. Full results — all three stop rules

| Game (rate) | 1:1 | 1:2 | Ratchet |
|---|---|---|---|
| Roulette (40/hr) | −$128/hr | −$148/hr | −$154/hr |
| Roulette La Partage (40/hr) | −$64/hr | −$71/hr | −$70/hr |
| Baccarat Player (80/hr) | −$117/hr | −$141/hr | −$144/hr |
| Sic Bo (60/hr) | −$202/hr | −$237/hr | −$234/hr |

### 4c. Detailed per-cycle figures

**Roulette single-zero (2.70%)**

| Rule | Win rate | Avg/cycle | Avg win | Avg loss |
|---|---|---|---|---|
| 1:1 | 43.86% | −$14.69 | +$286.56 | −$250.00 |
| 1:2 | 26.25% | −$23.99 | +$610.99 | −$250.00 |
| Ratchet | 42.89% | −$20.86 | +$278.53 | −$245.67 |

**Roulette La Partage (1.35%)**

| Rule | Win rate | Avg/cycle | Avg win | Avg loss |
|---|---|---|---|---|
| 1:1 | 43.98% | −$7.35 | +$288.32 | −$239.48 |
| 1:2 | 26.47% | −$11.41 | +$614.30 | −$236.65 |
| Ratchet | 42.98% | −$9.52 | +$289.39 | −$234.80 |

**Baccarat Player (1.24%)**

| Rule | Win rate | Avg/cycle | Avg win | Avg loss |
|---|---|---|---|---|
| 1:1 | 45.21% | −$7.39 | +$286.56 | −$250.00 |
| 1:2 | 27.54% | −$12.72 | +$611.62 | −$250.00 |
| Ratchet | 44.23% | −$10.84 | +$285.05 | −$245.00 |

**Sic Bo Big/Small (2.78%)**

| Rule | Win rate | Avg/cycle | Avg win | Avg loss |
|---|---|---|---|---|
| 1:1 | 43.71% | −$15.38 | +$286.70 | −$250.00 |
| 1:2 | 26.06% | −$25.60 | +$611.18 | −$250.00 |
| Ratchet | 42.80% | −$21.14 | +$279.10 | −$246.50 |

*(Avg loss is less than −$250 only where half-losses on zero/La Partage occur; otherwise
the loss floor is exactly the line sum.)*

### 4d. Blackjack (for comparison — not a progression game)

- Basic strategy, ~0.5% edge, flat $50, ~70 hands/hr → **≈ −$18/hr**.
- Casual "by feel" play, ~2% edge → **≈ −$70/hr** (worse than Sic Bo).

Blackjack's low edge exists only through perfect basic strategy and is *skill-dependent*.
It is not a candidate for reverse Labouchère.

---

## 5. Scaling

All per-decision and per-hour figures scale **linearly with stake**. At $50 units the
best-case burn is −$1.46/decision (Baccarat Player). Halve the units → halve the dollars;
double them → double. The percentage edges never change.

---

## 6. Bottom line

- **Running a progression?** → Baccarat Player (lowest even-money edge) or La Partage
  roulette (lowest per-hour cost). Avoid Sic Bo.
- **Want the best odds, period?** → Forget progressions. Learn basic-strategy blackjack on
  a 3:2 table (and refuse 6:5 tables, which add ~1.4%).
- **Always remember:** these are loss-shaping tools, not profit tools. The house edge is a
  flat tax on every bet; game and stop rule only set the rate.

---

*Simulation script: `reverse_labouchere_sim.py` (Monte Carlo, reproducible with seed 42).
This analysis is original simulation work for internal/business use — not Wikipedia
content, which requires published sources.*
