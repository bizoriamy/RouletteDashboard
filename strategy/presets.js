// BetPilot Strategy Presets
// 策略预设 - 6 个经典策略模板

const PRESETS = [
  {
    id: 'preset-martingale',
    name: 'Martingale',
    description: 'Bet on Black after Red is missing 3 times. Double on loss.',
    enabled: true,
    priority: 1,
    conditions: { logic: 'AND', rules: [{ target: 'red', type: 'missing', count: 3 }] },
    action: { target: 'black', stake: { type: 'fixed', value: 10 } },
    risk: { maxStake: 200, stopLoss: 500, stopWin: null }
  },
  {
    id: 'preset-reverse-martingale',
    name: 'Reverse Martingale',
    description: 'Bet on Red after Red appears 2 times consecutively. Ride the streak.',
    enabled: true,
    priority: 2,
    conditions: { logic: 'AND', rules: [{ target: 'red', type: 'consecutive', count: 2 }] },
    action: { target: 'red', stake: { type: 'fixed', value: 10 } },
    risk: { maxStake: 200, stopLoss: null, stopWin: 300 }
  },
  {
    id: 'preset-fibonacci',
    name: 'Fibonacci',
    description: 'Bet on Red after Black is missing 4 times. Fibonacci progression on loss.',
    enabled: true,
    priority: 3,
    conditions: { logic: 'AND', rules: [{ target: 'black', type: 'missing', count: 4 }] },
    action: { target: 'red', stake: { type: 'fixed', value: 10 } },
    risk: { maxStake: 200, stopLoss: 500, stopWin: null }
  },
  {
    id: 'preset-dalembert',
    name: "D'Alembert",
    description: 'Bet on Odd after Even is missing 3 times. Add one unit on loss, remove on win.',
    enabled: true,
    priority: 4,
    conditions: { logic: 'AND', rules: [{ target: 'even', type: 'missing', count: 3 }] },
    action: { target: 'odd', stake: { type: 'fixed', value: 10 } },
    risk: { maxStake: 200, stopLoss: 300, stopWin: null }
  },
  {
    id: 'preset-paroli',
    name: 'Paroli',
    description: 'Bet on Odd after Odd appears 2 times consecutively. Triple on win.',
    enabled: true,
    priority: 5,
    conditions: { logic: 'AND', rules: [{ target: 'odd', type: 'consecutive', count: 2 }] },
    action: { target: 'odd', stake: { type: 'fixed', value: 10 } },
    risk: { maxStake: 200, stopLoss: null, stopWin: 300 }
  },
  {
    id: 'preset-streak-rider',
    name: 'Streak Rider',
    description: 'Follow the trend - bet on Black after Black appears 3 times consecutively.',
    enabled: true,
    priority: 6,
    conditions: { logic: 'AND', rules: [{ target: 'black', type: 'consecutive', count: 3 }] },
    action: { target: 'black', stake: { type: 'fixed', value: 10 } },
    risk: { maxStake: 200, stopLoss: 500, stopWin: null }
  }
];

// 获取所有预设
function getPresets() {
  // 深拷贝，避免修改原预设
  return JSON.parse(JSON.stringify(PRESETS));
}

// 根据 ID 获取单个预设
function getPresetById(id) {
  const preset = PRESETS.find((p) => p.id === id);
  return preset ? JSON.parse(JSON.stringify(preset)) : null;
}

// 将预设转换为可保存的策略对象（生成唯一 ID 和时间戳）
function presetToStrategy(preset) {
  const now = new Date().toISOString();
  return {
    id: 'strat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    name: preset.name,
    enabled: true,
    priority: preset.priority,
    conditions: JSON.parse(JSON.stringify(preset.conditions)),
    action: JSON.parse(JSON.stringify(preset.action)),
    risk: JSON.parse(JSON.stringify(preset.risk)),
    description: preset.description,
    createdAt: now,
    updatedAt: now
  };
}

// 导出 API（兼容浏览器和 Node.js）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PRESETS, getPresets, getPresetById, presetToStrategy };
} else {
  window.BetPilotPresets = { PRESETS, getPresets, getPresetById, presetToStrategy };
}