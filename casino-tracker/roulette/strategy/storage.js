// BetPilot Strategy Storage
// 策略存储 - 使用 localStorage 持久化

const STORAGE_KEY = 'betpilot-strategies';

// 保存策略到 localStorage
function saveStrategies(strategies) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(strategies));
    return true;
  } catch (error) {
    console.error('Save failed:', error);
    return false;
  }
}

// 从 localStorage 加载策略
function loadStrategies() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('Load failed:', error);
    return [];
  }
}