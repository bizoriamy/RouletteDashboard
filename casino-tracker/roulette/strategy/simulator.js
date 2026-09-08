// BetPilot Strategy Simulator
// 策略模拟器 - 使用历史数据回测所有启用的策略

// 获取引擎 API（兼容浏览器 Node.js）
let engine;
if (typeof module !== 'undefined' && module.exports) {
  engine = require('./engine.js');
} else {
  engine = window.BetPilotEngine;
}
const { evaluateStrategy, numberMatchesTarget } = engine;

// 模拟单个策略在历史数据上的表现
function simulateSingleStrategy(strategy, history) {
  const stats = {
    strategyId: strategy.id,
    strategyName: strategy.name,
    totalBets: 0,
    wins: 0,
    losses: 0,
    totalStaked: 0,
    totalProfit: 0,
    maxWinStreak: 0,
    maxLossStreak: 0,
    currentWinStreak: 0,
    currentLossStreak: 0,
    winRate: 0,
    betHistory: []
  };

  // 策略自己的会话（用于 after-losses / after-wins 规则）
  const session = { strategyId: strategy.id, outcomes: [] };
  let pendingBet = null;

  for (let i = 0; i < history.length; i++) {
    // 1. 如果有等待中的下注，用当前 spin 结算
    if (pendingBet) {
      const outcome = settleBet(pendingBet, history[i]);
      stats.totalBets++;
      stats.totalStaked += outcome.stake;
      stats.totalProfit += outcome.profit;

      // 更新会话结果
      session.outcomes.push(outcome.result);

      // 更新连赢/连输统计
      if (outcome.result === 'win') {
        stats.wins++;
        stats.currentWinStreak++;
        stats.currentLossStreak = 0;
        stats.maxWinStreak = Math.max(stats.maxWinStreak, stats.currentWinStreak);
      } else {
        stats.losses++;
        stats.currentLossStreak++;
        stats.currentWinStreak = 0;
        stats.maxLossStreak = Math.max(stats.maxLossStreak, stats.currentLossStreak);
      }

      stats.betHistory.push(outcome);
      pendingBet = null;
    }

    // 2. 用截止到当前的历史（含当前期）评估策略
    if (i + 1 >= history.length) break; // 最后一期无法下注（没有下一期可结算）

    const state = {
      history: history.slice(0, i + 1),
      sessions: [session],
      bankroll: 1000
    };

    if (evaluateStrategy(strategy, state)) {
      // 触发下注，在下一期结算
      pendingBet = {
        spinIndex: i + 1,
        target: strategy.action.target,
        stake: strategy.action.stake.value
      };
    }
  }

  // 计算胜率
  stats.winRate = stats.totalBets > 0 ? (stats.wins / stats.totalBets) * 100 : 0;

  return stats;
}

// 结算一笔下注
function settleBet(bet, spin) {
  const hit = numberMatchesTarget(spin.number, bet.target);
  const profit = hit ? bet.stake : -bet.stake;
  return {
    spinIndex: bet.spinIndex,
    number: spin.number,
    target: bet.target,
    stake: bet.stake,
    result: hit ? 'win' : 'loss',
    profit
  };
}

// 模拟所有启用的策略，返回每个策略的统计结果
function simulateStrategies(strategies, history) {
  // 只模拟启用的策略
  const enabled = strategies.filter((s) => s.enabled);

  if (history.length === 0) {
    return enabled.map((strategy) => ({
      strategyId: strategy.id,
      strategyName: strategy.name,
      totalBets: 0,
      wins: 0,
      losses: 0,
      totalStaked: 0,
      totalProfit: 0,
      maxWinStreak: 0,
      maxLossStreak: 0,
      currentWinStreak: 0,
      currentLossStreak: 0,
      winRate: 0,
      betHistory: [],
      error: 'No history data'
    }));
  }

  return enabled.map((strategy) => simulateSingleStrategy(strategy, history));
}

// 生成模拟报告（汇总所有策略）
function generateSimulationReport(strategies, history) {
  const results = simulateStrategies(strategies, history);

  // 总览统计
  const totalStrategies = results.length;
  const strategiesWithBets = results.filter((r) => r.totalBets > 0);
  const totalBets = results.reduce((sum, r) => sum + r.totalBets, 0);
  const totalProfit = results.reduce((sum, r) => sum + r.totalProfit, 0);
  const totalWins = results.reduce((sum, r) => sum + r.wins, 0);
  const totalLosses = results.reduce((sum, r) => sum + r.losses, 0);

  // 最佳/最差策略
  const bestStrategy = strategiesWithBets.length > 0
    ? strategiesWithBets.reduce((best, r) => (r.totalProfit > best.totalProfit ? r : best))
    : null;
  const worstStrategy = strategiesWithBets.length > 0
    ? strategiesWithBets.reduce((worst, r) => (r.totalProfit < worst.totalProfit ? r : worst))
    : null;

  return {
    historySize: history.length,
    totalStrategies,
    enabledStrategies: totalStrategies,
    strategiesWithBets: strategiesWithBets.length,
    totalBets,
    totalProfit,
    totalWins,
    totalLosses,
    overallWinRate: totalBets > 0 ? (totalWins / totalBets) * 100 : 0,
    bestStrategy,
    worstStrategy,
    results
  };
}

// 导出 API（兼容浏览器和 Node.js）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    simulateStrategies,
    simulateSingleStrategy,
    settleBet,
    generateSimulationReport
  };
} else {
  window.BetPilotSimulator = {
    simulateStrategies,
    simulateSingleStrategy,
    settleBet,
    generateSimulationReport
  };
}