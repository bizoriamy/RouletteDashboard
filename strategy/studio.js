// BetPilot Strategy Studio - Main Logic

// 策略数组 - 从 localStorage 加载
let strategies = loadStrategies();

// 当前正在编辑的策略索引
let editingIndex = -1;

// 当前测试结果（策略ID -> 是否触发）
let testResults = {};

// 规则类型选项
const RULE_TYPES = [
  { value: 'missing', label: 'Missing' },
  { value: 'consecutive', label: 'Consecutive' },
  { value: 'after-losses', label: 'After Losses' },
  { value: 'after-wins', label: 'After Wins' }
];

// 初始化函数
function initStudio() {
  console.log('Strategy Studio loaded');
  renderPresets();
  renderStrategies();
}

// ===== 策略预设 =====

// 渲染预设策略列表
function renderPresets() {
  const listContainer = document.getElementById('presets-list');
  if (!listContainer) return;

  const presets = BetPilotPresets.getPresets();

  listContainer.innerHTML = '';

  presets.forEach((preset) => {
    const card = document.createElement('div');
    card.className = 'preset-card';
    card.dataset.presetId = preset.id;

    // 行动摘要
    const target = preset.action.target.charAt(0).toUpperCase() + preset.action.target.slice(1);

    card.innerHTML = `
      <div class="preset-card-header">
        <span class="preset-name">${preset.name}</span>
        <span class="preset-badge">${preset.action.stake.value > 0 ? 'Pro' : ''}</span>
      </div>
      <div class="preset-description">${preset.description}</div>
      <div class="preset-summary">
        <span class="preset-summary-item">🎯 ${target}</span>
        <span class="preset-summary-item">💰 RM ${preset.action.stake.value}</span>
        <span class="preset-summary-item">📋 ${preset.conditions.rules.length} rule${preset.conditions.rules.length > 1 ? 's' : ''}</span>
      </div>
      <button class="btn btn-load-preset" onclick="loadPreset('${preset.id}')">+ Load</button>
    `;

    listContainer.appendChild(card);
  });
}

// 加载预设策略到策略列表
function loadPreset(presetId) {
  const preset = BetPilotPresets.getPresetById(presetId);
  if (!preset) {
    console.error('Preset not found:', presetId);
    return;
  }

  // 转换预设为策略
  const strategy = BetPilotPresets.presetToStrategy(preset);

  // 添加到策略列表
  strategies.push(strategy);
  saveStrategies(strategies);
  renderStrategies();

  console.log('Preset loaded:', strategy.name);
}

// 创建新策略
function createNewStrategy() {
  const now = new Date().toISOString();
  const newStrategy = {
    id: 'strat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    name: 'New Strategy',
    enabled: true,
    priority: 1,
    conditions: { logic: 'AND', rules: [] },
    action: { target: 'red', stake: { type: 'fixed', value: 10 } },
    risk: { maxStake: 200, stopLoss: 500, stopWin: 300 },
    createdAt: now,
    updatedAt: now
  };

  strategies.push(newStrategy);
  saveStrategies(strategies);
  console.log('New strategy created:', newStrategy.name);
  renderStrategies();
}

// 渲染策略列表
function renderStrategies() {
  const listContainer = document.getElementById('strategy-list');
  if (!listContainer) return;

  // 清空策略列表区域
  listContainer.innerHTML = '';

  // 如果没有策略，显示空消息
  if (strategies.length === 0) {
    listContainer.innerHTML = '<p class="empty-message">No strategies yet. Create your first one!</p>';
    return;
  }

  // 循环遍历策略数组，为每个策略创建一个卡片
  strategies.forEach((strategy, index) => {
    const card = document.createElement('div');
    card.className = 'strategy-card';
    card.dataset.index = index;

    // 状态文本
    const statusText = strategy.enabled ? 'Enabled' : 'Disabled';
    const statusClass = strategy.enabled ? 'status-enabled' : 'status-disabled';

    // 条件摘要
    const conditionSummary = getConditionSummary(strategy);

    // 行动摘要
    const actionSummary = getActionSummary(strategy);

    // 触发状态
    const triggered = testResults[strategy.id] === true;
    const triggerClass = triggered ? 'triggered' : 'not-triggered';
    const triggerText = triggered ? '✅ TRIGGERED' : '⏸️ Not triggered';

    // 触发时高亮卡片边框
    if (triggered) {
      card.classList.add('has-trigger');
    }

    card.innerHTML = `
      <div class="strategy-card-header">
        <span class="strategy-name">${strategy.name}</span>
        <span class="strategy-status ${statusClass}">${statusText}</span>
      </div>
      <div class="strategy-card-body">
        <div class="strategy-info">
          <span class="info-label">Priority:</span> ${strategy.priority}
        </div>
        <div class="strategy-info">
          <span class="info-label">Condition:</span> ${conditionSummary}
        </div>
        <div class="strategy-info">
          <span class="info-label">Action:</span> ${actionSummary}
        </div>
        <div class="strategy-trigger ${triggerClass}">${triggerText}</div>
      </div>
      <div class="strategy-card-actions">
        <button class="btn btn-edit" data-action="edit">Edit</button>
        <button class="btn btn-delete" data-action="delete">Delete</button>
        <button class="btn btn-toggle" data-action="toggle">Toggle</button>
      </div>
    `;

    listContainer.appendChild(card);
  });

  // 绑定卡片按钮事件
  bindCardActions();
}

// 生成条件摘要
function getConditionSummary(strategy) {
  const rules = strategy.conditions.rules;
  if (!rules || rules.length === 0) {
    return 'No condition';
  }

  // 生成所有规则的摘要
  const summaries = rules.map((rule) => getRuleSummary(rule));
  return summaries.join('; ');
}

// 生成单条规则摘要
function getRuleSummary(rule) {
  const target = rule.target ? rule.target.charAt(0).toUpperCase() + rule.target.slice(1) : 'Red';
  const count = rule.count || 0;

  switch (rule.type) {
    case 'consecutive':
      return `${target} consecutive ${count} times`;
    case 'after-losses':
      return `After ${count} losses`;
    case 'after-wins':
      return `After ${count} wins`;
    case 'missing':
    default:
      return `${target} missing ${count} times`;
  }
}

// 生成行动摘要
function getActionSummary(strategy) {
  const action = strategy.action;
  const stakeType = action.stake.type === 'fixed' ? 'Fixed' : 'Dynamic';
  return `Bet ${action.target} RM ${action.stake.value} (${stakeType})`;
}

// 绑定卡片操作按钮
function bindCardActions() {
  const cards = document.querySelectorAll('.strategy-card');
  cards.forEach((card) => {
    const index = parseInt(card.dataset.index, 10);
    const buttons = card.querySelectorAll('.btn');

    buttons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        handleCardAction(index, action);
      });
    });
  });
}

// 处理卡片操作
function handleCardAction(index, action) {
  const strategy = strategies[index];
  if (!strategy) return;

  switch (action) {
    case 'edit':
      openEditor(index);
      break;
    case 'delete':
      strategies.splice(index, 1);
      saveStrategies(strategies);
      console.log('Strategy deleted');
      renderStrategies();
      break;
    case 'toggle':
      strategy.enabled = !strategy.enabled;
      strategy.updatedAt = new Date().toISOString();
      saveStrategies(strategies);
      console.log('Strategy toggled:', strategy.name, strategy.enabled ? 'Enabled' : 'Disabled');
      renderStrategies();
      break;
  }
}

// ===== 测试模式 =====

// 运行测试：解析输入号码，评估所有策略
function runTest() {
  const input = document.getElementById('test-input').value.trim();
  const resultsContainer = document.getElementById('test-results');

  if (!input) {
    resultsContainer.innerHTML = '<p class="test-error">Please enter spin history first.</p>';
    return;
  }

  // 解析输入号码
  const numbers = input.split(/[,\s]+/).map((n) => parseInt(n, 10)).filter((n) => !isNaN(n) && n >= 0 && n <= 36);

  if (numbers.length === 0) {
    resultsContainer.innerHTML = '<p class="test-error">No valid numbers found. Use numbers 0-36 separated by commas.</p>';
    return;
  }

  // 构建历史记录
  const history = numbers.map((number, i) => ({ number, at: new Date().toISOString(), index: i + 1 }));

  // 构建状态对象
  const state = {
    history,
    sessions: [],
    bankroll: 1000
  };

  // 调用引擎评估所有策略
  const triggered = BetPilotEngine.evaluateStrategies(strategies, state);

  // 记录测试结果
  testResults = {};
  strategies.forEach((strategy) => {
    testResults[strategy.id] = triggered.some((t) => t.id === strategy.id);
  });

  // 显示结果
  renderTestResults(triggered, numbers.length);
  renderStrategies();
}

// 渲染测试结果
function renderTestResults(triggered, spinCount) {
  const resultsContainer = document.getElementById('test-results');

  if (strategies.length === 0) {
    resultsContainer.innerHTML = '<p class="test-info">No strategies to test. Create one first.</p>';
    return;
  }

  const triggeredCount = triggered.length;
  const totalCount = strategies.length;

  let html = `
    <div class="test-summary">
      <span class="test-summary-label">Spins: ${spinCount}</span>
      <span class="test-summary-label">Triggered: ${triggeredCount}/${totalCount}</span>
    </div>
  `;

  if (triggeredCount === 0) {
    html += '<p class="test-info">No strategies triggered with this history.</p>';
  } else {
    html += '<div class="test-triggered-list">';
    triggered.forEach((strategy) => {
      html += `
        <div class="test-triggered-item">
          <span class="test-triggered-name">${strategy.name}</span>
          <span class="test-triggered-action">${getActionSummary(strategy)}</span>
        </div>
      `;
    });
    html += '</div>';
  }

  resultsContainer.innerHTML = html;
}

// 从主程序导入历史数据
function importFromMain() {
  const resultsContainer = document.getElementById('test-results');
  const inputEl = document.getElementById('test-input');

  // 主程序数据存储键名
  const MAIN_STORAGE_KEY = 'roulette-live-dashboard-v2';

  try {
    const raw = localStorage.getItem(MAIN_STORAGE_KEY);
    if (!raw) {
      resultsContainer.innerHTML = '<p class="test-error">No main dashboard data found. Open live-dashboard.html and add some spins first.</p>';
      return;
    }

    const snapshot = JSON.parse(raw);
    if (!snapshot || !Array.isArray(snapshot.events)) {
      resultsContainer.innerHTML = '<p class="test-error">Main dashboard data format is invalid.</p>';
      return;
    }

    // 提取所有开奖号码
    const numbers = snapshot.events
      .filter((event) => event.type === 'spin' && Number.isInteger(Number(event.number)) && Number(event.number) >= 0 && Number(event.number) <= 36)
      .map((event) => Number(event.number));

    if (numbers.length === 0) {
      resultsContainer.innerHTML = '<p class="test-error">No spin data found in the main dashboard.</p>';
      return;
    }

    // 填充到测试输入框
    inputEl.value = numbers.join(', ');

    // 显示导入成功信息
    const triggeredCount = strategies.length > 0
      ? BetPilotEngine.evaluateStrategies(strategies, {
          history: numbers.map((number, i) => ({ number, at: new Date().toISOString(), index: i + 1 })),
          sessions: [],
          bankroll: 1000
        }).length
      : 0;

    resultsContainer.innerHTML = `
      <div class="test-summary">
        <span class="test-summary-label">✅ Imported ${numbers.length} spins from main dashboard</span>
        <span class="test-summary-label">Triggered: ${triggeredCount}/${strategies.length}</span>
      </div>
    `;

    console.log(`Imported ${numbers.length} spins from main dashboard`);
  } catch (error) {
    console.error('Import failed:', error);
    resultsContainer.innerHTML = '<p class="test-error">Failed to import data from main dashboard.</p>';
  }
}

// ===== 模拟器 =====

// 运行模拟：从主程序读取历史数据，回测所有策略
function runSimulation() {
  const resultsContainer = document.getElementById('sim-results');
  const historySizeEl = document.getElementById('sim-history-size');
  const historySize = parseInt(historySizeEl.value, 10) || 100;

  if (strategies.length === 0) {
    resultsContainer.innerHTML = '<p class="test-error">No strategies to simulate. Create and enable some strategies first.</p>';
    return;
  }

  const enabledCount = strategies.filter((s) => s.enabled).length;
  if (enabledCount === 0) {
    resultsContainer.innerHTML = '<p class="test-error">No enabled strategies to simulate. Enable at least one strategy.</p>';
    return;
  }

  // 从主程序读取历史数据
  const MAIN_STORAGE_KEY = 'roulette-live-dashboard-v2';
  let history;

  try {
    const raw = localStorage.getItem(MAIN_STORAGE_KEY);
    if (!raw) {
      resultsContainer.innerHTML = '<p class="test-error">No main dashboard data found. Use "Import From Main" to load spin history first, or open live-dashboard.html and add spins.</p>';
      return;
    }

    const snapshot = JSON.parse(raw);
    if (!snapshot || !Array.isArray(snapshot.events)) {
      resultsContainer.innerHTML = '<p class="test-error">Main dashboard data format is invalid.</p>';
      return;
    }

    // 提取所有开奖号码，按时间顺序排列
    const numbers = snapshot.events
      .filter((event) => event.type === 'spin' && Number.isInteger(Number(event.number)) && Number(event.number) >= 0 && Number(event.number) <= 36)
      .map((event) => Number(event.number));

    if (numbers.length === 0) {
      resultsContainer.innerHTML = '<p class="test-error">No spin data found in the main dashboard.</p>';
      return;
    }

    // 使用最近 N 个号码
    const recentNumbers = numbers.slice(-historySize);

    // 构建历史记录
    history = recentNumbers.map((number, i) => ({
      number,
      at: new Date().toISOString(),
      index: i + 1
    }));
  } catch (error) {
    console.error('Simulation failed to load history:', error);
    resultsContainer.innerHTML = '<p class="test-error">Failed to load history data from main dashboard.</p>';
    return;
  }

  // 调用模拟器生成报告
  const report = BetPilotSimulator.generateSimulationReport(strategies, history);

  renderSimulationResults(report);
}

// 渲染模拟结果
function renderSimulationResults(report) {
  const resultsContainer = document.getElementById('sim-results');

  if (report.totalStrategies === 0) {
    resultsContainer.innerHTML = '<p class="test-info">No enabled strategies to simulate.</p>';
    return;
  }

  const fmtMoney = (v) => {
    const sign = v > 0 ? '+' : '';
    return `${sign}RM ${v.toFixed(2)}`;
  };

  // 最佳/最差策略
  const best = report.bestStrategy;
  const worst = report.worstStrategy;

  let html = `
    <div class="sim-summary">
      <div class="sim-summary-grid">
        <div class="sim-stat">
          <span class="sim-stat-label">Strategies</span>
          <span class="sim-stat-value">${report.enabledStrategies}</span>
        </div>
        <div class="sim-stat">
          <span class="sim-stat-label">Spins Tested</span>
          <span class="sim-stat-value">${report.historySize}</span>
        </div>
        <div class="sim-stat">
          <span class="sim-stat-label">Total Bets</span>
          <span class="sim-stat-value">${report.totalBets}</span>
        </div>
        <div class="sim-stat">
          <span class="sim-stat-label">Win Rate</span>
          <span class="sim-stat-value">${report.overallWinRate.toFixed(1)}%</span>
        </div>
        <div class="sim-stat ${report.totalProfit >= 0 ? 'sim-profit' : 'sim-loss'}">
          <span class="sim-stat-label">Net P/L</span>
          <span class="sim-stat-value">${fmtMoney(report.totalProfit)}</span>
        </div>
      </div>
    </div>
  `;

  // 最佳/最差策略
  if (best && worst) {
    html += `
      <div class="sim-best-worst">
        <div class="sim-best-item">
          <span class="sim-bw-label">🏆 Best</span>
          <span class="sim-bw-name">${best.strategyName}</span>
          <span class="sim-bw-value sim-profit">${fmtMoney(best.totalProfit)}</span>
        </div>
        <div class="sim-worst-item">
          <span class="sim-bw-label">📉 Worst</span>
          <span class="sim-bw-name">${worst.strategyName}</span>
          <span class="sim-bw-value ${worst.totalProfit >= 0 ? 'sim-profit' : 'sim-loss'}">${fmtMoney(worst.totalProfit)}</span>
        </div>
      </div>
    `;
  }

  // 每个策略的详细结果
  html += '<div class="sim-strategy-list">';
  report.results.forEach((r) => {
    const profitClass = r.totalProfit >= 0 ? 'sim-profit' : 'sim-loss';
    html += `
      <div class="sim-strategy-item">
        <div class="sim-strategy-header">
          <span class="sim-strategy-name">${r.strategyName}</span>
          <span class="sim-strategy-profit ${profitClass}">${fmtMoney(r.totalProfit)}</span>
        </div>
        <div class="sim-strategy-stats">
          <span class="sim-strategy-stat">Bets: ${r.totalBets}</span>
          <span class="sim-strategy-stat">Wins: ${r.wins}</span>
          <span class="sim-strategy-stat">Losses: ${r.losses}</span>
          <span class="sim-strategy-stat">Win rate: ${r.winRate.toFixed(1)}%</span>
          <span class="sim-strategy-stat">Max win streak: ${r.maxWinStreak}</span>
          <span class="sim-strategy-stat">Max loss streak: ${r.maxLossStreak}</span>
        </div>
      </div>
    `;
  });
  html += '</div>';

  resultsContainer.innerHTML = html;
}

// ===== 策略编辑器 =====

// 打开编辑器
function openEditor(index) {
  const strategy = strategies[index];
  if (!strategy) return;

  editingIndex = index;

  // 填充基本信息
  document.getElementById('edit-name').value = strategy.name;
  document.getElementById('edit-enabled').value = strategy.enabled ? 'true' : 'false';
  document.getElementById('edit-priority').value = strategy.priority;

  // 填充条件
  document.getElementById('edit-logic').value = strategy.conditions.logic || 'AND';
  renderRuleFields(strategy.conditions.rules || []);

  // 填充行动
  document.getElementById('edit-target').value = strategy.action.target || 'red';
  document.getElementById('edit-stake-type').value = strategy.action.stake.type || 'fixed';
  document.getElementById('edit-stake-value').value = strategy.action.stake.value || 10;

  // 填充风险控制
  document.getElementById('edit-max-stake').value = strategy.risk.maxStake || 200;
  document.getElementById('edit-stop-loss').value = strategy.risk.stopLoss || 500;
  document.getElementById('edit-stop-win').value = strategy.risk.stopWin || 300;

  // 显示模态框
  document.getElementById('editor-modal').style.display = 'flex';
}

// 关闭编辑器
function closeEditor() {
  document.getElementById('editor-modal').style.display = 'none';
  editingIndex = -1;
}

// 保存编辑器修改
function saveEditor() {
  if (editingIndex < 0) return;

  const strategy = strategies[editingIndex];
  if (!strategy) return;

  // 保存基本信息
  strategy.name = document.getElementById('edit-name').value || 'New Strategy';
  strategy.enabled = document.getElementById('edit-enabled').value === 'true';
  strategy.priority = parseInt(document.getElementById('edit-priority').value, 10) || 1;

  // 保存条件
  strategy.conditions.logic = document.getElementById('edit-logic').value;
  strategy.conditions.rules = collectRules();

  // 保存行动
  strategy.action.target = document.getElementById('edit-target').value;
  strategy.action.stake.type = document.getElementById('edit-stake-type').value;
  strategy.action.stake.value = parseFloat(document.getElementById('edit-stake-value').value) || 10;

  // 保存风险控制
  strategy.risk.maxStake = parseFloat(document.getElementById('edit-max-stake').value) || 200;
  strategy.risk.stopLoss = parseFloat(document.getElementById('edit-stop-loss').value) || 500;
  strategy.risk.stopWin = parseFloat(document.getElementById('edit-stop-win').value) || 300;

  strategy.updatedAt = new Date().toISOString();

  saveStrategies(strategies);
  console.log('Strategy saved:', strategy.name);
  closeEditor();
  renderStrategies();
}

// 渲染规则字段
function renderRuleFields(rules) {
  const ruleList = document.getElementById('rule-list');
  ruleList.innerHTML = '';

  if (!rules || rules.length === 0) {
    ruleList.innerHTML = '<p class="rule-empty">No rules yet.</p>';
    return;
  }

  rules.forEach((rule, i) => {
    const row = document.createElement('div');
    row.className = 'rule-row';

    // 目标选择
    const targetSelect = document.createElement('select');
    targetSelect.className = 'form-input rule-target';
    targetSelect.dataset.index = i;
    const targets = ['red', 'black', 'odd', 'even', '1-18', '19-36'];
    targets.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t.charAt(0).toUpperCase() + t.slice(1);
      if (t === rule.target) opt.selected = true;
      targetSelect.appendChild(opt);
    });

    // 类型选择
    const typeSelect = document.createElement('select');
    typeSelect.className = 'form-input rule-type';
    typeSelect.dataset.index = i;
    RULE_TYPES.forEach((type) => {
      const opt = document.createElement('option');
      opt.value = type.value;
      opt.textContent = type.label;
      if (type.value === rule.type) opt.selected = true;
      typeSelect.appendChild(opt);
    });

    // 次数输入
    const countInput = document.createElement('input');
    countInput.type = 'number';
    countInput.className = 'form-input rule-count';
    countInput.dataset.index = i;
    countInput.min = '0';
    countInput.value = rule.count || 0;

    // 次数标签
    const timesLabel = document.createElement('span');
    timesLabel.className = 'rule-type-label';
    timesLabel.textContent = 'times';

    // 删除按钮
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-remove-rule';
    removeBtn.textContent = 'Remove';
    removeBtn.dataset.index = i;
    removeBtn.addEventListener('click', () => {
      rules.splice(i, 1);
      renderRuleFields(rules);
    });

    row.appendChild(targetSelect);
    row.appendChild(typeSelect);
    row.appendChild(countInput);
    row.appendChild(timesLabel);
    row.appendChild(removeBtn);
    ruleList.appendChild(row);
  });
}

// 添加规则字段
function addRuleField() {
  // 从当前表单中收集已有规则，再添加一个新规则
  const rules = collectRules();
  rules.push({ target: 'red', type: 'missing', count: 0 });
  renderRuleFields(rules);
}

// 收集表单中的规则
function collectRules() {
  const rules = [];
  const targetSelects = document.querySelectorAll('.rule-target');
  const typeSelects = document.querySelectorAll('.rule-type');
  const countInputs = document.querySelectorAll('.rule-count');

  targetSelects.forEach((select, i) => {
    const typeSelect = typeSelects[i];
    const countInput = countInputs[i];
    if (select && typeSelect && countInput) {
      rules.push({
        target: select.value,
        type: typeSelect.value,
        count: parseInt(countInput.value, 10) || 0
      });
    }
  });

  return rules;
}

// 显示策略数量的函数
function updateStrategyCount() {
  const count = strategies.length;
  console.log(`Current strategies: ${count}`);
  // 未来可以在这里更新页面上的显示
}

// 页面加载完成后执行初始化
document.addEventListener('DOMContentLoaded', initStudio);