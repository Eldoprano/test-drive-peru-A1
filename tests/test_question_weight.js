const vm = require('vm');
const fs = require('fs');
const assert = require('assert');
const path = require('path');

// Mock browser globals
const context = {
  console: console,
  document: {
    documentElement: {
      setAttribute: () => {},
      getAttribute: () => {}
    },
    getElementById: () => ({
      classList: { remove: () => {}, add: () => {} },
      style: {},
      addEventListener: () => {}
    }),
    querySelector: () => ({ textContent: '' }),
    querySelectorAll: () => [],
    addEventListener: () => {} // Captures 'DOMContentLoaded'
  },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    clear: () => {}
  },
  window: {
    addEventListener: () => {},
    location: { reload: () => {} }
  },
  navigator: {
    serviceWorker: {
      register: () => Promise.resolve({ update: () => {}, addEventListener: () => {} }),
      addEventListener: () => {}
    }
  },
  history: {
    pushState: () => {},
    replaceState: () => {}
  },
  location: {
    reload: () => {}
  },
  alert: () => {},
  setInterval: () => {},
  clearInterval: () => {},
  setTimeout: setTimeout,
  Math: Math,
  Date: Date,
  fetch: () => Promise.resolve({ json: () => Promise.resolve([]) })
};

// Self-reference for 'global' usage
context.global = context;

// Create VM context
vm.createContext(context);

// Read app.js
const appPath = path.join(__dirname, '../app.js');
let appCode = fs.readFileSync(appPath, 'utf8');

// Append helpers to expose internal state for testing
// We use 'global' (which maps to context) to expose functions
appCode += `
;
// Test Helpers injected by test runner
global.getQuestionWeight = getQuestionWeight;
global.setUserProgress = (num, data) => { userProgress[num] = data; };
global.getUserProgress = (num) => userProgress[num];
`;

// Run code inside VM
try {
  vm.runInContext(appCode, context);
} catch (e) {
  console.error('Error running app.js in VM:', e);
  process.exit(1);
}

// Extract helpers from context
const getQuestionWeight = context.getQuestionWeight;
const setUserProgress = context.setUserProgress;

if (!getQuestionWeight || !setUserProgress) {
  console.error('Failed to expose getQuestionWeight or setUserProgress from app.js');
  process.exit(1);
}

// Run Tests
console.log('Running tests for getQuestionWeight...');

try {
  // Test 1: Not Seen
  setUserProgress(1, { seen: false });
  assert.strictEqual(getQuestionWeight(1), 100, 'Weight should be 100 for unseen questions');
  console.log('Test 1 Passed: Not Seen');

  // Test 2: Struggling (0% Accuracy)
  setUserProgress(2, {
    seen: true,
    correct: 0,
    incorrect: 1,
    attempts: 1,
    totalTime: 5000
  });
  // 60 + (1-0)*30 = 90
  assert.strictEqual(getQuestionWeight(2), 90, 'Weight should be 90 for 0% accuracy');
  console.log('Test 2 Passed: Struggling (0% Accuracy)');

  // Test 3: Struggling (40% Accuracy)
  setUserProgress(3, {
    seen: true,
    correct: 2,
    incorrect: 3,
    attempts: 5,
    totalTime: 25000
  });
  // Accuracy = 0.4. Weight = 60 + (1-0.4)*30 = 60 + 18 = 78
  assert.strictEqual(getQuestionWeight(3), 78, 'Weight should be 78 for 40% accuracy');
  console.log('Test 3 Passed: Struggling (40% Accuracy)');

  // Test 4: Mastered (High Accuracy, Low Time)
  setUserProgress(4, {
    seen: true,
    correct: 3,
    incorrect: 0,
    attempts: 3,
    totalTime: 15000 // 5s avg
  });
  // Accuracy 1.0, Total 3, AvgTime 5s
  // Matches first mastered check: accuracy >= 0.85 && total >= 3 && avgTime <= 12000
  // Weight = max(1, 15 - 3) = 12
  assert.strictEqual(getQuestionWeight(4), 12, 'Weight should be 12 for mastered (3 attempts, fast)');
  console.log('Test 4 Passed: Mastered (3 attempts, fast)');

  // Test 5: Mastered (Perfect Accuracy, Any Time?) - Second check
  setUserProgress(5, {
    seen: true,
    correct: 2,
    incorrect: 0,
    attempts: 2,
    totalTime: 30000 // 15s avg
  });
  // Accuracy 1.0, Total 2.
  // Fails first check (avgTime > 12000).
  // Hits second check: accuracy === 1.0 && total >= 2
  // Weight = max(1, 12 - 2) = 10
  assert.strictEqual(getQuestionWeight(5), 10, 'Weight should be 10 for perfect accuracy (2 attempts)');
  console.log('Test 5 Passed: Mastered (Perfect Accuracy)');

  // Test 6: Learning (Medium Accuracy)
  setUserProgress(6, {
    seen: true,
    correct: 3,
    incorrect: 1,
    attempts: 4,
    totalTime: 20000 // 5s avg
  });
  // Accuracy = 0.75.
  // Not struggling (< 0.5 or slow & < 0.7).
  // Not mastered (accuracy < 0.85).
  // Learning: 20 + (1-0.75)*30 = 20 + 7.5 = 27.5
  assert.strictEqual(getQuestionWeight(6), 27.5, 'Weight should be 27.5 for 75% accuracy');
  console.log('Test 6 Passed: Learning (75% Accuracy)');

  // Test 7: Struggling with Time (Slow but Okay Accuracy)
  setUserProgress(7, {
    seen: true,
    correct: 6,
    incorrect: 4,
    attempts: 10,
    totalTime: 200000 // 20s avg
  });
  // Accuracy = 0.6. AvgTime = 20s.
  // accuracy < 0.5 is false.
  // avgTime > 15000 (true) && accuracy < 0.7 (true).
  // Weight = 55 + (1-0.6)*20 = 55 + 8 = 63.
  assert.strictEqual(getQuestionWeight(7), 63, 'Weight should be 63 for slow but okay accuracy');
  console.log('Test 7 Passed: Struggling (Slow Time)');

  console.log('All tests passed!');
} catch (error) {
  console.error('Test failed:', error.message);
  process.exit(1);
}
