const fs = require('fs');
const vm = require('vm');

const CHAT_VIEW_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\ChatView\js\ChatView.js`;

function createNode(tagName) {
  return {
    tagName,
    children: [],
    style: {},
    className: '',
    innerHTML: '',
    parentNode: null,
    _attachListNode: null,
    _attachBarNode: null,
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      if (child.className === 'attach-bar') this._attachBarNode = child;
      if (child.className === 'attach-list') this._attachListNode = child;
    },
    addEventListener() {},
    remove() {},
    querySelector(selector) {
      if (selector === '.attach-bar') return this._attachBarNode;
      if (selector === '.attach-list') return this._attachListNode;
      return null;
    },
    querySelectorAll() { return []; },
    classList: { add() {}, remove() {} },
  };
}

function main() {
  const inner = createNode('div');
  const context = {
    console,
    window: {},
    document: {
      getElementsByTagName() { return []; },
      createElement(tag) { return createNode(tag); },
      head: createNode('head'),
      body: createNode('body'),
      getElementById() { return null; },
      querySelector() { return null; },
    },
    requestAnimationFrame(fn) { fn(); },
    renderMath(text) { return text; },
    esc(text) { return String(text || ''); },
    enableLatexCopy() {},
    FileReader: function FileReader() {
      this.onload = null;
      this.readAsDataURL = (file) => {
        if (typeof this.onload === 'function') {
          this.onload({ target: { result: file.mockDataUrl } });
        }
      };
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(CHAT_VIEW_PATH, 'utf8'), context, { filename: CHAT_VIEW_PATH });

  const chat = context.window.ChatView.create();
  chat.setInput('raw', {});

  inner.querySelector = function (selector) {
    if (selector === '.attach-bar') return this._attachBarNode;
    if (selector === '.attach-list') return this._attachListNode;
    return null;
  };

  // Reach into private bind state through exposed root mount contract.
  const api = inner;
  context.document.getElementById = function (id) {
    if (String(id).includes('inner')) return inner;
    return createNode('div');
  };
  chat.bind();

  chat.addAttachments([{ name: 'a.png', mockDataUrl: 'data:image/png;base64,AAA' }]);

  const attachments = chat.getAttachments();
  if (attachments.length !== 1) {
    throw new Error('attachment should be added');
  }
  if (attachments[0].fullImage !== 'data:image/png;base64,AAA') {
    throw new Error('attachment should preserve fullImage for payload build');
  }

  console.log('PASS: chatview add attachments regression');
}

main();
