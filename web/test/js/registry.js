/**
 * registry.js — 中心注册表
 *
 * 所有扩展点通过此注册表连接。新增功能 = 1 个新文件 + 1 行 register。
 *
 * 注册类型一览：
 *   'view'     → App.registry.register('view', 'id', { title, activate, deactivate })
 *   'input.extra' → App.registry.register('input.extra', 'id', { icon, label, handler })
 *   'pipeline.event' → App.registry.register('pipeline.event', 'type', fn)
 *   (后续扩展)
 */

const App = (() => {
  'use strict';

  // ── 中心注册表 ──────────────────────────────
  const _categories = {};

  const registry = {
    /**
     * 注册一项。
     * @param {string} category  类别 ('view', 'input.extra', ...)
     * @param {string} id        唯一标识
     * @param {*}      item      注册项
     */
    register(category, id, item) {
      if (!_categories[category]) _categories[category] = {};
      _categories[category][id] = item;
    },

    /** 获取某项 */
    get(category, id) {
      return _categories[category]?.[id];
    },

    /** 列出某类别下所有 ID */
    list(category) {
      return Object.keys(_categories[category] || {});
    },

    /** 列出某类别下所有项 */
    entries(category) {
      const cat = _categories[category] || {};
      return Object.entries(cat).map(([id, item]) => ({ id, ...item }));
    },
  };

  // ── 视图路由 ──────────────────────────────
  let _currentView = null;
  const _state = {};

  /**
   * 切换到指定视图。
   * 旧的视图 deactivate，新的视图 activate。
   */
  function showView(viewId) {
    const view = registry.get('view', viewId);
    if (!view) return console.warn(`[App] 视图未注册: ${viewId}`);

    // deactivate 旧视图
    if (_currentView && _currentView.deactivate) {
      _currentView.deactivate();
    }

    // activate 新视图
    _currentView = view;
    if (view.activate) {
      view.activate();
    }
  }

  // ── 公开 API ──────────────────────────────
  return { registry, showView, _state };
})();
