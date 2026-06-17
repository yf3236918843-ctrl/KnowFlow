const fs = require('fs');
const vm = require('vm');

const CHAT_VIEW_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\ChatView\js\ChatView.js`;

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
    esc: (s) => String(s),
    renderMath: (s) => String(s),
    renderAll: () => {},
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
  return context.ChatView;
}

function assertQuestionSegment(segments, expectedContent, label) {
  if (!Array.isArray(segments) || segments.length !== 1) {
    throw new Error(`${label}: expected 1 segment, got ${segments.length}`);
  }
  const seg = segments[0];
  if (seg.type !== 'card') {
    throw new Error(`${label}: expected card segment, got ${seg.type}`);
  }
  if (!seg.data || seg.data.type !== 'question') {
    throw new Error(`${label}: expected question card, got ${JSON.stringify(seg.data)}`);
  }
  if (seg.data.content !== expectedContent) {
    throw new Error(`${label}: expected content "${expectedContent}", got "${seg.data.content}"`);
  }
}

function main() {
  const ChatView = loadChatView();

  const typed = ChatView.parseAssistantContent('```json\n{"type":"question","content":"第一题"}\n```');
  assertQuestionSegment(typed, '第一题', 'typed question protocol');

  const shorthand = ChatView.parseAssistantContent('```json\n{"question":"第二题"}\n```');
  assertQuestionSegment(shorthand, '第二题', 'shorthand question protocol');

  console.log('PASS: qn-card question protocol regression');
}

main();
