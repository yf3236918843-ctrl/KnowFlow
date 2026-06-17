/**
 * MessageType: preference-actions — 偏好分析 action_set 卡片
 *
 * 以 6 种操作条目展示 AI 检测到的学生偏好变化。
 *
 * data:
 *   round         number        第几轮分析
 *   meta          string        顶部描述文字
 *   items         array         操作条目
 *     id           string        唯一标识
 *     action       'insert'|'update'|'delete'|'increment'|'signal'
 *     label        string        标签文字（如 "新增"）
 *     icon         string        emoji
 *     typeBadge    string        tag 文字（如 "tutoring"）
 *     typeBadgeClass string      额外 class（如 "type-deleted"）
 *     rule         string        规则内容
 *     reason       string        理由
 *     step         number        步骤序号
 *     stepActive   boolean       初始选中
 *     examples     array         [{ label, text, bad?, good? }]
 *     sources      array (可选)  合并专用 [{ id, type, rule, examples }]
 *   confirmText   string        确认按钮文字
 *
 * events:
 *   pref:step-toggle   → { itemId, active }
 *   pref:confirm       → { items: [{id, active}] }
 */

ChatView.registerType('preference_actions', {
  render: function (data) {
    data = data || {};
    // 兼容 LLM 输出字段名 actions → items
    if (!data.items && data.actions) data.items = data.actions;
    var items = _normalizeActionItems(data.items || []);
    data.items = items;
    var disabled = !!data.disabled;
    var confirmedCount = data.confirmedCount != null
      ? data.confirmedCount
      : items.filter(function (it) { return it.active !== false; }).length;

    var itemsHtml = items.map(function (item) {
      return _renderActionItem(item, disabled);
    }).join('');

    var actionsHtml;
    if (disabled) {
      actionsHtml = '<div class="card-actions">'
        + '<button class="btn-primary" disabled style="opacity:0.55;cursor:default;">\u2713 \u5DF2\u6536\u5F55\uFF08' + confirmedCount + ' \u9879\uFF09</button>'
        + '</div>';
    } else {
      actionsHtml = '<div class="card-actions">'
        + '<button class="btn-primary" id="pref-confirm-' + Date.now() + '">' + esc(data.confirmText || '\u786E\u8BA4\u6536\u5F55') + '</button>'
        + '</div>';
    }

    var cardStyle = 'margin:0;display:grid;gap:6px;';
    if (disabled) cardStyle += 'opacity:0.7;background:rgba(120,120,120,0.04);';

    var html = ''
      + '<div class="draft-card' + (disabled ? ' draft-card-disabled' : '') + '" style="' + cardStyle + '">'
      + '<div class="draft-title" style="display:flex;align-items:center;gap:8px;">'
      + '<span>\uD83E\uDDE0 \u504F\u597D\u5206\u6790\u7ED3\u679C</span>'  // 🧠 偏好分析结果
      + '<span style="font-size:11px;font-weight:400;color:var(--text-muted);">\u2014 \u7B2C ' + (data.round || 1) + ' \u8F6E</span>'  // — 第 n 轮
      + (disabled ? '<span style="margin-left:auto;font-size:11px;color:#4caf50;font-weight:600;">\u5DF2\u6536\u5F55(' + confirmedCount + ')</span>' : '')
      + '</div>'
      + (data.meta
        ? '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;line-height:1.6;padding:8px 10px;background:rgba(255,255,255,0.03);border-radius:var(--radius-sm);">' + esc(data.meta) + '</div>'
        : '')
      + itemsHtml
      + actionsHtml
      + '</div>';

    return {
      html: html,
      events: null,
      mount: function (el, api) {
    // ── Toggle links (示例展开) — 始终可用 ──
    el.querySelectorAll('.toggle-link').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.stopPropagation();
        var wrap = link.nextElementSibling;
        if (!wrap || !wrap.classList || !wrap.classList.contains('slide-wrap')) return;
        var isOpen = slideToggle(wrap);
        link.textContent = isOpen
          ? link.textContent.replace('\u25BE', '\u25B4').replace('\u25BC', '\u25B2')
          : link.textContent.replace('\u25B4', '\u25BE').replace('\u25B2', '\u25BC');
      });
    });

    if (disabled) return;

    // ── Step buttons ──
    el.querySelectorAll('.step-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var wasActive = btn.classList.contains('active');
        btn.classList.toggle('active');
        btn.classList.toggle('inactive');
        if (wasActive) {
          btn._num = btn.textContent;
          btn.textContent = '\u2715';  // ✕
        } else {
          btn.textContent = btn._num || btn.textContent;
        }
        _updateConfirmCount(el);
        api.emit('pref:step-toggle', {
          itemId: btn.dataset.itemId,
          active: btn.classList.contains('active'),
        });
      });
    });

    // ── Confirm button ──
    var confirmBtn = el.querySelector('.btn-primary');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', function () {
        var activeItems = [];
        el.querySelectorAll('.step-btn').forEach(function (btn) {
          var item = items.find(function (entry) { return entry.id === btn.dataset.itemId; }) || {};
          activeItems.push({
            id: btn.dataset.itemId,
            action: item.action,
            entry: item.entry,
            target_id: item.target_id,
            source_entries: item.source_entries,
            reason: item.reason,
            rule: item.rule,
            active: btn.classList.contains('active'),
          });
        });
        api.emit('pref:confirm', { items: activeItems, cardEl: el, draft_id: data.draft_id || '', round: data.round || 1 });
      });
    }

    // 初始更新确认按钮计数
    _updateConfirmCount(el);
      },
    };
  },
});

// ── 渲染单个 action-item ──
function _renderActionItem(item, disabled) {
  var actionClass = 'action-' + (item.action || 'insert');
  var examplesHtml = '';
  if (item.examples && item.examples.length) {
    examplesHtml += '<span class="toggle-link">\u67E5\u770B\u793A\u4F8B \u25BE</span>';  // 查看示例 ▾
    examplesHtml += '<div class="slide-wrap"><div><div class="toggle-body">';
    item.examples.forEach(function (ex) {
      var cls = ex.bad ? 'eg-bad' : ex.good ? 'eg-good' : '';
      examplesHtml += '<div class="example-item">'
        + '<span class="' + cls + '">' + (ex.label ? esc(ex.label) + '\uFF1A' : '') + esc(ex.text) + '</span>'
        + '</div>';
    });
    examplesHtml += '</div></div></div>';
  }

  // 合并类型的源偏好
  var sourcesHtml = '';
  if (item.sources && item.sources.length) {
    sourcesHtml += '<div style="margin-top:4px;">'
      + '<span class="toggle-link">\u67E5\u770B\u88AB\u5408\u5E76\u7684\u504F\u597D \u25BE</span>'  // 查看被合并的偏好 ▾
      + '<div class="slide-wrap"><div><div class="toggle-body">';
    item.sources.forEach(function (src) {
      var srcExamplesHtml = '';
      if (src.examples && src.examples.length) {
        srcExamplesHtml += '<span class="toggle-link">\u67E5\u770B\u793A\u4F8B \u25BE</span>';  // 查看示例 ▾
        srcExamplesHtml += '<div class="slide-wrap"><div><div class="toggle-body">';
        src.examples.forEach(function (ex) {
          var cls = ex.bad ? 'eg-bad' : ex.good ? 'eg-good' : '';
          srcExamplesHtml += '<div class="example-item">'
            + '<span class="' + cls + '">' + (ex.label ? esc(ex.label) + '\uFF1A' : '') + esc(ex.text) + '</span>'
            + '</div>';
        });
        srcExamplesHtml += '</div></div></div>';
      }
      sourcesHtml += '<div class="source-item">'
        + '<div class="si-head">'
        + '<span class="source-id">' + esc(src.id || '') + ' \u00B7 \u6765\u6E90</span>'  // · 来源
        + '<span class="type-badge">' + esc(src.type || '') + '</span>'
        + '</div>'
        + '<div class="source-rule">' + esc(src.rule || '') + '</div>'
        + srcExamplesHtml
        + '</div>';
    });
    sourcesHtml += '</div></div></div></div>';
  }

  var isActive = item.active !== false && item.stepActive !== false;
  var stepClass = isActive ? 'active' : 'inactive';
  var stepText = disabled
    ? (isActive ? (item.step || '') : '\u2715')
    : (item.step || '');

  return ''
    + '<div class="action-item ' + actionClass + '">'
    + '<span class="ai-icon">' + (item.icon || '') + '</span>'
    + '<div class="ai-label">' + esc(item.label || '') + '</div>'
    + '<span class="ai-type"><span class="type-badge' + (item.typeBadgeClass ? ' ' + item.typeBadgeClass : '') + '">' + esc(item.typeBadge || '') + '</span></span>'
    + '<div class="ai-rule">' + esc(item.rule || '') + '</div>'
    + '<div class="ai-reason">' + esc(item.reason || '') + '</div>'
    + '<div class="ai-examples">' + examplesHtml + sourcesHtml + '</div>'
    + '<button class="step-btn ' + stepClass + '" data-item-id="' + esc(item.id || '') + '"' + (disabled ? ' disabled' : '') + '>' + stepText + '</button>'
    + '</div>';
}

// ── 更新确认按钮计数 ──
function _normalizeActionItems(items) {
  return (items || []).map(function (item, idx) {
    var normalized = Object.assign({}, item);
    var entry = normalized.entry || {};
    var action = normalized.action || 'insert';
    var typeValue = Array.isArray(entry.type) ? (entry.type[0] || '') : (entry.type || normalized.typeBadge || '');

    if (!normalized.id) normalized.id = 'pref_action_' + (idx + 1);
    if (!normalized.label) normalized.label = _actionLabel(action);
    if (!normalized.icon) normalized.icon = _actionIcon(action);
    if (!normalized.typeBadge) normalized.typeBadge = typeValue || normalized.target_id || '';
    if (!normalized.rule) normalized.rule = entry.rule || normalized.rule || normalized.message || normalized.target_id || '';
    if (!normalized.reason) normalized.reason = normalized.reason || '';
    if (!normalized.step) normalized.step = idx + 1;
    if (normalized.stepActive == null) normalized.stepActive = true;
    if (!normalized.examples) normalized.examples = _mapExamples(entry.examples);
    if (!normalized.sources && Array.isArray(normalized.source_entries)) {
      normalized.sources = normalized.source_entries.map(function (src) {
        return {
          id: src.entry_id || src.id || '',
          type: Array.isArray(src.type) ? (src.type[0] || '') : (src.type || ''),
          rule: src.rule || '',
          examples: _mapExamples(src.examples)
        };
      });
    }
    return normalized;
  });
}

function _mapExamples(examples) {
  if (!Array.isArray(examples)) return [];
  var mapped = [];
  examples.forEach(function (ex) {
    if (!ex || typeof ex !== 'object') return;
    if (ex.input) mapped.push({ label: '触发情景', text: ex.input });
    if (ex.bad) mapped.push({ label: '错误输出', text: ex.bad, bad: true });
    if (ex.good) mapped.push({ label: '正确输出', text: ex.good, good: true });
    if (!ex.input && !ex.bad && !ex.good && ex.text) mapped.push(ex);
  });
  return mapped;
}

function _actionLabel(action) {
  switch (action) {
    case 'insert': return '新增';
    case 'update': return '更新';
    case 'delete': return '删除';
    case 'increment': return '强化';
    case 'mark_signal': return '弱信号';
    case 'message': return '提问';
    default: return action || '动作';
  }
}

function _actionIcon(action) {
  switch (action) {
    case 'insert': return '＋';
    case 'update': return '↺';
    case 'delete': return '－';
    case 'increment': return '↑';
    case 'mark_signal': return '◌';
    case 'message': return '？';
    default: return '';
  }
}

function _updateConfirmCount(el) {
  var allActive = el.querySelectorAll('.step-btn.active');
  var confirmBtn = el.querySelector('.btn-primary');
  if (!confirmBtn) return;
  var n = allActive.length;
  confirmBtn.textContent = '\u2713 \u786E\u8BA4\u6536\u5F55\uFF08' + n + ' \u9879\uFF09';  // ✓ 确认收录（n 项）
  confirmBtn.disabled = n === 0;
}

// 注册 action_set 别名 — LLM prompt 输出 "type":"action_set"，前端注册 "preference_actions"
// 统一两端，避免偏好卡片永远不可见
ChatView.registerType('action_set', ChatView.getType('preference_actions'));
