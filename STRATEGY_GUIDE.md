# European Roulette Strategy Guide

**Last reviewed:** 6 August 2026  
**Current dashboard version:** `v2026.08.06.4`

The complete operating rules, progression tables, stop conditions, table-rule
handling, and risk notes are maintained in the read-only Google Doc:

## [Open the European Roulette Strategy Guide](https://docs.google.com/document/d/1wzO508lhweokYDrhU-Aqm0fvWO-PJ9Kenk1ZIVwGcjg/edit?usp=sharing)

The sharing permission has been verified as **Anyone with the link - Viewer**.
The document is readable without edit permission and is not publicly searchable.

## Strategies covered

1. **Even-Money - Streak Rider**
   - Trigger after 6 absences.
   - Repeating `1, 2, 1, 2, ...` unit progression.
   - Continue after wins and stop at the first full loss.

2. **12-Number - Wait 6 / Play 6 Fibonacci**
   - Applies to dozens and columns.
   - Trigger after 6 absences.
   - Maximum six betting hands: `1, 1, 2, 3, 5, 8` units.

3. **4-Streets**
   - Identify six candidates from at least 24 history spins.
   - Observe the next 12 spins.
   - Play the hottest four streets using `1, 1, 2, 3, 5` units per street.

4. **Freddy's Triangle Snake (FTS)**
   - Supports up to seven simultaneous cards: three even-money, two dozens,
     and two columns.
   - Uses the configured triangle level and position for each stake.
   - Includes the four-consecutive-full-loss safety checkpoint.

## Maintenance

The Google Doc is the authoritative strategy reference. When a strategy rule
changes:

1. Update the Google Doc and its **Last update** date.
2. Update the summary in this file if the headline rules changed.
3. Record the application change in [`CHANGELOG.md`](CHANGELOG.md).
