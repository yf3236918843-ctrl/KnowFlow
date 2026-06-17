/**
 * app.js — 应用壳
 *
 * 职责：
 *   1. 渲染侧栏（品牌 + tabs + 功能列表）
 *   2. 渲染 context bar
 *   3. 处理欢迎页按钮点击
 *   4. 维护视图路由
 *
 * 依赖：registry.js
 */

const Shell = (() => {
  'use strict';

  function init() {
    _renderSidebar();
    _renderContextBar();
    _wireWelcome();
    _wireSidebarToggle();
  }

  function _wireSidebarToggle() {
    const btn = document.getElementById('sidebarToggle');
    if (btn) {
      btn.addEventListener('click', () => {
        document.querySelector('.sidebar')?.classList.toggle('collapsed');
      });
    }
  }

  // ── 侧栏 ─────────────────────────────────
  function _renderSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    // 侧栏骨架已在 HTML 中，只需填充功能列表
    const funcList = sidebar.querySelector('#funcList');
    if (funcList) {
      const items = App.registry.entries('view');
      funcList.innerHTML = items.map(v =>
        `<div class="func-item" data-view="${esc(v.id)}">
          <div class="f-icon">${v.icon || '📄'}</div>
          <div class="f-info">
            <div class="f-title">${esc(v.title)}</div>
            ${v.desc ? `<div class="f-desc">${esc(v.desc)}</div>` : ''}
          </div>
        </div>`
      ).join('');

      // 点击事件委托
      funcList.addEventListener('click', (e) => {
        const item = e.target.closest('.func-item');
        if (item) {
          const viewId = item.dataset.view;
          App.showView(viewId);
        }
      });
    }

    // Tab 切换
    sidebar.querySelectorAll('.sidebar-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const view = tab.dataset.view;
        document.querySelectorAll('.sidebar-tab').forEach(t =>
          t.classList.toggle('active', t.dataset.view === view));
        document.getElementById('viewSessions')?.classList.toggle('active', view === 'sessions');
        document.getElementById('viewFunctions')?.classList.toggle('active', view === 'functions');
      });
    });
  }

  // ── Context Bar ───────────────────────────
  function _renderContextBar() {
    // 骨架已在 HTML 中，提供更新方法
  }

  function setContextBar(project, bank, group) {
    const el = (id) => document.getElementById(id);
    if (el('ctxProject')) el('ctxProject').textContent = project || '';
    if (el('ctxBank')) el('ctxBank').textContent = bank || '';
    if (el('ctxGroup')) el('ctxGroup').textContent = group || '';
  }

  function setModeBadge(text) {
    const badge = document.getElementById('modeBadge');
    if (badge) {
      badge.textContent = text || '';
      badge.style.display = text ? '' : 'none';
    }
  }

  // ── 欢迎页按钮 ────────────────────────────
  function _wireWelcome() {
    const shortcuts = document.querySelectorAll('.shortcut-btn');
    shortcuts.forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.textContent.trim();
        // 查找注册的同名视图
        const view = App.registry.get('view', action);
        if (view) App.showView(action);
        else console.warn(`[Shell] 未找到视图: ${action}`);
      });
    });
  }

  // ── 工具 ──────────────────────────────────
  function esc(str) {
    if (str == null) return '';
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  }

  return { init, setContextBar, setModeBadge };
})();
