ChatView.registerType('ocr_batch', {
  render: function (data) {
    data = data || {};
    var items = Array.isArray(data.items) ? data.items : [];
    var userText = data.user_text || '';
    var html = ''
      + '<div class="ocr-batch-card">'
      + items.map(function (item, index) {
        var failed = !!item.failed;
        var retryText = failed ? (item.error_message || '图转文失败，点击重试') : '';
        return ''
          + '<section class="ocr-item" data-ocr-image-id="' + esc(item.image_id || ('img_' + (index + 1))) + '">'
          + '  <div class="ocr-item-head">图片 ' + esc(String(item.index || (index + 1))) + '</div>'
          + '  <div class="ocr-item-think-wrap">'
          + '    <div class="think-toggle" data-ocr-toggle="think">⚙ 思考过程</div>'
          + '    <div class="think-box" style="display:none"><div class="think-content">' + esc(item.thinking || '') + '</div></div>'
          + '  </div>'
          + '  <div class="ocr-item-output-wrap">'
          + '    <div class="think-toggle" data-ocr-toggle="output">📝 图转文结果</div>'
          + '    <div class="think-box" style="display:none"><div class="think-content">' + renderMath(esc(item.output || '')) + '</div></div>'
          + '  </div>'
          + '  <div class="ocr-image-wrap">'
          + '    <img class="ocr-image" src="' + esc(item.preview || item.dataUrl || '') + '" alt="' + esc(item.name || ('图片' + (index + 1))) + '">'
          + (failed ? '<button class="ocr-retry-btn" type="button" data-ocr-retry="' + esc(item.image_id || '') + '">↺ ' + esc(retryText) + '</button>' : '')
          + '  </div>'
          + '</section>';
      }).join('')
      + (userText ? '<div class="ocr-user-text"><div class="ocr-user-text-label">用户消息</div><div class="msg-bubble">' + renderMath(esc(userText)) + '</div></div>' : '')
      + (data.show_continue ? '<div class="ocr-batch-actions"><button class="btn-primary" type="button" data-ocr-continue="1">继续发送</button></div>' : '')
      + '</div>';

    return {
      html: html,
      events: null,
      mount: function (el, api) {
        el.querySelectorAll('[data-ocr-toggle]').forEach(function (toggle) {
          toggle.addEventListener('click', function () {
            var box = toggle.nextElementSibling;
            if (!box) return;
            box.style.display = box.style.display === 'none' ? 'block' : 'none';
          });
        });
        el.querySelectorAll('.ocr-image').forEach(function (img) {
          img.addEventListener('click', function () {
            if (api && api.getEl && window.ChatView && typeof window.ChatView.create === 'function') {
              var root = img.getAttribute('src');
              var chatRoot = api.getEl('root');
              if (chatRoot && chatRoot._chatViewApi && typeof chatRoot._chatViewApi.openImagePreview === 'function') {
                chatRoot._chatViewApi.openImagePreview({ name: img.alt || '图片预览', dataUrl: root, fullImage: root });
              }
            }
          });
        });
        el.querySelectorAll('[data-ocr-retry]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            api.emit('ocr:retry', {
              image_id: btn.getAttribute('data-ocr-retry'),
              cardEl: el,
            });
          });
        });
        var continueBtn = el.querySelector('[data-ocr-continue]');
        if (continueBtn) {
          continueBtn.addEventListener('click', function () {
            api.emit('ocr:continue', { cardEl: el });
          });
        }
      },
    };
  },
});
