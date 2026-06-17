/**
 * InputType: input-text — 默认文字输入框
 *
 * 结构：
 *   ┌───────────────────────┐
 *   │  textarea (圆顶角)     │
 *   ├───────────────────────┤
 *   │  [+] 📎      [■/➤]   │
 *   └───────────────────────┘
 *
 * events:
 *   input:send    用户发送文字
 *   input:stop    用户点击停止
 *   input:extras  用户点击扩展菜单项
 */

ChatView.registerType('input-text', {
  render: function (data) {
    data = data || {};
    var uid = 'it-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);

    var html = ''
      + '<textarea class="input-textarea" id="' + uid + '-ta" rows="1" placeholder="' + esc(data.placeholder || '\u8F93\u5165\u6D88\u606F...') + '"></textarea>'
      + '<div class="input-bottom">'
      + '<div class="input-left">'
      + '<div class="input-extras input-extras-wrap">'
      + '<button class="ie-trigger" id="' + uid + '-iet" title="\u6269\u5C55">' + (typeof Icon !== 'undefined' ? Icon.plus(16) : '+') + '</button>'
      + '<div class="ie-menu" id="' + uid + '-iem">'
      + '<div class="ie-grid" id="' + uid + '-ieg"></div>'
      + '</div>'
      + '</div>'
      + '<button class="btn-attach" id="' + uid + '-att" title="\u9644\u4EF6">' + (typeof Icon !== 'undefined' ? Icon.clip(16) : '\uD83D\uDCCE') + '</button>'
      + '</div>'
      + '<div class="input-right">'
      + '<button class="input-btn btn-stop" id="' + uid + '-stp" title="\u505C\u6B62" style="display:none">' + (typeof Icon !== 'undefined' ? Icon.stop(16) : '\u25A0') + '</button>'
      + '<button class="input-btn btn-send" id="' + uid + '-snd" title="\u53D1\u9001">' + (typeof Icon !== 'undefined' ? Icon.send(16) : '\u2192') + '</button>'
      + '</div>'
      + '</div>';

    return {
      html: html,
      events: null,  // 事件通过 mount 绑定（需要内部状态）
      mount: function (el, api) {

        // ── 获取元素引用 ──
        var ta = el.querySelector('textarea');
        var iet = el.querySelector('.ie-trigger');
        var iem = el.querySelector('.ie-menu');
        var ieg = el.querySelector('.ie-grid');
        var snd = el.querySelector('.btn-send');
        var stp = el.querySelector('.btn-stop');
        var att = el.querySelector('.btn-attach');

        // ── 发送 ──
        function doSend() {
          if (stp.style.display !== 'none') return;  // 正在流式
          var text = ta.value.trim();
          if (!text && !_attachments.length) return;
          ta.value = '';
          ta.style.height = 'auto';
          api.emit('input:send', text);
        }

        function doStop() {
          api.emit('input:stop');
        }

        snd.addEventListener('click', doSend);
        stp.addEventListener('click', doStop);

        ta.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            doSend();
          }
        });

        ta.addEventListener('input', function () {
          ta.style.height = 'auto';
          ta.style.height = ta.scrollHeight + 'px';
        });

        // ── 扩展菜单 ──
        if (iet && iem) {
          iet.addEventListener('click', function (e) {
            e.stopPropagation();
            iem.classList.toggle('open');
          });
          document.addEventListener('click', function () {
            iem.classList.remove('open');
          });
        }

        // ── 填充 extras（从 data.extras）──
        function fillExtras(items) {
          if (!ieg || !items) return;
          ieg.innerHTML = '';
          items.forEach(function (item) {
            var btn = document.createElement('button');
            btn.className = 'ie-item';
            btn.dataset.action = item.action;
            if (item.disabled) btn.disabled = true;
            if (item.disabled) btn.className += ' is-disabled';
            btn.innerHTML = '<span class="ie-icon">' + (item.icon || '') + '</span>'
              + '<span class="ie-label">' + esc(item.label || '') + '</span>';
            btn.addEventListener('click', function (e) {
              e.stopPropagation();
              if (item.disabled) return;
              iem.classList.remove('open');
              api.emit('input:extras', item.action);
            });
            ieg.appendChild(btn);
          });
        }

        fillExtras(data.extras);

        // ── 附件 ──
        if (att) {
          att.addEventListener('click', function () {
            api.emit('input:attach');
          });
        }
      },
    };
  },
});
