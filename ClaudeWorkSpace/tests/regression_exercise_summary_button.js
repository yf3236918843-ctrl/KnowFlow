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
  if (!helper || typeof helper.buildInputExtras !== 'function') {
    throw new Error('exercise view should expose buildInputExtras');
  }

  const normal = helper.buildInputExtras('teacher', { hasSummary: false });
  const summaryNormal = normal.find((item) => item.action === 'summary');
  if (!summaryNormal) throw new Error('summary action should exist');
  if (summaryNormal.disabled) {
    throw new Error('summary action should be enabled before summary');
  }

  const summarized = helper.buildInputExtras('teacher', { hasSummary: true });
  const summaryDone = summarized.find((item) => item.action === 'summary');
  if (!summaryDone) throw new Error('summary action should exist when summarized');
  if (!summaryDone.disabled) {
    throw new Error('summary action should be disabled after summary exists');
  }

  console.log('PASS: exercise summary button regression');
}

main();
