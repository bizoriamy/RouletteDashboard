/**
 * Baccarat Tracker - Core Application Logic
 * Version: 1.1.0
 * 
 * Features:
 * - Session management with auto-generated IDs
 * - Unit-based bet tracking
 * - Automatic payout calculation
 * - Table type support (5% Comm / No Comm)
 * - History tracking with localStorage persistence
 * - CSV export
 */

// ============================================
// STATE MANAGEMENT
// ============================================
const AppState = {
    currentSession: null,
    currentBet: { units: 0, side: null },
    unitValue: 0.50,
    tableType: '5comm',
    sessions: {},
    viewingSessionId: null,
    
    load() {
        const saved = localStorage.getItem('baccaratTracker');
        if (saved) {
            const data = JSON.parse(saved);
            this.sessions = data.sessions || {};
        }
    },
    
    save() {
        localStorage.setItem('baccaratTracker', JSON.stringify({
            sessions: this.sessions
        }));
    },
    
    generateSessionId(casinoName) {
        const prefix = casinoName.substring(0, 2).toUpperCase();
        const existing = Object.keys(this.sessions)
            .filter(id => id.startsWith(prefix))
            .length;
        return `${prefix}-${String(existing + 1).padStart(3, '0')}`;
    }
};

// ============================================
// DOM ELEMENTS
// ============================================
const DOM = {
    sessionSetup: document.getElementById('session-setup'),
    bettingScreen: document.getElementById('betting-screen'),
    pastSessionsScreen: document.getElementById('past-sessions-screen'),
    
    casinoName: document.getElementById('casino-name'),
    tableType: document.getElementById('table-type'),
    unitValue: document.getElementById('unit-value'),
    startSession: document.getElementById('start-session'),
    exportCsv: document.getElementById('export-csv'),
    viewHistory: document.getElementById('view-history'),
    
    sessionLabel: document.getElementById('session-label'),
    casinoDisplay: document.getElementById('casino-display'),
    tableTypeDisplay: document.getElementById('table-type-display'),
    balance: document.getElementById('balance'),
    currentUnits: document.getElementById('current-units'),
    currentDollar: document.getElementById('current-dollar'),
    resultPanel: document.getElementById('result-panel'),
    betSummary: document.getElementById('bet-summary'),
    historyList: document.getElementById('history-list'),
    totalBets: document.getElementById('total-bets'),
    totalWins: document.getElementById('total-wins'),
    winRate: document.getElementById('win-rate'),
    sessionPl: document.getElementById('session-pl'),
    
    unitButtons: document.querySelectorAll('.btn-unit'),
    clearBet: document.getElementById('clear-bet'),
    btnBanker: document.getElementById('btn-banker'),
    btnTie: document.getElementById('btn-tie'),
    btnPlayer: document.getElementById('btn-player'),
    btnPass: document.getElementById('btn-pass'),
    passPanel: document.getElementById('pass-panel'),
    passBanker: document.getElementById('pass-banker'),
    passTie: document.getElementById('pass-tie'),
    passPlayer: document.getElementById('pass-player'),
    btnWin: document.getElementById('btn-win'),
    btnPush: document.getElementById('btn-push'),
    btnLose: document.getElementById('btn-lose'),
    endSession: document.getElementById('end-session'),
    exportSessionCsv: document.getElementById('export-session-csv'),
    backToSetup: document.getElementById('back-to-setup'),
    exportHistoryCsv: document.getElementById('export-history-csv'),
    pastSessionsList: document.getElementById('past-sessions-list'),
    pastSessionsTitle: document.getElementById('past-sessions-title'),
    sessionDetail: document.getElementById('session-detail'),
    sessionDetailHeader: document.getElementById('session-detail-header'),
    sessionDetailList: document.getElementById('session-detail-list'),
    exportSessionDetail: document.getElementById('export-session-detail')
};

// ============================================
// SCREEN NAVIGATION
// ============================================
function showScreen(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
}

// ============================================
// SESSION MANAGEMENT
// ============================================
function startNewSession() {
    const casinoName = DOM.casinoName.value.trim();
    const unitValue = parseFloat(DOM.unitValue.value);
    const tableType = DOM.tableType.value;
    
    if (!casinoName) {
        DOM.casinoName.focus();
        DOM.casinoName.style.borderColor = '#DC143C';
        setTimeout(() => DOM.casinoName.style.borderColor = '', 1500);
        return;
    }
    
    if (!unitValue || unitValue <= 0) {
        DOM.unitValue.focus();
        DOM.unitValue.style.borderColor = '#DC143C';
        setTimeout(() => DOM.unitValue.style.borderColor = '', 1500);
        return;
    }
    
    AppState.unitValue = unitValue;
    AppState.tableType = tableType;
    const sessionId = AppState.generateSessionId(casinoName);
    const tableTypeLabel = tableType === '5comm' ? '5% Comm' : 'No Comm';
    
    AppState.currentSession = {
        id: sessionId,
        casino: casinoName,
        tableType: tableType,
        tableTypeLabel: tableTypeLabel,
        unitValue: unitValue,
        startTime: new Date().toISOString(),
        bets: [],
        balance: 0
    };
    
    AppState.sessions[sessionId] = AppState.currentSession;
    AppState.save();
    
    DOM.sessionLabel.textContent = sessionId;
    DOM.casinoDisplay.textContent = casinoName;
    DOM.tableTypeDisplay.textContent = tableTypeLabel;
    updateBalanceDisplay();
    resetCurrentBet();
    showScreen(DOM.bettingScreen);
}

function endSession() {
    if (!AppState.currentSession) return;
    AppState.currentSession.endTime = new Date().toISOString();
    AppState.save();
    AppState.currentSession = null;
    AppState.currentBet = { units: 0, side: null };
    showScreen(DOM.sessionSetup);
}

// ============================================
// BET MANAGEMENT
// ============================================
function addUnits(amount) {
    AppState.currentBet.units += amount;
    updateBetDisplay();
}

function doubleBet() {
    AppState.currentBet.units *= 2;
    updateBetDisplay();
}

function resetCurrentBet() {
    AppState.currentBet = { units: 0, side: null };
    updateBetDisplay();
    DOM.resultPanel.classList.add('hidden');
    DOM.passPanel.classList.add('hidden');
}

function recordPass(handWinner) {
    if (!AppState.currentSession) return;
    
    var handResult = '';
    if (handWinner === 'banker') handResult = 'BANKER';
    else if (handWinner === 'player') handResult = 'PLAYER';
    else if (handWinner === 'tie') handResult = 'TIE';
    
    var betRecord = {
        id: Date.now(),
        time: new Date().toLocaleTimeString(),
        side: null,
        units: 0,
        dollarAmount: 0,
        handResult: handResult,
        result: 'PASS',
        profit: 0
    };
    
    AppState.currentSession.bets.push(betRecord);
    AppState.save();
    
    addBetToHistory(betRecord);
    updateStats();
    DOM.passPanel.classList.add('hidden');
}

function updateBetDisplay() {
    const units = AppState.currentBet.units;
    const dollar = (units * AppState.unitValue).toFixed(2);
    DOM.currentUnits.textContent = units;
    DOM.currentDollar.textContent = '($' + dollar + ')';
}

function selectBetSide(side) {
    if (AppState.currentBet.units === 0) {
        DOM.unitButtons.forEach(btn => {
            btn.style.animation = 'none';
            btn.offsetHeight;
            btn.style.animation = 'pulse 0.5s';
        });
        return;
    }
    AppState.currentBet.side = side;
    
    // Update bet summary display
    var units = AppState.currentBet.units;
    var dollar = (units * AppState.unitValue).toFixed(2);
    var sideName = side.charAt(0).toUpperCase() + side.slice(1);
    DOM.betSummary.textContent = units + ' units ($' + dollar + ') on ' + sideName;
    
    DOM.resultPanel.classList.remove('hidden');
}

function recordResult(resultType) {
    if (!AppState.currentSession || !AppState.currentBet.side) return;
    
    var bet = AppState.currentBet;
    var betAmount = bet.units * AppState.unitValue;
    var profit = 0;
    var resultText = '';
    var handResult = '';
    
    if (resultType === 'win') {
        handResult = 'WIN';
        if (bet.side === 'player') {
            profit = betAmount * 1;
            resultText = 'WIN';
        } else if (bet.side === 'banker') {
            if (AppState.currentSession.tableType === '5comm') {
                profit = betAmount * 0.95;
            } else {
                profit = betAmount * 1;
            }
            resultText = 'WIN';
        } else if (bet.side === 'tie') {
            profit = betAmount * 8;
            resultText = 'WIN';
        }
    } else if (resultType === 'push') {
        handResult = 'TIE';
        if (bet.side === 'tie') {
            // Bet on Tie and it's a Tie = Win 8:1
            profit = betAmount * 8;
            resultText = 'WIN';
        } else {
            // Bet on Banker/Player and it's a Tie = Push (money back)
            profit = 0;
            resultText = 'PUSH';
        }
    } else if (resultType === 'lose') {
        handResult = 'LOSE';
        profit = -betAmount;
        resultText = 'LOSE';
    }
    
    var betRecord = {
        id: Date.now(),
        time: new Date().toLocaleTimeString(),
        side: bet.side,
        units: bet.units,
        dollarAmount: betAmount,
        handResult: handResult,
        result: resultText,
        profit: profit
    };
    
    AppState.currentSession.bets.push(betRecord);
    AppState.currentSession.balance += profit;
    AppState.save();
    
    updateBalanceDisplay();
    addBetToHistory(betRecord);
    updateStats();
    resetCurrentBet();
}

// ============================================
// UI UPDATES
// ============================================
function updateBalanceDisplay() {
    if (!AppState.currentSession) return;
    
    const balance = AppState.currentSession.balance;
    const display = balance >= 0 ? '+$' + balance.toFixed(2) : '-$' + Math.abs(balance).toFixed(2);
    
    DOM.balance.textContent = display;
    DOM.balance.style.color = balance >= 0 ? '#00E676' : '#DC143C';
    DOM.sessionPl.textContent = display;
    DOM.sessionPl.style.color = balance >= 0 ? '#00E676' : '#DC143C';
}

function addBetToHistory(bet) {
    var historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    
    var resultClass = '';
    if (bet.result === 'WIN') resultClass = 'result-win';
    else if (bet.result === 'LOSE') resultClass = 'result-lose';
    else if (bet.result === 'PUSH') resultClass = 'result-push';
    else resultClass = 'result-pass';
    
    var profitText = '';
    if (bet.result === 'PASS') {
        profitText = 'PASS';
    } else if (bet.profit > 0) {
        profitText = '+$' + bet.profit.toFixed(2);
    } else if (bet.profit < 0) {
        profitText = '-$' + Math.abs(bet.profit).toFixed(2);
    } else {
        profitText = 'PUSH';
    }
    
    var leftSide = '';
    if (bet.result === 'PASS') {
        // Show who won the hand for passed hands
        leftSide = '<span class="side-badge side-pass">' + bet.handResult.charAt(0) + '</span>' +
                   '<span class="pass-label">PASS</span>';
    } else {
        var sideLetter = bet.side === 'banker' ? 'B' : bet.side === 'tie' ? 'T' : 'P';
        leftSide = '<span class="side-badge side-' + bet.side + '">' + sideLetter + '</span>' +
                   '<span>' + bet.units + 'u ($' + bet.dollarAmount.toFixed(2) + ')</span>';
    }
    
    historyItem.innerHTML = '<div class="bet-info">' + leftSide + '</div>' +
        '<span class="' + resultClass + '">' + profitText + '</span>';
    
    DOM.historyList.insertBefore(historyItem, DOM.historyList.firstChild);
}

function updateStats() {
    if (!AppState.currentSession) return;
    
    var bets = AppState.currentSession.bets;
    var totalHands = bets.length;
    var totalBets = bets.filter(function(b) { return b.result !== 'PASS'; }).length;
    var totalPasses = bets.filter(function(b) { return b.result === 'PASS'; }).length;
    var totalWins = bets.filter(function(b) { return b.result === 'WIN'; }).length;
    var winRate = totalBets > 0 ? ((totalWins / totalBets) * 100).toFixed(0) : 0;
    
    DOM.totalBets.textContent = totalHands + ' (' + totalBets + 'B/' + totalPasses + 'P)';
    DOM.totalWins.textContent = totalWins;
    DOM.winRate.textContent = winRate + '%';
}

// ============================================
// PAST SESSIONS
// ============================================
function loadPastSessions() {
    var sessions = Object.values(AppState.sessions).sort(function(a, b) {
        return new Date(b.startTime) - new Date(a.startTime);
    });
    
    DOM.sessionDetail.classList.add('hidden');
    DOM.pastSessionsList.classList.remove('hidden');
    DOM.pastSessionsTitle.textContent = 'PAST SESSIONS';
    DOM.exportHistoryCsv.style.display = '';
    
    if (sessions.length === 0) {
        DOM.pastSessionsList.innerHTML = '<div class="no-sessions">No past sessions found</div>';
        return;
    }
    
    DOM.pastSessionsList.innerHTML = sessions.map(function(session) {
        var bets = session.bets || [];
        var totalHands = bets.length;
        var totalBets = bets.filter(function(b) { return b.result !== 'PASS'; }).length;
        var totalPasses = bets.filter(function(b) { return b.result === 'PASS'; }).length;
        var wins = bets.filter(function(b) { return b.result === 'WIN'; }).length;
        var winRate = totalBets > 0 ? ((wins / totalBets) * 100).toFixed(0) : 0;
        var startDate = new Date(session.startTime).toLocaleDateString();
        var startTime = new Date(session.startTime).toLocaleTimeString();
        
        var duration = '';
        if (session.endTime) {
            var diff = new Date(session.endTime) - new Date(session.startTime);
            var mins = Math.floor(diff / 60000);
            var hrs = Math.floor(mins / 60);
            mins = mins % 60;
            duration = hrs > 0 ? hrs + 'h ' + mins + 'm' : mins + 'm';
        } else {
            duration = 'Active';
        }
        
        var balanceClass = session.balance >= 0 ? 'profit-positive' : 'profit-negative';
        var balanceText = session.balance >= 0 ? '+$' + session.balance.toFixed(2) : '-$' + Math.abs(session.balance).toFixed(2);
        
        return '<div class="past-session-card" data-session-id="' + session.id + '">' +
            '<div class="session-top">' +
                '<span class="session-id">' + session.id + '</span>' +
                '<span class="session-date">' + startDate + '</span>' +
            '</div>' +
            '<div class="session-details">' +
                '<span class="casino-name">' + session.casino + ' (' + session.tableTypeLabel + ')</span>' +
                '<span class="session-time">' + startTime + (duration !== 'Active' ? ' - ' + duration : '') + '</span>' +
            '</div>' +
            '<div class="session-stats">' +
                '<span>' + totalHands + ' hands (' + totalBets + 'B/' + totalPasses + 'P)</span>' +
                '<span>' + wins + ' wins</span>' +
                '<span>' + winRate + '% win rate</span>' +
                '<span class="' + balanceClass + '">' + balanceText + '</span>' +
            '</div>' +
            '<div class="session-tap-hint">Tap to view details →</div>' +
        '</div>';
    }).join('');
    
    // Add click handlers
    var cards = DOM.pastSessionsList.querySelectorAll('.past-session-card');
    cards.forEach(function(card) {
        card.addEventListener('click', function() {
            var sessionId = card.getAttribute('data-session-id');
            showSessionDetail(sessionId);
        });
    });
}

function showSessionDetail(sessionId) {
    var session = AppState.sessions[sessionId];
    if (!session) return;
    
    AppState.viewingSessionId = sessionId;
    DOM.pastSessionsList.classList.add('hidden');
    DOM.sessionDetail.classList.remove('hidden');
    DOM.pastSessionsTitle.textContent = sessionId;
    DOM.exportHistoryCsv.style.display = 'none';
    
    var bets = session.bets || [];
    var totalHands = bets.length;
    var totalBets = bets.filter(function(b) { return b.result !== 'PASS'; }).length;
    var totalPasses = bets.filter(function(b) { return b.result === 'PASS'; }).length;
    var wins = bets.filter(function(b) { return b.result === 'WIN'; }).length;
    var winRate = totalBets > 0 ? ((wins / totalBets) * 100).toFixed(0) : 0;
    var balanceClass = session.balance >= 0 ? 'profit-positive' : 'profit-negative';
    var balanceText = session.balance >= 0 ? '+$' + session.balance.toFixed(2) : '-$' + Math.abs(session.balance).toFixed(2);
    
    DOM.sessionDetailHeader.innerHTML = 
        '<div class="detail-info">' +
            '<span>' + session.casino + ' (' + session.tableTypeLabel + ')</span>' +
            '<span>$' + session.unitValue.toFixed(2) + '/unit</span>' +
        '</div>' +
        '<div class="detail-stats">' +
            '<span>' + totalHands + ' hands (' + totalBets + 'B/' + totalPasses + 'P)</span>' +
            '<span>' + wins + ' wins (' + winRate + '%)</span>' +
            '<span class="' + balanceClass + '">' + balanceText + '</span>' +
        '</div>';
    
    if (bets.length === 0) {
        DOM.sessionDetailList.innerHTML = '<div class="no-sessions">No hands recorded</div>';
        return;
    }
    
    DOM.sessionDetailList.innerHTML = bets.map(function(bet, index) {
        var resultClass = '';
        if (bet.result === 'WIN') resultClass = 'result-win';
        else if (bet.result === 'LOSE') resultClass = 'result-lose';
        else if (bet.result === 'PUSH') resultClass = 'result-push';
        else resultClass = 'result-pass';
        
        var profitText = '';
        if (bet.result === 'PASS') profitText = 'PASS';
        else if (bet.profit > 0) profitText = '+$' + bet.profit.toFixed(2);
        else if (bet.profit < 0) profitText = '-$' + Math.abs(bet.profit).toFixed(2);
        else profitText = 'PUSH';
        
        var leftSide = '';
        if (bet.result === 'PASS') {
            leftSide = '<span class="side-badge side-pass">' + bet.handResult.charAt(0) + '</span>' +
                       '<span class="pass-label">PASS</span>';
        } else {
            var sideLetter = bet.side === 'banker' ? 'B' : bet.side === 'tie' ? 'T' : 'P';
            leftSide = '<span class="side-badge side-' + bet.side + '">' + sideLetter + '</span>' +
                       '<span>' + bet.units + 'u ($' + bet.dollarAmount.toFixed(2) + ')</span>';
        }
        
        return '<div class="history-item">' +
            '<div class="bet-info">' +
                '<span class="hand-number">#' + (index + 1) + '</span>' +
                leftSide +
            '</div>' +
            '<span class="' + resultClass + '">' + profitText + '</span>' +
        '</div>';
    }).join('');
}

function backToPastSessions() {
    AppState.viewingSessionId = null;
    DOM.sessionDetail.classList.add('hidden');
    DOM.pastSessionsList.classList.remove('hidden');
    DOM.pastSessionsTitle.textContent = 'PAST SESSIONS';
    DOM.exportHistoryCsv.style.display = '';
}
function exportToCSV(sessionData) {
    if (!sessionData || !sessionData.bets || sessionData.bets.length === 0) {
        alert('No bets to export!');
        return;
    }
    
    var headers = ['No', 'Time', 'Side', 'Units', 'Amount', 'Hand Result', 'Bet Result', 'Profit/Loss', 'Running Balance'];
    var rows = [];
    var runningBalance = 0;
    
    sessionData.bets.forEach(function(bet, index) {
        runningBalance += bet.profit;
        var sideDisplay = bet.side ? bet.side.charAt(0).toUpperCase() + bet.side.slice(1) : '-';
        rows.push([
            index + 1,
            bet.time,
            sideDisplay,
            bet.units || '-',
            bet.dollarAmount > 0 ? bet.dollarAmount.toFixed(2) : '-',
            bet.handResult,
            bet.result,
            bet.profit !== 0 ? bet.profit.toFixed(2) : '-',
            runningBalance.toFixed(2)
        ]);
    });
    
    rows.push([]);
    var totalHands = sessionData.bets.length;
    var totalBets = sessionData.bets.filter(function(b) { return b.result !== 'PASS'; }).length;
    var totalPasses = sessionData.bets.filter(function(b) { return b.result === 'PASS'; }).length;
    var winCount = sessionData.bets.filter(function(b) { return b.result === 'WIN'; }).length;
    var winPct = totalBets > 0 ? ((winCount / totalBets) * 100).toFixed(0) : 0;
    rows.push(['', '', '', '', '', 'TOTAL HANDS:', totalHands, '']);
    rows.push(['', '', '', '', '', 'BETS/PLAYED:', totalBets + 'B/' + totalPasses + 'P', '']);
    rows.push(['', '', '', '', '', 'WINS:', winCount, '']);
    rows.push(['', '', '', '', '', 'WIN RATE:', winPct + '%', '']);
    rows.push(['', '', '', '', '', 'FINAL P/L:', sessionData.balance.toFixed(2), '']);
    
    var sessionInfo = [
        ['Session ID:', sessionData.id],
        ['Casino:', sessionData.casino],
        ['Table Type:', sessionData.tableTypeLabel],
        ['Unit Value:', '$' + sessionData.unitValue.toFixed(2)],
        ['Start Time:', new Date(sessionData.startTime).toLocaleString()],
        ['End Time:', sessionData.endTime ? new Date(sessionData.endTime).toLocaleString() : 'Session Active'],
        ['']
    ];
    
    var csvContent = sessionInfo.map(function(row) { return row.join(','); }).join('\n');
    csvContent += '\n' + headers.join(',');
    csvContent += '\n' + rows.map(function(row) { return row.join(','); }).join('\n');
    
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    var url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', 'baccarat_' + sessionData.id + '_' + new Date().toISOString().split('T')[0] + '.csv');
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportAllSessionsToCSV() {
    var sessions = Object.values(AppState.sessions).sort(function(a, b) {
        return new Date(b.startTime) - new Date(a.startTime);
    });
    
    if (sessions.length === 0) {
        alert('No sessions to export!');
        return;
    }
    
    var headers = ['Session ID', 'Casino', 'Table Type', 'Unit Value', 'Start Date', 'End Date', 'Duration', 'Total Bets', 'Wins', 'Win Rate', 'Final P/L'];
    var rows = sessions.map(function(session) {
        var bets = session.bets || [];
        var wins = bets.filter(function(b) { return b.result === 'WIN'; }).length;
        var winRate = bets.length > 0 ? ((wins / bets.length) * 100).toFixed(0) : 0;
        
        var startDate = new Date(session.startTime).toLocaleDateString();
        var endDate = session.endTime ? new Date(session.endTime).toLocaleDateString() : 'Active';
        
        var duration = '';
        if (session.endTime) {
            var diff = new Date(session.endTime) - new Date(session.startTime);
            var mins = Math.floor(diff / 60000);
            var hrs = Math.floor(mins / 60);
            mins = mins % 60;
            duration = hrs > 0 ? hrs + 'h ' + mins + 'm' : mins + 'm';
        } else {
            duration = 'Active';
        }
        
        return [
            session.id,
            session.casino,
            session.tableTypeLabel || '5% Comm',
            '$' + (session.unitValue || 0.50).toFixed(2),
            startDate,
            endDate,
            duration,
            bets.length,
            wins,
            winRate + '%',
            session.balance.toFixed(2)
        ];
    });
    
    var csvContent = headers.join(',') + '\n' + rows.map(function(row) { return row.join(','); }).join('\n');
    
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    var url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', 'baccarat_all_sessions_' + new Date().toISOString().split('T')[0] + '.csv');
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ============================================
// EVENT LISTENERS
// ============================================
function initEventListeners() {
    DOM.startSession.addEventListener('click', startNewSession);
    
    DOM.exportCsv.addEventListener('click', function(e) {
        e.preventDefault();
        exportAllSessionsToCSV();
    });
    
    DOM.viewHistory.addEventListener('click', function(e) {
        e.preventDefault();
        loadPastSessions();
        showScreen(DOM.pastSessionsScreen);
    });
    
    DOM.unitButtons.forEach(function(btn) {
        btn.addEventListener('click', function() {
            var unit = parseInt(btn.dataset.unit);
            if (unit) addUnits(unit);
        });
    });
    
    DOM.clearBet.addEventListener('click', resetCurrentBet);
    document.querySelector('.btn-double').addEventListener('click', doubleBet);
    
    DOM.btnBanker.addEventListener('click', function() { selectBetSide('banker'); });
    DOM.btnTie.addEventListener('click', function() { selectBetSide('tie'); });
    DOM.btnPlayer.addEventListener('click', function() { selectBetSide('player'); });
    
    DOM.btnPass.addEventListener('click', function() {
        DOM.passPanel.classList.remove('hidden');
    });
    
    DOM.passBanker.addEventListener('click', function() { recordPass('banker'); });
    DOM.passTie.addEventListener('click', function() { recordPass('tie'); });
    DOM.passPlayer.addEventListener('click', function() { recordPass('player'); });
    
    DOM.btnWin.addEventListener('click', function() { recordResult('win'); });
    DOM.btnPush.addEventListener('click', function() { recordResult('push'); });
    DOM.btnLose.addEventListener('click', function() { recordResult('lose'); });
    
    DOM.endSession.addEventListener('click', endSession);
    DOM.exportSessionCsv.addEventListener('click', function() {
        if (AppState.currentSession) {
            exportToCSV(AppState.currentSession);
        }
    });
    DOM.backToSetup.addEventListener('click', function() {
        if (DOM.sessionDetail.classList.contains('hidden') === false) {
            backToPastSessions();
        } else {
            showScreen(DOM.sessionSetup);
        }
    });
    
    DOM.exportHistoryCsv.addEventListener('click', function() {
        exportAllSessionsToCSV();
    });
    
    DOM.exportSessionDetail.addEventListener('click', function() {
        if (AppState.viewingSessionId && AppState.sessions[AppState.viewingSessionId]) {
            exportToCSV(AppState.sessions[AppState.viewingSessionId]);
        }
    });
    
    document.addEventListener('keydown', function(e) {
        if (DOM.bettingScreen.classList.contains('active')) {
            switch(e.key.toLowerCase()) {
                case 'b': selectBetSide('banker'); break;
                case 't': selectBetSide('tie'); break;
                case 'p': selectBetSide('player'); break;
                case 's': DOM.passPanel.classList.remove('hidden'); break;
                case 'w': recordResult('win'); break;
                case 'u': recordResult('push'); break;
                case 'l': recordResult('lose'); break;
                case 'escape': resetCurrentBet(); break;
            }
        }
    });
}

// ============================================
// INITIALIZATION
// ============================================
function init() {
    AppState.load();
    initEventListeners();
    
    var style = document.createElement('style');
    style.textContent = '@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }';
    document.head.appendChild(style);
}

document.addEventListener('DOMContentLoaded', init);
