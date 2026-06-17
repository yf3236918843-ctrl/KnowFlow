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

  if (!context.__drawViewTest || typeof context.__drawViewTest.computeStrokeBounds !== 'function') {
    throw new Error('draw view should expose computeStrokeBounds for regression tests');
  }

  const computeStrokeBounds = context.__drawViewTest.computeStrokeBounds;

  const bounds = computeStrokeBounds([
    {
      size: 6,
      points: [
        { x: 1, y: 2 },
        { x: 100, y: 370 },
      ],
    },
  ], 12);

  if (!bounds) {
    throw new Error('non-empty strokes should produce bounds');
  }
  if (bounds.left !== 0 || bounds.top !== 0) {
    throw new Error('bounds should clamp to zero after padding expansion');
  }
  if (bounds.right < 112 || bounds.bottom < 382) {
    throw new Error('bounds should include stroke size and outward padding');
  }

  const empty = computeStrokeBounds([], 12);
  if (empty !== null) {
    throw new Error('empty strokes should not produce bounds');
  }

  console.log('PASS: draw crop bounds regression');
}

main();
