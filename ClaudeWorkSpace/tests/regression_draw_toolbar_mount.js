const fs = require('fs');
const vm = require('vm');

const VIEW_MANAGER_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\ViewManager.js`;
const DRAW_VIEW_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\draw.view.js`;

function main() {
  const shellCalls = {
    title: [],
    content: [],
    actions: [],
    clearActions: 0,
  };

  const context = {
    console,
    window: {},
    document: {
      querySelector() { return null; },
      getElementById() { return null; },
      createElement() {
        return {
          getContext() { return null; },
          toDataURL() { return 'data:image/png;base64,test'; },
        };
      },
    },
    requestAnimationFrame(fn) { fn(); },
    renderMath(text) { return text; },
    esc(text) { return String(text || ''); },
    Shell: {
      setTitle(value) { shellCalls.title.push(value); },
      setContent(value) { shellCalls.content.push(value); },
      setActions(value) { shellCalls.actions.push(value); },
      clearActions() { shellCalls.clearActions += 1; },
      showBack() {},
      hideBack() {},
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(VIEW_MANAGER_PATH, 'utf8'), context, { filename: VIEW_MANAGER_PATH });
  vm.runInContext(fs.readFileSync(DRAW_VIEW_PATH, 'utf8'), context, { filename: DRAW_VIEW_PATH });
  vm.runInContext('this.__viewManager = ViewManager; this.__drawView = window._drawView;', context);

  const ViewManager = context.__viewManager;
  const drawView = context.__drawView;

  ViewManager.show(drawView, {
    questions: [{ content: 'q1' }, { content: 'q2' }],
    currentQuestionIndex: 0,
  });

  if (!shellCalls.content.length) {
    throw new Error('draw view should render content through Shell.setContent');
  }

  const contentHtml = String(shellCalls.content[shellCalls.content.length - 1] || '');
  if (contentHtml.indexOf('draw-toolbar') !== -1) {
    throw new Error('draw toolbar should not be rendered inside draw view content');
  }

  if (!shellCalls.actions.length) {
    throw new Error('draw view should render toolbar through Shell.setActions');
  }

  const actionsHtml = String(shellCalls.actions[shellCalls.actions.length - 1] || '');
  if (actionsHtml.indexOf('draw-toolbar') === -1) {
    throw new Error('draw toolbar should be mounted into context actions');
  }

  console.log('PASS: draw toolbar mount regression');
}

main();
