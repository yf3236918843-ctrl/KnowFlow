const fs = require('fs');
const vm = require('vm');

const VIEW_MANAGER_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\ViewManager.js`;

function main() {
  const context = {
    console,
    window: {},
    document: {},
    requestAnimationFrame(fn) { fn(); },
    Shell: {
      setTitle() {},
      setContent() {},
      showBack() {},
      hideBack() {},
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(VIEW_MANAGER_PATH, 'utf8'), context, { filename: VIEW_MANAGER_PATH });
  vm.runInContext('this.__viewManager = ViewManager;', context);
  const ViewManager = context.__viewManager;

  const received = [];

  const drawFactory = ViewManager.registerView('draw', {
    create() {
      return {
        activate() {
          return {
            title: 'draw',
            content: '<div></div>',
            mount() {},
          };
        },
      };
    },
  });

  const exerciseFactory = ViewManager.registerView('exercise', {
    create() {
      return {
        activate(ctx, result) {
          received.push({ ctx, result });
          return {
            title: 'exercise',
            content: '<div></div>',
            mount() {},
          };
        },
      };
    },
  });

  ViewManager.show(exerciseFactory, { from: 'root' });
  ViewManager.open(drawFactory, {
    questions: [{ content: 'q1' }],
    currentQuestionIndex: 0,
  });
  ViewManager.back({
    image: 'data:image/png;base64,abc',
    preview: 'data:image/png;base64,preview',
    bounds: { left: 0, top: 0, right: 12, bottom: 34 },
  });

  if (received.length !== 2) {
    throw new Error('exercise view should activate twice: initial + draw return');
  }

  const returned = received[1].result;
  if (!returned || returned.image !== 'data:image/png;base64,abc') {
    throw new Error('draw return payload image should reach exercise view via ViewManager.back');
  }
  if (!returned.preview || !returned.bounds || returned.bounds.bottom !== 34) {
    throw new Error('draw return payload should preserve preview and bounds');
  }

  console.log('PASS: draw return bridge regression');
}

main();
