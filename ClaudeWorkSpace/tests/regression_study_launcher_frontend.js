const fs = require('fs');
const vm = require('vm');

const VIEW_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\study-launcher.view.js`;
const PATCH_PATH = String.raw`D:\FIles\documents\Project FIles\PT\Project\web\test\app-shell.launcher.js`;

function makeElement() {
  return {
    style: {},
    children: [],
    dataset: {},
    className: '',
    innerHTML: '',
    textContent: '',
    value: '',
    listeners: {},
    parentNode: null,
    _insideRoot: false,
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
    },
    insertBefore(child) {
      this.children.push(child);
      child.parentNode = this;
    },
    removeChild(child) {
      this.children = this.children.filter((it) => it !== child);
    },
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    removeEventListener(type, handler) {
      if (this.listeners[type] === handler) delete this.listeners[type];
    },
    setAttribute() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    contains(node) {
      return !!(node && node._insideRoot);
    },
    classList: { add() {}, remove() {}, toggle() {} },
  };
}

function createContentArea() {
  const root = makeElement();
  const bodySlot = makeElement();
  const launcherRoot = makeElement();
  bodySlot._insideRoot = true;
  root._insideRoot = true;
  root._bodySlot = bodySlot;
  root._launcherRoot = launcherRoot;
  Object.defineProperty(root, 'innerHTML', {
    get() {
      return this._html || '';
    },
    set(value) {
      this._html = String(value || '');
      this._bodySlot = makeElement();
      this._bodySlot._insideRoot = true;
      this._launcherRoot = makeElement();
      this._launcherRoot._insideRoot = true;
    },
  });
  root.querySelector = function querySelector(selector) {
    if (selector === '[data-sl-body="1"]') return this._bodySlot;
    if (selector === '[data-study-launcher-root="1"]') return this._launcherRoot;
    return null;
  };
  return root;
}

function makeClosestNode(attrName, attrValue) {
  return {
    _insideRoot: true,
    getAttribute(name) {
      if (name === attrName) return attrValue;
      return null;
    },
  };
}

function makeEventTarget(selectorMap) {
  return {
    _insideRoot: true,
    closest(selector) {
      return selectorMap[selector] || null;
    },
  };
}

function createContext() {
  const nodes = {};
  const contentArea = createContentArea();
  nodes.contentArea = contentArea;

  function byId(id) {
    if (id === 'contentArea') return contentArea;
    if (!nodes[id]) nodes[id] = makeElement();
    return nodes[id];
  }

  const documentListeners = {};
  const context = {
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame(fn) { fn(); },
    window: {},
    document: {
      createElement: makeElement,
      getElementById(id) { return byId(id); },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      addEventListener(type, handler) {
        documentListeners[type] = handler;
      },
      removeEventListener(type, handler) {
        if (documentListeners[type] === handler) delete documentListeners[type];
      },
      _listeners: documentListeners,
    },
    localStorage: {
      _store: {},
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(this._store, key) ? this._store[key] : null;
      },
      setItem(key, value) {
        this._store[key] = String(value);
      },
    },
    history: { pushState() {} },
    location: { href: 'http://localhost/test/main.html' },
    URL,
    __setContentCalls: 0,
    Shell: {
      setContent(html) {
        context.__setContentCalls += 1;
        contentArea.innerHTML = html || '';
      },
      setMeta() {},
      clearActions() {},
    },
    ViewManager: {
      registerView(name, def) {
        return function factory(args) {
          const instance = def.create(args);
          instance._type = name;
          return instance;
        };
      },
      show() {},
    },
    api: {
      query(name) {
        if (name === 'project.list') return Promise.resolve([{ id: 1, name: 'Project A' }]);
        if (name === 'bank.list') return Promise.resolve([{ id: 2, name: 'Bank A' }]);
        if (name === 'group.list') return Promise.resolve([{ id: 3, name: 'Group A' }]);
        return Promise.resolve([]);
      },
    },
    showToast() {},
  };
  context.window = context;
  context.AppShell = {
    bindChrome() {},
    ensureLogin() { return Promise.resolve(true); },
    loadSessions() { return Promise.resolve(); },
    bootstrapInitialView() {},
    openExercise() {},
    openProjectManagement() {},
    openPreferencePreview() {},
    getExerciseTarget() { return { bank_id: 2 }; },
    setExerciseTarget() {},
    renderFunctionList() {},
  };
  return context;
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function main() {
  const context = createContext();
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(VIEW_PATH, 'utf8'), context, { filename: VIEW_PATH });
  vm.runInContext(fs.readFileSync(PATCH_PATH, 'utf8'), context, { filename: PATCH_PATH });

  if (!context._studyLauncherView) {
    throw new Error('study launcher view was not registered');
  }
  if (typeof context.AppShell.openStudyLauncher !== 'function') {
    throw new Error('AppShell.openStudyLauncher was not installed');
  }
  if (typeof context.AppShell.renderFunctionList !== 'function') {
    throw new Error('AppShell.renderFunctionList override missing');
  }

  const view = context._studyLauncherView();
  const rendered = view.activate();
  context.Shell.setContent(typeof rendered.content === 'function' ? rendered.content() : rendered.content);
  rendered.mount();
  await flushMicrotasks();

  const launcherRoot = context.document.getElementById('contentArea').querySelector('[data-study-launcher-root="1"]');
  if (!launcherRoot) {
    throw new Error('study launcher should render a stable root element');
  }

  const rootClick = context.document.getElementById('contentArea').listeners.click;
  if (typeof rootClick !== 'function') {
    throw new Error('study launcher should bind a delegated click handler on contentArea');
  }

  const beforeToggle = context.__setContentCalls;
  const toggleTarget = makeEventTarget({
    '[data-dropdown-toggle]': makeClosestNode('data-dropdown-toggle', 'project'),
  });
  rootClick({ target: toggleTarget });
  if (context.__setContentCalls !== beforeToggle) {
    throw new Error('dropdown toggle should not remount the whole launcher');
  }

  const beforeSelect = context.__setContentCalls;
  const optionTarget = makeEventTarget({
    '[data-dropdown-option]': {
      _insideRoot: true,
      getAttribute(name) {
        if (name === 'data-dropdown-option') return 'project';
        if (name === 'data-option-value') return '1';
        return null;
      },
    },
  });
  rootClick({ target: optionTarget });
  await flushMicrotasks();
  if (context.__setContentCalls !== beforeSelect) {
    throw new Error('dropdown selection should update locally without Shell.setContent');
  }

  console.log('PASS: study launcher frontend regression');
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
