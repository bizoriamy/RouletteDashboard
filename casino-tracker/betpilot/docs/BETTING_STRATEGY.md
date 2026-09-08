# BetPilot Strategy Collection Guide

## Overview

BetPilot-myMates is a **collector of roulette strategies**. It records and tests the currently implemented systems so they can be compared consistently. This guide explains the two built-in strategy families, their logic, and their risks.

All results remain subject to the European roulette house edge. A positive session result is not evidence that a strategy has positive long-term expectation.

## Built-in Strategies

### Classic 4-Bettor Strategy

Four bettors operate simultaneously:

- Bettors A and B use rotating pairs of columns.
- Bettors C and D use rotating pairs of dozens.
- Each pair covers 24 of the 37 European roulette outcomes, excluding zero.
- Each bettor progresses independently through the configured stake sequence.

### Absence-Trigger Strategy

Two bettors operate independently:

- One bettor tracks the three columns.
- One bettor tracks the three dozens.
- The most-absent side is identified before each spin.
- When the configured absence trigger is reached, the bettor covers the other two sides.
- The progression is `1, 3, 9`; a win resets it, while a Step-3 loss is recorded as a burst and resets the sequence.

## Betting Patterns

### Bettor A (Fixed Rotation)
| Spin | Pattern | Columns |
|------|---------|---------|
| 1, 4, 7, ... | Col1 + Col2 | 1-36 split across 2 columns |
| 2, 5, 8, ... | Col1 + Col3 | 1-36 split across 2 columns |
| 3, 6, 9, ... | Col2 + Col3 | 1-36 split across 2 columns |

### Bettor B (Fixed Rotation)
| Spin | Pattern | Columns |
|------|---------|---------|
| 1, 4, 7, ... | Col2 + Col3 | 1-36 split across 2 columns |
| 2, 5, 8, ... | Col1 + Col2 | 1-36 split across 2 columns |
| 3, 6, 9, ... | Col1 + Col3 | 1-36 split across 2 columns |

**Key Property**: Bettor A and B never place the same column pair on the same spin. Both bettors always bet exactly 2 columns (covering 24 of 37 numbers, or ~65%).

## Column Mapping (European Roulette)

```
Column 1   Column 2   Column 3
---------  ---------  ---------
1  10  19  2  11  20  3  12  21
4  13  22  5  14  23  6  15  24
7  16  25  8  17  26  9  18  27
10 19  28  11 20  29  12 21  30
13 22  31  14 23  32  15 24  33
16 25  34  17 26  35  18 27  36

(Plus 0 = Green, no column)
```

## Bet Placement

### Per Spin, Per Bettor
- **Two identical bets** on the same column pair
- **Same stake** on each bet
- **Payout**: 2:1 for a winning column (return 3× the stake)

### Example
Bettor A, Spin 1, Step 2 (stake = 3u):
- Bet 1: 3u on Col1+Col2 (24 numbers)
- Bet 2: 3u on Col1+Col2 (24 numbers)
- **Total stake**: 6u
- **If winning number is in Col1 or Col2**:
  - One winning bet returns 3u × 3 = 9u (profit 3u on that bet)
  - Net for spin: 9u - 6u = +3u
- **If losing number (not in Col1 or Col2, or is 0)**:
  - Both bets lose
  - Net for spin: 0u - 6u = -6u

## Step Progression Logic

### The Steps (Per-Bet Stake)
| Step | Stake per Bet | Total per Spin | Description |
|------|---------------|----------------|-------------|
| 1    | 1u            | 2u             | Starting bet |
| 2    | 3u            | 6u             | After 1 loss |
| 3    | 9u            | 18u            | After 2 losses |
| 4    | 27u           | 54u            | After 3 losses |
| 5    | 81u           | 162u           | After 4 losses |
| 6    | 243u          | 486u           | After 5 losses (MAX) |

### Progression Rules

**After a WIN (any step):**
→ Reset to **Step 1** immediately for next spin

**After a LOSS (steps 1–5):**
→ Advance to **next step** for next spin

**After a WIN or LOSS at Step 6:**
→ Reset to **Step 1** immediately for next spin

### Purpose
- **Win:** Quick reset keeps stakes manageable
- **Loss streak**: Stakes increase to recover losses (Martingale-like)
- **Max step protection**: Ensures bets don't escalate beyond Step 6

## Example Sequence

```
Bettor A betting on Col1+Col2:

Spin 1: Number = 7 (in Col1) → WIN at Step 1
        Profit: +1u
        Next step: 1

Spin 2: Number = 15 (in Col3, not Col1+Col2) → LOSS at Step 1
        Loss: -2u (total stake for spin)
        Next step: 2

Spin 3: Number = 5 (in Col2) → WIN at Step 2
        Profit: +3u (winning bet pays 9u - 6u stake)
        Next step: 1 (reset on win)

Spin 4: Number = 0 (Green) → LOSS at Step 1
        Loss: -2u
        Next step: 2

Spin 5: Number = 12 (in Col3, not Col1+Col2) → LOSS at Step 2
        Loss: -6u
        Next step: 3

Spin 6: Number = 11 (in Col2) → WIN at Step 3
        Profit: +9u (winning bet pays 27u - 18u stake)
        Next step: 1 (reset on win)

...continuing...
```

## Key Metrics

### Individual Bettor Metrics
- **Spins**: Total spins in session
- **Wins**: Successful spins (winning bet landed)
- **Losses**: Failed spins (no winning bet)
- **Total Bet**: Sum of all stakes (stake × 2 per spin)
- **Total Return**: Sum of all payouts
- **Net Profit**: Total Return - Total Bet

### Max Step Metrics
- **Max Step Hits**: Times reached Step 6 (243u)
- **Max Step Wins**: Wins when at Step 6
- **Max Step Losses**: Losses when at Step 6

**Interpretation:**
- High max step hits → Experienced longer loss streaks
- High max step wins → Recovery when needed
- High max step losses → Risk of very large single-spin losses

### Session-Level Metrics
- **Combined Net**: Sum of both bettors' profits
- **Max Drawdown**: Largest peak-to-trough decline in cumulative profit
  - Measured on combined cumulative net
  - Indicates worst-case scenario during session
- **Largest Burst**: Single-spin swing with largest absolute magnitude
  - Can be win or loss
  - Shows volatility

## Probability Analysis

### Basic Win Rate
- **Columns**: 24 of 37 numbers (excluding 0)
- **Single column pair**: Two columns = 24 numbers out of 37
- **Theoretical win probability per spin**: 24/37 ≈ **64.9%**

### Actual Outcomes
The simulator reflects:
- Natural variance (good and bad streaks)
- The progression system amplifying wins and losses
- Two independent bettors with overlapping column coverage

### Expected Performance
Over 100 spins with fair roulette:
- ~65 wins, ~35 losses per bettor
- But variance is high due to step progression
- A few long loss streaks can significantly damage profits

## Strategies to Consider

### Conservative (Max Step 1–2)
- Keep stakes low
- Avoid large bets
- Slower progression
- Lower drawdown risk

### Aggressive (Max Step 5–6)
- Allow higher stakes
- Attempt to recover losses faster
- Higher drawdown risk
- Larger potential swings

### Balanced (Max Step 3–4)
- Middle ground
- Moderate escalation
- Manageable risk

## Risk Considerations

1. **No House Edge Adjustment**: Simulator assumes true 24/37 probability (European roulette). Real casinos have commission on certain bets.

2. **Unlimited Bankroll**: Simulator assumes infinite bankroll. Real betting requires capital limits.

3. **Realistic Roulette**: Numbers should come from real spins or fair RNG. Biased spins or patterns can skew results.

4. **Step 6 Exposure**: A single loss at Step 6 = 486u loss. Ensure bankroll can absorb this.

## Interpreting Results

### Good Session
- Positive combined net (both bettors profitable)
- Low max drawdown (smooth progression)
- Modest max step hits (few loss streaks)

### Mixed Session
- One bettor wins, other loses
- Moderate drawdown
- Normal max step activity

### Challenging Session
- Negative combined net
- High max drawdown (significant losses)
- Frequent max step hits (many loss streaks)

### Recovery Analysis
Look at max step wins vs. losses:
- If max step wins > losses → Progression strategy helped recovery
- If max step losses > wins → Risk wasn't worth it this session

---

Use this guide to understand your simulation results and adjust your max step selection for future sessions.
