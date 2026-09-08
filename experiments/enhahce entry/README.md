# BetPilot Quick Entry - Enhanced UI
**Version:** v2026.08.31.3  
**Status:** Production Ready  
**Last Updated:** August 31, 2026

---

## Table of Contents
1. [Overview](#overview)
2. [Features](#features)
3. [Project Structure](#project-structure)
4. [Installation & Usage](#installation--usage)
5. [User Guide](#user-guide)
6. [Technical Specifications](#technical-specifications)
7. [Architecture & Design](#architecture--design)
8. [API Reference](#api-reference)
9. [Troubleshooting](#troubleshooting)

---

## Overview

**BetPilot Quick Entry** is a lightweight, floating companion window for the BetPilot roulette analyzer. It provides real-time entry of European roulette winning numbers with enhanced visual feedback through:

- **Dynamic hit badges** on all number tiles
- **Street bet tiles** (12 consecutive number groups) with hit tracking
- **Group statistics tiles** (Dozens D1-D3 and Columns C1-C3) showing hit/absence counts
- **Responsive layout switching** between two roulette configurations (0 Left / 0 Top)
- **BroadcastChannel synchronization** with the main dashboard

The enhanced UI transforms the basic number entry interface into a comprehensive betting analysis companion, allowing users to see at a glance which numbers, streets, and groups have been hit across the current spin session.

---

## Features

### Core Features
✅ **Manual Number Entry** - Type or click to enter winning numbers (0-36)  
✅ **Undo Functionality** - Remove the last entered number  
✅ **Hit Tracking** - Dynamic badge counts on all tiles  
✅ **Layout Switching** - Toggle between 0 Left (horizontal) and 0 Top (vertical) layouts  
✅ **Real-time Sync** - BroadcastChannel communication with main dashboard  
✅ **Session Persistence** - localStorage saves layout preference and topmost setting  
✅ **Always on Top** - Optional window topmost state (API-enabled)

### Visual Enhancements
✅ **Hit Badges** - Gold badges with count on:
  - Individual numbers (0-36)
  - Street tiles (1-3, 4-6, 7-9, 10-12, 13-15, 16-18, 19-21, 22-24, 25-27, 28-30, 31-33, 34-36)
  - Group tiles (Dozens and Columns)

✅ **Group Statistics** - Each group tile displays:
  - Hit count (number of spins hitting this group)
  - Absence count (total spins minus hits)

✅ **History Display** - Latest 10 winning numbers with color-coding:
  - Red for red numbers
  - Black for black numbers
  - Green for zero

✅ **Responsive Design** - Adapts to different viewport sizes with media queries

---

## Project Structure

```
enhahce entry/
├── quick-entry-enhanced.html    # Main UI markup and layout
├── quick-entry-enhanced.css     # Styling and responsive grid layouts
├── quick-entry-enhanced.js      # Application logic and BroadcastChannel sync
└── README.md                     # This documentation file
```

### File Sizes
- **HTML:** ~3.6 KB
- **CSS:** ~5.0 KB
- **JavaScript:** ~9.9 KB
- **Total:** ~18.5 KB

---

## Installation & Usage

### Quick Start

1. **Copy all three files** to your project directory:
   - `quick-entry-enhanced.html`
   - `quick-entry-enhanced.css`
   - `quick-entry-enhanced.js`

2. **Open the HTML file** in a modern web browser:
   ```
   file:///path/to/quick-entry-enhanced.html
   ```

3. **Connect to Main Dashboard:**
   - The window will automatically attempt to sync with the main dashboard via BroadcastChannel
   - Channel name: `roulette-quick-entry-v1`
   - Status indicator shows connection state

### Running Standalone

The enhanced quick entry can run independently for testing:
- Open the `.html` file directly in your browser
- Enter test numbers manually
- Layout switching and UI features work offline
- Sync will show "Requesting state..." until main dashboard connects

### Launching from Main Dashboard

Typically opened via `window.open()`:
```javascript
window.open(
  'quick-entry-enhanced.html',
  'quick-entry',
  'width=700,height=900,menubar=no,toolbar=no'
);
```

---

## User Guide

### Entering Numbers

**Via Input Field (Recommended for quick entry):**
1. Type a number (0-36) in the input field
2. Press **Enter** or click **Enter** button
3. Number is submitted and field clears

**Via Number Buttons:**
1. Click any number button (0-36) on the grid
2. Number is immediately submitted

### Undo Last Entry

1. Click the **Undo** button
2. Or use previous keyboard shortcut if available
3. Last number is removed from history

### Layout Switching

**Toggle between two roulette configurations:**

1. Click the **Layout** dropdown at top-right
2. Select either:
   - **0 Left** (horizontal layout - zero on left side)
   - **0 Top** (vertical layout - zero at top)
3. Layout preference is saved and persists across sessions

**Visual Differences:**
- **0 Left:** Grid is 13 columns × 3 rows; streets horizontal on bottom
- **0 Top:** Grid is 3 columns × 13 rows; streets vertical on right

### Always on Top

1. Check the **Always on top** checkbox in the header
2. Window will request topmost state from the API
3. Setting persists across sessions via localStorage

### Understanding the Badges

**Hit Badges (Gold):**
- Appear on number, street, and group tiles
- Show count of how many times that tile has been hit
- Example: Badge "3" means that number/street/group appeared in 3 spins

**Group Statistics:**
- **Hit:** Number of spins that included this group
- **Abs (Absence):** Number of spins that did NOT include this group
- Calculated as: Absence = Total Spins - Hits

### Street Tiles

Street tiles represent consecutive 3-number combinations:
- **1-3, 4-6, 7-9, 10-12, 13-15, 16-18**
- **19-21, 22-24, 25-27, 28-30, 31-33, 34-36**

A street tile shows a hit badge whenever any of its constituent numbers appears.

### Group Tiles

**Dozens (D1-D3):**
- D1: Numbers 1-12
- D2: Numbers 13-24
- D3: Numbers 25-36

**Columns (C1-C3):**
- C1: Numbers 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34
- C2: Numbers 2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35
- C3: Numbers 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36

---

## Technical Specifications

### Browser Compatibility
- **Minimum:** Modern browsers with ES6 support
- **Tested on:** Chrome, Firefox, Edge (all current versions)
- **Requires:** 
  - BroadcastChannel API
  - CSS Grid
  - ES6 JavaScript features

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Enter** | Submit entered number |
| **Escape** | (Reserved for future use) |
| **Tab** | Navigate between controls |

### Color Scheme

| Element | Color | Hex Code |
|---------|-------|----------|
| Red numbers | Red | `#dc2626` |
| Black numbers | Dark gray | `#1f2937` |
| Zero (0) | Green | `#16a34a` |
| Hit badge | Gold | `#fbbf24` |
| Grid background | Light gray | `#dbe2ec` |
| Primary button | Blue | `#2563eb` |

### Grid Dimensions

**0 Left Layout (Horizontal):**
- Grid: 13 columns × 3 rows
- Zero button: 1 column × 3 rows (left side)
- Each number button: ~76px × 34px
- Streets: 1 column × 13 rows (below the number buttons)

**0 Top Layout (Vertical):**
- Grid: 3 columns × 13 rows
- Zero button: 3 columns × 1 row (top)
- Each number button: ~76px × 34px
- Streets: 1 column × 13 rows (right side)

### Data Structures

**Street Data:**
```javascript
{
  num: "1-3",
  numbers: [1, 2, 3]
}
```

**Group Data:**
```javascript
{
  d1: { name: "D1", numbers: [1,2,3,4,5,6,7,8,9,10,11,12] },
  d2: { name: "D2", numbers: [13,14,15,16,17,18,19,20,21,22,23,24] },
  d3: { name: "D3", numbers: [25,26,27,28,29,30,31,32,33,34,35,36] },
  c1: { name: "C1", numbers: [1,4,7,10,13,16,19,22,25,28,31,34] },
  c2: { name: "C2", numbers: [2,5,8,11,14,17,20,23,26,29,32,35] },
  c3: { name: "C3", numbers: [3,6,9,12,15,18,21,24,27,30,33,36] }
}
```

**Hit Tracking Objects:**
```javascript
numberHits[0]           // Count for number 0
streetHits["1-3"]       // Count for street 1-3
groupHits["d1"]         // Count for dozen D1
groupHits["c2"]         // Count for column C2
```

---

## Architecture & Design

### Communication Pattern (BroadcastChannel)

The enhanced quick entry uses a pub/sub pattern via BroadcastChannel for real-time synchronization:

```
Main Dashboard                    Quick Entry Window
      |                                  |
      +-------- postMessage() ---------->|
      |      (spin/undo action)          |
      |                                  |
      |<------- addEventListener() -----+
      |      (state update)              |
```

**Message Protocol:**

1. **Request State:**
   ```javascript
   { type: "request-state" }
   ```

2. **Send Action:**
   ```javascript
   { type: "action", action: "spin"|"undo", number: 0-36 }
   ```

3. **Receive State:**
   ```javascript
   { type: "state", numbers: [1, 5, 12, ...], build: "v2026.08.31.3" }
   ```

4. **Build Check:**
   - If received build differs from local build, window reloads automatically
   - Ensures UI consistency across all windows

### Component Architecture

```
quick-entry-enhanced.html
├── Header Section
│   ├── Title & Subtitle
│   └── Controls (Layout dropdown, Always on top checkbox)
├── History Section
│   └── Recent spins display (colored badges)
├── Controls Section
│   ├── Number input field
│   ├── Enter button
│   ├── Undo button
│   └── Status indicator
├── Board Container
│   ├── Grid (numbers 0-36)
│   └── Streets (12 street tiles)
└── Groups Section
    ├── D1, D2, D3 tiles (with Hit/Absence stats)
    └── C1, C2, C3 tiles (with Hit/Absence stats)
```

### State Management

**Local State:**
- `numberHits` - Map of number → count
- `streetHits` - Map of street → count
- `groupHits` - Map of group → count

**Persistent State (localStorage):**
- `roulette-quick-layout-v1` - User's layout preference (left/top)
- `roulette-quick-topmost-v1` - Always on top checkbox state

**Remote State (from main dashboard):**
- `numbers` - Array of all spins entered in session
- `build` - Version identifier for consistency checks

### Layout Switching Logic

**CSS Classes Toggle:**
- Each major element has `.layout-left` and `.layout-top` variants
- Layout change removes old class and adds new one
- Grid positions are dynamically calculated for each layout

**Grid Position Calculation:**

For 0 Top (vertical):
```javascript
button.style.gridColumn = String(((number - 1) % 3) + 1);
button.style.gridRow = String(Math.floor((number - 1) / 3) + 2);
```

For 0 Left (horizontal):
```javascript
button.style.gridColumn = String(Math.floor((number - 1) / 3) + 2);
button.style.gridRow = String(3 - ((number - 1) % 3));
```

### Badge Update Flow

```
1. Receive state with numbers array from main dashboard
2. updateBadges() called with numbers array
3. Reset all hit counters to 0
4. Loop through numbers:
   - Increment numberHits[number]
   - Find streets containing number, increment streetHits
   - Find groups containing number, increment groupHits
5. DOM Update:
   - For each number button:
     - If count > 0: create/update badge span
     - If count = 0: remove badge span
   - For each street button: same as above
   - For each group tile:
     - Update Hit stat-count
     - Calculate and update Absence stat-count
```

### Error Handling

**Input Validation:**
- Must be 1-2 digit string
- Must convert to integer
- Must be in range 0-36
- Invalid inputs show error message and select input text

**BroadcastChannel Fallback:**
- If sync fails, status shows "Requesting state..."
- Window continues to function offline
- Manual entry still works
- Auto-retries every 1500ms

**Build Mismatch:**
- If received build ≠ local build, auto-reloads window
- Prevents stale UI states across multiple windows

---

## API Reference

### External API Calls

**Topmost Window State (Optional):**
```javascript
POST /api/window/topmost
Content-Type: application/json

Request body:
{
  "target": "quick",
  "enabled": true|false
}
```

Response: Success response (implementation-dependent)  
Fallback: Silently continues without error

### Public Functions (Internal Use)

**requestState()**
- Posts a "request-state" message to BroadcastChannel
- Triggers dashboard to send current state
- Called on load and every 1500ms

**send(action, number)**
- Sends action message to dashboard
- Actions: "spin" (with number), "undo" (ignores number)
- Clears input field after sending

**submitTyped()**
- Validates input field content
- Calls send() if valid
- Shows error if invalid

**updateBadges(numbers)**
- Recalculates all hit counts from numbers array
- Updates all badge elements in DOM
- Updates group statistics

**renderHistory(numbers)**
- Creates colored number badges for recent spins
- Shows "No spins yet" if empty

**applyLayout(value)**
- Applies layout CSS classes
- Recalculates grid positions for all numbers
- Saves preference to localStorage

---

## Troubleshooting

### Issue: "Requesting state..." message persists

**Cause:** Main dashboard is not connected or running  
**Solution:**
1. Ensure main dashboard is open and running
2. Check BroadcastChannel is enabled in your browser
3. Verify both windows are in the same browser context
4. Try reloading both windows

### Issue: Numbers not appearing in history

**Cause:** Main dashboard hasn't sent state update  
**Solution:**
1. Click a number button to trigger a send
2. Wait a moment for state to sync
3. Check main dashboard is processing entries

### Issue: Layout doesn't switch

**Cause:** CSS classes not toggling properly  
**Solution:**
1. Check browser console for JavaScript errors
2. Try refreshing the page (F5)
3. Clear localStorage: `localStorage.clear()`

### Issue: Badges not updating

**Cause:** updateBadges() not receiving numbers array  
**Solution:**
1. Check browser console for errors
2. Verify main dashboard is sending state messages
3. Try entering a number to trigger update

### Issue: Window won't stay on top

**Cause:** API endpoint `/api/window/topmost` not available  
**Solution:**
1. This is optional functionality
2. Application continues to work without it
3. Check that main application implements this API

### Issue: Responsiveness issues on mobile

**Cause:** Grid layout not adapting to small screens  
**Solution:**
1. Layout designed for desktop (min 660px width)
2. Media query at 660px reduces grid column count
3. Consider opening on larger screen

### Issue: Styles not loading

**Cause:** CSS file path incorrect  
**Solution:**
1. Verify `quick-entry-enhanced.css?v=2026.08.31.3` is in same directory
2. Check browser Network tab for 404 errors
3. Ensure file permissions allow reading

### Issue: JavaScript not executing

**Cause:** Script file path incorrect or CORS issue  
**Solution:**
1. Verify `quick-entry-enhanced.js?v=2026.08.31.3` is in same directory
2. Check browser console for errors
3. Ensure `file://` protocol allows scripts on local files

---

## Performance Notes

- **DOM Updates:** Minimal - only badges are dynamically created/removed
- **Memory:** State stored in simple objects, no memory leaks
- **Refresh Rate:** State updates sync at ~1500ms intervals
- **Bundle Size:** ~18.5 KB total (minified but not gzipped)
- **CPU Usage:** Negligible - event-driven architecture

---

## Future Enhancements

Potential features not yet implemented:
- Dark mode theme
- Click-to-select on street/group tiles
- Export spin history as CSV
- Custom bet strategy panels
- Keyboard shortcut customization
- Persistent spin history (between sessions)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v2026.08.31.3 | Aug 31, 2026 | Initial enhanced release with street tiles, group stats, and responsive layouts |

---

## License & Attribution

**Created with:** Copilot CLI runtime in VS Code

For questions or contributions, refer to the main BetPilot project documentation.

---

**Last Updated:** September 1, 2026  
**Status:** Production Ready ✅
