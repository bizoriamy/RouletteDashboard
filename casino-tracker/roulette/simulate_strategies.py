"""
Simulate two betting strategies on the 6 twelve-number categories
using real spin data from the Google Sheet.

Strategies compared:
  A) Wait 6 absences → bet 4 steps (1, 2, 3, 4)  — total risk 10u
  B) Wait 6 absences → bet 4 steps (1, 1, 2, 3)  — total risk 7u
"""

import csv

# --- category definitions ---
# dozen1 = 1-12, dozen2 = 13-24, dozen3 = 25-36
# column1 = 1,4,7,10,13,16,19,22,25,28,31,34
# column2 = 2,5,8,11,14,17,20,23,26,29,32,35
# column3 = 3,6,9,12,15,18,21,24,27,30,33,36

CATEGORIES = {
    'dozen1': set(range(1, 13)),
    'dozen2': set(range(13, 25)),
    'dozen3': set(range(25, 37)),
    'column1': {1,4,7,10,13,16,19,22,25,28,31,34},
    'column2': {2,5,8,11,14,17,20,23,26,29,32,35},
    'column3': {3,6,9,12,15,18,21,24,27,30,33,36},
}

PROGRESSIONS = {
    '1,2,3,4': [1, 2, 3, 4],
    '1,1,2,3': [1, 1, 2, 3],
}

DOZEN_PAYOUT = 2  # net profit = bet * 2 (3x total including stake)

def belongs_to(number, category_set):
    return number in category_set

def simulate(spins, cat_name, cat_set, progression):
    """
    Simulate one category with one progression.
    Returns: dict with total_pnl, wins, bursts, events
    """
    prog = PROGRESSIONS[progression]
    max_steps = len(prog)
    total_risk = sum(prog)

    absence = 0          # consecutive misses
    betting = False
    bet_step = 0         # 1-indexed which bet we're on
    total_pnl = 0
    wins = 0
    bursts = 0
    events_triggered = 0  # how many times we triggered betting
    skip_until_hit = False  # after burst, wait for hit before re-triggering

    for spin_num in spins:
        n = int(spin_num)

        if n == 0:
            # zero: all categories absent
            absence += 1
            if betting:
                bet_step += 1
                if bet_step > max_steps:
                    total_pnl -= total_risk
                    bursts += 1
                    betting = False
                    bet_step = 0
            continue

        hit = belongs_to(n, cat_set)

        # --- betting logic ---
        if betting:
            if hit:
                # WIN
                profit = prog[bet_step - 1] * DOZEN_PAYOUT
                # subtract losses from previous steps in this cycle
                for s in range(bet_step - 1):
                    profit -= prog[s]
                total_pnl += profit
                wins += 1
                betting = False
                bet_step = 0
                skip_until_hit = False  # reset flag
            else:
                bet_step += 1
                if bet_step > max_steps:
                    total_pnl -= total_risk
                    bursts += 1
                    betting = False
                    bet_step = 0
                    skip_until_hit = True  # wait for a hit before re-triggering

        # --- absence tracking ---
        if hit:
            absence = 0
            if skip_until_hit:
                skip_until_hit = False  # now we can re-trigger next time
        else:
            absence += 1

        # --- trigger ---
        if absence >= 6 and not betting and not skip_until_hit:
            betting = True
            bet_step = 1
            events_triggered += 1

    return {
        'total_pnl': total_pnl,
        'wins': wins,
        'bursts': bursts,
        'events_triggered': events_triggered,
        'total_risk': total_risk,
    }

# --- load spins ---
spins_list = []
with open('spin_data.csv', 'r', encoding='utf-8') as f:
    reader = csv.reader(f)
    header = next(reader)
    for row in reader:
        if len(row) < 3:
            continue
        num_str = row[2].strip()
        if num_str and num_str.isdigit():
            spins_list.append(int(num_str))

print(f"Loaded {len(spins_list)} spins\n")

# --- run simulation ---
results = []
for cat_name, cat_set in sorted(CATEGORIES.items()):
    for prog_name in ['1,2,3,4', '1,1,2,3']:
        r = simulate(spins_list, cat_name, cat_set, prog_name)
        results.append((cat_name, prog_name, r))

# --- print results ---
print(f"{'Category':<12} {'Prog':<10} {'Triggers':<9} {'Wins':<6} {'Bursts':<7} {'P&L (u)':<9} {'Risk (u)':<9} {'ROI':<8}")
print("=" * 70)
for cat_name, prog_name, r in results:
    pnl = r['total_pnl']
    risk = r['total_risk'] * r['bursts']  # total units risked
    roi_pct = (pnl / r['total_risk'] * 100) if r['bursts'] > 0 else (pnl * 100 / (1 if pnl == 0 else abs(pnl)))
    # better ROI: pnl / total risked (sum of all losses that occurred)
    total_risked = r['total_risk'] * r['bursts']
    if total_risked > 0:
        roi = pnl / total_risked * 100
    else:
        roi = 0 if pnl == 0 else float('inf')
    
    print(f"{cat_name:<12} {prog_name:<10} {r['events_triggered']:<9} {r['wins']:<6} {r['bursts']:<7} {pnl:+5d}u   {r['total_risk']:>2}u/{r['bursts']:<3} {'---' if pnl==0 else f'{pnl/total_risked*100:.0f}%' if total_risked>0 else 'N/A':<8}")

print()

# --- totals per progression ---
for prog_name in ['1,2,3,4', '1,1,2,3']:
    total_pnl = sum(r['total_pnl'] for cn, pn, r in results if pn == prog_name)
    total_bursts = sum(r['bursts'] for cn, pn, r in results if pn == prog_name)
    total_risk = sum(r['total_risk'] for cn, pn, r in results if pn == prog_name)
    total_risked_units = total_risk * total_bursts
    print(f"{'ALL 6 CATEGORIES':<12} {prog_name:<10} {'':<9} {'':<6} {total_bursts:<7} {total_pnl:+5d}u   {total_risk:>2}u/{total_bursts:<3} {f'{total_pnl/total_risked_units*100:.0f}%' if total_risked_units>0 else 'N/A':<8}")

print()

# --- per-category summary ---
print("DETAILED BREAKDOWN BY CATEGORY")
print("=" * 70)
for cat_name, cat_set in sorted(CATEGORIES.items()):
    print(f"\n{cat_name}:")
    for prog_name in ['1,2,3,4', '1,1,2,3']:
        r = next(r for cn, pn, r in results if cn == cat_name and pn == prog_name)
        burst_rate = r['bursts'] / r['events_triggered'] * 100 if r['events_triggered'] > 0 else 0
        print(f"  {prog_name:>10}: P&L={r['total_pnl']:+3d}u  wins={r['wins']}  bursts={r['bursts']}  triggered={r['events_triggered']}  burst_rate={burst_rate:.0f}%")
