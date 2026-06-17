/**
 * MessageType: raw — 原生 HTML 逃生口
 *
 * 当标准 type 不够用时，Process 直接传 html + 事件声明。
 * data:
 *   role     'assistant'|'user'|'system'
 *   html     原始 HTML 字符串
 *   events   [{ selector, event, emit }]  可选
 *   onMount  (el) => void                 可选
 */

ChatView.registerType('raw', {
  render: function (data) {
    data = data || {};
    return {
      html: data.html || '',
      events: data.events || null,
      mount: data.onMount || null,
    };
  },
});
