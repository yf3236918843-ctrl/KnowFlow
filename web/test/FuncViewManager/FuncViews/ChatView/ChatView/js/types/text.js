/**
 * MessageType: text — 文字气泡（user / assistant / system）
 *
 * events: 无
 * streaming: 支持（返回 handle）
 *
 * data.role → user=右 / assistant=左 / system=居中
 */

ChatView.registerType('text', {
  render: function (data) {
    data = data || {};
    var role = data.role || 'assistant';
    var content = data.content || '';
    var html;

    if (role === 'system') {
      html = '<div class="msg-bubble">' + content + '</div>';
    } else if (data.streaming) {
      html = '<div class="msg-bubble"><span class="thinking-dots"><span></span><span></span><span></span></span></div>';
    } else {
      html = '<div class="msg-bubble">' + renderMath(esc(content)) + '</div>';
    }

    return { html: html, events: null, mount: null };
  },
});
