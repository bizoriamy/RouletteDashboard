# Installation Guide

Baccarat Tracker is a simple web application that runs directly in your browser. No installation required!

## Quick Start (30 seconds)

1. **Download** the project files (or clone the repository)
2. **Open** the `baccarat-tracker` folder
3. **Double-click** on `index.html`
4. **Start tracking** your bets!

That's it! The app runs entirely in your web browser.

---

## Detailed Instructions

### Step 1: Get the Files

**Option A: Download ZIP**
1. Click the "Code" button on the project page
2. Select "Download ZIP"
3. Extract the ZIP file to your desired location

**Option B: Clone Repository** (if you have Git installed)
```bash
git clone [repository-url]
cd baccarat-tracker
```

### Step 2: Open the App

**Windows:**
1. Open the `baccarat-tracker` folder
2. Double-click `index.html`
3. It will open in your default web browser

**Mac:**
1. Open the `baccarat-tracker` folder
2. Double-click `index.html`
3. It will open in Safari or your default browser

**Using a Different Browser:**
1. Open your preferred browser (Chrome, Firefox, Edge)
2. Press `Ctrl+O` (Windows) or `Cmd+O` (Mac)
3. Navigate to the `baccarat-tracker` folder
4. Select `index.html` and click "Open"

---

## First Time Setup

### Creating Your First Session

1. **Enter Casino Name**
   - Type the name of the casino you're playing at
   - Examples: "BetVictor", "BK8", "888 Casino"

2. **Select Table Type**
   - **5% Commission Table** - Banker wins pay 0.95:1 (standard)
   - **No Commission Table** - Banker wins pay 1:1

3. **Set Unit Value**
   - Enter how much 1 unit is worth in dollars
   - Example: `0.50` means 1 unit = $0.50

4. **Click START SESSION**
   - The app will generate a session ID (e.g., "BV-001")
   - You're ready to start tracking!

### Making Your First Bet

1. **Add Units**
   - Click the `+1`, `+2`, or `+5` buttons
   - Each click adds that many units to your current bet
   - Example: Click `+5` five times = 25 units

2. **Select Bet Side**
   - Click `BANKER`, `TIE`, or `PLAYER`
   - A bet summary will appear showing your bet details

3. **Record Result**
   - After the hand is complete, click:
     - `WIN` - Your bet side won
     - `TIE` - Hand was a Tie (Push for Banker/Player, Win for Tie bets)
     - `LOSE` - Opposite side won
   - The bet is recorded and your balance updates

### Ending a Session

1. Click the `END` button in the history panel
2. The session end time is recorded
3. You return to the setup screen

### Exporting Data

**Current Session:**
- Click `📄 CSV` button in the history panel
- Downloads detailed bet-by-bet history

**All Sessions:**
- Click `📄 Export History to CSV` on the setup screen
- Downloads summary of all sessions

---

## Using on Mobile

### Adding to Home Screen (iPhone)
1. Open Safari and navigate to the app
2. Tap the Share button (square with arrow)
3. Scroll down and tap "Add to Home Screen"
4. Tap "Add"

### Adding to Home Screen (Android)
1. Open Chrome and navigate to the app
2. Tap the three-dot menu
3. Tap "Add to Home screen"
4. Tap "Add"

---

## Tips for Best Experience

### Desktop (PC/Mac)
- **Resize the window** to fit beside your casino window
- **Use keyboard shortcuts** for faster entry:
  - `B` = Banker, `T` = Tie, `P` = Player
  - `W` = Win, `U` = Tie/Push, `L` = Lose
  - `Escape` = Clear bet

### Mobile
- **Portrait mode** works best
- **Large buttons** are easy to tap
- **Add to home screen** for quick access

---

## Troubleshooting

### App Won't Open
- Make sure you're opening `index.html` (not `style.css` or `app.js`)
- Try a different browser (Chrome recommended)

### Data Not Saving
- Make sure cookies/localStorage are enabled in your browser
- Don't use "Private" or "Incognito" mode (data won't persist)

### Buttons Not Working
- Try refreshing the page
- Clear your browser cache and reload

### Display Issues
- Try zooming in/out (`Ctrl +` or `Ctrl -`)
- Make sure your browser is up to date

---

## Data Storage

Your data is stored locally in your browser using **localStorage**.

**What this means:**
- ✅ Works completely offline
- ✅ No account or login required
- ✅ Data stays on your device (private)
- ⚠️ Clearing browser data will delete your history
- ⚠️ Data doesn't sync between devices

**To backup your data:**
1. Use the CSV export feature (recommended)
2. Or open browser Developer Tools (`F12` or `Ctrl+Shift+I`)
3. Go to "Application" tab
4. Click "Local Storage" → your domain
5. Right-click and "Export" or copy the data

---

## Uninstalling

To remove Baccarat Tracker:
1. Delete the `baccarat-tracker` folder
2. Optionally clear localStorage:
   - Open browser Developer Tools
   - Go to "Application" → "Local Storage"
   - Delete the entries for the app

---

## Need Help?

If you encounter any issues:
1. Check the [README.md](README.md) for feature documentation
2. See the [CHANGELOG.md](CHANGELOG.md) for known issues
3. Create an issue in the project repository

---

**Enjoy tracking your bets! 🎰**
