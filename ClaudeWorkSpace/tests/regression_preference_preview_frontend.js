const fs = require('fs');
const vm = require('vm');

const VIEW_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\preference-preview.view.js`;
const PATCH_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\app-shell.preference.js`;

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

function loadScripts() {
  const context = {
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame(fn) { fn(); },
    window: {},
    document: {
      createElement: makeElement,
      getElementById() { return makeElement(); },
      querySelector() { return null; },
      querySelectorAll() { return []; },
    },
    Shell: {
      setContent() {},
      setMeta() {},
      clearActions() {},
    },
    ViewManager: {
      registerView(name, def) {
        return { _type: name, _definition: def };
      },
      show() {},
    },
    api: {
      query() { return Promise.resolve([]); },
    },
  };
  context.window = context;
  context.AppShell = {
    openProjectManagement() {},
    openExercise() {},
    getExerciseTarget() { return { bank_id: 2 }; },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(VIEW_PATH, 'utf8'), context, { filename: VIEW_PATH });
  vm.runInContext(fs.readFileSync(PATCH_PATH, 'utf8'), context, { filename: PATCH_PATH });
  return context;
}

function main() {
  const context = loadScripts();
  if (!context._preferencePreviewView) {
    throw new Error('preference preview view was not registered');
  }
  if (typeof context.AppShell.openPreferencePreview !== 'function') {
    throw new Error('AppShell.openPreferencePreview was not installed');
  }
  if (typeof context.AppShell.renderFunctionList !== 'function') {
    throw new Error('AppShell.renderFunctionList override missing');
  }
  console.log('PASS: preference preview frontend regression');
}

main();
