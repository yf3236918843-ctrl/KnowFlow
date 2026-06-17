/**
 * views/test.js — 顺序做题视图（流式解析版）
 *
 * 后端只发原始 LLM 流（output），前端全权负责解析 `json 块并决定渲染方式。
 * 支持 Session 恢复：激活时自动检测未归档 session 并恢复聊天界面。
 *
 * 依赖：api.call / runPipeline / parseStream (from utils.js + client.js + mock.js)
 */

(function () {
  'use strict';

  let _chatArea = null;
  let _inputArea = null;
  let _messagesEl = null;
  let _sessionId = null;
  let _currentMsg = null;
  let _streaming = false;

  const view = {
    id: '顺序做题',
    title: '顺序做题',
    desc: '按序完成习题，AI 逐题讲解',
    icon: '✏️',

    activate() {
      _chatArea = document.getElementById('chatArea');
      _inputArea = document.querySelector('.input-area');
      if (!_chatArea || !_inputArea) return;

      // 1. 隐藏欢迎页，清空消息
      const welcome = document.getElementById('welcomeView');
      if (welcome) welcome.style.display = 'none';

      _messagesEl = _chatArea.querySelector('.messages');
      if (!_messagesEl) {
        _messagesEl = document.createElement('div');
        _messagesEl.className = 'messages';
        _chatArea.appendChild(_messagesEl);
      }
      _messagesEl.innerHTML = '';

      // 2. 激活输入栏
      const textarea = _inputArea.querySelector('textarea');
      const sendBtn = _inputArea.querySelector('.btn-send');
      if (textarea) {
        textarea.disabled = false;
        textarea.placeholder = '输入消息，回车发送';
        textarea.focus();
      }
      if (sendBtn) sendBtn.style.display = '';

      // 3. 显示收录/总结按钮
      const collectBtn = document.getElementById('btnCollect');
      const summaryBtn = document.getElementById('btnSummary');
      if (collectBtn) collectBtn.style.display = '';
      if (summaryBtn) summaryBtn.style.display = '';

      // 4. 更新 context bar
      Shell.setModeBadge('顺序做题');

      // 5. 绑定输入事件 + ⊕ 菜单
      _bindInput();
      _bindExtras();

      // 6. 开始做题
      _tryRestoreSession();
    },

    deactivate() {
      if (_messagesEl) _messagesEl.innerHTML = '';
      const textarea = _inputArea?.querySelector('textarea');
      if (textarea) textarea.disabled = true;

      const welcome = document.getElementById('welcomeView');
      if (welcome) welcome.style.display = '';

      Shell.setModeBadge('');
      _sessionId = null;
      _currentMsg = null;
      _streaming = false;
    },
  };


  // ── Session 恢复 ──────────────────────────
  async function _tryRestoreSession() {
    const res = await api.query('session.list', {});
    if (!res || !Array.isArray(res)) {
      _startExercise();
      return;
    }
    const exerciseSessions = res.filter(function(s) {
      return s.status === 'idle' || s.status === 'streaming' || s.status === 'completed';
    });
    if (exerciseSessions.length === 0) {
      _startExercise();
      return;
    }
    const latest = exerciseSessions.sort(function(a, b) { return (b.id || 0) - (a.id || 0); })[0];
    const sessionData = await api.query('session.get', { id: latest.id });
    if (!sessionData || !sessionData.messages) {
      _startExercise();
      return;
    }
    _sessionId = latest.id;
    _restoreMessages(sessionData.messages);
  }

  function _restoreMessages(messages) {
    const segments = parseMessages(messages);
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      if (seg.type === 'card') {
        _renderCard(seg.data);
      } else {
        _addBubble(seg.role === 'user' ? 'user' : 'ai', seg.html, true);
      }
    }
    if (typeof renderAll === 'function') renderAll(_messagesEl);
  }

  // ── 开始做题 ──────────────────────────────
  async function _startExercise() {
    _addSystemMsg('正在出题...');

    await runPipeline('exercise.start', {}, {
      question: (ev) => {
        _sessionId = ev.session_id;
        _addQuestion(ev);
      },
      error: (ev) => _addError(ev.message || '出题失败'),
      _error: (e) => _addError('出题异常: ' + e.message),
    });
  }

  // ── 发送消息 ──────────────────────────────
  async function _sendMessage(text) {
    if (!text.trim() || !_sessionId || _streaming) return;
    _streaming = true;
    _addBubble('user', escHtml(text));
    const aiBubble = _addBubble('ai', '');
    _currentMsg = aiBubble;
    const result = api.call('exercise.chat', {
      session_id: _sessionId,
      message: text,
    });
    const stream = result.stream;
    try {
      for await (const parsed of parseStream(stream)) {
        if (parsed.type === 'text') {
          _appendToBubble(aiBubble, parsed.content);
        } else if (parsed.type === 'json_end') {
          _renderCard(parsed.data);
        } else if (parsed.type === 'json_fail') {
          _appendToBubble(aiBubble, parsed.raw);
        } else if (parsed.type === 'error') {
          _addError(parsed.message || '对话失败');
        }
      }
    } catch (e) {
      _addError('对话异常: ' + e.message);
    }
    _currentMsg = null;
    _streaming = false;
  }

  function _addBubble(role, content, isHtml) {
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    if (role === 'ai' && !content) {
      bubble.innerHTML = '<span class="thinking-dots"><span></span><span></span><span></span></span>';
    } else if (role === 'user') {
      bubble.textContent = content;
    } else if (isHtml) {
      bubble.innerHTML = content;
    } else {
      bubble.innerHTML = renderMath(content);
    }
    div.appendChild(bubble);
    _messagesEl.appendChild(div);
    _scrollBottom();
    return bubble;
  }

  function _appendToBubble(bubbleEl, chunk) {
    const dots = bubbleEl.querySelector('.thinking-dots');
    if (dots) dots.remove();

    // 流式期间直接追加纯文本
    bubbleEl.insertAdjacentHTML('beforeend', escHtml(chunk));
    _scrollBottom();
  }

  /** 流式完成后，用完整内容重渲染（支持粗体等格式） */
  /** 将纯文本格式化为 HTML：**粗体**、段落、列表 */
  function _addSystemMsg(text) {
    const div = document.createElement('div');
    div.className = 'msg system';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = text;
    div.appendChild(bubble);
    _messagesEl.appendChild(div);
    _scrollBottom();
  }

  function _addQuestion(ev) {
    const div = document.createElement('div');
    div.className = 'msg system';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble exercise-quote';
    bubble.innerHTML =
      `<div style="font-weight:600;color:var(--accent);margin-bottom:4px;">📖 ${escHtml(ev.label || '')}</div>
       ${renderMath(escHtml(ev.content || ''))}`;
    div.appendChild(bubble);
    _messagesEl.appendChild(div);
    _scrollBottom();
  }

  // ── 错题本草稿卡片 ────────────────────────────
  function _renderCard(data) {
    if (!data || !data.type) return;
    switch (data.type) {
      case 'action_set':
        _addPrefCard(data);
        break;
      case 'collect_draft':
        _addDraftCard(data);
        break;
      case 'summary':
        _addSummaryCard(data);
        break;
    }
  }

  function _addPrefCard(data) {
    const div = document.createElement('div');
    div.className = 'msg system';
    const card = document.createElement('div');
    card.className = 'msg-bubble draft-card';
    const actions = data.actions || [];
    const reasoning = data.meta_reasoning || '';
    const actionLabels = {
      insert: { icon: '➕', label: '新增' },
      update: { icon: '🔄', label: '更新' },
      delete: { icon: '🗑', label: '删除' },
      increment: { icon: '📈', label: '强化' },
      mark_signal: { icon: '📌', label: '标记' },
    };
    const items = actions.map(function (a) {
      const info = actionLabels[a.action] || { icon: '❓', label: a.action };
      const rule = a.entry && a.entry.rule ? a.entry.rule : (a.reason || '');
      return '<div class="draft-item">' +
        '<div style="display:flex;gap:6px;align-items:flex-start;">' +
        '<span style="flex-shrink:0;">' + info.icon + '</span>' +
        '<div style="flex:1;">' +
        '<div style="font-size:13px;">' + escHtml(rule) + '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">' + info.label + ' · ' + (a.reason || '') + '</div>' +
        '</div></div></div>';
    }).join('');
    card.innerHTML = '<div class="draft-title">🧠 偏好分析结果</div>' +
      (reasoning ? '<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;line-height:1.5;">' + escHtml(reasoning) + '</div>' : '') +
      '<div style="font-size:12px;font-weight:600;color:var(--accent);margin-bottom:6px;">待确认的偏好变更（' + actions.length + ' 项）</div>' +
      items;
    div.appendChild(card);
    _messagesEl.appendChild(div);
    _scrollBottom();
  }

  function _addDraftCard(ev) {
    const div = document.createElement('div');
    div.className = 'msg system';

    const card = document.createElement('div');
    card.className = 'msg-bubble draft-card';

    const items = Array.isArray(ev.items) ? ev.items : [];
    const masteryColor = (m) => {
      // mastery 三档: 0 完全不会 / 20 引导才懂 / 45 一点就通
      if (m <= 0) return '#d4665a';
      if (m < 30) return '#c9a87c';
      return '#5a9b6a';
    };
    const masteryPct = (m) => Math.min(100, Math.max(0, Math.round((m / 45) * 100)));

    card.innerHTML = `
      <div class="draft-title">📝 薄弱点收录草稿</div>
      ${items.map(it => `
        <div class="draft-item">
          <div><strong>${escHtml(it.title || '')}</strong></div>
          <div style="font-size:12px;color:var(--text-muted);">${escHtml(it.detail || '')}</div>
          <div class="d-mastery-bar" style="background:var(--border-default);">
            <div style="height:100%;width:${masteryPct(it.mastery || 0)}%;background:${masteryColor(it.mastery || 0)};border-radius:2px;"></div>
          </div>
          ${(it.types && it.types.length) ? `<div class="d-type">${escHtml(it.types.join(' / '))}</div>` : ''}
        </div>
      `).join('')}
      <div class="draft-btns">
        <button class="draw-btn draw-insert">确认收录</button>
      </div>
    `;

    div.appendChild(card);
    _messagesEl.appendChild(div);
    _scrollBottom();
  }

  // ── 学习总结卡片 ───────────────────────────────
  function _addSummaryCard(ev) {
    const div = document.createElement('div');
    div.className = 'msg system';

    const card = document.createElement('div');
    card.className = 'msg-bubble summary-card';

    const resultColor = ev.result === '正确' ? '#5a9b6a'
      : ev.result === '错误' ? '#d4665a'
      : '#c9a87c';

    card.innerHTML = `
      <div class="sc-header">
        📊 学习总结
        <span class="sc-result" style="color:${resultColor};font-weight:600;">${escHtml(ev.result || '')}</span>
        <span class="sc-arrow">▼</span>
      </div>
      <div class="sc-preview">${escHtml((ev.summary || '').slice(0, 50))}${ev.summary && ev.summary.length > 50 ? '...' : ''}</div>
      <div class="sc-body" style="display:none;margin-top:10px;font-size:13px;color:var(--text-secondary);line-height:1.6;">
        ${escHtml(ev.summary || '')}
      </div>
    `;

    // 点击展开/收起
    card.addEventListener('click', () => {
      const body = card.querySelector('.sc-body');
      const arrow = card.querySelector('.sc-arrow');
      if (body.style.display === 'none') {
        body.style.display = '';
        arrow.textContent = '▲';
      } else {
        body.style.display = 'none';
        arrow.textContent = '▼';
      }
    });

    div.appendChild(card);
    _messagesEl.appendChild(div);
    _scrollBottom();
  }

  function _addError(msg) {
    const div = document.createElement('div');
    div.className = 'msg system';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.style.cssText = 'color:var(--error) !important;border:1px solid rgba(212,102,90,0.3);';
    bubble.textContent = '⚠ ' + msg;
    div.appendChild(bubble);
    _messagesEl.appendChild(div);
    _scrollBottom();
  }

  function _scrollBottom() {
    if (_chatArea) _chatArea.scrollTop = _chatArea.scrollHeight;
  }

  function escHtml(str) {
    if (str == null) return '';
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  }

  // ── ⊕ 菜单 ──────────────────────────────
  function _bindExtras() {
    const trigger = document.getElementById('ieTrigger');
    const menu = document.getElementById('ieMenu');
    if (!trigger || !menu) return;

    // 注册菜单项
    const items = [
      { id: 'collect', icon: '📝', label: '收录', handler: _triggerCollect },
      { id: 'summary', icon: '📊', label: '总结', handler: _triggerSummary },
      { id: 'preference', icon: '🧠', label: '偏好分析', handler: _triggerPreference },
      { id: 'draw', icon: '✏️', label: '画图', handler: () => showToast('画图（待实现）') },
      { id: 'image', icon: '📷', label: '拍照', handler: () => document.getElementById('imageInput')?.click() },
      { id: 'voice', icon: '🎤', label: '语音', handler: () => showToast('语音（待实现）') },
    ];

    function renderMenu() {
      menu.innerHTML = '<div class="ie-grid">' +
        items.map(it =>
          `<button class="ie-item" data-ext="${it.id}">
            <span class="ie-icon">${it.icon}</span>
            <span class="ie-label">${it.label}</span>
          </button>`
        ).join('') + '</div>';
    }

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      renderMenu();
      menu.classList.toggle('open');
    });

    menu.addEventListener('click', (e) => {
      const btn = e.target.closest('.ie-item');
      if (!btn) return;
      const id = btn.dataset.ext;
      const item = items.find(i => i.id === id);
      if (item) {
        menu.classList.remove('open');
        item.handler();
      }
    });

    document.addEventListener('click', (e) => {
      const wrap = document.getElementById('inputExtras');
      if (wrap && !wrap.contains(e.target)) menu.classList.remove('open');
    });
  }

  // ── 偏好分析（注册 mock handler） ─────────────
  async function _triggerPreference() {
    if (!_sessionId) return showToast('请先开始做题');
    const bubble = _addBubble('ai', '');
    const result = api.call('exercise.preference', { session_id: _sessionId });
    const stream = result.stream;
    try {
      for await (const parsed of parseStream(stream)) {
        if (parsed.type === 'text') {
          _appendToBubble(bubble, parsed.content);
        } else if (parsed.type === 'json_end') {
          _renderCard(parsed.data);
        } else if (parsed.type === 'json_fail') {
          _appendToBubble(bubble, parsed.raw);
        } else if (parsed.type === 'error') {
          _addError(parsed.message || '偏好分析失败');
        }
      }
    } catch (e) {
      _addError('偏好分析异常: ' + e.message);
    }
  }

  /** 从文本中提取第一个 ```json ... ``` 块 */
  /** 渲染偏好卡片内部项 */
  async function _triggerCollect() {
    if (!_sessionId) return showToast('请先开始做题');
    _addSystemMsg('正在分析薄弱点...');
    const result = api.call('exercise.collect', { session_id: _sessionId });
    const stream = result.stream;
    try {
      for await (const parsed of parseStream(stream)) {
        if (parsed.type === 'json_end') {
          _renderCard(parsed.data);
        } else if (parsed.type === 'error') {
          _addError(parsed.message || '收录失败');
        }
      }
    } catch (e) {
      _addError('收录异常: ' + e.message);
    }
  }

  async function _triggerSummary() {
    if (!_sessionId) return showToast('请先开始做题');
    _addSystemMsg('正在生成总结...');
    const result = api.call('exercise.summary', {
      session_id: _sessionId, question_id: 1,
    });
    const stream = result.stream;
    try {
      for await (const parsed of parseStream(stream)) {
        if (parsed.type === 'json_end') {
          _renderCard(parsed.data);
        } else if (parsed.type === 'next_question') {
          if (parsed.session_id) _sessionId = parsed.session_id;
          _addQuestion(parsed);
        } else if (parsed.type === 'result') {
          if (parsed.message) _addSystemMsg(parsed.message);
        } else if (parsed.type === 'error') {
          _addError(parsed.message || '总结失败');
        }
      }
    } catch (e) {
      _addError('总结异常: ' + e.message);
    }
  }

  function _bindInput() {
    const textarea = _inputArea?.querySelector('textarea');
    const sendBtn = _inputArea?.querySelector('.btn-send');

    if (!textarea || !sendBtn) return;

    // 防重复绑定
    if (textarea._bound) return;
    textarea._bound = true;

    function send() {
      const text = textarea.value.trim();
      if (!text) return;
      textarea.value = '';
      textarea.style.height = 'auto';
      _sendMessage(text);
    }

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });

    sendBtn.addEventListener('click', send);

    // 内联收录/总结按钮也走同样的 handler
    document.getElementById('btnCollect')?.addEventListener('click', _triggerCollect);
    document.getElementById('btnSummary')?.addEventListener('click', _triggerSummary);
  }

  // ── 注册 ──────────────────────────────────
  App.registry.register('view', '顺序做题', view);
})();
