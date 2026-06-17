(function () {
  'use strict';

  var STORAGE_KEY = 'jx-study-launcher-v1';

  function loadSavedSelection() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        mode: raw.mode || 'sequence',
        project_id: raw.project_id || '',
        bank_id: raw.bank_id || '',
        group_id: raw.group_id || '',
      };
    } catch (e) {
      return {
        mode: 'sequence',
        project_id: '',
        bank_id: '',
        group_id: '',
      };
    }
  }

  function saveSelection(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        mode: state.mode,
        project_id: state.project_id || '',
        bank_id: state.bank_id || '',
        group_id: state.group_id || '',
      }));
    } catch (e) {}
  }

  function byName(a, b) {
    return String(a.name || '').localeCompare(String(b.name || ''));
  }

  window._studyLauncherView = ViewManager.registerView('study-launcher', {
    create: function () {
      var saved = loadSavedSelection();
      var state = {
        mode: saved.mode || 'sequence',
        project_id: saved.project_id || '',
        bank_id: saved.bank_id || '',
        group_id: saved.group_id || '',
        projects: [],
        banks: [],
        groups: [],
        openDropdown: '',
        loading: false,
        error: '',
        notice: '',
      };
      var refs = {
        root: null,
        modeCards: [],
        sequencePanel: null,
        reviewPanel: null,
        pathText: null,
        note: null,
        startButton: null,
        fieldShells: {},
        fieldButtons: {},
        fieldValues: {},
        fieldMenus: {},
      };
      var boundRoot = null;
      var boundDocument = null;
      var requestToken = 0;
      var fieldOrder = ['project', 'bank', 'group'];
      var fieldConfig = {
        project: {
          label: '项目',
          placeholder: '选择项目',
          itemsKey: 'projects',
          valueKey: 'project_id',
        },
        bank: {
          label: '题库',
          placeholder: '选择题库',
          itemsKey: 'banks',
          valueKey: 'bank_id',
        },
        group: {
          label: '题组',
          placeholder: '全部题组',
          itemsKey: 'groups',
          valueKey: 'group_id',
        },
      };

      function findById(items, id) {
        return (items || []).find(function (item) {
          return String(item.id) === String(id);
        }) || null;
      }

      function getItems(key) {
        return state[fieldConfig[key].itemsKey] || [];
      }

      function getSelectedId(key) {
        return state[fieldConfig[key].valueKey] || '';
      }

      function isFieldDisabled(key) {
        if (state.loading) return true;
        if (key === 'bank') return !state.project_id;
        if (key === 'group') return !state.bank_id;
        return false;
      }

      function isStartDisabled() {
        return state.loading || !state.project_id || !state.bank_id;
      }

      function optionHtml(key, value, label, active, placeholder) {
        return ''
          + '<button class="sl-option' + (active ? ' active' : '') + (placeholder ? ' placeholder' : '') + '"'
          + ' type="button"'
          + ' data-dropdown-option="' + key + '"'
          + ' data-option-value="' + String(value) + '">'
          +   '<span class="sl-option-label">' + String(label) + '</span>'
          + '</button>';
      }

      function renderFieldOptions(key) {
        var cfg = fieldConfig[key];
        var items = getItems(key);
        var selectedId = String(getSelectedId(key) || '');
        var html = optionHtml(key, '', cfg.placeholder, selectedId === '', true);
        items.forEach(function (item) {
          html += optionHtml(
            key,
            item.id == null ? '' : String(item.id),
            item.name || ('#' + item.id),
            selectedId === String(item.id),
            false
          );
        });
        return html;
      }

      function renderRoot() {
        return ''
          + '<div class="sl-root" data-study-launcher-root="1">'
          + '  <div class="sl-shell">'
          + '    <div class="sl-topbar">'
          + '      <div class="sl-headline">'
          + '        <div class="sl-kicker">Study Modes</div>'
          + '        <div class="sl-title">开始学习</div>'
          + '      </div>'
          + '    </div>'
          + '    <div class="sl-panel">'
          + '      <div class="sl-mode-grid">'
          + '        <button class="sl-mode-card" type="button" data-mode-card="sequence">'
          + '          <span class="sl-mode-icon">→</span>'
          + '          <span class="sl-mode-name">顺序做题</span>'
          + '          <span class="sl-mode-desc">选择项目、题库、题组后，继续向下做题。</span>'
          + '        </button>'
          + '        <button class="sl-mode-card" type="button" data-mode-card="review">'
          + '          <span class="sl-mode-icon">◌</span>'
          + '          <span class="sl-mode-name">复习</span>'
          + '          <span class="sl-mode-desc">入口先保留，后续接入复习出题与总结回看。</span>'
          + '        </button>'
          + '      </div>'
          + '      <div class="sl-config-card" data-panel="sequence">'
          + '        <div class="sl-config-head">'
          + '          <div>'
          + '            <div class="sl-config-title">顺序做题</div>'
          + '            <div class="sl-config-meta" data-path-text="1">未选择范围</div>'
          + '          </div>'
          + '          <button class="pm-btn primary" type="button" data-launch-sequence="1">开始</button>'
          + '        </div>'
          + '        <div class="sl-form-grid">'
          +            fieldOrder.map(function (key) {
                         return ''
                           + '<div class="sl-field" data-field-key="' + key + '">'
                           + '  <div class="sl-label">' + fieldConfig[key].label + '</div>'
                           + '  <div class="sl-select-shell" data-dropdown-shell="' + key + '">'
                           + '    <button class="sl-select-button" type="button" data-dropdown-toggle="' + key + '">'
                           + '      <span class="sl-select-value placeholder" data-field-value="' + key + '">' + fieldConfig[key].placeholder + '</span>'
                           + '      <span class="sl-select-caret" aria-hidden="true"><span></span><span></span></span>'
                           + '    </button>'
                           + '    <div class="sl-dropdown" data-dropdown-menu="' + key + '"></div>'
                           + '  </div>'
                           + '</div>';
                       }).join('')
          + '        </div>'
          + '      </div>'
          + '      <div class="sl-config-card review" data-panel="review" hidden>'
          + '        <div class="sl-config-head">'
          + '          <div>'
          + '            <div class="sl-config-title">复习</div>'
          + '            <div class="sl-config-meta">入口已预留，当前版本先专注顺序做题。</div>'
          + '          </div>'
          + '          <button class="pm-btn" type="button" data-launch-review="1">查看说明</button>'
          + '        </div>'
          + '      </div>'
          + '      <div class="sl-inline-note" data-inline-note="1" hidden></div>'
          + '    </div>'
          + '  </div>'
          + '</div>';
      }

      function cacheRefs() {
        refs.root = document.getElementById('contentArea');
        var rootEl = refs.root ? refs.root.querySelector('[data-study-launcher-root="1"]') : null;
        if (!rootEl) return;
        refs.modeCards = Array.prototype.slice.call(rootEl.querySelectorAll('[data-mode-card]'));
        refs.sequencePanel = rootEl.querySelector('[data-panel="sequence"]');
        refs.reviewPanel = rootEl.querySelector('[data-panel="review"]');
        refs.pathText = rootEl.querySelector('[data-path-text="1"]');
        refs.note = rootEl.querySelector('[data-inline-note="1"]');
        refs.startButton = rootEl.querySelector('[data-launch-sequence="1"]');
        refs.fieldShells = {};
        refs.fieldButtons = {};
        refs.fieldValues = {};
        refs.fieldMenus = {};
        fieldOrder.forEach(function (key) {
          refs.fieldShells[key] = rootEl.querySelector('[data-dropdown-shell="' + key + '"]');
          refs.fieldButtons[key] = rootEl.querySelector('[data-dropdown-toggle="' + key + '"]');
          refs.fieldValues[key] = rootEl.querySelector('[data-field-value="' + key + '"]');
          refs.fieldMenus[key] = rootEl.querySelector('[data-dropdown-menu="' + key + '"]');
        });
      }

      function setNotice(text, isError) {
        if (!refs.note) return;
        var message = String(text || '');
        refs.note.textContent = message;
        refs.note.hidden = !message;
        refs.note.classList.toggle('error', !!(message && isError));
        refs.note.classList.toggle('loading', !!(message && state.loading && !isError));
      }

      function renderMode() {
        refs.modeCards.forEach(function (card) {
          var mode = card.getAttribute('data-mode-card');
          card.classList.toggle('active', mode === state.mode);
        });
        if (refs.sequencePanel) refs.sequencePanel.hidden = state.mode !== 'sequence';
        if (refs.reviewPanel) refs.reviewPanel.hidden = state.mode !== 'review';
      }

      function renderPath() {
        if (!refs.pathText) return;
        var project = findById(state.projects, state.project_id);
        var bank = findById(state.banks, state.bank_id);
        var group = findById(state.groups, state.group_id);
        var text = [
          project ? project.name : '',
          bank ? bank.name : '',
          group ? group.name : ''
        ].filter(Boolean).join(' / ');
        refs.pathText.textContent = text || '未选择范围';
      }

      function renderField(key) {
        var cfg = fieldConfig[key];
        var items = getItems(key);
        var selected = findById(items, getSelectedId(key));
        var disabled = isFieldDisabled(key);
        var open = state.openDropdown === key && !disabled;
        var label = selected ? (selected.name || ('#' + selected.id)) : cfg.placeholder;
        var valueEl = refs.fieldValues[key];
        var buttonEl = refs.fieldButtons[key];
        var shellEl = refs.fieldShells[key];
        var menuEl = refs.fieldMenus[key];

        if (valueEl) {
          valueEl.textContent = label;
          valueEl.classList.toggle('placeholder', !selected);
        }
        if (buttonEl) buttonEl.disabled = disabled;
        if (shellEl) {
          shellEl.classList.toggle('disabled', disabled);
          shellEl.classList.toggle('open', open);
        }
        if (menuEl) {
          menuEl.classList.toggle('open', open);
          menuEl.innerHTML = renderFieldOptions(key);
        }
      }

      function renderStartButton() {
        if (!refs.startButton) return;
        refs.startButton.disabled = isStartDisabled();
      }

      function renderNotice() {
        if (state.error) {
          setNotice(state.error, true);
          return;
        }
        if (state.notice) {
          setNotice(state.notice, false);
          return;
        }
        setNotice('', false);
      }

      function render() {
        renderMode();
        renderPath();
        fieldOrder.forEach(renderField);
        renderStartButton();
        renderNotice();
      }

      function persist() {
        saveSelection(state);
      }

      function loadProjects() {
        return api.query('project.list', {}).then(function (projects) {
          if (projects && projects.ok === false) {
            throw new Error(projects.error || '读取项目失败');
          }
          state.projects = (projects || []).slice().sort(byName);
          if (state.project_id && !findById(state.projects, state.project_id)) {
            state.project_id = '';
          }
        });
      }

      function loadBanks() {
        if (!state.project_id) {
          state.banks = [];
          state.bank_id = '';
          return Promise.resolve();
        }
        return api.query('bank.list', {
          project_id: parseInt(state.project_id, 10) || state.project_id,
        }).then(function (banks) {
          if (banks && banks.ok === false) {
            throw new Error(banks.error || '读取题库失败');
          }
          state.banks = (banks || []).slice().sort(byName);
          if (state.bank_id && !findById(state.banks, state.bank_id)) {
            state.bank_id = '';
          }
        });
      }

      function loadGroups() {
        if (!state.bank_id) {
          state.groups = [];
          state.group_id = '';
          return Promise.resolve();
        }
        return api.query('group.list', {
          bank_id: parseInt(state.bank_id, 10) || state.bank_id,
        }).then(function (groups) {
          if (groups && groups.ok === false) {
            throw new Error(groups.error || '读取题组失败');
          }
          state.groups = (groups || []).slice().sort(byName);
          if (state.group_id && !findById(state.groups, state.group_id)) {
            state.group_id = '';
          }
        });
      }

      function startLoading(text) {
        state.loading = true;
        state.error = '';
        state.notice = text || '';
        state.openDropdown = '';
        render();
      }

      function finishLoading() {
        state.loading = false;
        state.notice = '';
        persist();
        render();
      }

      function failLoading(message) {
        state.loading = false;
        state.notice = '';
        state.error = message || '读取失败';
        render();
      }

      function refreshAll() {
        var token = ++requestToken;
        startLoading('正在读取项目与题库...');
        return loadProjects()
          .then(loadBanks)
          .then(loadGroups)
          .then(function () {
            if (token !== requestToken) return;
            finishLoading();
          })
          .catch(function (err) {
            if (token !== requestToken) return;
            failLoading(err && err.message ? err.message : '读取失败');
          });
      }

      function refreshDependents(level) {
        var token = ++requestToken;
        startLoading(level === 'project' ? '正在更新题库与题组...' : '正在更新题组...');
        var chain = Promise.resolve();
        if (level === 'project') {
          chain = chain.then(loadBanks).then(loadGroups);
        } else if (level === 'bank') {
          chain = chain.then(loadGroups);
        }
        return chain.then(function () {
          if (token !== requestToken) return;
          finishLoading();
        }).catch(function (err) {
          if (token !== requestToken) return;
          failLoading(err && err.message ? err.message : '读取失败');
        });
      }

      function launchSequence() {
        if (!window.AppShell || typeof window.AppShell.openExercise !== 'function') return;
        if (isStartDisabled()) return;
        var payload = {
          project_id: parseInt(state.project_id, 10) || state.project_id,
          bank_id: parseInt(state.bank_id, 10) || state.bank_id,
          _forceNew: true,
        };
        if (state.group_id) {
          payload.group_id = parseInt(state.group_id, 10) || state.group_id;
        }
        if (typeof window.AppShell.setExerciseTarget === 'function') {
          window.AppShell.setExerciseTarget(payload);
        }
        persist();
        window.AppShell.openExercise(payload);
      }

      function selectMode(mode) {
        if (mode !== 'sequence' && mode !== 'review') return;
        state.mode = mode;
        state.openDropdown = '';
        persist();
        render();
      }

      function toggleDropdown(key) {
        if (isFieldDisabled(key)) return;
        state.openDropdown = state.openDropdown === key ? '' : key;
        renderField(key);
        fieldOrder.forEach(function (name) {
          if (name !== key) renderField(name);
        });
      }

      function selectValue(key, value) {
        state.error = '';
        if (key === 'project') {
          state.project_id = value || '';
          state.bank_id = '';
          state.group_id = '';
          persist();
          refreshDependents('project');
          return;
        }
        if (key === 'bank') {
          state.bank_id = value || '';
          state.group_id = '';
          persist();
          refreshDependents('bank');
          return;
        }
        if (key === 'group') {
          state.group_id = value || '';
          state.openDropdown = '';
          persist();
          render();
        }
      }

      function handleRootClick(event) {
        if (!refs.root || !refs.root.contains(event.target)) return;

        var modeCard = event.target.closest('[data-mode-card]');
        if (modeCard) {
          selectMode(modeCard.getAttribute('data-mode-card'));
          return;
        }

        var dropdownToggle = event.target.closest('[data-dropdown-toggle]');
        if (dropdownToggle) {
          toggleDropdown(dropdownToggle.getAttribute('data-dropdown-toggle'));
          return;
        }

        var dropdownOption = event.target.closest('[data-dropdown-option]');
        if (dropdownOption) {
          selectValue(
            dropdownOption.getAttribute('data-dropdown-option'),
            dropdownOption.getAttribute('data-option-value') || ''
          );
          return;
        }

        var launchSequenceBtn = event.target.closest('[data-launch-sequence="1"]');
        if (launchSequenceBtn) {
          launchSequence();
          return;
        }

        var launchReviewBtn = event.target.closest('[data-launch-review="1"]');
        if (launchReviewBtn && typeof showToast === 'function') {
          showToast('复习模式暂未实现');
        }
      }

      function handleDocumentClick(event) {
        if (!state.openDropdown) return;
        if (refs.root && refs.root.contains(event.target)) return;
        state.openDropdown = '';
        fieldOrder.forEach(renderField);
      }

      function bind() {
        cacheRefs();
        if (!refs.root) return;

        if (boundRoot && boundRoot !== refs.root) {
          boundRoot.removeEventListener('click', handleRootClick);
        }
        if (boundRoot !== refs.root) {
          refs.root.addEventListener('click', handleRootClick);
          boundRoot = refs.root;
        }

        if (!boundDocument) {
          document.addEventListener('click', handleDocumentClick);
          boundDocument = document;
        }
      }

      function unbind() {
        if (boundRoot) {
          boundRoot.removeEventListener('click', handleRootClick);
          boundRoot = null;
        }
        if (boundDocument) {
          boundDocument.removeEventListener('click', handleDocumentClick);
          boundDocument = null;
        }
      }

      return {
        activate: function () {
          Shell.setMeta('');
          Shell.clearActions();
          return {
            title: '开始学习',
            content: renderRoot(),
            mount: function () {
              bind();
              render();
              refreshAll();
            },
          };
        },
        suspend: function () {},
        deactivate: function () {
          unbind();
        },
        match: function () { return false; },
      };
    },
  });
})();
