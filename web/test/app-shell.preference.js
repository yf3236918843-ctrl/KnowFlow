(function () {
  'use strict';

  if (!window.AppShell) return;

  window.AppShell.openPreferencePreview = function () {
    if (!window._preferencePreviewView) return;
    ViewManager.show(window._preferencePreviewView, { view: 'preference-preview' });
  };

  window.AppShell.renderFunctionList = function () {
    var items = [
      { label: '项目管理', desc: '管理项目、题库和题目。', icon: '▣', action: 'project' },
      { label: '顺序做题', desc: '继续做题，或开始新一轮练习。', icon: '→', action: 'exercise' },
      { label: '偏好预览', desc: '查看活跃偏好与弱信号。', icon: '◌', action: 'preference' }
    ];
    var funcList = document.getElementById('funcList');
    var shortcutList = document.getElementById('shortcutList');

    function runAction(action) {
      if (action === 'project' && typeof window.AppShell.openProjectManagement === 'function') {
        window.AppShell.openProjectManagement();
      }
      if (action === 'exercise' && typeof window.AppShell.openExercise === 'function') {
        window.AppShell.openExercise(Object.assign(window.AppShell.getExerciseTarget(), { _forceNew: true }));
      }
      if (action === 'preference' && typeof window.AppShell.openPreferencePreview === 'function') {
        window.AppShell.openPreferencePreview();
      }
    }

    if (funcList) {
      funcList.innerHTML = items.map(function (item) {
        return ''
          + '<button class="func-item" data-action="' + item.action + '">'
          + '  <span class="f-icon">' + item.icon + '</span>'
          + '  <span class="f-info">'
          + '    <span class="f-title">' + item.label + '</span>'
          + '    <span class="f-desc">' + item.desc + '</span>'
          + '  </span>'
          + '</button>';
      }).join('');
      funcList.querySelectorAll('[data-action]').forEach(function (el) {
        el.addEventListener('click', function () {
          runAction(el.getAttribute('data-action'));
        });
      });
    }

    if (shortcutList) {
      shortcutList.innerHTML = items.map(function (item) {
        return '<button class="shortcut-btn" data-action="' + item.action + '">' + item.label + '</button>';
      }).join('');
      shortcutList.querySelectorAll('[data-action]').forEach(function (el) {
        el.addEventListener('click', function () {
          runAction(el.getAttribute('data-action'));
        });
      });
    }
  };
})();
