/**
 * MessageType: collect-draft — 错题收录草稿卡片
 *
 * 展示错题弱点列表，含掌握度滑块、步骤切换。
 *
 * data:
 *   round   number      第几轮收录
 *   title   string      卡片标题
 *   items   array       弱点条目
 *     id          string   唯一标识
 *     title       string   弱点标题
 *     source      string   来源问题（可含 LaTeX）
 *     types       array    string[] 类型标签
 *     mastery     number   掌握度 0-100
 *     detail      string   详细描述
 *     step        number   步骤序号
 *     stepActive  boolean  初始选中
 *   confirmText string   确认按钮文字
 *
 * events:
 *   collect:step-toggle    → { itemId, active }
 *   collect:mastery-change → { itemId, value }
 *   collect:confirm        → { items: [{id, active, mastery}] }
 */

ChatView.registerType('collect_draft', {
  render: function (data) {
    data = data || {};
    var items = data.items || [];
    var disabled = !!data.disabled;
    var confirmedCount = data.confirmedCount != null
      ? data.confirmedCount
      : items.filter(function (it) { return it.active !== false; }).length;

    var itemsHtml = items.map(function (item, idx) {
      return _renderCollectItem(item, idx, disabled);
    }).join('');

    var actionsHtml;
    if (disabled) {
      actionsHtml = '<div class="card-actions" style="margin-top:8px;">'
        + '<button class="btn-primary" disabled style="opacity:0.55;cursor:default;">\u2713 \u5DF2\u6536\u5F55\uFF08' + confirmedCount + ' \u9879\uFF09</button>'
        + '</div>';
    } else {
      actionsHtml = '<div class="card-actions" style="margin-top:8px;">'
        + '<button class="btn-primary" id="collect-confirm-' + Date.now() + '">' + esc(data.confirmText || '\u2713 \u786E\u8BA4\u6536\u5F55') + '</button>'
        + '</div>';
    }

    var cardStyle = 'margin:0;display:grid;gap:6px;';
    if (disabled) cardStyle += 'opacity:0.7;background:rgba(120,120,120,0.04);';

    var html = ''
      + '<div class="draft-card' + (disabled ? ' draft-card-disabled' : '') + '" style="' + cardStyle + '">'
      + '<div class="draft-title" style="display:flex;align-items:center;gap:8px;">'
      + '<span>\uD83D\uDCDD ' + esc(data.title || '\u9519\u9898\u672C\u8349\u7A3F') + '</span>'  // 📝 错题本草稿
      + '<span style="font-size:11px;font-weight:400;color:var(--text-muted);">\u2014 \u7B2C ' + (data.round || 1) + ' \u8F6E</span>'  // — 第 n 轮
      + (disabled ? '<span style="margin-left:auto;font-size:11px;color:#4caf50;font-weight:600;">\u5DF2\u6536\u5F55(' + confirmedCount + ')</span>' : '')
      + '</div>'
      + itemsHtml
      + actionsHtml
      + '</div>';

    return {
      html: html,
      events: null,
      mount: function (el, api) {
    // disabled 模式：不绑定任何交互（按钮已 disabled，滑块 readonly）
    if (disabled) {
      // 滑块设置颜色但不响应
      el.querySelectorAll('.mastery-slider').forEach(function (s) { _updateSlider(s); s.disabled = true; });
      return;
    }

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
        _updateCollectCount(el);
        api.emit('collect:step-toggle', {
          itemId: btn.dataset.itemId,
          active: btn.classList.contains('active'),
        });
      });
    });

    // ── Mastery sliders ──
    el.querySelectorAll('.mastery-slider').forEach(function (slider) {
      slider.addEventListener('input', function () {
        _updateSlider(slider);
        api.emit('collect:mastery-change', {
          itemId: slider.dataset.itemId,
          value: parseInt(slider.value, 10),
        });
      });
    });

    // ── Confirm button ──
    var confirmBtn = el.querySelector('.btn-primary');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', function () {
        var items = [];
        el.querySelectorAll('.draft-item-grid').forEach(function (itemEl) {
          var btn = itemEl.querySelector('.step-btn');
          var slider = itemEl.querySelector('.mastery-slider');
          var titleEl = itemEl.querySelector('.di-title');
          var sourceEl = itemEl.querySelector('.di-source span');
          var detailEl = itemEl.querySelector('.di-detail');
          var typeEls = itemEl.querySelectorAll('.d-type');
          items.push({
            id: btn ? btn.dataset.itemId : null,
            title: titleEl ? titleEl.textContent : '',
            source: sourceEl ? sourceEl.textContent : '',
            detail: detailEl ? detailEl.textContent : '',
            types: Array.prototype.map.call(typeEls || [], function (node) { return node.textContent; }),
            active: btn ? btn.classList.contains('active') : true,
            mastery: slider ? parseInt(slider.value, 10) : 0,
          });
        });
        api.emit('collect:confirm', { items: items, cardEl: el, draft_id: data.draft_id || '', round: data.round || 1 });
      });
    }

    // 初始化滑块颜色 + 确认按钮计数
    el.querySelectorAll('.mastery-slider').forEach(function (s) { _updateSlider(s); });
    _updateCollectCount(el);
      },
    };
  },
});

// ── 渲染单个 collect item ──
function _renderCollectItem(item, index, disabled) {
  var typesHtml = '';
  if (item.types && item.types.length) {
    typesHtml = item.types.map(function (t) {
      return '<span class="d-type">' + esc(t) + '</span>';
    }).join('');
  }

  var isActive = item.active !== false && item.stepActive !== false;
  var stepClass = isActive ? 'active' : 'inactive';
  var stepText = disabled
    ? (isActive ? (item.step != null ? item.step : (index + 1)) : '\u2715')
    : (item.step != null ? item.step : (index + 1));

  return ''
    + '<div class="draft-item-grid">'
    + '<div class="di-title">' + esc(item.title || '') + '</div>'
    + '<div class="di-source">\u6765\u6E90\uFF1A<span style="color:var(--text-secondary);">' + (item.source || '') + '</span></div>'  // 来源：
    + '<div class="di-type">' + typesHtml + '</div>'
    + '<div class="di-slider">'
    + '<input type="range" min="0" max="100" value="' + (item.mastery || 0) + '" class="mastery-slider" data-item-id="' + esc(item.id || '') + '"' + (disabled ? ' disabled' : '') + '>'
    + '<span class="mastery-val">' + (item.mastery || 0) + '%</span>'
    + '</div>'
    + '<div class="di-detail">' + esc(item.detail || '') + '</div>'
    + '<div class="di-empty"></div>'
    + '<button class="step-btn ' + stepClass + '" data-item-id="' + esc(item.id || '') + '"' + (disabled ? ' disabled' : '') + '>' + stepText + '</button>'
    + '</div>';
}

// ── 更新滑块颜色 ──
function _updateSlider(slider) {
  var val = slider.value;
  var label = slider.nextElementSibling;
  if (label && label.classList.contains('mastery-val')) {
    label.textContent = val + '%';
  }
  var pct = val / 100;
  var r = Math.round(212 * (1 - pct) + 90 * pct);
  var g = Math.round(102 * (1 - pct) + 155 * pct);
  var b = Math.round(90 * (1 - pct) + 106 * pct);
  var color = 'rgb(' + r + ',' + g + ',' + b + ')';
  slider.style.background = 'linear-gradient(to right, ' + color + ' ' + val + '%, var(--border-default) ' + val + '%)';
}

// ── 更新确认按钮计数 ──
function _updateCollectCount(el) {
  var allActive = el.querySelectorAll('.step-btn.active');
  var confirmBtn = el.querySelector('.btn-primary');
  if (!confirmBtn) return;
  var n = allActive.length;
  confirmBtn.textContent = '\u2713 \u786E\u8BA4\u6536\u5F55\uFF08' + n + ' \u9879\uFF09';
  confirmBtn.disabled = n === 0;
}
