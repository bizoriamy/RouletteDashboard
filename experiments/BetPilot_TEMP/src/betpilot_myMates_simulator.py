#!/usr/bin/env python3
"""
BetPilot-myMates simulator
- European roulette (0-36)
- Two bettors (A and B) place two identical bets each on column pairs: (Col1+Col2), (Col1+Col3), (Col2+Col3)
- Steps (per-bet unit sizes): [1,3,9,27,81,243]
- Each bettor places two bets of the same stake (so total stake per bettor is stake*2)
- Bettor resets to step 1 individually after any winning bet
- Bettors cannot place the same pair on the same spin; each must place at least 2 columns (enforced by design)

Usage examples:
  python betpilot_myMates_simulator.py --numbers 7,0,19,32,14
  python betpilot_myMates_simulator.py --file spins.txt --max-step 4 --seed 42

Options:
  --file FILE         Path to a file with one winning number per line (0-36)
  --numbers NUMS      Comma-separated list of numbers (e.g. "1,2,3,0,36")
  --max-step N        Maximum step to progress to before staying there (1-6). Default 6
  --seed S            RNG seed for reproducible bettor choices
  --quiet             Reduce per-spin output (summary only)

"""

import argparse
import random
import sys
from typing import List, Tuple, Optional

# Column mapping for European roulette (standard table)
COL1 = {1,4,7,10,13,16,19,22,25,28,31,34}
COL2 = {2,5,8,11,14,17,20,23,26,29,32,35}
COL3 = {3,6,9,12,15,18,21,24,27,30,33,36}

COLUMN_SETS = {1: COL1, 2: COL2, 3: COL3}
PAIR_OPTIONS = [ (1,2), (1,3), (2,3) ]
STEPS = [1,3,9,27,81,243]

class Bettor:
    def __init__(self, name: str, max_step_index: int):
        self.name = name
        self.max_step_index = max_step_index  # 1..6
        self.step_index = 0  # index into STEPS (0-based)
        self.total_bet = 0.0
        self.total_return = 0.0
        self.spins = 0
        self.wins = 0
        self.losses = 0
        self.max_step_hits = 0  # times reached max step
        self.max_step_wins = 0  # wins when at max
        self.max_step_losses = 0  # losses when at max
        self.history = []  # tuples of (spin_idx, chosen_pair, stake_per_bet, win, net)

    def current_stake(self) -> int:
        return STEPS[self.step_index]

    def place_and_resolve(self, chosen_pair: Tuple[int,int], winning_number: int) -> Tuple[bool, float]:
        """Place two identical bets on the chosen_pair columns and resolve against winning_number.
        Returns (win_flag, net_profit)
        net_profit is payout minus stake (can be negative)
        """
        stake = self.current_stake()
        total_stake = stake * 2
        self.total_bet += total_stake
        self.spins += 1

        # check if at max step
        at_max = (self.step_index >= self.max_step_index - 1)
        if at_max:
            self.max_step_hits += 1

        # check win
        win_flag = False
        # Column 0 (green/zero) is no column; only 1-36 map
        if winning_number != 0:
            for col in chosen_pair:
                if winning_number in COLUMN_SETS[col]:
                    win_flag = True
                    break

        if win_flag:
            # column pays 2:1 -> return for winning bet = stake * 3 (stake + 2x)
            payout = stake * 3
            net = payout - total_stake
            self.total_return += payout
            self.wins += 1
            if at_max:
                self.max_step_wins += 1
            # reset step_index to 0
            self.step_index = 0
        else:
            payout = 0.0
            net = payout - total_stake
            self.total_return += payout
            self.losses += 1
            if at_max:
                self.max_step_losses += 1
            # after max step hand (win or lose), reset to step 1; otherwise advance
            if at_max:
                self.step_index = 0
            elif self.step_index < (self.max_step_index - 1):
                self.step_index += 1

        self.history.append((self.spins, chosen_pair, stake, win_flag, net))
        return win_flag, net

    def summary(self) -> dict:
        net = self.total_return - self.total_bet
        return {
            'name': self.name,
            'spins': self.spins,
            'wins': self.wins,
            'losses': self.losses,
            'total_bet': self.total_bet,
            'total_return': self.total_return,
            'net': net,
            'current_step_index': self.step_index,
            'current_stake': self.current_stake(),
            'max_step_hits': self.max_step_hits,
            'max_step_wins': self.max_step_wins,
            'max_step_losses': self.max_step_losses
        }


def parse_numbers_from_string(s: str) -> List[int]:
    parts = [p.strip() for p in s.split(',') if p.strip()!='']
    nums = []
    for p in parts:
        try:
            n = int(p)
            if n < 0 or n > 36:
                raise ValueError()
            nums.append(n)
        except ValueError:
            raise ValueError(f"Invalid number in list: '{p}' (must be integer 0-36)")
    return nums


def parse_numbers_from_file(path: str) -> List[int]:
    nums = []
    with open(path, 'r') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            # allow comma-separated or single per line
            if ',' in line:
                nums.extend(parse_numbers_from_string(line))
            else:
                try:
                    n = int(line)
                    if n < 0 or n > 36:
                        raise ValueError()
                    nums.append(n)
                except ValueError:
                    raise ValueError(f"Invalid number in file '{path}': '{line}'")
    return nums


def choose_pairs_for_two_bettors(rng: random.Random) -> Tuple[Tuple[int,int], Tuple[int,int]]:
    """Choose two distinct pairs (from PAIR_OPTIONS) for Bettor A and B, uniformly random but not identical."""
    a = rng.choice(PAIR_OPTIONS)
    b_options = [p for p in PAIR_OPTIONS if p != a]
    b = rng.choice(b_options)
    return a, b


def pretty_pair(pair: Tuple[int,int]) -> str:
    return f"Col{pair[0]}+Col{pair[1]}"


def compute_drawdown(cumulative):
    # cumulative: list of cumulative net values
    peak = cumulative[0] if cumulative else 0
    max_dd = 0
    for v in cumulative:
        if v > peak:
            peak = v
        dd = peak - v
        if dd > max_dd:
            max_dd = dd
    return max_dd


def run_simulation(spins: List[int], max_step:int=6, seed: Optional[int]=None, quiet: bool=False):
    if max_step < 1 or max_step > len(STEPS):
        raise ValueError("max_step must be between 1 and 6")

    rng = random.Random(seed)
    bettorA = Bettor('A', max_step_index=max_step)
    bettorB = Bettor('B', max_step_index=max_step)

    per_spin_records = []

    A_cycle = [ (1,2), (1,3), (2,3) ]
    B_cycle = [ (2,3), (1,2), (1,3) ]

    cumulative_net = []
    cum = 0.0

    for idx, spin in enumerate(spins, start=1):
        # deterministic rotation per user specification
        pairA = A_cycle[(idx-1) % 3]
        pairB = B_cycle[(idx-1) % 3]

        winA, netA = bettorA.place_and_resolve(pairA, spin)
        winB, netB = bettorB.place_and_resolve(pairB, spin)

        spin_total_net = netA + netB
        cum += spin_total_net
        cumulative_net.append(cum)

        per_spin_records.append({
            'spin_index': idx,
            'winning_number': spin,
            'pairA': pairA,
            'pairB': pairB,
            'winA': winA,
            'netA': netA,
            'stepA_after': bettorA.step_index + 1, # human-friendly 1-based
            'pairA_pretty': pretty_pair(pairA),
            'winB': winB,
            'netB': netB,
            'stepB_after': bettorB.step_index + 1,
            'pairB_pretty': pretty_pair(pairB),
            'spin_total_net': spin_total_net,
            'cumulative_net': cum
        })

        if not quiet:
            print(f"Spin {idx}: number={spin}")
            stakeA = bettorA.history[-1][2]
            stakeB = bettorB.history[-1][2]
            print(f"  Bettor A -> {pretty_pair(pairA)}, stake per bet={stakeA} (total {stakeA*2}) -> {'WIN' if winA else 'LOSS'}, net={netA:+.2f}, next step={bettorA.step_index+1}")
            print(f"  Bettor B -> {pretty_pair(pairB)}, stake per bet={stakeB} (total {stakeB*2}) -> {'WIN' if winB else 'LOSS'}, net={netB:+.2f}, next step={bettorB.step_index+1}")
            print()

    # summary
    sumA = bettorA.summary()
    sumB = bettorB.summary()

    # compute session-level metrics
    max_drawdown = compute_drawdown(cumulative_net)
    # largest single-spin burst (max absolute spin_total_net)
    largest_burst = 0.0
    largest_burst_spin = None
    largest_win = None
    largest_loss = None
    for r in per_spin_records:
        val = r['spin_total_net']
        if abs(val) > abs(largest_burst):
            largest_burst = val
            largest_burst_spin = r['spin_index']
        if largest_win is None or r['netA'] > largest_win['value']:
            largest_win = {'bettor':'A','value': r['netA'], 'spin': r['spin_index']} if r['netA'] >= r['netB'] else largest_win
        if largest_win is None or r['netB'] > largest_win.get('value', -1e18):
            largest_win = {'bettor':'B','value': r['netB'], 'spin': r['spin_index']} if r['netB'] > (largest_win.get('value') if largest_win else -1e18) else largest_win
        if largest_loss is None or r['netA'] < largest_loss.get('value', 1e18):
            largest_loss = {'bettor':'A','value': r['netA'], 'spin': r['spin_index']} if r['netA'] <= r['netB'] else largest_loss
        if largest_loss is None or r['netB'] < largest_loss.get('value', 1e18):
            largest_loss = {'bettor':'B','value': r['netB'], 'spin': r['spin_index']} if r['netB'] < (largest_loss.get('value') if largest_loss else 1e18) else largest_loss

    # fallback calculations if above logic didn't set them properly
    # compute per-bettor largest single-spin win/loss directly
    max_win_a = max((r['netA'] for r in per_spin_records), default=0)
    max_loss_a = min((r['netA'] for r in per_spin_records), default=0)
    max_win_b = max((r['netB'] for r in per_spin_records), default=0)
    max_loss_b = min((r['netB'] for r in per_spin_records), default=0)

    # prepare session-level summary
    session_metrics = {
        'spins': len(spins),
        'combined_net': cum,
        'max_drawdown': max_drawdown,
        'largest_burst': largest_burst,
        'largest_burst_spin': largest_burst_spin,
        'largest_win_A': max_win_a,
        'largest_loss_A': max_loss_a,
        'largest_win_B': max_win_b,
        'largest_loss_B': max_loss_b,
        'max_step_hits_A': sumA['max_step_hits'],
        'max_step_wins_A': sumA['max_step_wins'],
        'max_step_losses_A': sumA['max_step_losses'],
        'max_step_hits_B': sumB['max_step_hits'],
        'max_step_wins_B': sumB['max_step_wins'],
        'max_step_losses_B': sumB['max_step_losses'],
    }

    print('\n=== Simulation summary ===')
    print(f"Bettor A: spins={sumA['spins']}, wins={sumA['wins']}, losses={sumA['losses']}, total_bet={sumA['total_bet']:.2f}, total_return={sumA['total_return']:.2f}, net={sumA['net']:.2f}")
    print(f"Bettor A: max_step_hits={sumA['max_step_hits']}, max_step_wins={sumA['max_step_wins']}, max_step_losses={sumA['max_step_losses']}")
    print(f"Bettor B: spins={sumB['spins']}, wins={sumB['wins']}, losses={sumB['losses']}, total_bet={sumB['total_bet']:.2f}, total_return={sumB['total_return']:.2f}, net={sumB['net']:.2f}")
    print(f"Bettor B: max_step_hits={sumB['max_step_hits']}, max_step_wins={sumB['max_step_wins']}, max_step_losses={sumB['max_step_losses']}")
    print(f"Session combined net: {session_metrics['combined_net']:.2f}, max_drawdown: {session_metrics['max_drawdown']:.2f}, largest_burst: {session_metrics['largest_burst']:.2f} (spin {session_metrics['largest_burst_spin']})")

    return {
        'per_spin': per_spin_records,
        'summaryA': sumA,
        'summaryB': sumB,
        'session_metrics': session_metrics
    }


def main(argv=None):
    parser = argparse.ArgumentParser(prog='BetPilot-myMates Simulator')
    parser.add_argument('--file', type=str, help='Path to file with winning numbers (one per line or comma-separated)')
    parser.add_argument('--numbers', type=str, help='Comma-separated list of winning numbers')
    parser.add_argument('--max-step', type=int, default=6, help='Maximum step to progress to before staying there (1-6). Default 6')
    parser.add_argument('--seed', type=int, default=None, help='RNG seed for reproducible bettor choices')
    parser.add_argument('--quiet', action='store_true', help='Show summary only')

    args = parser.parse_args(argv)

    spins = []
    if args.file:
        try:
            spins = parse_numbers_from_file(args.file)
        except Exception as e:
            print(f"Error reading file: {e}")
            sys.exit(1)
    elif args.numbers:
        try:
            spins = parse_numbers_from_string(args.numbers)
        except Exception as e:
            print(f"Error parsing numbers: {e}")
            sys.exit(1)
    else:
        # interactive input
        print("Enter winning numbers separated by commas (e.g. 7,0,19,32) or press Ctrl+D/Ctrl+Z to end:")
        try:
            raw = sys.stdin.read()
        except Exception as e:
            print(f"Failed to read stdin: {e}")
            sys.exit(1)
        raw = raw.strip()
        if not raw:
            print("No numbers provided. Exiting.")
            sys.exit(0)
        try:
            spins = parse_numbers_from_string(raw)
        except Exception as e:
            print(f"Error parsing input numbers: {e}")
            sys.exit(1)

    if len(spins) == 0:
        print("No spins to simulate. Exiting.")
        sys.exit(0)

    result = run_simulation(spins, max_step=args.max_step, seed=args.seed, quiet=args.quiet)

    # generate session id: spins(6 digits)-yymmdd-seq(3 digits)
    from datetime import datetime
    import os, json
    spin_count = len(spins)
    spins_padded = str(spin_count).zfill(6)
    date_tag = datetime.now().strftime('%y%m%d')

    # sessions.json stored next to this script
    base_dir = os.path.dirname(os.path.abspath(__file__))
    sessions_path = os.path.join(base_dir, 'sessions.json')

    sessions = {}
    if os.path.exists(sessions_path):
        try:
            with open(sessions_path, 'r') as sf:
                sessions = json.load(sf)
        except Exception:
            sessions = {}

    # find next sequence number for today's date
    seq = 1
    existing_seqs = []
    for sid in sessions.keys():
        parts = sid.split('-')
        if len(parts) >= 3 and parts[1] == date_tag:
            try:
                existing_seqs.append(int(parts[2]))
            except Exception:
                pass
    if existing_seqs:
        seq = max(existing_seqs) + 1

    session_id = f"{spins_padded}-{date_tag}-{str(seq).zfill(3)}"

    # build summary to persist
    summary_record = {
        'session_id': session_id,
        'timestamp': datetime.now().isoformat(),
        'spins': spin_count,
        'max_step': args.max_step,
        'summaryA': result['summaryA'],
        'summaryB': result['summaryB'],
        'session_metrics': result['session_metrics']
    }

    sessions[session_id] = summary_record

    try:
        with open(sessions_path, 'w') as sf:
            json.dump(sessions, sf, indent=2)
        # also save per-spin details
        per_spin_path = os.path.join(base_dir, f"session_{session_id}_per_spin.json")
        with open(per_spin_path, 'w') as pf:
            json.dump(result['per_spin'], pf, indent=2)
        print(f"\nSession saved as {session_id}")
        print(f"Summary stored in: {sessions_path}")
        print(f"Per-spin details stored in: {per_spin_path}")
    except Exception as e:
        print(f"Warning: Failed to save session summary: {e}")

if __name__ == '__main__':
    main()
