const fs = require('fs');
const vm = require('vm');

const CHAT_VIEW_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\ChatView\js\ChatView.js`;
const SUMMARY_TYPE_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\ChatView\js\types\summary.js`;
const SESSION_MEMORY_TYPE_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\ChatView\js\types\session-memory.js`;

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
  vm.runInContext(fs.readFileSync(SUMMARY_TYPE_PATH, 'utf8'), context, { filename: SUMMARY_TYPE_PATH });
  vm.runInContext(fs.readFileSync(SESSION_MEMORY_TYPE_PATH, 'utf8'), context, { filename: SESSION_MEMORY_TYPE_PATH });
  return context.ChatView;
}

function main() {
  const ChatView = loadChatView();
  if (!ChatView.getType('session_memory')) {
    throw new Error('session_memory type should be registered');
  }

  const content = ''
    + '```json\n'
    + '{"type":"summary","summary":"学生在提示后完成了本题","result":"False","mastery":"引导才懂"}\n'
    + '```\n'
    + '```json\n'
    + '{"type":"session_memory","session_outline":"学生先不会，老师先提示思路。","stu_signal":"接触过洛必达，但还不能默认掌握。","tec_signal":"先判断题型再提醒工具名。","meta_signal":"本轮信号较少，不要过度推断。"}\n'
    + '```';

  const segments = ChatView.parseAssistantContent(content);
  const cards = segments.filter((seg) => seg.type === 'card');
  if (!Array.isArray(cards) || cards.length !== 2) {
    throw new Error(`expected 2 card segments, got ${cards.length}`);
  }
  if (cards[0].data.type !== 'summary') {
    throw new Error(`expected first card to be summary, got ${cards[0].data.type}`);
  }
  if (cards[1].data.type !== 'session_memory') {
    throw new Error(`expected second card to be session_memory, got ${cards[1].data.type}`);
  }

  const rendered = ChatView.getType('session_memory').render(cards[1].data);
  const html = rendered && rendered.html ? rendered.html : '';
  if (html.indexOf('教师会话记忆') < 0) {
    throw new Error('session_memory card should render title');
  }
  if (html.indexOf('接触过洛必达') < 0) {
    throw new Error('session_memory card should render student signal');
  }

  console.log('PASS: session memory card frontend regression');
}

main();
