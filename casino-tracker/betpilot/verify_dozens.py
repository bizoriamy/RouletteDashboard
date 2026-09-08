#!/usr/bin/env python3
"""Comprehensive verification of all 4 bettors"""

numbers = [8, 20, 4, 19, 5, 3, 35, 11, 4, 32]

D1 = set(range(1, 13))
D2 = set(range(13, 25))
D3 = set(range(25, 37))

DOZEN_SETS = {1: D1, 2: D2, 3: D3}
PAIR_OPTIONS = [(1,2), (1,3), (2,3)]

print("MANUAL VERIFICATION - Bettor C (DOZEN)")
print("=" * 100)
print(f"{'Spin':<5} {'Num':<5} {'Pair':<8} {'D_A':<8} {'D_B':<8} {'Combined':<35} {'In Set':<8} {'Result':<8}")
print("-" * 100)

for spin_idx, winning_num in enumerate(numbers, start=1):
    pair_idx = (spin_idx - 1) % len(PAIR_OPTIONS)
    pair = PAIR_OPTIONS[pair_idx]
    
    d_a, d_b = pair
    set_a = DOZEN_SETS[d_a]
    set_b = DOZEN_SETS[d_b]
    combined = set_a | set_b
    
    is_in = winning_num in combined
    result = "WIN" if is_in else "LOSS"
    
    # Format combined set nicely
    combined_str = "{" + ", ".join(map(str, sorted(combined))) + "}"
    if len(combined_str) > 35:
        combined_str = combined_str[:32] + "..."
    
    print(f"{spin_idx:<5} {winning_num:<5} ({d_a},{d_b})    D{d_a}       D{d_b}       {combined_str:<35} {str(is_in):<8} {result:<8}")

print("\nNow checking what the SIMULATOR calculated...")
print("")

# Now run the actual simulator on this data
import sys
sys.path.insert(0, '.')

from betpilot_myMates_simulator import Bettor, DOZEN_SETS as ACTUAL_DOZEN_SETS

print("Checking if DOZEN_SETS in simulator match:")
for i in [1, 2, 3]:
    expected = DOZEN_SETS[i]
    actual = ACTUAL_DOZEN_SETS[i]
    match = "✓" if expected == actual else "✗"
    print(f"  D{i}: {match} Expected {expected} == Actual {actual}")
