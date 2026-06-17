/**
 * ViewManager — 视图注册模块
 *
 * 职责：
 *   管理多栈视图系统：show/open/back + 后台池 + 自毁投票
 *   调用 Shell API 更新界面（ViewManager 不直接操作 DOM）
 *   FuncViews 只对 ViewManager 负责，不知道 main.html 的存在
 *
 * 依赖：
 *   window.Shell — 由 main.html 提供 { setTitle, setContent, showBack, hideBack }
 *
 * 用法：
 *   const createExercise = ViewManager.registerView('exercise', {
 *     create(args) { return { activate, suspend, ... } }
 *   });
 *   ViewManager.show(createExercise, { bankId: 1 });
 *   ViewManager.open(createDraw, {});
 *   ViewManager.back({ image: '...' });
 */

const ViewManager = (() => {
  'use strict';

  // ═══════════════════════════════════════════════════
  // 数据结构
  // ═══════════════════════════════════════════════════

  let _idCounter = 0;
  /** @type {Array<{views: Array}>} */
  let _stacks = [];
  let _activeStackIdx = -1;

  // ═══════════════════════════════════════════════════
  // 注册
  // ═══════════════════════════════════════════════════

  /**
   * 注册视图类型。
   * @param {string}   type        视图类型标识
   * @param {object}   definition  { create(args) }
   * @returns {function} callable  用于 show/open 的工厂函数
   */
  function registerView(type, definition) {
    if (!type || !definition || typeof definition.create !== 'function') {
      throw new Error('[ViewManager] registerView 需要 type 和 definition.create');
    }
    const factory = function (args) {
      const instance = definition.create(args);
      instance._type = type;
      instance.viewId = String(++_idCounter);
      return instance;
    };
    factory._type = type;
    factory._definition = definition;
    return factory;
  }

  // ═══════════════════════════════════════════════════
  // 操作原语
  // ═══════════════════════════════════════════════════

  /**
   * 切换栈。
   * 后台池匹配 → 恢复；不匹配 → 新建。
   * @param {function} callable  工厂函数（registerView 返回值）
   * @param {object}   args      匹配/初始化参数
   * @returns {string} viewId
   */
  function show(callable, args) {
    const matched = _matchStack(args);
    if (matched) {
      _switchToStack(matched);
      return matched.views[matched.views.length - 1].viewId;
    }

    const view = callable(args);
    const newStack = _createStack([view]);
    _stacks.push(newStack);

    _switchActiveStack(_stacks.length - 1);
    _activateView(view, args, null);
    return view.viewId;
  }

  /**
   * 压栈。当前栈叠一层新视图。
   * @param {function} callable  工厂函数
   * @param {object}   args      初始化参数
   * @returns {string} viewId
   */
  function open(callable, args) {
    const stack = _stacks[_activeStackIdx];
    if (!stack) {
      console.warn('[ViewManager] open 需要当前有前台栈，退化到 show');
      return show(callable, args);
    }

    const view = callable(args);

    const top = stack.views[stack.views.length - 1];
    if (top.suspend) top.suspend();

    _assignStack(stack, view);
    _callShell('showBack');
    _activateView(view, args, null);
    return view.viewId;
  }

  /**
   * 出栈。弹栈顶，恢复下层。
   * @param {object} [result]  传回下层的数据
   */
  function back(result) {
    const stack = _stacks[_activeStackIdx];
    if (!stack || stack.views.length <= 1) return;

    const top = stack.views[stack.views.length - 1];

    if (top.beforePop && top.beforePop() === 'block') return;

    if (top.deactivate) top.deactivate();
    stack.views.pop();

    const newTop = stack.views[stack.views.length - 1];
    if (stack.views.length === 1) _callShell('hideBack');
    _activateView(newTop, null, result);
  }

  // ═══════════════════════════════════════════════════
  // 自毁投票
  // ═══════════════════════════════════════════════════

  /**
   * 视图调此函数投票。
   * @param {object}  view  视图实例
   * @param {boolean} bool  true=赞成销毁, false=收回
   */
  function vote(view, bool) {
    view._readyToDie = bool;
    if (bool) {
      const stack = _findStackByView(view);
      if (stack) _destroyCheck(stack);
    }
  }

  function _destroyCheck(stack) {
    const allReady = stack.views.every(v => v._readyToDie === true);
    if (!allReady) return;

    stack.views.forEach(v => { if (v.deactivate) v.deactivate(); });
    const idx = _stacks.indexOf(stack);
    if (idx >= 0) {
      _stacks.splice(idx, 1);
      if (_activeStackIdx === idx) _activeStackIdx = -1;
      else if (_activeStackIdx > idx) _activeStackIdx--;
    }
  }

  // ═══════════════════════════════════════════════════
  // 内部
  // ═══════════════════════════════════════════════════

  /** 创建栈对象（附加 findView 方法） */
  function _createStack(views) {
    const stack = {
      views: Array.isArray(views) ? views : [],
      /** 按条件查找本栈中的视图 */
      findView(predicate) {
        for (const v of this.views) {
          if (predicate(v)) return v;
        }
        return null;
      },
    };
    // 为已有视图设 stack 引用
    stack.views.forEach(v => { v.stack = stack; });
    return stack;
  }

  /** 将视图加入栈并设引用 */
  function _assignStack(stack, view) {
    view.stack = stack;
    stack.views.push(view);
  }

  /** 遍历后台池所有视图调 match */
  function _matchStack(args) {
    for (let si = 0; si < _stacks.length; si++) {
      const stack = _stacks[si];
      for (const view of stack.views) {
        if (view.match && view.match(args)) {
          return stack;
        }
      }
    }
    return null;
  }

  /** 切换到后台池中某栈 */
  function _switchToStack(stack) {
    const idx = _stacks.indexOf(stack);
    if (idx < 0) return;
    // 已经是当前栈 → 不做事
    if (idx === _activeStackIdx) return;
    _selfDestructActiveStack();
    _activeStackIdx = idx;
    const top = stack.views[stack.views.length - 1];
    _activateView(top, null, null);
  }

  /** 切换激活栈（旧栈进后台） */
  function _switchActiveStack(idx) {
    _selfDestructActiveStack();
    _activeStackIdx = idx;
  }

  /** 旧前台进后台：suspend + selfDestruct */
  function _selfDestructActiveStack() {
    if (_activeStackIdx < 0) return;
    const stack = _stacks[_activeStackIdx];
    if (!stack) return;

    const top = stack.views[stack.views.length - 1];
    if (top && top.suspend) top.suspend();

    stack.views.forEach(v => {
      if (v.selfDestruct) v.selfDestruct();
    });
  }

  /** 激活视图：调 activate → 拿 title/content → 调 Shell */
  function _activateView(view, ctx, result) {
    if (!view.activate) return;

    const rendered = view.activate(ctx, result) || {};

    if (rendered.title) {
      const html = typeof rendered.title === 'function' ? rendered.title() : rendered.title;
      _callShell('setTitle', html);
    }

    if (rendered.content) {
      const html = typeof rendered.content === 'function' ? rendered.content() : rendered.content;
      _callShell('setContent', html);
    }

    if (rendered.mount) {
      requestAnimationFrame(() => rendered.mount());
    }
  }

  function _findStackByView(view) {
    for (const stack of _stacks) {
      if (stack.views.includes(view)) return stack;
    }
    return null;
  }

  function _callShell(method, arg) {
    if (window.Shell && typeof Shell[method] === 'function') {
      Shell[method](arg);
    } else {
      console.warn(`[ViewManager] Shell.${method} 不可用`);
    }
  }

  return { registerView, show, open, back, vote };
})();
