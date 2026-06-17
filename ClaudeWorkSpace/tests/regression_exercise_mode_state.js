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
  if (!helper || typeof helper.resolveModeFromUiState !== 'function') {
    throw new Error('exercise view should expose resolveModeFromUiState');
  }
  if (typeof helper.buildModeUiState !== 'function') {
    throw new Error('exercise view should expose buildModeUiState');
  }

  if (helper.resolveModeFromUiState({ current_mode: 'collect' }) !== 'collect') {
    throw new Error('collect mode should restore from ui_state');
  }
  if (helper.resolveModeFromUiState({ current_mode: 'preference' }) !== 'preference') {
    throw new Error('preference mode should restore from ui_state');
  }
  if (helper.resolveModeFromUiState({ current_mode: 'weird' }) !== 'teacher') {
    throw new Error('unknown mode should fall back to teacher');
  }
  if (helper.resolveModeFromUiState(null) !== 'teacher') {
    throw new Error('empty ui_state should fall back to teacher');
  }

  const collectState = helper.buildModeUiState('collect');
  if (!collectState || collectState.current_mode !== 'collect') {
    throw new Error('buildModeUiState should persist collect mode');
  }

  const teacherState = helper.buildModeUiState('teacher');
  if (!teacherState || teacherState.current_mode !== 'teacher') {
    throw new Error('buildModeUiState should persist teacher mode');
  }

  console.log('PASS: exercise mode state regression');
}

main();
