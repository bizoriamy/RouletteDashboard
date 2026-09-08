#!/usr/bin/env python3
"""Debug version to trace step progression"""

# Test data
numbers = [8, 20, 4, 19, 5, 3, 35, 11, 4, 32, 28, 18, 2, 5, 18, 11, 29, 21, 32, 13]

COL1 = {1,4,7,10,13,16,19,22,25,28,31,34}
COL2 = {2,5,8,11,14,17,20,23,26,29,32,35}
COL3 = {3,6,9,12,15,18,21,24,27,30,33,36}

PAIR_OPTIONS = [(1,2), (1,3), (2,3)]
STEPS = [1, 3, 9, 27, 81, 243]

class DebugBettor:
    def __init__(self, name):
        self.name = name
        self.step_index = 0
        self.history = []
    
    def current_step_num(self):
        return self.step_index + 1
    
    def current_stake(self):
        return STEPS[self.step_index]
    
    def test_win(self, pair, winning_num):
        col1, col2 = pair
        col_set = {1,4,7,10,13,16,19,22,25,28,31,34} | {2,5,8,11,14,17,20,23,26,29,32,35} if col2 == 2 else {1,4,7,10,13,16,19,22,25,28,31,34} | {3,6,9,12,15,18,21,24,27,30,33,36}
        
        if col1 == 1 and col2 == 2:
            col_set = COL1 | COL2
        elif col1 == 1 and col2 == 3:
            col_set = COL1 | COL3
        else:
            col_set = COL2 | COL3
        
        is_win = winning_num in col_set
        return is_win

# Simulate Bettor A (column) for first 20 spins
print("BETTOR A (COLUMN) - Detailed Trace")
print("=" * 80)
print(f"{'Spin':<5} {'Num':<5} {'Pair':<8} {'Pre-Step':<10} {'Win?':<6} {'Post-Step':<10} {'Stake':<8}")
print("-" * 80)

bettor_a = DebugBettor('A')

for spin_idx, winning_num in enumerate(numbers, start=1):
    # A's rotation: spin 1 → pair 0, spin 2 → pair 1, spin 3 → pair 2, spin 4 → pair 0...
    pair_idx = (spin_idx - 1) % len(PAIR_OPTIONS)
    pair = PAIR_OPTIONS[pair_idx]
    
    pre_step = bettor_a.current_step_num()
    pre_stake = bettor_a.current_stake()
    is_win = bettor_a.test_win(pair, winning_num)
    
    if is_win:
        bettor_a.step_index = 0
    else:
        if bettor_a.step_index < 5:
            bettor_a.step_index += 1
        else:
            bettor_a.step_index = 0
    
    post_step = bettor_a.current_step_num()
    
    print(f"{spin_idx:<5} {winning_num:<5} ({pair[0]},{pair[1]})  {pre_step:<10} {'YES' if is_win else 'NO':<6} {post_step:<10} {pre_stake:<8}")
    
    bettor_a.history.append({
        'spin': spin_idx,
        'pair': pair,
        'pre_step': pre_step,
        'win': is_win,
        'post_step': post_step
    })

print("-" * 80)
print(f"\nTotal spins: {len(numbers)}")
print(f"Final step: {bettor_a.current_step_num()} (stake: {bettor_a.current_stake()}u)")

# Count max step hits manually
max_step_hits = sum(1 for h in bettor_a.history if h['pre_step'] == 6)
print(f"Max step hits (Step 6): {max_step_hits}")
