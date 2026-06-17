const fs = require('fs');
const vm = require('vm');

const DRAW_VIEW_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\draw.view.js`;

function main() {
  const context = {
    console,
    window: {},
    ViewManager: {
      registerView() {
        return function () {};
      },
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(DRAW_VIEW_PATH, 'utf8'), context, { filename: DRAW_VIEW_PATH });

  const helper = context.__drawViewTest;
  if (!helper || typeof helper.getPersistedState !== 'function') {
    throw new Error('draw view should expose getPersistedState');
  }
  if (typeof helper.mergePersistedState !== 'function') {
    throw new Error('draw view should expose mergePersistedState');
  }
  if (typeof helper.resetPersistedState !== 'function') {
    throw new Error('draw view should expose resetPersistedState');
  }

  helper.resetPersistedState();
  helper.mergePersistedState({
    strokes: [{ size: 3, points: [{ x: 1, y: 2 }, { x: 10, y: 20 }] }],
    redoStack: [{ size: 2, points: [{ x: 5, y: 6 }, { x: 7, y: 8 }] }],
    currentQuestionIndex: 2,
    panX: 30,
    panY: 40,
    tool: 'hand',
    color: '#5E6AD2',
    size: 8,
  });

  const saved = helper.getPersistedState();
  if (!saved || saved.strokes.length !== 1) {
    throw new Error('strokes should persist across reopen');
  }
  if (saved.redoStack.length !== 1) {
    throw new Error('redo stack should persist across reopen');
  }
  if (saved.currentQuestionIndex !== 2 || saved.panX !== 30 || saved.panY !== 40) {
    throw new Error('view position and selected question should persist');
  }
  if (saved.tool !== 'hand' || saved.color !== '#5E6AD2' || saved.size !== 8) {
    throw new Error('tool settings should persist');
  }

  helper.resetPersistedState();
  const reset = helper.getPersistedState();
  if (reset.strokes.length || reset.redoStack.length || reset.panX !== 0 || reset.panY !== 0) {
    throw new Error('reset should clear persisted draw state');
  }

  console.log('PASS: draw state persist regression');
}

main();
