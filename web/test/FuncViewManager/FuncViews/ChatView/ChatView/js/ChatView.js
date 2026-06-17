/**
 * ChatView — 通用聊天窗口 UI 库
 *
 * 架构：
 *   appendMessage(type, data)  消息（通过 type 注册渲染 + 事件声明）
 *   setSlot('banner', type, data)  顶栏区域（可插拔）
 *   setInput(type, data)  输入区域（可插拔）
 *   on(event, fn)  事件订阅（Process 层解耦）
 *
 * 使用方式见 test Process: Process/test/view.js
 *
 * 依赖：
 *   utils.js (esc, renderMath)
 */

window.ChatView = (() => {
  'use strict';

  // ═══════════════════════════════════════════════════
  // Type 注册表（模块级，所有实例共享）
  // ═══════════════════════════════════════════════════

  var _types = {};

  /**
   * 注册消息/插槽/输入类型。
   * @param {string}   name
   * @param {object}   def   { render(data) → { html, events?, mount? } }
   */
  function registerType(name, def) {
    if (!name || !def || typeof def.render !== 'function') {
      throw new Error('[ChatView] registerType 需要 name 和 render()');
    }
    _types[name] = def;
  }

  function _getType(name) {
    return _types[name];
  }

  function _normalizeStructuredJson(json) {
    if (!json || typeof json !== 'object') return null;
    if (json.type === 'question') {
      return {
        type: 'question',
        content: json.content || json.question || '',
      };
    }
    if (typeof json.question === 'string' && json.question.trim()) {
      return {
        type: 'question',
        content: json.question,
      };
    }
    return json;
  }

  function _isVisibleMessage(msg) {
    if (!msg || !msg.role) return false;
    if (msg.role === 'system') return false;
    if (msg.role === 'user' && typeof msg.content === 'string') {
      if (msg.content.indexOf('【系统指令】') === 0) return false;
      if (msg.content.indexOf('【系统提示:') === 0) return false;
    }
    return true;
  }

  // ═══════════════════════════════════════════════════
  // CSS 自动注入
  // ═══════════════════════════════════════════════════

  var _cssLoaded = false;
  var _cssBase = (function () {
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var s = scripts[i].src;
      if (s && s.indexOf('ChatView.js') >= 0) {
        return s.replace(/js\/ChatView\.js.*$/, 'css/');
      }
    }
    return '';
  })();
  var _cssVersion = (function () {
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var s = scripts[i].src || '';
      if (s.indexOf('ChatView.js') >= 0) {
        var idx = s.indexOf('?');
        return idx >= 0 ? s.slice(idx) : '';
      }
    }
    return '';
  })();

  function _injectCSS() {
    if (_cssLoaded || !_cssBase) return;
    _cssLoaded = true;
    var files = ['ChatView.css', 'chat.css', 'input.css', 'qbar.css', 'cards.css'];
    files.forEach(function (file) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = _cssBase + file + _cssVersion;
      document.head.appendChild(link);
    });
  }

  // ═══════════════════════════════════════════════════
  // Factory
  // ═══════════════════════════════════════════════════

  function create() {
    _injectCSS();

    var _uid = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    function _id(name) { return 'cv-' + _uid + '-' + name; }

    // ── 状态 ──
    var _state = {
      messages: [],
    };
    var _els = {};
    var _handlers = {};
    var _listeners = {};
    var _msgSeq = 0;
    var _streaming = false;
    var _attachments = [];
    var _previewOverlay = null;

    // ═════════════════════════════════════════════
    // 事件系统
    // ═════════════════════════════════════════════

    function on(event, fn) {
      (_listeners[event] = _listeners[event] || []).push(fn);
      return this;
    }

    function off(event, fn) {
      var list = _listeners[event];
      if (!list) return this;
      var idx = list.indexOf(fn);
      if (idx >= 0) list.splice(idx, 1);
      return this;
    }

    function emit(event, data) {
      var list = _listeners[event];
      if (list) {
        list.slice().forEach(function (fn) { fn(data); });
      }
      // 同时触发通配 * 监听
      var all = _listeners['*'];
      if (all) {
        all.slice().forEach(function (fn) { fn({ event: event, data: data }); });
      }
    }

    // ═════════════════════════════════════════════
    // HTML 骨架
    // ═════════════════════════════════════════════

    function _getHTML() {
      return ''
        + '<div class="chat-view" id="' + _id('root') + '">'

        // Banner 插槽（顶栏，如题目栏）
        + '<div class="chat-banner" id="' + _id('banner') + '" style="display:none"></div>'

        // 消息区
        + '<div class="chat-area" id="' + _id('chat') + '">'
        + '<div class="messages" id="' + _id('msgs') + '"></div>'
        + '</div>'

        // 输入区（内容由 setInput 动态填充）
        + '<div class="input-area" id="' + _id('input') + '">'
        + '<div class="input-inner" id="' + _id('inner') + '">'
        + '</div>'
        + '</div>'

        + '</div>';
    }

    // ═════════════════════════════════════════════
    // Bind / Unbind / Destroy
    // ═════════════════════════════════════════════

    var _api = null;

    function _bind() {
      if (typeof enableLatexCopy === 'function') enableLatexCopy();
      _els = {
        root:   document.getElementById(_id('root')),
        banner: document.getElementById(_id('banner')),
        chat:   document.getElementById(_id('chat')),
        msgs:   document.getElementById(_id('msgs')),
        input:  document.getElementById(_id('input')),
        inner:  document.getElementById(_id('inner')),
      };
      if (_els.root) _els.root._chatViewApi = _api;

      // 恢复消息
      if (_state._sessionData) {
        _replaySessionData(_state._sessionData);
        delete _state._sessionData;
      } else {
        _state.messages.forEach(function (msg) {
          _renderMessage(msg);
        });
      }

      // 如果已有 slot/input 配置，恢复
      if (_state._bannerDef) {
        _renderSlot(_state._bannerDef);
      }
      if (_state._inputDef) {
        _renderInput(_state._inputDef);
      } else {
        // 默认 text input
        _renderInput({ type: 'input-text', data: {} });
      }

      // 自动渲染 LaTeX + Markdown
      if (typeof renderAll === 'function') {
        renderAll(_els.msgs);
      }
    }

    function _unbind() {
      _els = {};
    }

    function _destroy() {
      _unbind();
      _state.messages = [];
      _state._bannerDef = null;
      _state._inputDef = null;
      _listeners = {};
      _handlers = {};
      _attachments = [];
    }

    // ═════════════════════════════════════════════
    // appendMessage — 统一消息入口
    // ═════════════════════════════════════════════

    /**
     * 添加一条消息。
     * @param {string} type  消息类型（需先 registerType）
     * @param {object} data  传给 type.render(data) 的数据
     * @returns {object|null}  streaming 文字 → handle；raw → DOM 元素；其他 → null
     */
    function appendMessage(type, data) {
      var def = _getType(type);
      if (!def) {
        console.warn('[ChatView] 未知消息类型:', type);
        return null;
      }

      data = data || {};

      // 统一入口过滤：不可见消息不渲染
      if (!_isVisibleMessage(data)) return null;

      var result = def.render(data);
      if (!result) return null;

      var role = data.role || 'assistant';
      var el = document.createElement('div');
      el.className = 'msg ' + (role === 'user' ? 'user' : role === 'system' ? 'system' : 'ai');
      el.innerHTML = result.html || '';

      // 绑定 type 声明的事件
      _bindEvents(el, result.events, data);

      var msgId = ++_msgSeq;
      _state.messages.push({ id: msgId, type: type, data: data });

      if (_els.msgs) {
        _els.msgs.appendChild(el);
        if (typeof renderAll === 'function' && !data.streaming) {
          renderAll(el);
        }
        _scrollBottom();
      } else {
        el._pendingMount = true;
      }

      // mount 回调
      if (result.mount) {
        if (_els.root) {
          result.mount(el, { emit: emit, getEl: function (k) { return _els[k]; } });
        } else {
          el._pendingMountCb = result.mount;
        }
      }

      // streaming handle
      if (data.streaming) {
        return _createStreamHandle(data, el);
      }

      return el;
    }

    function _renderMessage(msg) {
      var def = _getType(msg.type);
      if (!def) return;
      var result = def.render(msg.data);
      if (!result) return;

      var role = msg.data.role || 'assistant';
      var el = document.createElement('div');
      el.className = 'msg ' + (role === 'user' ? 'user' : role === 'system' ? 'system' : 'ai');
      el.innerHTML = result.html || '';
      _bindEvents(el, result.events, msg.data);
      _els.msgs.appendChild(el);

      if (result.mount) {
        result.mount(el, { emit: emit, getEl: function (k) { return _els[k]; } });
      }
    }

    function _bindEvents(el, events, data) {
      if (!events) return;
      events.forEach(function (ev) {
        var target = ev.selector ? el.querySelector(ev.selector) : el;
        if (!target) return;
        target.addEventListener(ev.event || 'click', function (e) {
          emit(ev.emit, ev.data || data);
        });
      });
    }

    // ── Streaming handle ──
    function _createStreamHandle(data, el) {
      var throttleTimer = null;
      return {
        append: function (text) {
          data.content = (data.content || '') + text;
          var bubble = el.querySelector('.msg-bubble');
          if (!bubble) return;
          var dots = bubble.querySelector('.thinking-dots');
          if (dots) dots.remove();
          bubble.textContent = data.content;
          _scrollBottom();
        },

        finalize: function () {
          data.streaming = false;
          el.classList.remove('typing');
          if (typeof renderAll === 'function') {
            renderAll(el);
          }
          _scrollBottom();
        },

        showThinking: function (text) {
          var toggle = el.querySelector('.think-toggle');
          var box = el.querySelector('.think-box');
          var bubble = el.querySelector('.msg-bubble');

          if (!toggle) {
            toggle = document.createElement('div');
            toggle.className = 'think-toggle';
            toggle.textContent = '\u2699 \u601D\u8003\u8FC7\u7A0B';
            toggle.dataset.open = 'false';
            box = document.createElement('div');
            box.className = 'think-box';
            box.style.display = 'none';
            box.innerHTML = '<div class="think-content"></div>';
            el.insertBefore(toggle, bubble);
            el.insertBefore(box, bubble);
            toggle.addEventListener('click', function () {
              var open = toggle.dataset.open === 'true';
              toggle.dataset.open = open ? 'false' : 'true';
              box.style.display = open ? 'none' : 'block';
            });
          }

          var content = box.querySelector('.think-content');
          content.textContent += text;
          _scrollBottom();
        },

        hideThinking: function () {
          var toggle = el.querySelector('.think-toggle');
          var box = el.querySelector('.think-box');
          if (toggle) toggle.style.display = 'none';
          if (box) box.style.display = 'none';
        },

        remove: function () {
          el.remove();
          _state.messages = _state.messages.filter(function (m) { return m.id !== data.id; });
        },
      };
    }

    // ═════════════════════════════════════════════
    // Slot（顶栏 Banner）
    // ═════════════════════════════════════════════

    function setSlot(slotName, type, data) {
      if (slotName !== 'banner') return;
      var def = _getType(type);
      if (!def) return;

      _state._bannerDef = { type: type, data: data };

      if (!_els.banner) return;
      _renderSlot({ type: type, data: data });
    }

    function _renderSlot(def) {
      var result = _getType(def.type).render(def.data);
      if (!result) {
        _els.banner.style.display = 'none';
        return;
      }
      _els.banner.style.display = '';
      _els.banner.innerHTML = result.html || '';
      _bindEvents(_els.banner, result.events, def.data);
      if (result.mount) {
        result.mount(_els.banner, { emit: emit, getEl: function (k) { return _els[k]; } });
      }
      if (typeof renderAll === 'function') renderAll(_els.banner);
    }

    function setSlotHTML(slotName, html, onMount) {
      if (slotName !== 'banner') return;
      _state._bannerDef = null;
      if (_els.banner) {
        if (html) {
          _els.banner.style.display = '';
          _els.banner.innerHTML = html;
          if (onMount) onMount(_els.banner);
          if (typeof renderAll === 'function') renderAll(_els.banner);
        } else {
          _els.banner.style.display = 'none';
        }
      }
    }

    // ═════════════════════════════════════════════
    // Input（输入框）
    // ═════════════════════════════════════════════

    function setInput(type, data) {
      _state._inputDef = { type: type, data: data };
      if (!_els.inner) return;
      _renderInput({ type: type, data: data });
    }

    function _renderInput(def) {
      var typeDef = _getType(def.type);
      if (!typeDef) return;

      var result = typeDef.render(def.data || {});
      if (!result) return;

      _els.inner.innerHTML = result.html || '';
      _bindEvents(_els.inner, result.events, def.data);

      if (result.mount) {
        result.mount(_els.inner, { emit: emit, getEl: function (k) { return _els[k]; } });
      }
      _renderAttachments();
      if (typeof renderAll === 'function') renderAll(_els.inner);
    }

    function setInputHTML(html, onMount) {
      _state._inputDef = { type: 'raw', data: {} };
      if (!_els.inner) return;
      _els.inner.innerHTML = html || '';
      if (onMount) onMount(_els.inner);
      if (typeof renderAll === 'function') renderAll(_els.inner);
    }

    // ═════════════════════════════════════════════
    // 滚动
    // ═════════════════════════════════════════════

    function _scrollBottom() {
      requestAnimationFrame(function () {
        if (_els.chat) _els.chat.scrollTop = _els.chat.scrollHeight;
      });
    }

    function _renderAttachments() {
      if (!_els.inner) return;
      var bar = _els.inner.querySelector('.attach-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'attach-bar';
        bar.innerHTML = '<div class="attach-list"></div>';
        _els.inner.appendChild(bar);
      }
      var list = bar.querySelector('.attach-list');
      if (!list) return;
      list.innerHTML = '';
      if (!_attachments.length) {
        bar.classList.remove('open');
        return;
      }
      bar.classList.add('open');
      _attachments.forEach(function (item, index) {
        var node = document.createElement('div');
        node.className = 'attach-item';
        node.innerHTML = ''
          + '<img src="' + item.dataUrl + '" alt="' + esc(item.name || ('附件' + (index + 1))) + '">'
          + '<span class="attach-index">' + (index + 1) + '</span>'
          + '<button class="attach-del" type="button" data-attach-del="' + index + '">×</button>';
        list.appendChild(node);
        node.addEventListener('click', function (event) {
          if (event.target && event.target.closest('[data-attach-del]')) return;
          _openImagePreview(item);
        });
      });
      list.querySelectorAll('[data-attach-del]').forEach(function (btn) {
        btn.addEventListener('click', function (event) {
          event.stopPropagation();
          var idx = parseInt(btn.getAttribute('data-attach-del'), 10);
          if (!isNaN(idx)) {
            _attachments.splice(idx, 1);
            _renderAttachments();
          }
        });
      });
    }

    function _ensurePreviewOverlay() {
      if (_previewOverlay) return _previewOverlay;
      _previewOverlay = document.createElement('div');
      _previewOverlay.className = 'chat-image-preview';
      _previewOverlay.style.display = 'none';
      _previewOverlay.innerHTML = ''
        + '<div class="chat-image-preview-backdrop" data-preview-close="1"></div>'
        + '<div class="chat-image-preview-dialog">'
        + '  <button class="chat-image-preview-close" type="button" data-preview-close="1">×</button>'
        + '  <img class="chat-image-preview-img" alt="">'
        + '  <div class="chat-image-preview-name"></div>'
        + '</div>';
      _previewOverlay.addEventListener('click', function (event) {
        if (event.target && event.target.getAttribute('data-preview-close') === '1') {
          _closeImagePreview();
        }
      });
      document.body.appendChild(_previewOverlay);
      return _previewOverlay;
    }

    function _openImagePreview(item) {
      var overlay = _ensurePreviewOverlay();
      var img = overlay.querySelector('.chat-image-preview-img');
      var name = overlay.querySelector('.chat-image-preview-name');
      if (img) img.src = item.fullImage || item.dataUrl || '';
      if (img) img.alt = item.name || '图片预览';
      if (name) name.textContent = item.name || '图片预览';
      overlay.style.display = 'flex';
    }

    function _closeImagePreview() {
      if (!_previewOverlay) return;
      _previewOverlay.style.display = 'none';
    }

    // ═════════════════════════════════════════════
    // Content Parser — 流式解析模型 output
    // ═════════════════════════════════════════════

    var _currentOutput = null;

    function startOutput() {
      if (typeof ContentParser !== 'function') {
        console.warn('[ChatView] 需要 content-parser.js');
        return;
      }
      // 如有未结束的输出，先关掉
      if (_currentOutput) endOutput();

      var el = document.createElement('div');
      el.className = 'msg ai';

      // Think toggle（初始隐藏，feedThinking 首次调用时显示）
      var thinkToggle = null;
      var thinkBox = null;

      var bubble = document.createElement('div');
      bubble.className = 'msg-bubble';
      el.appendChild(bubble);

      var textSpan = document.createElement('span');
      textSpan.className = 'output-text';
      bubble.appendChild(textSpan);

      var progressSpan = document.createElement('span');
      progressSpan.className = 'json-progress';
      progressSpan.style.display = 'none';
      progressSpan.textContent = '\u25CB \u6B63\u5728\u6784\u5EFA\u5361\u7247...'; // ○ 正在构建卡片...
      bubble.appendChild(progressSpan);

      if (_els.msgs) {
        _els.msgs.appendChild(el);
        _scrollBottom();
      }

      var parser = new ContentParser();
      var textAccum = '';

      parser.onText = function (ch) {
        textAccum += ch;
        textSpan.textContent = textAccum;
        _scrollBottom();
      };

      parser.onJsonStart = function () {
        progressSpan.style.display = '';
        _scrollBottom();
      };

      parser.onJsonProgress = function (n) {
        progressSpan.textContent = '\u6B63\u5728\u6784\u5EFA\u5361\u7247(' + n + '\u5B57...)'; // 正在构建卡片(N字...)
      };

      parser.onJsonEnd = function (json) {
        progressSpan.style.display = 'none';
        json = _normalizeStructuredJson(json);
        // 子题事件：question 类型不渲染卡片，emit 给 Process 收集
        if (json && json.type === 'question') {
          emit('question', { content: json.content || '', domRef: el });
        }
        // 类型已注册 → 渲染卡片；未注册 → 静默消费（由 pipeline 结构化事件处理）
        if (json && json.type && _getType(json.type)) {
          _renderCardAfter(bubble, json);
        }
        _scrollBottom();
      };

      parser.onError = function () {
        progressSpan.style.display = 'none';
      };

      _currentOutput = {
        el: el,
        parser: parser,
        textSpan: textSpan,
        textAccum: textAccum,
        bubble: bubble,
        progressSpan: progressSpan,
        thinkToggle: null,
        thinkBox: null,
      };
    }

    function feedOutput(chunk) {
      if (!_currentOutput || !_currentOutput.parser) return;
      _currentOutput.parser.feed(chunk);
    }

    function feedThinking(text) {
      if (!_currentOutput) return;
      var co = _currentOutput;
      if (!co.thinkToggle) {
        co.thinkToggle = document.createElement('div');
        co.thinkToggle.className = 'think-toggle';
        co.thinkToggle.textContent = '\u2699 \u601D\u8003\u8FC7\u7A0B';
        co.thinkToggle.dataset.open = 'false';
        co.thinkBox = document.createElement('div');
        co.thinkBox.className = 'think-box';
        co.thinkBox.style.display = 'none';
        co.thinkBox.innerHTML = '<div class="think-content"></div>';
        co.el.insertBefore(co.thinkToggle, co.bubble);
        co.el.insertBefore(co.thinkBox, co.bubble);
        co.thinkToggle.addEventListener('click', function () {
          var open = co.thinkToggle.dataset.open === 'true';
          co.thinkToggle.dataset.open = open ? 'false' : 'true';
          co.thinkBox.style.display = open ? 'none' : 'block';
        });
      }
      var content = co.thinkBox.querySelector('.think-content');
      if (content) content.textContent += text;
      _scrollBottom();
    }

    function endOutput() {
      if (!_currentOutput) return;
      // 关闭 parser（处理残留）
      _currentOutput.parser.feed('');
      // 确保进度隐藏
      if (_currentOutput.progressSpan) {
        _currentOutput.progressSpan.style.display = 'none';
      }
      // 若整段输出无任何文本（如只有 ```json``` 块），移除空 bubble 避免占位残留
      // 卡片是 el 的子节点（与 bubble 同级），需保留
      if (_currentOutput.bubble && _currentOutput.textSpan &&
          _currentOutput.textSpan.textContent === '' &&
          _currentOutput.bubble.parentNode) {
        _currentOutput.bubble.parentNode.removeChild(_currentOutput.bubble);
        // 若整条 el 也已无子节点（连卡片都没有），整条移除
        if (_currentOutput.el && _currentOutput.el.children.length === 0 &&
            _currentOutput.el.parentNode) {
          _currentOutput.el.parentNode.removeChild(_currentOutput.el);
        }
      }
      if (_currentOutput.el && _currentOutput.el.parentNode && typeof renderAll === 'function') {
        renderAll(_currentOutput.el);
      }
      _scrollBottom();
      _currentOutput = null;
    }

    /** 在消息气泡后渲染一张卡片 */
    function _renderCardAfter(afterEl, data) {
      var def = _getType(data.type);
      if (!def) return;
      var result = def.render(data);
      if (!result) return;

      var cardEl = document.createElement('div');
      cardEl.innerHTML = result.html || '';
      afterEl.parentNode.insertBefore(cardEl, afterEl.nextSibling);

      if (result.mount) {
        result.mount(cardEl, { emit: emit, getEl: function (k) { return _els[k]; } });
      }
      if (typeof renderAll === 'function') renderAll(cardEl);
    }

    // ═════════════════════════════════════════════
    function _clearMessages() {
      _state.messages = [];
      delete _state._sessionData;
      if (_els.msgs) _els.msgs.innerHTML = '';
    }

    // loadSession — 从 Session 恢复消息
    // ═════════════════════════════════════════════

    function loadSession(messages, options) {
      if (typeof ContentParser !== 'function') {
        console.warn('[ChatView] loadSession 需要 content-parser.js');
        return;
      }
      _clearMessages();

      _state._sessionData = { messages: messages || [], options: options || {} };

      // DOM 已就绪？直接回放（bind() 后在用）
      if (_els.msgs) {
        _replaySessionData(_state._sessionData);
        delete _state._sessionData;
      }
    }

    function _replaySessionData(data) {
      var messages = data.messages;
      var cardStates = (data.options.uiState && data.options.uiState.card_states) || {};
      for (var i = 0; i < messages.length; i++) {
        var msg = messages[i];
        if (!_isVisibleMessage(msg)) continue;
        if (msg.role === 'user') {
          appendMessage('text', { role: 'user', content: msg.content });
        } else if (msg.role === 'assistant') {
          _renderAssistantContent(msg.content || '', cardStates, msg.thinking || '');
        }
      }

      emit('session:restored', {});
      if (typeof renderAll === 'function') renderAll(_els.msgs);
      _scrollBottom();
    }

    /** 渲染一条完整的 assistant content（非流式，页面恢复用） */
    function _renderAssistantContent(content, cardStates, thinkingText) {
      cardStates = cardStates || {};
      var segments = _parseSync(content);
      if (!segments.length) return;

      var el = document.createElement('div');
      el.className = 'msg ai';

      // ── Think toggle（有 thinking 时渲染） ──
      if (thinkingText) {
        var thinkToggle = document.createElement('div');
        thinkToggle.className = 'think-toggle';
        thinkToggle.textContent = '\u2699 \u601D\u8003\u8FC7\u7A0B';
        thinkToggle.dataset.open = 'false';
        var thinkBox = document.createElement('div');
        thinkBox.className = 'think-box';
        thinkBox.style.display = 'none';
        thinkBox.innerHTML = '<div class="think-content">' + esc(thinkingText) + '</div>';
        el.appendChild(thinkToggle);
        el.appendChild(thinkBox);
        thinkToggle.addEventListener('click', function () {
          var open = thinkToggle.dataset.open === 'true';
          thinkToggle.dataset.open = open ? 'false' : 'true';
          thinkBox.style.display = open ? 'none' : 'block';
        });
      }

      for (var i = 0; i < segments.length; i++) {
        var seg = segments[i];
        if (seg.type === 'text') {
          var bubble = document.createElement('div');
          bubble.className = 'msg-bubble';
          bubble.textContent = seg.content;
          el.appendChild(bubble);
        } else if (seg.type === 'card') {
          // 子题恢复：question 类型不渲染卡片，emit 给 Process（domRef=el 指向当前消息容器）
          if (seg.data.type === 'question') {
            emit('question', { content: seg.data.content || '', domRef: el });
          }
          // 注入 disabled 状态（从 extern.ui_state.card_states 读取）
          var stateKey = null;
          if (seg.data.type === 'collect_draft') stateKey = 'collect_' + (seg.data.draft_id || seg.data.round || 1);
          else if (seg.data.type === 'preference_actions' || seg.data.type === 'action_set') stateKey = 'pref_' + (seg.data.draft_id || seg.data.round || 1);
          if (stateKey && cardStates[stateKey] && cardStates[stateKey].confirmed) {
            seg.data.disabled = true;
            // 合并 active/mastery 到 items
            var savedItems = cardStates[stateKey].items || {};
            if (Array.isArray(seg.data.items)) {
              seg.data.items = seg.data.items.map(function (it) {
                var sv = savedItems[it.id];
                if (!sv) return it;
                var merged = {};
                for (var k in it) if (it.hasOwnProperty(k)) merged[k] = it[k];
                if (sv.active != null) merged.active = sv.active;
                if (sv.mastery != null) merged.mastery = sv.mastery;
                return merged;
              });
              seg.data.confirmedCount = seg.data.items.filter(function (it) { return it.active !== false; }).length;
            }
          }
          var def = _getType(seg.data.type);
          if (def) {
            var result = def.render(seg.data);
            if (result) {
              var cardEl = document.createElement('div');
              cardEl.innerHTML = result.html || '';
              el.appendChild(cardEl);
              if (result.mount) {
                result.mount(cardEl, { emit: emit, getEl: function (k) { return _els[k]; } });
              }
            }
          }
        }
      }

      _els.msgs.appendChild(el);
    }

    /** 同步正则解析完整 content（非流式） */
    function _parseSync(content) {
      var segments = [];
      var pattern = /(\/\*[\s\S]*?\*\/)|(```json[\s\S]*?```)/g;
      var lastIndex = 0;
      var match;

      while ((match = pattern.exec(content)) !== null) {
        // 匹配前的纯文本
        if (match.index > lastIndex) {
          var before = content.slice(lastIndex, match.index);
          if (before) segments.push({ type: 'text', content: before });
        }

        if (match[1]) {
          // group 1: /* ... */
          var inner = match[1].slice(2, -2);
          if (inner) segments.push({ type: 'text', content: inner });
        } else if (match[2]) {
          // group 2: ```json ... ```
          var jsonStr = match[2].slice(7, -3);
          try {
            var json = _normalizeStructuredJson(JSON.parse(jsonStr));
            if (json && json.type === 'question') {
              segments.push({ type: 'card', data: json });
            } else if (json && json.type && _getType(json.type)) {
              segments.push({ type: 'card', data: json });
            }
            // 未注册类型 → 静默消费
          } catch (e) {
            segments.push({ type: 'text', content: match[2] });
          }
        }
        lastIndex = pattern.lastIndex;
      }

      // 剩余文本
      if (lastIndex < content.length) {
        var remaining = content.slice(lastIndex);
        if (remaining) segments.push({ type: 'text', content: remaining });
      }

      // 纯文本段合并
      var merged = [];
      for (var i = 0; i < segments.length; i++) {
        if (segments[i].type === 'text' && merged.length && merged[merged.length - 1].type === 'text') {
          merged[merged.length - 1].content += segments[i].content;
        } else {
          merged.push(segments[i]);
        }
      }

      return merged;
    }

    // ═════════════════════════════════════════════
    // 向后兼容别名（逐步弃用）
    // ═════════════════════════════════════════════

    function _deprecated(msg) {
      console.warn('[ChatView] 弃用: ' + msg);
    }

    _api = {

      // ── 新 API ──
      get html() { return _getHTML(); },

      bind: _bind,
      unbind: _unbind,
      destroy: function () {
        _unbind();
        _state.messages = [];
        _state._bannerDef = null;
        _state._inputDef = null;
        _listeners = {};
        _handlers = {};
        _attachments = [];
        if (_previewOverlay && _previewOverlay.parentNode) {
          _previewOverlay.parentNode.removeChild(_previewOverlay);
        }
        _previewOverlay = null;
      },

      appendMessage: appendMessage,
      isVisibleMessage: _isVisibleMessage,

      on: on,
      off: off,

      setSlot: setSlot,
      setSlotHTML: setSlotHTML,
      setInput: setInput,
      setInputHTML: setInputHTML,

      scrollToBottom: _scrollBottom,

      // ── 强制渲染当前消息区的 LaTeX + Markdown ──
      renderAll: function () {
        if (typeof renderAll === 'function' && _els.msgs) {
          renderAll(_els.msgs);
        }
      },

      // ── 向后兼容别名 ──
      addMessage: function (msg) {
        _deprecated('addMessage → appendMessage("text", msg)');
        return appendMessage('text', msg);
      },

      addCard: function (type, data) {
        _deprecated('addCard → appendMessage(type, data)');
        return appendMessage(type, data);
      },

      setQuestion: function (q) {
        _deprecated('setQuestion → setSlot("banner", "question", q)');
        if (q) {
          setSlot('banner', 'question', q);
        } else {
          setSlotHTML('banner', null);
        }
      },

      getQuestion: function () {
        return _state._bannerDef && _state._bannerDef.type === 'question'
          ? _state._bannerDef.data : null;
      },

      setExtras: function (items) {
        _deprecated('setExtras 即将弃用，setInput 内部处理');
        // 保持功能：如果当前 input 已渲染且有 extras 容器，填充
        var grid = _els.inner && _els.inner.querySelector('.ie-grid');
        if (grid && items) {
          grid.innerHTML = '';
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
              var menu = grid.closest('.ie-menu');
              if (menu) menu.classList.remove('open');
              emit('input:extras', item.action);
            });
            grid.appendChild(btn);
          });
        }
      },

      onSend: function (fn) { _deprecated('onSend → on("input:send")'); _handlers.send = fn; this.on('input:send', fn); },
      onStop: function (fn) { _deprecated('onStop → on("input:stop")'); _handlers.stop = fn; this.on('input:stop', fn); },
      onExtras: function (fn) { _deprecated('onExtras → on("input:extras")'); _handlers.extras = fn; this.on('input:extras', fn); },

      setReady: function (b) {
        var ta = _els.inner && _els.inner.querySelector('textarea');
        if (ta) ta.disabled = !b;
      },

      setPlaceholder: function (t) {
        var ta = _els.inner && _els.inner.querySelector('textarea');
        if (ta) ta.placeholder = t || '';
      },

      focus: function () {
        var ta = _els.inner && _els.inner.querySelector('textarea');
        if (ta) ta.focus();
      },

      setStreaming: function (b) {
        _streaming = b;
        var send = _els.inner && _els.inner.querySelector('.btn-send');
        var stop = _els.inner && _els.inner.querySelector('.btn-stop');
        if (send) send.style.display = b ? 'none' : '';
        if (stop) stop.style.display = b ? '' : 'none';
      },

      // ── Content Parser 输出流 ──
      startOutput: startOutput,
      feedOutput: feedOutput,
      feedThinking: feedThinking,
      endOutput: endOutput,

      // ── 通知条 ──
      showNotification: function (text, options) {
        options = options || {};
        var duration = options.duration || 3000;
        var root = _els.root;
        if (!root) return;
        var t = document.createElement('div');
        t.className = 'chat-notification';
        t.textContent = text || '';
        t.style.cssText = 'position:absolute;left:50%;top:25%;transform:translate(-50%,-50%);'
          + 'background:rgba(40,40,40,0.92);color:#fff;padding:10px 20px;border-radius:8px;'
          + 'font-size:14px;z-index:1000;pointer-events:none;box-shadow:0 2px 12px rgba(0,0,0,0.3);'
          + 'opacity:0;transition:opacity 0.2s;';
        root.style.position = root.style.position || 'relative';
        root.appendChild(t);
        requestAnimationFrame(function () { t.style.opacity = '1'; });
        setTimeout(function () {
          t.style.opacity = '0';
          setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 250);
        }, duration);
      },

      // ── 兼容旧 showToast ──
      showToast: function (text, duration) {
        this.showNotification(text, { duration: duration || 2000 });
      },

      // ── Session 恢复 ──
      loadSession: loadSession,

      // ── 就地替换一张卡片（统一 mount 协议：透出 emit / getEl）──
      replaceCard: function (cardEl, type, data) {
        var def = _getType(type);
        if (!def) return null;
        var result = def.render(data);
        if (!result) return null;
        var wrap = cardEl && cardEl.parentNode;
        if (!wrap) return null;
        var tmp = document.createElement('div');
        tmp.innerHTML = result.html || '';
        var newCard = tmp.firstElementChild;
        if (!newCard) return null;
        wrap.replaceChild(newCard, cardEl);
        if (result.mount) {
          result.mount(newCard, { emit: emit, getEl: function (k) { return _els[k]; } });
        }
        if (typeof renderAll === 'function') renderAll(newCard);
        return newCard;
      },

      clearMessages: _clearMessages,

      addAttachments: function (files) {
        // 保留原逻辑
        if (!files || !files.length) return;
        Array.from(files).forEach(function (file) {
          var reader = new FileReader();
          reader.onload = function (e) {
            var dataUrl = e.target.result;
            _attachments.push({ name: file.name, dataUrl: dataUrl, fullImage: dataUrl });
            _renderAttachments();
          };
          reader.readAsDataURL(file);
        });
      },

      clearAttachments: function () {
        _attachments = [];
        _renderAttachments();
      },

      setAttachments: function (attachments) {
        _attachments = Array.isArray(attachments) ? attachments.slice() : [];
        _renderAttachments();
      },

      getAttachments: function () {
        return _attachments.slice();
      },
      openImagePreview: _openImagePreview,
      closeImagePreview: _closeImagePreview,
    };
    return _api;
  }

  // ── 静态方法：同步解析 assistant content（供只读预览等外部复用）──
  function parseAssistantContent(content) {
    var segments = [];
    var pattern = /(\/\*[\s\S]*?\*\/)|(```json[\s\S]*?```)/g;
    var lastIndex = 0, match;
    while ((match = pattern.exec(content)) !== null) {
      if (match.index > lastIndex) {
        var before = content.slice(lastIndex, match.index);
        if (before) segments.push({ type: 'text', content: before });
      }
      if (match[1]) {
        var inner = match[1].slice(2, -2);
        if (inner) segments.push({ type: 'text', content: inner });
      } else if (match[2]) {
        var jsonStr = match[2].slice(7, -3);
        try {
          var json = _normalizeStructuredJson(JSON.parse(jsonStr));
          if (json && json.type === 'question') {
            segments.push({ type: 'card', data: json });
          } else if (json && json.type && _getType(json.type)) {
            segments.push({ type: 'card', data: json });
          }
        } catch (e) {
          segments.push({ type: 'text', content: match[2] });
        }
      }
      lastIndex = pattern.lastIndex;
    }
    if (lastIndex < content.length) {
      var rest = content.slice(lastIndex);
      if (rest) segments.push({ type: 'text', content: rest });
    }
    var merged = [];
    for (var i = 0; i < segments.length; i++) {
      if (segments[i].type === 'text' && merged.length && merged[merged.length - 1].type === 'text') {
        merged[merged.length - 1].content += segments[i].content;
      } else {
        merged.push(segments[i]);
      }
    }
    return merged;
  }

  return { create: create, registerType: registerType, getType: _getType, isVisibleMessage: _isVisibleMessage, parseAssistantContent: parseAssistantContent };
})();
