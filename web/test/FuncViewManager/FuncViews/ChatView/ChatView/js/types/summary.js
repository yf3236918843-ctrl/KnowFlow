/**
 * MessageType: summary — 学习总结卡片
 *
 * 展示 prompt 输出的三个字段：result / mastery / summary。
 * 使用 slideToggle 实现滑动展开/收起动画。
 *
 * data:
 *   result   "True" | "False"
 *   mastery  "一点就通" (0.45) | "引导才懂" (0.20) | "完全不会" (0.0)
 *   summary  string  对话压缩文本
 *
 * events: 无
 */

ChatView.registerType('summary', {
  render: function (data) {
    data = data || {};
    var isPass = data.result === 'True';

    var resultHtml = isPass
      ? '<span class="sc-result pass">\u2713 \u72EC\u7ACB\u5B8C\u6210</span>'   // ✓ 独立完成
      : '<span class="sc-result fail">\u2717 \u9700\u8981\u5F15\u5BFC</span>';   // ✗ 需要引导

    var masteryHtml = '';
    if (!isPass && data.mastery) {
      masteryHtml = '<span class="sc-mastery">' + esc(data.mastery) + ' \u00B7 mastery ' + _getMasteryValue(data.mastery) + '</span>';  // · mastery
    }

    var html = ''
      + '<div class="summary-card" style="margin:0;">'
      + '<div class="sc-header">'
      + '<span>\u5B66\u4E60\u603B\u7ED3</span>'  // 学习总结
      + '<span class="sc-arrow">\u25B6</span>'   // ▶
      + '</div>'
      + '<div class="sc-preview">' + resultHtml + masteryHtml + '</div>'
      + '<div class="slide-wrap">'
      + '<div><div class="sc-body">' + renderMath(esc(data.summary || '')) + '</div></div>'
      + '</div>'
      + '</div>';

    return {
      html: html,
      events: null,
      mount: function (el) {
        var card = el.querySelector('.summary-card');
        var slide = card.querySelector('.slide-wrap');
        var arrow = card.querySelector('.sc-arrow');
        if (!card || !slide) return;

        card.addEventListener('click', function () {
          var isOpen = slideToggle(slide);
          if (arrow) arrow.textContent = isOpen ? '\u25BC' : '\u25B6';  // ▼ / ▶
        });
      },
    };
  },
});

function _getMasteryValue(mastery) {
  if (mastery === '\u4E00\u70B9\u5C31\u901A') return '0.45';  // 一点就通
  if (mastery === '\u5F15\u5BFC\u624D\u61C2') return '0.20';  // 引导才懂
  if (mastery === '\u5B8C\u5168\u4E0D\u4F1A') return '0.0';   // 完全不会
  return '';
}
