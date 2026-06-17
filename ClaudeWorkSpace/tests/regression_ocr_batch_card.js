const fs = require('fs');
const vm = require('vm');

const CHAT_VIEW_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\ChatView\js\ChatView.js`;
const TEXT_TYPE_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\ChatView\js\types\text.js`;
const RAW_TYPE_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\ChatView\js\types\raw.js`;
const OCR_BATCH_TYPE_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\ChatView\js\types\ocr-batch.js`;

function createNode(tagName) {
  return {
    tagName,
    children: [],
    style: {},
    className: '',
    innerHTML: '',
    appendChild(child) { this.children.push(child); child.parentNode = this; },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    remove() {},
  };
}

function main() {
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
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(CHAT_VIEW_PATH, 'utf8'), context, { filename: CHAT_VIEW_PATH });
  vm.runInContext(fs.readFileSync(TEXT_TYPE_PATH, 'utf8'), context, { filename: TEXT_TYPE_PATH });
  vm.runInContext(fs.readFileSync(RAW_TYPE_PATH, 'utf8'), context, { filename: RAW_TYPE_PATH });
  vm.runInContext(fs.readFileSync(OCR_BATCH_TYPE_PATH, 'utf8'), context, { filename: OCR_BATCH_TYPE_PATH });

  const type = context.window.ChatView.getType('ocr_batch');
  if (!type) throw new Error('ocr_batch type should be registered');

  const rendered = type.render({
    items: [{ image_id: 'img_1', index: 1, preview: 'data:image/png;base64,AAA', output: '识别结果', thinking: '' }],
    user_text: '用户消息',
    show_continue: true,
  });
  if (!rendered || typeof rendered.html !== 'string') {
    throw new Error('ocr_batch render should return html');
  }
  if (rendered.html.indexOf('ocr-batch-card') === -1) {
    throw new Error('ocr_batch html should contain root class');
  }
  if (rendered.html.indexOf('data-ocr-continue') === -1) {
    throw new Error('ocr_batch html should render continue button');
  }
  if (rendered.html.indexOf('data-ocr-image-id="img_1"') === -1) {
    throw new Error('ocr_batch html should include image identifier');
  }

  console.log('PASS: ocr batch card regression');
}

main();
