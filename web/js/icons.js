/**
 * icons.js — 全局 SVG 图标库
 *
 * 所有图标都是函数：Icon.plus(size) → SVG string
 * viewBox 固定 16×16，通过 width/height 缩放，无字体偏移问题。
 *
 * 用法：
 *   el.innerHTML = Icon.plus(18);  // 18×18 的 + 号
 */
(function () {
  'use strict';

  function _v(s) {
    var h = s || 16;
    var svg = function (inner) {
      return '<svg width="' + h + '" height="' + h + '" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">'
        + inner
        + '</svg>';
    };
    return svg;
  }

  window.Icon = {
    /** + */
    plus: function (size) {
      var s = _v(size);
      return s('<path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>');
    },

    /** ☰ 汉堡菜单 */
    menu: function (size) {
      var s = _v(size);
      return s([
        '<line x1="3" y1="4" x2="13" y2="4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
        '<line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
        '<line x1="3" y1="12" x2="13" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
      ].join(''));
    },

    /** → 发送箭头 */
    send: function (size) {
      var s = _v(size);
      return s('<path d="M4 3l9 5-9 5V3z" fill="currentColor"/>');
    },

    /** ■ 停止方块 */
    stop: function (size) {
      var s = _v(size);
      return s('<rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor"/>');
    },

    /** 📎 附件 */
    clip: function (size) {
      var s = _v(size);
      return s('<path d="M8.5 5v5a2 2 0 0 1-4 0V4.5a3 3 0 0 1 6 0V10" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>');
    },

    /** ◀ 左箭头 */
    chevronLeft: function (size) {
      var s = _v(size);
      return s('<path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>');
    },

    /** ▶ 右箭头 */
    chevronRight: function (size) {
      var s = _v(size);
      return s('<path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>');
    },

    /** ▼ 下箭头（展开） */
    chevronDown: function (size) {
      var s = _v(size);
      return s('<path d="M3 6l5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>');
    },

    /** ▲ 上箭头（收起） */
    chevronUp: function (size) {
      var s = _v(size);
      return s('<path d="M3 10l5-5 5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>');
    },

    /** ✕ 关闭 */
    close: function (size) {
      var s = _v(size);
      return s([
        '<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
      ].join(''));
    },

    /** ✓ 勾 */
    check: function (size) {
      var s = _v(size);
      return s('<path d="M3 8.5l3 3 7-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>');
    },

    /** ⏵ 小三角（卡片收起状态） */
    triangleRight: function (size) {
      var s = _v(size);
      return s('<path d="M6 4l5 4-5 4V4z" fill="currentColor"/>');
    },

    /** ⏷ 小三角（卡片展开状态） */
    triangleDown: function (size) {
      var s = _v(size);
      return s('<path d="M4 6l4 5 4-5H4z" fill="currentColor"/>');
    },
  };
})();
