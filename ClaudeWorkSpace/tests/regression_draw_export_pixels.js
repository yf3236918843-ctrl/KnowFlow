const fs = require('fs');
const vm = require('vm');

const DRAW_VIEW_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\draw.view.js`;

function createImageData(width, height, points) {
  const data = new Uint8ClampedArray(width * height * 4);
  points.forEach(([x, y, r, g, b, a]) => {
    const idx = (y * width + x) * 4;
    data[idx] = r;
    data[idx + 1] = g;
    data[idx + 2] = b;
    data[idx + 3] = a;
  });
  return { width, height, data };
}

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
  if (!helper || typeof helper.computePixelBounds !== 'function') {
    throw new Error('draw view should expose computePixelBounds');
  }
  if (typeof helper.getExportPalette !== 'function') {
    throw new Error('draw view should expose getExportPalette');
  }
  if (typeof helper.computeWorldBounds !== 'function') {
    throw new Error('draw view should expose computeWorldBounds');
  }

  const image = createImageData(8, 7, [
    [2, 1, 0, 0, 0, 255],
    [5, 4, 0, 0, 0, 255],
    [4, 2, 0, 0, 0, 160],
  ]);

  const bounds = helper.computePixelBounds(image, 1);
  if (!bounds) {
    throw new Error('non-empty image data should produce pixel bounds');
  }
  if (bounds.left !== 1 || bounds.top !== 0 || bounds.right !== 7 || bounds.bottom !== 6) {
    throw new Error('pixel bounds should expand from actual painted pixels with padding');
  }

  const empty = helper.computePixelBounds(createImageData(4, 4, []), 1);
  if (empty !== null) {
    throw new Error('empty image should not produce pixel bounds');
  }

  const palette = helper.getExportPalette();
  if (palette.background !== '#FFFFFF') {
    throw new Error('export background should be pure white for OCR');
  }
  if (palette.stroke !== '#111111') {
    throw new Error('export stroke should be dark for OCR');
  }

  const worldBounds = helper.computeWorldBounds([
    {
      size: 4,
      points: [
        { x: 100, y: 200 },
        { x: 160, y: 260 },
      ],
    },
  ], 12);
  if (!worldBounds) {
    throw new Error('world bounds should exist for renderable strokes');
  }
  if (worldBounds.left > 90 || worldBounds.top > 190) {
    throw new Error('world bounds should be computed from absolute stroke coordinates, not viewport');
  }

  const negativeBounds = helper.computeWorldBounds([
    {
      size: 6,
      points: [
        { x: -120, y: -40 },
        { x: -20, y: 10 },
      ],
    },
  ], 12);
  if (!negativeBounds) {
    throw new Error('negative world coordinates should still produce bounds');
  }
  if (negativeBounds.left >= 0 || negativeBounds.top >= 0) {
    throw new Error('world bounds must preserve negative coordinates after panning');
  }

  console.log('PASS: draw export pixels regression');
}

main();
