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
      createElement() { return { appendChild() {}, style: {}, setAttribute() {}, addEventListener() {}, remove() {} }; },
      head: { appendChild() {} },
      getElementById() { return null; },
      querySelector() { return null; },
    },
    requestAnimationFrame(fn) { fn(); },
    renderMath(text) { return text; },
    esc(text) { return String(text || ''); },
    enableLatexCopy() {},
    ViewManager: null,
    Shell: { clearActions() {} },
    AppShell: { setExerciseTarget() {} },
    api: { call() { throw new Error('api.call should not be used in payload regression'); } },
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
  if (!helper || typeof helper.buildChatRequestPayload !== 'function') {
    throw new Error('buildChatRequestPayload test helper should exist');
  }

  const payload = helper.buildChatRequestPayload({
    session_id: 12,
    message: '用户补充',
    attachments: [
      { name: 'draw.png', dataUrl: 'data:image/png;base64,AAA', fullImage: 'data:image/png;base64,FULL' },
    ],
  });

  if (payload.session_id !== 12) {
    throw new Error('session_id should be preserved');
  }
  if (payload.message !== '用户补充') {
    throw new Error('message should be preserved');
  }
  if (!Array.isArray(payload.attachments) || payload.attachments.length !== 1) {
    throw new Error('attachments should be included in chat payload');
  }
  if (payload.attachments[0].dataUrl !== 'data:image/png;base64,FULL') {
    throw new Error('fullImage should be preferred when building chat payload');
  }

  console.log('PASS: exercise image payload regression');
}

main();
