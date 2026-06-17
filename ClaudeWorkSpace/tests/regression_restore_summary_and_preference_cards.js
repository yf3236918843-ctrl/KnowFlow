const fs = require('fs');
const vm = require('vm');

const CHAT_VIEW_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\ChatView\js\ChatView.js`;
const PARSER_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\ChatView\js\content-parser.js`;
const TEXT_TYPE_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\ChatView\js\types\text.js`;
const RAW_TYPE_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\ChatView\js\types\raw.js`;
const PREF_TYPE_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\ChatView\js\types\preference-actions.js`;
const SUMMARY_TYPE_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\ChatView\js\types\summary.js`;
const SESSION_MEMORY_TYPE_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\ChatView\js\types\session-memory.js`;

function makeElement(tagName) {
  return {
    tagName: tagName || 'div',
    style: {},
    children: [],
    dataset: {},
    className: '',
    innerHTML: '',
    textContent: '',
    parentNode: null,
    disabled: false,
    appendChild(child) { this.children.push(child); child.parentNode = this; },
    insertBefore(child) { this.children.push(child); child.parentNode = this; },
    removeChild(child) { this.children = this.children.filter((it) => it !== child); },
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    querySelector(selector) {
      if (!selector) return null;
      return makeElement('div');
    },
    querySelectorAll() { return []; },
    closest() { return null; },
  };
}

function loadChatView(documentStub) {
  const context = {
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame(fn) { fn(); },
    esc: (s) => String(s || ''),
    renderMath: (s) => String(s || ''),
    renderAll: () => {},
    slideToggle: () => false,
    enableLatexCopy: () => {},
    window: {},
    document: documentStub,
  };
  context.window = context;
  vm.createContext(context);
  [
    CHAT_VIEW_PATH,
    PARSER_PATH,
    TEXT_TYPE_PATH,
    RAW_TYPE_PATH,
    PREF_TYPE_PATH,
    SUMMARY_TYPE_PATH,
    SESSION_MEMORY_TYPE_PATH,
  ].forEach((path) => {
    vm.runInContext(fs.readFileSync(path, 'utf8'), context, { filename: path });
  });
  return context.ChatView;
}

function main() {
  const nodes = {};
  const documentStub = {
    head: { appendChild() {} },
    body: makeElement('body'),
    getElementsByTagName() { return []; },
    createElement(tag) { return makeElement(tag); },
    getElementById(id) { return nodes[id] || null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
  };

  const ChatView = loadChatView(documentStub);
  const chat = ChatView.create();
  const html = chat.html;
  const ids = {};
  ['root', 'banner', 'chat', 'msgs', 'input', 'inner'].forEach((key) => {
    const match = html.match(new RegExp(`id="([^"]*-${key})"`));
    if (!match) throw new Error(`missing id for ${key}`);
    ids[key] = match[1];
    nodes[ids[key]] = makeElement('div');
  });

  chat.bind();

  const session = JSON.parse(fs.readFileSync(String.raw`D:\FIles\documents\Project FIles\PT\Project\core\store\data\3\sessions\205.json`, 'utf8'));
  const renderCounts = { action_set: 0, summary: 0, session_memory: 0 };
  ['action_set', 'summary', 'session_memory'].forEach((type) => {
    const def = ChatView.getType(type);
    const originalRender = def.render;
    def.render = function (data) {
      renderCounts[type] += 1;
      return originalRender.call(this, data);
    };
  });

  chat.loadSession(session.messages, { uiState: session.extern.ui_state || {} });

  if (!renderCounts.action_set) {
    throw new Error('restored session should include preference action_set card');
  }
  if (!renderCounts.summary) {
    throw new Error('restored session should include summary card');
  }
  if (!renderCounts.session_memory) {
    throw new Error('restored session should include session_memory card');
  }

  console.log('PASS: restore summary and preference cards regression');
}

main();
