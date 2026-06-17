const fs = require('fs');
const vm = require('vm');

const VIEW_MANAGER_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\ViewManager.js`;
const CHAT_VIEW_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\ChatView\js\ChatView.js`;
const EXERCISE_VIEW_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\Process\exercise\view.js`;

function main() {
  const context = {
    console,
    window: {},
    document: {
      querySelector() { return null; },
      getElementsByTagName() { return []; },
      createElement() { return {}; },
      body: { appendChild() {}, removeChild() {} },
    },
    requestAnimationFrame(fn) { fn(); },
    renderAll() {},
    renderMath(text) { return text; },
    esc(text) { return String(text || ''); },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(VIEW_MANAGER_PATH, 'utf8'), context, { filename: VIEW_MANAGER_PATH });
  vm.runInContext(fs.readFileSync(CHAT_VIEW_PATH, 'utf8'), context, { filename: CHAT_VIEW_PATH });
  vm.runInContext(fs.readFileSync(EXERCISE_VIEW_PATH, 'utf8'), context, { filename: EXERCISE_VIEW_PATH });

  const helper = context.window.__exerciseViewTest;
  if (!helper || typeof helper.buildRestoreMessages !== 'function') {
    throw new Error('exercise view should expose buildRestoreMessages');
  }

  const messages = [{ role: 'user', content: '答案是 1' }];
  const restored = helper.buildRestoreMessages(messages, {
    content: '14. 讨论函数 $f(x)$ 的连续性。',
  });

  if (!Array.isArray(restored) || restored.length !== 2) {
    throw new Error('restore messages should prepend one synthetic question message');
  }
  if (restored[0].role !== 'assistant') {
    throw new Error('synthetic question message should be assistant role');
  }
  if (restored[0].content.indexOf('"type":"question"') < 0) {
    throw new Error('synthetic restore message should use question protocol');
  }
  if (restored[0].content.indexOf('14. 讨论函数 $f(x)$ 的连续性。') < 0) {
    throw new Error('synthetic restore message should include full question content');
  }

  console.log('PASS: question restore message regression');
}

main();
