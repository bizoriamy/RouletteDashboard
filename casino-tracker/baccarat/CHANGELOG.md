# Changelog

All notable changes to Baccarat Tracker will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-08-22

### Added

#### Table Type Support
- Selection between 5% Commission Table and No Commission Table
- Automatic payout calculation based on table type
- 5% Commission: Banker wins pay 0.95:1
- No Commission: Banker wins pay 1:1
- Table type displayed in session header

#### TIE/Push Result
- Added TIE button to result panel (gold color)
- Push logic for Banker/Player bets on Tie (money back)
- Win logic for Tie bets on Tie (8:1 payout)
- History shows PUSH in gold for tie results
- Keyboard shortcut: U for Push/Tie result

#### Bet Summary Display
- Shows bet details before recording result
- Format: "X units ($Y) on Side"

#### CSV Export
- Export current session detailed history (from session screen)
- Export all sessions summary (from setup screen)
- Single session includes: start time, end time, running balance
- All sessions includes: duration, win rate, final P/L

#### End Time Tracking
- Session records end time when END button clicked
- Duration calculated and displayed in CSV export

### Changed
- **Layout**: Buttons now appear before bet amount display
- **Colors**: Banker = Red, Tie = Green, Player = Blue (standard baccarat colors)
- **Setup Screen**: Removed recent sessions section, added CSV export link
- **History Badges**: Changed from full text to circular single-letter badges (B/T/P)
- **History Panel**: Expanded to show 75+ records

### Removed
- Recent sessions display from setup screen (data still stored)

---

## [1.0.0] - 2026-08-22

### Added

#### Session Management
- Casino name input for session identification
- Auto-generated session IDs (e.g., BV-001, BK8-001)
- Session persistence using localStorage

#### Betting Interface
- Unit-based betting system with configurable unit value
- Click-based unit addition (+1, +2, +5 buttons)
- Double bet button (x2)
- Clear bet button (CLR)
- Three bet options: Banker, Tie, Player

#### Payout Calculation
- Player win: 1:1 payout
- Banker win: 0.95:1 payout (standard baccarat rule)
- Tie: 8:1 payout
- Automatic profit/loss calculation

#### History & Statistics
- Real-time history list during session
- Running balance display
- Session statistics (total bets, wins, win rate)

#### User Interface
- Casino-themed dark design with gold accents
- Compact layout for mobile and desktop use
- Responsive design for various screen sizes
- Visual feedback for button interactions
- Color-coded results (green for win, red for lose)

#### Keyboard Shortcuts
- B: Select Banker
- T: Select Tie
- P: Select Player
- W: Record Win
- L: Record Lose
- Escape: Clear current bet

#### Documentation
- Comprehensive README.md with features and usage
- INSTALL.md with step-by-step setup guide
- This CHANGELOG.md for version tracking
- MIT License

### Technical Details
- Pure HTML/CSS/JavaScript (no dependencies)
- LocalStorage for data persistence
- Mobile-first responsive design
- No server required - works offline

---

## Future Releases

### Planned Features (v1.2.0)
- [ ] Google Sheets integration (live sync)
- [ ] Side bets support (Tiger, Super 6, etc.)
- [ ] Detailed statistics and charts

### Planned Features (v1.3.0)
- [ ] Bankroll management tools
- [ ] Advanced pattern analysis
- [ ] Custom payout rules
- [ ] Session notes and comments

---

*For support or suggestions, please create an issue in the project repository.*
