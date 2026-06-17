(function () {
  'use strict';

  function escHtml(text) {
    if (text == null) return '';
    var el = document.createElement('div');
    el.textContent = String(text);
    return el.innerHTML;
  }

  function formatTime(ts) {
    if (!ts) return '';
    try {
      var d = new Date(ts);
      if (isNaN(d.getTime())) return '';
      var yyyy = d.getFullYear();
      var mm = String(d.getMonth() + 1).padStart(2, '0');
      var dd = String(d.getDate()).padStart(2, '0');
      var hh = String(d.getHours()).padStart(2, '0');
      var mi = String(d.getMinutes()).padStart(2, '0');
      return yyyy + '-' + mm + '-' + dd + ' ' + hh + ':' + mi;
    } catch (e) {
      return '';
    }
  }

  function pickUpdatedAt(entry) {
    return entry.updated_at || entry.created_at || '';
  }

  function summarizeExamples(entry) {
    var examples = Array.isArray(entry.examples) ? entry.examples : [];
    if (!examples.length) return '';
    return examples.map(function (item) {
      var input = item && item.input ? String(item.input).trim() : '';
      return input ? '<span class="pp-tag subtle">' + escHtml(input) + '</span>' : '';
    }).filter(Boolean).slice(0, 3).join('');
  }

  function buildHistory(entry) {
    var items = Array.isArray(entry.change_history) ? entry.change_history : [];
    if (!items.length) return '';
    return ''
      + '<details class="pp-details">'
      + '  <summary>变更 ' + items.length + '</summary>'
      + '  <div class="pp-detail-list">'
      +      items.slice().reverse().map(function (item) {
        var reason = item && item.reason ? String(item.reason).trim() : '';
        var ts = formatTime(item && item.timestamp);
        return ''
          + '<div class="pp-detail-row">'
          + '  <span class="pp-detail-type">' + escHtml(item.type || 'change') + '</span>'
          + '  <span class="pp-detail-text">' + escHtml(reason || '无附加说明') + '</span>'
          + '  <span class="pp-detail-time">' + escHtml(ts) + '</span>'
          + '</div>';
      }).join('')
      + '  </div>'
      + '</details>';
  }

  function buildEntry(entry, kind) {
    var isGlobal = entry.project_id == null;
    var text = kind === 'active' ? (entry.rule || '') : (entry.raw || '');
    var examples = summarizeExamples(entry);
    var updated = formatTime(pickUpdatedAt(entry));
    var sourceSession = entry.source_session ? ('#' + entry.source_session) : '';
    var sourceIds = Array.isArray(entry.source_ids) ? entry.source_ids : [];
    return ''
      + '<article class="pp-entry-card">'
      + '  <div class="pp-entry-top">'
      + '    <div class="pp-entry-body">'
      + '      <div class="pp-entry-text">' + escHtml(text || '空内容') + '</div>'
      + '      <div class="pp-entry-meta">'
      + '        <span class="pp-tag">' + (isGlobal ? '全局' : ('项目 ' + escHtml(entry.project_id))) + '</span>'
      + (entry.count ? ('<span class="pp-tag">命中 ' + escHtml(entry.count) + '</span>') : '')
      + (sourceSession ? ('<span class="pp-tag subtle">会话 ' + escHtml(sourceSession) + '</span>') : '')
      + (entry.entry_id ? ('<span class="pp-tag subtle mono">' + escHtml(entry.entry_id) + '</span>') : '')
      + '      </div>'
      + (examples ? ('<div class="pp-entry-examples">' + examples + '</div>') : '')
      + '    </div>'
      + '    <div class="pp-entry-side">'
      + (updated ? ('<div class="pp-time">' + escHtml(updated) + '</div>') : '')
      + '    </div>'
      + '  </div>'
      + ((sourceIds.length || (Array.isArray(entry.change_history) && entry.change_history.length)) ? ''
      + '  <div class="pp-entry-bottom">'
      + (sourceIds.length ? ('<div class="pp-source-line">来源 ' + sourceIds.slice(0, 4).map(function (id) {
            return '<span class="pp-tag subtle mono">' + escHtml(id) + '</span>';
          }).join('') + '</div>') : '')
      + buildHistory(entry)
      + '  </div>' : '')
      + '</article>';
  }

  function buildGroup(group, kind) {
    var entries = Array.isArray(group.entries) ? group.entries : [];
    return ''
      + '<section class="pp-group">'
      + '  <div class="pp-group-head">'
      + '    <div class="pp-group-title">' + escHtml(group.title || group.type || '未命名分组') + '</div>'
      + '    <div class="pp-group-meta">' + escHtml(group.count || entries.length) + '</div>'
      + '  </div>'
      + '  <div class="pp-group-list">'
      +      entries.map(function (entry) { return buildEntry(entry, kind); }).join('')
      + '  </div>'
      + '</section>';
  }

  function buildSection(title, count, groups, kind) {
    groups = Array.isArray(groups) ? groups : [];
    return ''
      + '<section class="pp-section">'
      + '  <div class="pp-section-head">'
      + '    <div class="pp-section-title">' + escHtml(title) + '</div>'
      + '    <div class="pp-section-meta">' + escHtml(count) + '</div>'
      + '  </div>'
      + (groups.length
          ? '<div class="pp-section-body">' + groups.map(function (group) { return buildGroup(group, kind); }).join('') + '</div>'
          : '<div class="pp-empty-slot">暂无内容</div>')
      + '</section>';
  }

  window._preferencePreviewView = ViewManager.registerView('preference-preview', {
    create: function () {
      var state = {
        loading: true,
        error: '',
        projects: [],
        selectedProjectId: null,
        data: null,
      };

      function renderFilters() {
        var items = [{ id: '', label: '全部' }].concat((state.projects || []).map(function (item) {
          return { id: String(item.id), label: item.name || ('项目 ' + item.id) };
        }));
        return items.map(function (item) {
          var active = String(state.selectedProjectId == null ? '' : state.selectedProjectId) === String(item.id);
          return '<button class="pp-filter' + (active ? ' active' : '') + '" data-project-filter="' + escHtml(item.id) + '">' + escHtml(item.label) + '</button>';
        }).join('');
      }

      function renderSummary() {
        var data = state.data || { active_total: 0, signal_total: 0 };
        var projectLabel = state.selectedProjectId == null ? '全部项目' : ('项目 ' + state.selectedProjectId);
        return ''
          + '<div class="pp-summary">'
          + '  <div class="pp-stat">'
          + '    <div class="pp-stat-value">' + escHtml(data.active_total || 0) + '</div>'
          + '    <div class="pp-stat-label">活跃偏好</div>'
          + '  </div>'
          + '  <div class="pp-stat">'
          + '    <div class="pp-stat-value">' + escHtml(data.signal_total || 0) + '</div>'
          + '    <div class="pp-stat-label">弱信号</div>'
          + '  </div>'
          + '  <div class="pp-scope">' + escHtml(projectLabel) + '</div>'
          + '</div>';
      }

      function renderBody() {
        if (state.loading) return '<div class="pp-status">正在读取偏好数据...</div>';
        if (state.error) return '<div class="pp-status error">' + escHtml(state.error) + '</div>';
        var data = state.data || { active_groups: [], signal_groups: [] };
        return ''
          + '<div class="pp-grid">'
          + buildSection('活跃偏好', data.active_total || 0, data.active_groups || [], 'active')
          + buildSection('弱信号', data.signal_total || 0, data.signal_groups || [], 'signal')
          + '</div>';
      }

      function render() {
        return ''
          + '<div class="pp-root">'
          + '  <div class="pp-shell">'
          + '    <div class="pp-topbar">'
          + '      <div class="pp-headline">'
          + '        <div class="pp-kicker">Preference Memory</div>'
          + '        <div class="pp-title">偏好预览</div>'
          + '      </div>'
          + '      <div class="pp-actions">'
          + '        <button class="pm-btn" data-pp-refresh="1">刷新</button>'
          + '      </div>'
          + '    </div>'
          + '    <div class="pp-card">'
          + '      <div class="pp-card-head">'
          +          renderSummary()
          + '      </div>'
          + '      <div class="pp-filter-row">' + renderFilters() + '</div>'
          + '      <div class="pp-card-body">' + renderBody() + '</div>'
          + '    </div>'
          + '  </div>'
          + '</div>';
      }

      function mount() {
        Shell.setContent(render());
        Shell.setMeta('');
        Shell.clearActions();
        bind(document.getElementById('contentArea'));
      }

      function loadProjects() {
        return api.query('project.list', {}).then(function (projects) {
          if (projects && projects.ok === false) throw new Error(projects.error || '读取项目失败');
          state.projects = Array.isArray(projects) ? projects : [];
        });
      }

      function loadPreview() {
        var params = {};
        if (state.selectedProjectId != null && state.selectedProjectId !== '') {
          params.project_id = parseInt(state.selectedProjectId, 10) || state.selectedProjectId;
        }
        return api.query('preference.preview', params).then(function (data) {
          if (data && data.ok === false) throw new Error(data.error || '读取偏好失败');
          state.data = data || { active_total: 0, signal_total: 0, active_groups: [], signal_groups: [] };
        });
      }

      function refresh() {
        state.loading = true;
        state.error = '';
        mount();
        return Promise.all([loadProjects(), loadPreview()]).then(function () {
          state.loading = false;
          mount();
        }).catch(function (err) {
          state.loading = false;
          state.error = err && err.message ? err.message : '读取失败';
          mount();
        });
      }

      function bind(root) {
        if (!root) return;
        var refreshBtn = root.querySelector('[data-pp-refresh="1"]');
        if (refreshBtn) refreshBtn.addEventListener('click', refresh);

        root.querySelectorAll('[data-project-filter]').forEach(function (el) {
          el.addEventListener('click', function () {
            var raw = el.getAttribute('data-project-filter');
            state.selectedProjectId = raw === '' ? null : raw;
            refresh();
          });
        });
      }

      return {
        activate: function () {
          return {
            title: '偏好预览',
            content: render(),
            mount: function () {
              bind(document.getElementById('contentArea'));
              refresh();
            },
          };
        },
        suspend: function () {},
        deactivate: function () {},
        match: function () { return false; },
      };
    },
  });
})();
