// BetPilot Strategy Engine
// 策略引擎 - 评估策略条件是否满足

// 号码分类常量
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

// 分类号码，返回该号码所属的属性集合
function classifyNumber(number) {
  if (!Number.isInteger(number) || number < 0 || number > 36) return [];
  if (number === 0) return [];
  return [
    number <= 18 ? 'low' : 'high',
    number % 2 === 0 ? 'even' : 'odd',
    RED_NUMBERS.has(number) ? 'red' : 'black'
  ];
}

// 判断号码是否属于某个目标
function numberMatchesTarget(number, target) {
  const props = classifyNumber(number);
  return props.includes(target);
}

// 从历史记录中计算目标的缺失次数（最近连续未出现次数）
function getAbsentCount(history, target) {
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const spin = history[i];
    if (numberMatchesTarget(spin.number, target)) {
      break;
    }
    count++;
  }
  return count;
}

// 从历史记录中计算目标的连续出现次数
function getConsecutiveCount(history, target) {
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const spin = history[i];
    if (numberMatchesTarget(spin.number, target)) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

// 从会话中计算当前策略的连输次数
function getLossStreak(sessions, strategyId) {
  const session = sessions.find((s) => s.strategyId === strategyId);
  if (!session || !session.outcomes) return 0;
  let streak = 0;
  for (let i = session.outcomes.length - 1; i >= 0; i--) {
    if (session.outcomes[i] === 'loss' || session.outcomes[i] === 'half-loss') {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// 从会话中计算当前策略的连赢次数
function getWinStreak(sessions, strategyId) {
  const session = sessions.find((s) => s.strategyId === strategyId);
  if (!session || !session.outcomes) return 0;
  let streak = 0;
  for (let i = session.outcomes.length - 1; i >= 0; i--) {
    if (session.outcomes[i] === 'win') {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// 评估单条规则是否满足
function evaluateRule(rule, state) {
  const target = rule.target || 'red';
  const count = rule.count || 0;
  const history = state.history || [];
  const sessions = state.sessions || [];

  switch (rule.type) {
    case 'missing':
      return getAbsentCount(history, target) >= count;

    case 'consecutive':
      return getConsecutiveCount(history, target) >= count;

    case 'after-losses':
      return getLossStreak(sessions, state.strategyId) >= count;

    case 'after-wins':
      return getWinStreak(sessions, state.strategyId) >= count;

    default:
      return false;
  }
}

// 评估单个策略是否满足条件
function evaluateStrategy(strategy, state) {
  if (!strategy || !strategy.enabled) return false;
  if (!strategy.conditions || !strategy.conditions.rules) return false;

  const rules = strategy.conditions.rules;
  if (rules.length === 0) return false;

  const logic = strategy.conditions.logic || 'AND';
  const stateWithId = { ...state, strategyId: strategy.id };

  if (logic === 'OR') {
    // OR 逻辑：任一规则满足即触发
    return rules.some((rule) => evaluateRule(rule, stateWithId));
  }

  // AND 逻辑：所有规则都满足才触发
  return rules.every((rule) => evaluateRule(rule, stateWithId));
}

// 评估所有策略，返回触发的策略列表
function evaluateStrategies(strategies, state) {
  const triggered = [];
  for (const strategy of strategies) {
    if (evaluateStrategy(strategy, state)) {
      triggered.push(strategy);
    }
  }
  // 按优先级排序（数字越小优先级越高）
  triggered.sort((a, b) => (a.priority || 1) - (b.priority || 1));
  return triggered;
}

// 导出 API（兼容浏览器和 Node.js）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    classifyNumber,
    numberMatchesTarget,
    getAbsentCount,
    getConsecutiveCount,
    getLossStreak,
    getWinStreak,
    evaluateRule,
    evaluateStrategy,
    evaluateStrategies
  };
} else {
  window.BetPilotEngine = {
    classifyNumber,
    numberMatchesTarget,
    getAbsentCount,
    getConsecutiveCount,
    getLossStreak,
    getWinStreak,
    evaluateRule,
    evaluateStrategy,
    evaluateStrategies
  };
}