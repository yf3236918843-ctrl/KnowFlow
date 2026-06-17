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
  if (!helper || typeof helper.buildRenderableStrokes !== 'function') {
    throw new Error('draw view should expose buildRenderableStrokes');
  }
  if (typeof helper.shouldStartPan !== 'function') {
    throw new Error('draw view should expose shouldStartPan');
  }
  if (typeof helper.isUndoShortcut !== 'function') {
    throw new Error('draw view should expose isUndoShortcut');
  }

  const strokes = helper.buildRenderableStrokes(
    [{ size: 3, points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] }],
    { size: 4, points: [{ x: 100, y: 200 }, { x: 120, y: 230 }] }
  );

  if (strokes.length !== 2) {
    throw new Error('current stroke should be included in exportable strokes');
  }
  if (strokes[1].points[1].x !== 120) {
    throw new Error('current stroke points should be preserved');
  }

  if (!helper.shouldStartPan('pen', 1)) {
    throw new Error('middle mouse button should always start panning');
  }
  if (!helper.shouldStartPan('hand', 0)) {
    throw new Error('hand tool left click should start panning');
  }
  if (helper.shouldStartPan('pen', 0)) {
    throw new Error('pen tool left click should not start panning');
  }

  if (!helper.isUndoShortcut({ ctrlKey: true, shiftKey: false, key: 'z' })) {
    throw new Error('Ctrl+Z should trigger undo');
  }
  if (helper.isUndoShortcut({ ctrlKey: true, shiftKey: true, key: 'z' })) {
    throw new Error('Ctrl+Shift+Z should not be treated as undo');
  }

  console.log('PASS: draw interactions regression');
}

main();
