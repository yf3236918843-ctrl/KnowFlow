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
      getElementsByTagName() { return []; },
      createElement() { return { appendChild() {}, style: {}, addEventListener() {}, remove() {} }; },
      head: { appendChild() {} },
      body: { appendChild() {} },
      getElementById() { return null; },
      querySelector() { return null; },
    },
    requestAnimationFrame(fn) { fn(); },
    renderMath(text) { return text; },
    esc(text) { return String(text || ''); },
    enableLatexCopy() {},
    Shell: { clearActions() {} },
    AppShell: { setExerciseTarget() {} },
    api: { call() { throw new Error('not expected'); } },
    location: { href: 'http://localhost/test/main.html' },
    history: { pushState() {} },
    URL,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(VIEW_MANAGER_PATH, 'utf8'), context, { filename: VIEW_MANAGER_PATH });
  vm.runInContext(fs.readFileSync(CHAT_VIEW_PATH, 'utf8'), context, { filename: CHAT_VIEW_PATH });
  vm.runInContext(fs.readFileSync(EXERCISE_VIEW_PATH, 'utf8'), context, { filename: EXERCISE_VIEW_PATH });

  const helper = context.window.__exerciseViewTest;
  if (!helper || typeof helper.buildOcrCardData !== 'function') {
    throw new Error('buildOcrCardData helper should exist');
  }

  const data = helper.buildOcrCardData({
    items: [{ image_id: 'img_1', index: 1, preview: 'x' }],
    text: '用户消息',
    continueEnabled: true,
  });

  if (data.role !== 'assistant') {
    throw new Error('ocr card data must be visible assistant content');
  }
  if (data.type !== 'ocr_batch') {
    throw new Error('ocr card data type should be ocr_batch');
  }
  if (!data.show_continue) {
    throw new Error('ocr card continue flag should be preserved');
  }

  console.log('PASS: exercise ocr card data regression');
}

main();
