const fs = require('fs');
const vm = require('vm');

const UTILS_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\js\utils.js`;

function createElement() {
  let text = '';
  let html = '';
  return {
    className: '',
    style: {},
    appendChild() {},
    remove() {},
    get innerHTML() {
      return html;
    },
    set innerHTML(value) {
      html = String(value);
    },
    get textContent() {
      return text;
    },
    set textContent(value) {
      text = String(value);
      html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },
  };
}

function makeContext() {
  const calls = [];
  const context = {
    console,
    setTimeout,
    clearTimeout,
    navigator: { clipboard: { writeText() { return Promise.resolve(); } } },
    showToast() {},
    requestAnimationFrame(fn) { fn(); },
    document: {
      createElement() { return createElement(); },
      addEventListener() {},
      querySelector() { return null; },
      createTreeWalker() { return { nextNode() { return false; }, currentNode: null }; },
      createDocumentFragment() { return { appendChild() {} }; },
      body: { appendChild() {} },
    },
    katex: {
      renderToString(expr) {
        calls.push(expr);
        return '<span class="katex">' + expr + '</span>';
      },
    },
  };
  context.window = context;
  context.__katexCalls = calls;
  return context;
}

function main() {
  const ctx = makeContext();
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(UTILS_PATH, 'utf8'), ctx, { filename: UTILS_PATH });

  const source = '14. 讨论函数$f(x)=\\begin{cases}1, & x\\leqslant 0 \\\\ 2x+1, & 0<x\\leqslant 1\\end{cases}$';
  const escaped = ctx.esc(source);
  const rendered = ctx.renderMath(escaped);
  const latexInput = ctx.__katexCalls[0] || '';

  if (!latexInput.includes('& x\\leqslant 0')) {
    throw new Error('expected math alignment ampersand to survive entity decoding');
  }
  if (!latexInput.includes('0<x\\leqslant 1')) {
    throw new Error('expected comparison operator < to survive entity decoding');
  }
  if (latexInput.includes('&amp;') || latexInput.includes('&lt;')) {
    throw new Error('escaped math entities leaked into katex render input');
  }

  console.log('PASS: renderMath decodes HTML entities inside LaTeX only');
}

main();
