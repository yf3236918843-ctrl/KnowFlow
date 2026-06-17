(function () {
  'use strict';

  if (!window.AppShell) return;

  window.AppShell.openStudyLauncher = function () {
    if (!window._studyLauncherView) return;
    ViewManager.show(window._studyLauncherView, { view: 'study-launcher' });
  };

  var originalBindChrome = window.AppShell.bindChrome;
  window.AppShell.bindChrome = function () {
    if (typeof originalBindChrome === 'function') {
      originalBindChrome();
    }
    var newSessionBtn = document.getElementById('newSessionBtn');
    if (newSessionBtn && newSessionBtn.dataset.launcherBound !== '1') {
      newSessionBtn.dataset.launcherBound = '1';
      var cloned = newSessionBtn.cloneNode(true);
      newSessionBtn.parentNode.replaceChild(cloned, newSessionBtn);
      cloned.dataset.launcherBound = '1';
      cloned.addEventListener('click', function () {
        try {
          var url = new URL(location.href);
          url.searchParams.delete('session_id');
          history.pushState({}, '', url);
        } catch (e) {}
        window.AppShell.openStudyLauncher();
      });
    }
  };

  window.AppShell.renderFunctionList = function () {
    var items = [
      { label: '项目管理', desc: '管理项目、题库和题目。', icon: '▣', action: 'project' },
      { label: '顺序做题', desc: '选择项目、题库、题组后开始。', icon: '→', action: 'exercise' },
      { label: '偏好预览', desc: '查看活跃偏好与弱信号。', icon: '◌', action: 'preference' }
    ];
    var funcList = document.getElementById('funcList');
    var shortcutList = document.getElementById('shortcutList');

    function runAction(action) {
      if (action === 'project' && typeof window.AppShell.openProjectManagement === 'function') {
        window.AppShell.openProjectManagement();
      }
      if (action === 'exercise' && typeof window.AppShell.openStudyLauncher === 'function') {
        window.AppShell.openStudyLauncher();
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
