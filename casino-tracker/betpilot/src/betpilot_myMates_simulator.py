#!/usr/bin/env python3
"""
BetPilot-myMates 4-Bettor Simulator
- European roulette (0-36)
- Four bettors:
  * Bettor A & B: betting on COLUMNS (Col1, Col2, Col3)
  * Bettor C & D: betting on DOZENS (D1=1-12, D2=13-24, D3=25-36)
- Each pair of bettors has non-overlapping bet pairs
- Steps (per-bet unit sizes): [1,3,9,27,81,243]
- Each bettor places two bets of the same stake (total stake per bettor = stake*2)
- Bettor resets to step 1 individually after any winning bet
- Validation: No two bettors (same type) place the same pair on the same spin

Usage examples:
  python betpilot_myMates_simulator.py --numbers 7,0,19,32,14
  python betpilot_myMates_simulator.py --file spins.txt --max-step 4

Options:
  --file FILE         Path to a file with one winning number per line (0-36)
  --numbers NUMS      Comma-separated list of numbers (e.g. "1,2,3,0,36")
  --max-step N        Maximum step; loss at this step stops that bettor (1-6). Default 6
  --quiet             Reduce per-spin output (summary only)
"""

import argparse
import csv
import json
from datetime import datetime
from typing import List, Tuple, Dict
from pathlib import Path

# European Roulette Columns
COL1 = {1,4,7,10,13,16,19,22,25,28,31,34}
COL2 = {2,5,8,11,14,17,20,23,26,29,32,35}
COL3 = {3,6,9,12,15,18,21,24,27,30,33,36}

# Roulette Dozens
D1 = set(range(1, 13))      # 1-12
D2 = set(range(13, 25))     # 13-24
D3 = set(range(25, 37))     # 25-36

COLUMN_SETS = {1: COL1, 2: COL2, 3: COL3}
DOZEN_SETS = {1: D1, 2: D2, 3: D3}
PAIR_OPTIONS = [(1,2), (1,3), (2,3)]
STEPS = [1, 3, 9, 27, 81, 243]
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / 'data'

class Bettor:
    def __init__(self, name: str, bettor_type: str, max_step_index: int):
        """
        Args:
            name: Bettor name (A, B, C, D)
            bettor_type: 'column' or 'dozen'
            max_step_index: Maximum step (1-6)
        """
        self.name = name
        self.bettor_type = bettor_type
        self.max_step_index = max_step_index
        self.step_index = 0
        self.total_bet = 0.0
        self.total_return = 0.0
        self.spins = 0
        self.wins = 0
        self.losses = 0
        self.max_step_hits = 0
        self.max_step_wins = 0
        self.max_step_losses = 0
        self.is_active = True
        self.burst_spin = None
        self.cumulative_net = 0.0
        self.peak_net = 0.0
        self.min_net = 0.0
    
    def current_stake(self) -> int:
        return STEPS[self.step_index]
    
    def place_and_resolve(self, pair: Tuple[int, int], winning_number: int) -> Dict:
        """
        Place two bets (same pair, same stake) and resolve against winning number.
        Returns {bet_stake, total_stake, payout, net, win}
        """
        if not self.is_active:
            return {
                'bet_stake': 0,
                'total_stake': 0,
                'payout': 0,
                'net': 0,
                'win': False,
                'stopped': True,
                'bursted': False,
            }

        bet_stake = self.current_stake()
        total_stake = bet_stake * 2
        
        # Determine whether exactly one of the two bets in the pair wins.
        # For a valid column or dozen pair, only one side can hit a given number.
        if self.bettor_type == 'column':
            col1, col2 = pair
            bet1_hits = winning_number in COLUMN_SETS[col1]
            bet2_hits = winning_number in COLUMN_SETS[col2]
            winning_bets = int(bet1_hits) + int(bet2_hits)
            is_win = winning_bets == 1
        else:  # dozen
            d1, d2 = pair
            bet1_hits = winning_number in DOZEN_SETS[d1]
            bet2_hits = winning_number in DOZEN_SETS[d2]
            winning_bets = int(bet1_hits) + int(bet2_hits)
            is_win = winning_bets == 1
        
        # One of the two identical bets wins; the other loses.
        # A single winning bet pays 2:1, so return on a 1u bet is 3u.
        payout = (bet_stake * 3) if is_win else 0
        net = payout - total_stake
        
        # Track stats
        self.total_bet += total_stake
        self.total_return += payout
        self.spins += 1
        
        # Check if at max step before outcome
        at_max = self.step_index >= (self.max_step_index - 1)
        if at_max:
            self.max_step_hits += 1
        
        if is_win:
            self.wins += 1
            if at_max:
                self.max_step_wins += 1
            self.step_index = 0
            bursted = False
        else:
            self.losses += 1
            if at_max:
                self.max_step_losses += 1
                self.is_active = False
                bursted = True
            elif self.step_index < (self.max_step_index - 1):
                self.step_index += 1
                bursted = False
            else:
                self.step_index = 0
                bursted = False
        
        # Track cumulative net
        self.cumulative_net += net
        self.peak_net = max(self.peak_net, self.cumulative_net)
        self.min_net = min(self.min_net, self.cumulative_net)
        
        return {
            'bet_stake': bet_stake,
            'total_stake': total_stake,
            'payout': payout,
            'net': net,
            'win': is_win,
            'stopped': False,
            'bursted': bursted,
        }

def run_simulation(winning_numbers: List[int], max_step: int) -> Dict:
    """Run simulation with 4 bettors."""
    bettors = {
        'A': Bettor('A', 'column', max_step),
        'B': Bettor('B', 'column', max_step),
        'C': Bettor('C', 'dozen', max_step),
        'D': Bettor('D', 'dozen', max_step),
    }
    
    col_rotation = PAIR_OPTIONS
    dozen_rotation = PAIR_OPTIONS
    per_spin_records = []
    
    for spin_index, winning_num in enumerate(winning_numbers, start=1):
        # Validate number
        if not (0 <= winning_num <= 36):
            continue
        
        # Deterministic pair rotation
        col_pair_a = col_rotation[(spin_index - 1) % len(col_rotation)]
        col_pair_b = col_rotation[(spin_index) % len(col_rotation)]
        
        dozen_pair_c = dozen_rotation[(spin_index - 1) % len(dozen_rotation)]
        dozen_pair_d = dozen_rotation[(spin_index) % len(dozen_rotation)]
        
        # Ensure different pairs within same type
        if col_pair_a == col_pair_b:
            col_pair_b = col_rotation[(spin_index + 1) % len(col_rotation)]
        if dozen_pair_c == dozen_pair_d:
            dozen_pair_d = dozen_rotation[(spin_index + 1) % len(dozen_rotation)]
        
        # Place and resolve bets
        results_a = bettors['A'].place_and_resolve(col_pair_a, winning_num)
        results_b = bettors['B'].place_and_resolve(col_pair_b, winning_num)
        results_c = bettors['C'].place_and_resolve(dozen_pair_c, winning_num)
        results_d = bettors['D'].place_and_resolve(dozen_pair_d, winning_num)

        if results_a['bursted']:
            bettors['A'].burst_spin = spin_index
        if results_b['bursted']:
            bettors['B'].burst_spin = spin_index
        if results_c['bursted']:
            bettors['C'].burst_spin = spin_index
        if results_d['bursted']:
            bettors['D'].burst_spin = spin_index
        
        combined_net = results_a['net'] + results_b['net'] + results_c['net'] + results_d['net']
        
        spin_record = {
            'spin': spin_index,
            'winning_number': winning_num,
            'bettor_a': {
                'type': 'column',
                'pair': col_pair_a,
                'step': bettors['A'].step_index + 1,
                'stake': results_a['bet_stake'],
                'total_stake': results_a['total_stake'],
                'payout': results_a['payout'],
                'net': results_a['net'],
                'win': results_a['win'],
                'stopped': results_a['stopped'],
                'bursted': results_a['bursted'],
            },
            'bettor_b': {
                'type': 'column',
                'pair': col_pair_b,
                'step': bettors['B'].step_index + 1,
                'stake': results_b['bet_stake'],
                'total_stake': results_b['total_stake'],
                'payout': results_b['payout'],
                'net': results_b['net'],
                'win': results_b['win'],
                'stopped': results_b['stopped'],
                'bursted': results_b['bursted'],
            },
            'bettor_c': {
                'type': 'dozen',
                'pair': dozen_pair_c,
                'step': bettors['C'].step_index + 1,
                'stake': results_c['bet_stake'],
                'total_stake': results_c['total_stake'],
                'payout': results_c['payout'],
                'net': results_c['net'],
                'win': results_c['win'],
                'stopped': results_c['stopped'],
                'bursted': results_c['bursted'],
            },
            'bettor_d': {
                'type': 'dozen',
                'pair': dozen_pair_d,
                'step': bettors['D'].step_index + 1,
                'stake': results_d['bet_stake'],
                'total_stake': results_d['total_stake'],
                'payout': results_d['payout'],
                'net': results_d['net'],
                'win': results_d['win'],
                'stopped': results_d['stopped'],
                'bursted': results_d['bursted'],
            },
            'combined_net': combined_net
        }
        per_spin_records.append(spin_record)
    
    # Compute metrics
    def compute_max_drawdown(bettors_dict):
        drawdowns = []
        for b in bettors_dict.values():
            drawdown = b.peak_net - b.min_net
            drawdowns.append(drawdown)
        return max(drawdowns) if drawdowns else 0
    
    def compute_largest_burst(records):
        if not records:
            return 0
        return max(abs(r['combined_net']) for r in records)
    
    session_metrics = {
        'max_drawdown': compute_max_drawdown(bettors),
        'largest_burst': compute_largest_burst(per_spin_records),
        'total_spins': len(per_spin_records),
    }
    
    # Summary per bettor
    bettor_summary = {}
    for name, bettor in bettors.items():
        bettor_summary[name] = {
            'name': name,
            'type': bettor.bettor_type,
            'spins': bettor.spins,
            'wins': bettor.wins,
            'losses': bettor.losses,
            'total_bet': bettor.total_bet,
            'total_return': bettor.total_return,
            'net': bettor.total_return - bettor.total_bet,
            'max_step_hits': bettor.max_step_hits,
            'max_step_wins': bettor.max_step_wins,
            'max_step_losses': bettor.max_step_losses,
            'stopped': not bettor.is_active,
            'burst_spin': bettor.burst_spin,
        }
    
    return {
        'session_metrics': session_metrics,
        'bettor_summary': bettor_summary,
        'per_spin_records': per_spin_records,
    }

def generate_session_id():
    """Generate session ID: yymmdd-seq"""
    now = datetime.now()
    date_str = now.strftime("%y%m%d")
    
    DATA_DIR.mkdir(exist_ok=True)
    sessions_file = DATA_DIR / "sessions.json"
    
    if sessions_file.exists():
        with open(sessions_file, 'r') as f:
            sessions = json.load(f)
    else:
        sessions = {}
    
    date_key = f"seq_{date_str}"
    if date_key not in sessions:
        sessions[date_key] = 0
    
    seq_num = sessions[date_key] + 1
    sessions[date_key] = seq_num
    
    with open(sessions_file, 'w') as f:
        json.dump(sessions, f, indent=2)
    
    return f"{date_str}-{seq_num:03d}"


def write_summary_csv(session_id: str, max_step: int, results: Dict):
    """Write a spreadsheet-friendly row for session comparison."""
    DATA_DIR.mkdir(exist_ok=True)
    output_file = DATA_DIR / f"session_{session_id}_summary.csv"

    headers = [
        'session_id', 'max_step', 'total_spins', 'max_drawdown', 'largest_burst', 'combined_net',
        'bettorA_net', 'bettorB_net', 'bettorC_net', 'bettorD_net',
        'bettorA_wins', 'bettorA_losses', 'bettorB_wins', 'bettorB_losses',
        'bettorC_wins', 'bettorC_losses', 'bettorD_wins', 'bettorD_losses',
        'bettorA_max_hits', 'bettorB_max_hits', 'bettorC_max_hits', 'bettorD_max_hits',
        'bettorA_stopped', 'bettorB_stopped', 'bettorC_stopped', 'bettorD_stopped',
        'bettorA_burst_spin', 'bettorB_burst_spin', 'bettorC_burst_spin', 'bettorD_burst_spin'
    ]

    combined_net = sum(summary['net'] for summary in results['bettor_summary'].values())
    row = {
        'session_id': session_id,
        'max_step': max_step,
        'total_spins': results['session_metrics']['total_spins'],
        'max_drawdown': results['session_metrics']['max_drawdown'],
        'largest_burst': results['session_metrics']['largest_burst'],
        'combined_net': combined_net,
        'bettorA_net': results['bettor_summary']['A']['net'],
        'bettorB_net': results['bettor_summary']['B']['net'],
        'bettorC_net': results['bettor_summary']['C']['net'],
        'bettorD_net': results['bettor_summary']['D']['net'],
        'bettorA_wins': results['bettor_summary']['A']['wins'],
        'bettorA_losses': results['bettor_summary']['A']['losses'],
        'bettorB_wins': results['bettor_summary']['B']['wins'],
        'bettorB_losses': results['bettor_summary']['B']['losses'],
        'bettorC_wins': results['bettor_summary']['C']['wins'],
        'bettorC_losses': results['bettor_summary']['C']['losses'],
        'bettorD_wins': results['bettor_summary']['D']['wins'],
        'bettorD_losses': results['bettor_summary']['D']['losses'],
        'bettorA_max_hits': results['bettor_summary']['A']['max_step_hits'],
        'bettorB_max_hits': results['bettor_summary']['B']['max_step_hits'],
        'bettorC_max_hits': results['bettor_summary']['C']['max_step_hits'],
        'bettorD_max_hits': results['bettor_summary']['D']['max_step_hits'],
        'bettorA_stopped': results['bettor_summary']['A']['stopped'],
        'bettorB_stopped': results['bettor_summary']['B']['stopped'],
        'bettorC_stopped': results['bettor_summary']['C']['stopped'],
        'bettorD_stopped': results['bettor_summary']['D']['stopped'],
        'bettorA_burst_spin': results['bettor_summary']['A']['burst_spin'],
        'bettorB_burst_spin': results['bettor_summary']['B']['burst_spin'],
        'bettorC_burst_spin': results['bettor_summary']['C']['burst_spin'],
        'bettorD_burst_spin': results['bettor_summary']['D']['burst_spin'],
    }

    with open(output_file, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        writer.writerow(row)

    return output_file


def print_results(results: Dict, session_id: str):
    """Print formatted results."""
    print("\n" + "="*80)
    print(f"BetPilot-myMates 4-Bettor Simulation Results")
    print(f"Session: {session_id}")
    print("="*80 + "\n")
    
    # Session metrics
    metrics = results['session_metrics']
    print(f"Total Spins: {metrics['total_spins']}")
    print(f"Max Drawdown: {metrics['max_drawdown']:.2f}u")
    print(f"Largest Burst: {metrics['largest_burst']:.2f}u\n")
    
    # Per-bettor summary
    print("-" * 80)
    print(f"{'Bettor':<8} {'Type':<8} {'Spins':<8} {'W/L':<12} {'Bankroll Change':<16} {'Max Hits':<10} {'Status':<18}")
    print("-" * 80)
    
    for name in ['A', 'B', 'C', 'D']:
        summary = results['bettor_summary'][name]
        w_l = f"{summary['wins']}/{summary['losses']}"
        net = summary['net']
        if summary['stopped']:
            status = f"STOPPED@{summary['burst_spin']}"
        else:
            status = "ACTIVE"
        print(f"{name:<8} {summary['type']:<8} {summary['spins']:<8} {w_l:<12} {net:>14.0f}u {summary['max_step_hits']:>9} {status:<18}")
    
    print("-" * 80 + "\n")
    
    # Sample per-spin records
    records = results['per_spin_records']
    if records:
        print("Sample Per-Spin Details (first 10 spins):\n")
        for record in records[:10]:
            print(f"Spin {record['spin']}: Num={record['winning_number']}")
            for name in ['A', 'B', 'C', 'D']:
                key = f'bettor_{name.lower()}'
                bet = record[key]
                if bet.get('stopped'):
                    result = "STOPPED"
                elif bet.get('bursted'):
                    result = "BURST"
                else:
                    result = "WIN" if bet['win'] else "LOSS"
                pair_str = f"{bet['pair'][0]}{bet['pair'][1]}"
                print(f"  {name} ({bet['type']}) Pair({pair_str}): Step {bet['step']}, Stake/Bet {bet['stake']}u, Total Stake {bet['total_stake']}u, Payout {bet['payout']}u, Bankroll Change {bet['net']:+.0f}u [{result}]")
            print(f"  Combined Bankroll Change: {record['combined_net']:+.0f}u\n")

def main():
    parser = argparse.ArgumentParser(description="BetPilot-myMates 4-Bettor Simulator")
    parser.add_argument('--file', type=str, help='Input file with one number per line')
    parser.add_argument('--numbers', type=str, help='Comma-separated numbers')
    parser.add_argument('--max-step', type=int, default=6, help='Max step; a loss on this step stops that bettor (1-6)')
    parser.add_argument('--quiet', action='store_true', help='Reduce output')
    
    args = parser.parse_args()
    
    winning_numbers = []
    
    if args.file:
        try:
            with open(args.file, 'r') as f:
                winning_numbers = [int(line.strip()) for line in f if line.strip()]
        except Exception as e:
            print(f"Error reading file: {e}")
            return
    elif args.numbers:
        try:
            winning_numbers = [int(n.strip()) for n in args.numbers.split(',')]
        except ValueError:
            print("Error: Invalid numbers format")
            return
    else:
        print("Interactive mode: Paste winning numbers (one per line, empty line to finish):")
        try:
            while True:
                line = input().strip()
                if not line:
                    break
                winning_numbers.append(int(line))
        except ValueError:
            print("Error: Each line must be a valid number (0-36)")
            return
    
    if not winning_numbers:
        print("No numbers provided.")
        return
    
    # Run simulation
    session_id = generate_session_id()
    results = run_simulation(winning_numbers, args.max_step)
    
    if not args.quiet:
        print_results(results, session_id)
    
    # Save outputs
    DATA_DIR.mkdir(exist_ok=True)
    output_file = DATA_DIR / f"session_{session_id}_per_spin.json"
    summary_file = write_summary_csv(session_id, args.max_step, results)
    
    with open(output_file, 'w') as f:
        json.dump({
            'session_id': session_id,
            'max_step': args.max_step,
            'metrics': results['session_metrics'],
            'summary': results['bettor_summary'],
            'per_spin_records': results['per_spin_records'],
        }, f, indent=2)
    
    print(f"\nOK: Results saved to: {output_file}")
    print(f"OK: Summary CSV saved to: {summary_file}")

if __name__ == '__main__':
    main()
