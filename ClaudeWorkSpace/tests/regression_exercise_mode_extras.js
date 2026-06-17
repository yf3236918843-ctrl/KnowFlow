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
      createElement() { return {}; },
      getElementsByTagName() { return []; },
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

  const teacher = helper.buildInputExtras('teacher');
  const collect = helper.buildInputExtras('collect');
  const preference = helper.buildInputExtras('preference');

  const teacherCollect = teacher.find((it) => it.action === 'collect');
  const teacherPref = teacher.find((it) => it.action === 'preference');
  if (!teacherCollect || !teacherPref) {
    throw new Error('teacher mode should expose collect and preference actions');
  }

  const collectBack = collect.find((it) => it.action === 'continue');
  if (!collectBack || collectBack.label !== '教师模式') {
    throw new Error('collect mode should replace collect button with teacher mode');
  }
  if (collect.some((it) => it.action === 'collect')) {
    throw new Error('collect mode should not keep collect action visible');
  }

  const prefBack = preference.find((it) => it.action === 'continue');
  if (!prefBack || prefBack.label !== '教师模式') {
    throw new Error('preference mode should replace preference button with teacher mode');
  }
  if (preference.some((it) => it.action === 'preference')) {
    throw new Error('preference mode should not keep preference action visible');
  }

  console.log('PASS: exercise mode extras regression');
}

main();
