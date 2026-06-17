const fs = require('fs');
const vm = require('vm');

const CHAT_VIEW_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\ChatView\js\ChatView.js`;
const PREF_TYPE_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\ChatView\js\types\preference-actions.js`;

function makeElement() {
  return {
    style: {},
    children: [],
    dataset: {},
    className: '',
    innerHTML: '',
    textContent: '',
    appendChild(child) { this.children.push(child); child.parentNode = this; },
    insertBefore(child) { this.children.push(child); child.parentNode = this; },
    removeChild(child) { this.children = this.children.filter((it) => it !== child); },
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}

function loadChatView() {
  const context = {
    console,
    setTimeout,
    clearTimeout,
    esc: (s) => String(s || ''),
    renderMath: (s) => String(s || ''),
    renderAll: () => {},
    slideToggle: () => false,
    window: {},
    document: {
      head: { appendChild() {} },
      createElement: makeElement,
      getElementsByTagName() { return []; },
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(CHAT_VIEW_PATH, 'utf8'), context, { filename: CHAT_VIEW_PATH });
  vm.runInContext(fs.readFileSync(PREF_TYPE_PATH, 'utf8'), context, { filename: PREF_TYPE_PATH });
  return context.ChatView;
}

function main() {
  const ChatView = loadChatView();
  const session = JSON.parse(fs.readFileSync(String.raw`D:\FIles\documents\Project FIles\PT\Project\core\store\data\3\sessions\205.json`, 'utf8'));
  const actionMessages = (session.messages || []).filter((msg) => {
    return msg && msg.role === 'assistant' && String(msg.content || '').indexOf('"type": "action_set"') >= 0;
  });

  if (!actionMessages.length) {
    throw new Error('fixture session should contain action_set assistant message');
  }

  let foundCard = false;
  actionMessages.forEach((msg) => {
    const segments = ChatView.parseAssistantContent(msg.content || '');
    if (segments.some((seg) => seg.type === 'card' && seg.data && seg.data.type === 'action_set')) {
      foundCard = true;
    }
  });

  if (!foundCard) {
    throw new Error('restored assistant message should contain visible action_set card segment');
  }

  console.log('PASS: restore preference action_set regression');
}

main();
