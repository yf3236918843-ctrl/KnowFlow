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
  if (!helper || typeof helper.buildQuestionPreview !== 'function') {
    throw new Error('exercise view should expose buildQuestionPreview');
  }

  const preview = helper.buildQuestionPreview(
    "3. 给定函数 $f(x) = ax^2 + bx + c$，其中 $a,b,c$ 为常数，求：$f'(x),\\ f'(0),\\ f'\\left(\\frac{1}{2}\\right),\\ f'\\left(-\\frac{b}{2a}\\right)$"
  );

  if (preview !== "3. 给定函数 $f(x) = ax^2 + bx + c$ · 求 4 项") {
    throw new Error('unexpected question preview: ' + preview);
  }

  console.log('PASS: question summary preview regression');
}

main();
