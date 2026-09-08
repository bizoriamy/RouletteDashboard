# Trigger and Fibonacci logic

## Trigger

A group becomes eligible to start when its `absent` count is at least the global trigger. The app does not place bets; it displays a decision aid and the next suggested Fibonacci stake.

## Starting a sequence

Choose **Start betting** on an eligible group. Its next bet begins at Fibonacci Step 1.

| Step | Stake |
|---:|---:|
| 1 | 1U |
| 2 | 1U |
| 3 | 2U |
| 4 | 3U |
| 5 | 5U |
| 6 | 8U |
| 7 | 13U |
| 8 | 21U |
| 9 | 34U |
| 10 | 55U |
| 11 | 89U |

## Result handling

After every recorded spin, each active group is evaluated.

- A **hit** in that group resets and stops its Fibonacci sequence.
- A **miss** advances the sequence to the next step.
- Reaching the selected **Stop Loss** automatically stops that group’s sequence.
- Pressing an active group’s Next bet button stops its sequence manually.

A spin can be a hit for both one dozen and one column. Each active group is evaluated independently.
