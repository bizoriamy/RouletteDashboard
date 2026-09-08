# BetPilot Setup Guide

BetPilot-myMates is a local **collector of roulette strategies**. The project provides a browser interface and a Python simulator for testing and documenting strategy behavior against manually entered, uploaded, or generated European roulette results.

## Prerequisites

- **Python 3.7+** (for the Python version)
- **Web browser** (for the HTML/JS version)
- **Git** (for version control and GitHub backup)

## Installation

### 1. Download/Clone the Project

If you haven't already, create the folder:
```bash
C:\Users\HP\PawWork\BetPilot
```

### 2. Python Setup (Optional)

The Python simulator has no external dependencies — it uses only Python's standard library.

If you plan to extend the simulator with additional packages in the future, install from requirements:
```bash
cd C:\Users\HP\PawWork\BetPilot
pip install -r src/requirements.txt
```

### 3. Verify Installation

Test the Python simulator:
```bash
python src/betpilot_myMates_simulator.py --numbers 1,2,3,4,5
```

You should see output like:
```
Spin 1: number=1
  Bettor A -> Col1+Col2, stake per bet=1 (total 2) -> WIN, net=1.00, next step=1
  ...
=== Simulation summary ===
```

### 4. Web Frontend

Open `frontend/betpilot_myMates_frontend.html` directly in your browser — no server required.

## Folder Structure

```
BetPilot/
├── src/                          # Python source code
│   ├── betpilot_myMates_simulator.py   # Main simulator
│   └── requirements.txt                 # Python dependencies
├── frontend/                     # Web interface
│   └── betpilot_myMates_frontend.html   # Single HTML file
├── docs/                         # Documentation
│   ├── SETUP.md                  # This file
│   ├── USAGE.md                  # Usage examples
│   ├── BETTING_STRATEGY.md       # Strategy explanation
│   └── SESSION_FORMAT.md         # Session data format
├── data/                         # Session storage (git-ignored)
│   ├── sessions.json             # Summary index
│   └── session_<id>_per_spin.json
├── samples/                      # Example input files
│   └── sample_spins.txt
├── .gitignore                    # Git ignore rules
├── LICENSE                       # Project license
└── README.md                     # Main documentation
```

## Data Storage

### Python
Session data is stored in `data/` folder:
- `sessions.json`: Summary of all sessions
- `session_<SESSION_ID>_per_spin.json`: Detailed per-spin records

### Web Frontend
Session data is stored in browser localStorage (not on disk).

## Git Setup

Initialize version control and prepare for GitHub:

```bash
cd C:\Users\HP\PawWork\BetPilot
git init
git add .
git commit -m "Initial commit: BetPilot simulator"
git branch -M main
```

To link to GitHub:
```bash
git remote add origin https://github.com/YOUR_USERNAME/BetPilot.git
git push -u origin main
```

## First Run

### Python
```bash
cd C:\Users\HP\PawWork\BetPilot
python src/betpilot_myMates_simulator.py --file samples/sample_spins.txt --max-step 6
```

### Web
1. Open `frontend/betpilot_myMates_frontend.html` in Chrome, Firefox, or Edge
2. Paste test numbers: `1,2,3,0,10,20,30,5,15,25`
3. Select Max Step = 6
4. Click "Run Simulation"
5. View results and download CSV

## Troubleshooting

### Python: "No module named 'X'"
This shouldn't happen as the simulator uses only standard library. If it does:
```bash
pip install --upgrade pip
pip install -r src/requirements.txt
```

### Python: Numbers file not found
Ensure the file path is correct. Use absolute paths:
```bash
python src/betpilot_myMates_simulator.py --file "C:\Users\HP\Desktop\spins.txt"
```

### Web: CSV download doesn't work
- Ensure your browser allows downloads
- Try a different browser (Chrome, Firefox, Edge all work)

### Web: Sessions not persisting
- Browser localStorage is cleared when cache is cleared
- Check browser settings: Settings > Privacy > Clear cache/cookies

## Next Steps

1. Read **USAGE.md** for detailed examples
2. Read **BETTING_STRATEGY.md** to understand the logic
3. Create a `.gitignore` entry if you have local test data you don't want to commit
4. Start running simulations!

---

For additional support, check the main README.md or source code comments.
