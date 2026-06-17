(function () {
  'use strict';

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj || {}));
  }

  function truncate(text, limit) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    if (text.length <= limit) return text;
    return text.slice(0, limit) + '...';
  }

  function summaryBody(summary) {
    if (!summary) return '暂无总结';
    if (typeof summary === 'string') return summary;
    return summary.summary || summary.content || JSON.stringify(summary, null, 2);
  }

  function buildChatRequestPayload(input) {
    input = input || {};
    return {
      session_id: input.session_id,
      message: input.message || '',
      attachments: (input.attachments || []).map(function (item, index) {
        return {
          id: item.id || ('img_' + (index + 1)),
          name: item.name || ('image-' + (index + 1) + '.png'),
          dataUrl: item.fullImage || item.dataUrl || '',
          preview: item.dataUrl || item.fullImage || '',
          bounds: clone(item.bounds || {}),
        };
      }),
    };
  }

  function buildOcrCardData(round) {
    round = round || {};
    return {
      role: 'assistant',
      type: 'ocr_batch',
      items: (round.items || []).map(function (item) { return clone(item); }),
      user_text: round.text || '',
      show_continue: !!round.continueEnabled,
    };
  }

  function buildInputExtras(mode, options) {
    options = options || {};
    var hasSummary = !!options.hasSummary;
    var collectAction = mode === 'collect'
      ? { icon: '🎓', label: '教师模式', action: 'continue' }
      : { icon: '📓', label: '收录错题', action: 'collect' };
    var preferenceAction = mode === 'preference'
      ? { icon: '🎓', label: '教师模式', action: 'continue' }
      : { icon: '🧠', label: '生成偏好', action: 'preference' };
    return [
      { icon: '✏️', label: '手写画图', action: 'draw' },
      collectAction,
      { icon: '📝', label: '总结本题', action: 'summary', disabled: hasSummary },
      preferenceAction,
    ];
  }

  function resolveModeFromUiState(uiState) {
    var mode = uiState && uiState.current_mode;
    return (mode === 'collect' || mode === 'preference') ? mode : 'teacher';
  }

  function buildModeUiState(mode) {
    return { current_mode: resolveModeFromUiState({ current_mode: mode }) };
  }

  function stripOuterQuotes(text) {
    text = String(text || '').trim();
    if (!text) return '';
    if ((text[0] === '"' && text[text.length - 1] === '"') || (text[0] === "'" && text[text.length - 1] === "'")) {
      return text.slice(1, -1).trim();
    }
    return text;
  }

  function normalizeQuestionText(text) {
    return stripOuterQuotes(String(text || ''))
      .replace(/\s+/g, ' ')
      .replace(/\s*([，。；：！？])\s*/g, '$1')
      .trim();
  }

  function buildQuestionPreview(text) {
    var normalized = normalizeQuestionText(text);
    if (!normalized) return '';
    var numberMatch = normalized.match(/^(\d+[\.、])\s*/);
    var prefix = numberMatch ? numberMatch[1] + ' ' : '';
    var body = numberMatch ? normalized.slice(numberMatch[0].length) : normalized;
    var askIndex = body.indexOf('求：');
    if (askIndex < 0) askIndex = body.indexOf('求:');
    if (askIndex < 0) return truncate(prefix + body, 42);

    var before = body.slice(0, askIndex).trim().replace(/[，。；：]+$/g, '');
    before = before.replace(/，?\s*其中[^，。；]*$/g, '').trim();
    var after = body.slice(askIndex + 2).trim();
    if (!after) return truncate(prefix + before, 42);

    var count = after.split(/\s*,\s*|、|；|;/).map(function (part) {
      return part.trim();
    }).filter(Boolean).length;
    if (!count) return truncate(prefix + before, 42);
    return (prefix + before + ' · 求 ' + count + ' 项').trim();
  }

  function buildQuestionProtocolMessage(content) {
    return '```json\n' + JSON.stringify({
      type: 'question',
      content: String(content || ''),
    }) + '\n```';
  }

  function buildRestoreMessages(messages, entryQuestion) {
    var list = Array.isArray(messages) ? messages.slice() : [];
    if (!entryQuestion || !entryQuestion.content) return list;
    var alreadyHasQuestion = list.some(function (msg) {
      if (!msg || msg.role !== 'assistant' || typeof msg.content !== 'string') return false;
      return msg.content.indexOf('"type":"question"') >= 0 || msg.content.indexOf('"question"') >= 0;
    });
    if (alreadyHasQuestion) return list;
    return [{
      role: 'assistant',
      content: buildQuestionProtocolMessage(entryQuestion.content),
    }].concat(list);
  }

  var createExerciseView = ViewManager.registerView('exercise', {
    create: function (args) {
      var chat = ChatView.create();
      var state = {
        session_id: null,
        project_id: (args && args.project_id) || null,
        bank_id: (args && args.bank_id) || 2,
        group_id: (args && args.group_id) || null,
        path: null,
        questions: [],
        currentIdx: 0,
        questionSeq: 0,
        streaming: false,
        mode: 'teacher',
        navigator: { items: [], loading: false, open: false },
        activeSummary: null,
        drawAttachment: null,
        ocrRound: null,
        hasSummary: false,
      };

      function createOcrRound(text, attachments) {
        return {
          text: text || '',
          items: (attachments || []).map(function (item, index) {
            return {
              image_id: item.id || ('img_' + (index + 1)),
              index: index + 1,
              name: item.name || ('image-' + (index + 1) + '.png'),
              preview: item.dataUrl || item.preview || '',
              dataUrl: item.fullImage || item.dataUrl || '',
              thinking: '',
              output: '',
              failed: false,
              error_message: '',
              done: false,
            };
          }),
          continueEnabled: false,
          cardEl: null,
        };
      }

      function renderOcrRound(round) {
        if (!round) return;
        var data = buildOcrCardData(round);
        if (!round.cardEl) {
          round.cardEl = chat.appendMessage('ocr_batch', data);
          return;
        }
        round.cardEl = chat.replaceCard(round.cardEl, 'ocr_batch', data) || round.cardEl;
      }

      function findOcrItem(imageId) {
        if (!state.ocrRound) return null;
        return state.ocrRound.items.find(function (item) {
          return String(item.image_id) === String(imageId);
        }) || null;
      }

      function refreshOcrContinue() {
        if (!state.ocrRound) return;
        state.ocrRound.continueEnabled = state.ocrRound.items.some(function (item) {
          return item.failed;
        });
      }

      function setPath(path) {
        state.path = path || null;
        if (path && path.project && path.bank && path.group) {
          state.project_id = path.project.id || state.project_id;
          state.bank_id = path.bank.id || state.bank_id;
          state.group_id = path.group.id || state.group_id;
          if (window.AppShell && typeof window.AppShell.setExerciseTarget === 'function') {
            window.AppShell.setExerciseTarget({
              project_id: state.project_id,
              bank_id: state.bank_id,
              group_id: state.group_id,
            });
          }
        }
        renderShellContext();
      }

      function currentQuestion() {
        return state.questions[state.currentIdx] || null;
      }

      function questionKeyFrom(q) {
        if (!q) return '';
        if (q.real_id != null) return 'qid:' + String(q.real_id);
        return 'content:' + String(q.content || '').replace(/\s+/g, ' ').trim();
      }

      function addQuestion(q) {
        if (!q || !q.content) return;
        var key = questionKeyFrom(q);
        var existingIdx = state.questions.findIndex(function (item) {
          return questionKeyFrom(item) === key;
        });
        if (existingIdx >= 0) {
          state.questions[existingIdx].domRef = q.domRef || state.questions[existingIdx].domRef;
          state.currentIdx = existingIdx;
          renderSessionBanner();
          return;
        }
        state.questions.push(q);
        state.currentIdx = state.questions.length - 1;
        renderSessionBanner();
      }

      function navTo(idx) {
        if (idx < 0 || idx >= state.questions.length) return;
        state.currentIdx = idx;
        renderSessionBanner();
      }

      function scrollToQuestion(idx) {
        var q = state.questions[idx];
        if (!q) return;
        var target = q.domRef;
        if (!target) {
          target = document.querySelector('.chat-view .messages .msg.user') || document.querySelector('.chat-view .messages .msg.ai');
        }
        if (target && target.scrollIntoView) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }

      function renderSessionBanner() {
        var q = currentQuestion();
        if (!q) {
          chat.setSlotHTML('banner', null);
          renderShellContext();
          return;
        }
        var projectName = state.path && state.path.project ? state.path.project.name : '未绑定项目';
        var bankName = state.path && state.path.bank ? state.path.bank.name : '题库';
        var groupName = state.path && state.path.group ? state.path.group.name : '题组';
        var number = state.path && state.path.question ? (state.path.question.number || '?') : (q.label || '?');
        var total = state.questions.length;
        var currentIndex = state.currentIdx + 1;
        var idxLabel = currentIndex + '/' + total;
        var summaryHtml = renderMath(esc(buildQuestionPreview(q.content || '')));

        renderShellContext({
          projectName: projectName,
          bankName: bankName,
          groupName: groupName,
          questionNumber: number,
          indexLabel: idxLabel,
          canOpenNavigator: true,
        });

        var html = ''
          + '<div class="qn-wrap">'
          + '  <div class="qn-card" role="button" tabindex="0" aria-label="定位到当前题目">'
          + '    <div class="qn-summary">' + summaryHtml + '</div>'
          + '  </div>'
          + '</div>';

        chat.setSlotHTML('banner', html, function (el) {
          var card = el.querySelector('.qn-card');
          if (!card) return;
          card.dataset.questionIndex = String(currentIndex);
          card.dataset.questionTotal = String(total);
          var wheelLocked = false;
          var touchStartX = 0;
          var touchStartY = 0;

          card.addEventListener('click', function () {
            scrollToQuestion(state.currentIdx);
          });
          card.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              scrollToQuestion(state.currentIdx);
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault();
              navTo(state.currentIdx - 1);
            } else if (event.key === 'ArrowRight') {
              event.preventDefault();
              navTo(state.currentIdx + 1);
            }
          });
          card.addEventListener('wheel', function (event) {
            if (wheelLocked || total <= 1) return;
            var delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
            if (Math.abs(delta) < 12) return;
            event.preventDefault();
            wheelLocked = true;
            navTo(delta > 0 ? (state.currentIdx + 1) : (state.currentIdx - 1));
            setTimeout(function () { wheelLocked = false; }, 300);
          }, { passive: false });
          card.addEventListener('touchstart', function (event) {
            if (!event.touches || !event.touches.length) return;
            touchStartX = event.touches[0].clientX;
            touchStartY = event.touches[0].clientY;
          }, { passive: true });
          card.addEventListener('touchend', function (event) {
            if (!event.changedTouches || !event.changedTouches.length || total <= 1) return;
            var dx = event.changedTouches[0].clientX - touchStartX;
            var dy = event.changedTouches[0].clientY - touchStartY;
            if (Math.abs(dx) < 36 || Math.abs(dx) < Math.abs(dy)) return;
            navTo(dx < 0 ? (state.currentIdx + 1) : (state.currentIdx - 1));
          }, { passive: true });
        });
      }

      function renderShellContext(opts) {
        if (!window.Shell) return;
        var data = opts || {};
        if (!data.projectName && state.path && state.path.project) {
          data.projectName = state.path.project.name;
          data.bankName = state.path && state.path.bank ? state.path.bank.name : '题库';
          data.groupName = state.path && state.path.group ? state.path.group.name : '题组';
          data.questionNumber = state.path && state.path.question ? (state.path.question.number || '?') : '?';
          data.indexLabel = data.indexLabel || ((state.currentIdx + 1) + '/' + Math.max(state.questions.length, 1));
          data.canOpenNavigator = true;
        }
        if (!data.projectName) {
          Shell.setTitle('顺序做题');
          Shell.setMeta('');
          Shell.clearActions();
          return;
        }
        Shell.setTitle(
          '<span class="crumb">' + esc(data.projectName) + '</span>'
          + '<span class="crumb-sep">/</span>'
          + '<span class="crumb">' + esc(data.bankName || '题库') + '</span>'
          + '<span class="crumb-sep">/</span>'
          + '<span class="crumb">' + esc(data.groupName || '题组') + '</span>'
          + '<span class="crumb-sep">/</span>'
          + '<span class="crumb current">第 ' + esc(data.questionNumber || '?') + ' 题</span>'
        );
        Shell.setMeta('');
        Shell.setActions(
          '<span class="ctx-chip">' + esc(data.indexLabel || '') + '</span>'
          + '<button class="ctx-chip-btn ctx-chip-strong" data-open-nav="1">题目导航</button>',
          function (root) {
            var btn = root.querySelector('[data-open-nav="1"]');
            if (btn) {
              btn.addEventListener('click', function () {
                openNavigator();
              });
            }
          }
        );
      }

      function navigatorGroups() {
        var items = state.navigator.items || [];
        var currentQuestion = currentQuestionId();
        var groupsMap = {};
        var order = [];
        items.forEach(function (item) {
          var key = String(item.group_id || 'ungrouped');
          if (!groupsMap[key]) {
            groupsMap[key] = {
              id: key,
              group_id: item.group_id,
              name: item.group_name || '未命名题组',
              items: [],
            };
            order.push(key);
          }
          groupsMap[key].items.push(item);
        });
        return order.map(function (key) {
          var group = groupsMap[key];
          group.done = group.items.filter(function (item) { return !!item.has_summary; }).length;
          group.current = group.items.some(function (item) {
            return Number(item.question_id) === Number(currentQuestion);
          });
          return group;
        });
      }

      function currentQuestionId() {
        var q = currentQuestion();
        return q && q.real_id != null ? Number(q.real_id) : null;
      }

      function loadNavigator() {
        if (!state.project_id || !state.bank_id) return Promise.resolve();
        state.navigator.loading = true;
        return api.query('question.navigator', {
          project_id: state.project_id,
          bank_id: state.bank_id,
        }).then(function (data) {
          if (data && data.ok === false) throw new Error(data.error || '加载题目导航失败');
          state.navigator.items = (data && data.items) || [];
          state.navigator.loading = false;
        }).catch(function (err) {
          state.navigator.loading = false;
          chat.showNotification(err.message || '加载题目导航失败', { type: 'error' });
        });
      }

      function refreshNavigator() {
        return loadNavigator().then(function () {
          renderSessionBanner();
        });
      }

      function navigatorHtml() {
        if (state.navigator.loading) {
          return '<div style="text-align:center;padding:40px;color:var(--text-muted)"><div class="thinking-dots"><span></span><span></span><span></span></div></div>';
        }
        if (!state.navigator.items.length) {
          return '<div class="sidebar-empty">当前题库暂无导航数据。</div>';
        }
        return navigatorGroups().map(function (group) {
          var open = group.current ? ' open' : '';
          var arrow = group.current ? ' open' : '';
          var pct = group.items.length ? Math.round(group.done / group.items.length * 100) : 0;
          return ''
            + '<div class="grp-item">'
            + '  <div class="grp-header' + (group.current ? ' current' : '') + '" data-toggle-nav-group="' + esc(group.id) + '">'
            + '    <span class="grp-arrow' + arrow + '">&#9654;</span>'
            + '    <span class="grp-label">' + esc(group.name) + '</span>'
            + '    <span class="grp-progress">' + group.done + '/' + group.items.length + ' · ' + pct + '%</span>'
            + '  </div>'
            + '  <div class="grp-body' + open + '">'
            +      group.items.map(function (item) {
              var cls = 'q-pend';
              if (Number(item.question_id) === Number(currentQuestionId())) cls = 'q-cur';
              else if (item.has_summary) cls = 'q-done';
              var prefix = item.has_summary ? '&#10003; ' : '';
              return '<span class="grp-q ' + cls + '" data-nav-question="' + item.question_id + '">' + prefix + '#' + esc(item.question_number || '?') + ' ' + renderMath(esc(truncate(item.question_content, 32))) + '</span>';
            }).join('')
            + '  </div>'
            + '</div>';
        }).join('');
      }

      function bindNavigator() {
        var panel = document.querySelector('[data-nav-panel="1"]');
        if (!panel) return;
        panel.querySelectorAll('[data-toggle-nav-group]').forEach(function (el) {
          el.addEventListener('click', function () {
            var body = el.nextElementSibling;
            var arrow = el.querySelector('.grp-arrow');
            if (!body) return;
            body.classList.toggle('open');
            if (arrow) arrow.classList.toggle('open');
          });
        });
        panel.querySelectorAll('[data-nav-question]').forEach(function (el) {
          el.addEventListener('click', function () {
            var qid = parseInt(el.getAttribute('data-nav-question'), 10);
            var item = state.navigator.items.find(function (it) { return Number(it.question_id) === Number(qid); });
            openNavigatorQuestion(item);
          });
        });
      }

      function openNavigator() {
        loadNavigator().then(function () {
          state.navigator.open = true;
          if (!window.Shell || typeof window.Shell.openPanel !== 'function') {
            chat.showNotification('当前页面不支持题目导航面板', { type: 'error' });
            return;
          }
          Shell.openPanel({
            title: '题目导航',
            bodyHtml: navigatorHtml(),
            panelClass: 'nav-history-panel',
            onMount: function (panelRoot) {
              panelRoot.setAttribute('data-nav-panel', '1');
              bindNavigator();
              if (typeof renderAll === 'function') renderAll(panelRoot);
            },
            onClose: function () {
              state.navigator.open = false;
            },
          });
        });
      }

      function closeNavigator() {
        state.navigator.open = false;
        if (window.Shell && typeof window.Shell.closePanel === 'function') {
          Shell.closePanel();
        }
      }

      function openSummary(item) {
        state.activeSummary = item;
        var root = document.querySelector('.chat-view');
        if (!root) return;
        var overlay = document.createElement('div');
        overlay.className = 'qd-overlay open';
        overlay.innerHTML = ''
          + '<div class="qd-modal">'
          + '  <div class="qd-head">'
          + '    <div class="qd-title">第 ' + esc(item.question_number || '?') + ' 题总结</div>'
          + '    <button class="qd-close" data-close-summary="1">×</button>'
          + '  </div>'
          + '  <div class="qd-scroll">'
          + '    <div class="qd-section">'
          + '      <div class="qd-label">题目</div>'
          + '      <div class="qd-content">' + esc(item.question_content || '') + '</div>'
          + '    </div>'
          + '    <div class="qd-section">'
          + '      <div class="qd-label">总结</div>'
          + '      <div class="qd-content">' + renderMath(esc(summaryBody(item.summary))) + '</div>'
          + '    </div>'
          + '  </div>'
          + '</div>';
        root.appendChild(overlay);
        overlay.addEventListener('click', function (event) {
          if (event.target === overlay || event.target.closest('[data-close-summary="1"]')) {
            closeSummary();
          }
        });
        if (typeof renderAll === 'function') renderAll(overlay);
      }

      function closeSummary() {
        state.activeSummary = null;
        var overlay = document.querySelector('.qd-overlay');
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }

      function updatePathFromQuestion(questionId, fallbackPath) {
        if (fallbackPath) setPath(fallbackPath);
        if (!questionId) return Promise.resolve();
        return api.query('question.path', { id: questionId }).then(function (data) {
          if (data && data.ok === false) return;
          setPath(data);
          renderSessionBanner();
        }).catch(function () {});
      }

      function rebuildQuestionsFromMessages(messages, entryQuestion) {
        state.questions = [];
        state.currentIdx = 0;
        state.questionSeq = 0;

        if (entryQuestion && entryQuestion.content) {
          addQuestion(entryQuestion);
        }

        (messages || []).forEach(function (msg) {
          if (msg.role !== 'assistant' || typeof msg.content !== 'string') return;
          var segments = ChatView.parseAssistantContent(msg.content || '');
          segments.forEach(function (seg) {
            if (seg.type !== 'card' || !seg.data || seg.data.type !== 'question') return;
            state.questionSeq += 1;
            addQuestion({
              id: 'q_restore_' + state.questionSeq,
              content: seg.data.content || '',
              source: 'AI',
              domRef: null,
            });
          });
        });
      }

      function syncSidebarSession(event) {
        if (!window.AppShell || typeof window.AppShell.upsertSessionItem !== 'function') return false;
        var path = event.path || state.path || {};
        var project = path.project || {};
        var bank = path.bank || {};
        var group = path.group || {};
        var question = path.question || {};
        return window.AppShell.upsertSessionItem({
          session_id: event.session_id || state.session_id,
          project_id: project.id || state.project_id,
          bank_id: bank.id || state.bank_id,
          group_name: group.name || '',
          bank_name: bank.name || '',
          project_name: project.name || '',
          group_id: group.id || state.group_id,
          question_id: question.id || event.question_id || null,
          question_number: question.number || event.label || '',
          question_content: event.content || '',
          created_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        });
      }

      function startExercise() {
        closeNavigator();
        closeSummary();
        chat.clearMessages();
        state.questions = [];
        state.currentIdx = 0;
        state.questionSeq = 0;
        chat.appendMessage('text', { role: 'assistant', content: '正在加载题目...' });
        var payload = {};
        if (state.project_id) payload.project_id = state.project_id;
        if (state.bank_id) payload.bank_id = state.bank_id;
        if (state.group_id) payload.group_id = state.group_id;
        if (args && args.question_id) payload.question_id = args.question_id;

        var stream = api.call('exercise.start', payload).stream;
        consumeStream(stream, function (event) {
          if (event.type === 'question') {
            state.session_id = event.session_id;
            chat.clearMessages();
            setPath(event.path || null);
            state.questions = [{
              id: 'q_' + (event.question_id || 'start'),
              real_id: event.question_id,
              label: event.label || '',
              content: event.content || '',
              source: '题库',
              domRef: null,
            }];
            state.currentIdx = 0;
            renderSessionBanner();
            refreshNavigator();
            chat.loadSession([{
              role: 'assistant',
              content: buildQuestionProtocolMessage(event.content || ''),
            }, {
              role: 'assistant',
              content: '题目已加载，请输入你的答案开始。',
            }], { uiState: {} });
            try {
              var url = new URL(location.href);
              url.searchParams.set('session_id', event.session_id);
              history.pushState({}, '', url);
            } catch (e) {}
            if (!syncSidebarSession(event) && typeof window._reloadSessions === 'function') window._reloadSessions();
          } else if (event.type === 'error') {
            chat.showNotification('加载失败: ' + (event.message || '未知错误'), { type: 'error' });
          } else if (event.type === 'result' && event.message) {
            chat.clearMessages();
            chat.showNotification(event.message);
          }
        });
      }

      function sendMessage(text) {
        if (state.streaming) return;
          if (!state.session_id) {
            chat.showNotification('请先加载题目', { type: 'error' });
            return;
        }
        var entryQ = state.questions[0];
        if (!entryQ) return;

        var attachments = typeof chat.getAttachments === 'function' ? chat.getAttachments() : [];
        if (attachments.length) {
          state.ocrRound = createOcrRound(text, attachments);
          renderOcrRound(state.ocrRound);
        } else {
          state.ocrRound = null;
          chat.appendMessage('text', { role: 'user', content: text });
        }

        state.streaming = true;
        chat.setStreaming(true);

        var stream = api.call('exercise.chat', buildChatRequestPayload({
          session_id: state.session_id,
          message: text,
          attachments: attachments,
        })).stream;
        chat.startOutput();
        consumeStream(stream, function (event) {
          if (event.type === 'image_task_started') {
            var started = findOcrItem(event.image_id);
            if (started) {
              started.preview = event.preview || started.preview;
              renderOcrRound(state.ocrRound);
            }
          } else if (event.type === 'image_think') {
            var thinkItem = findOcrItem(event.image_id);
            if (thinkItem) {
              thinkItem.thinking += event.content || '';
              renderOcrRound(state.ocrRound);
            }
          } else if (event.type === 'image_output') {
            var outputItem = findOcrItem(event.image_id);
            if (outputItem) {
              outputItem.output += event.content || '';
              outputItem.failed = false;
              outputItem.error_message = '';
              renderOcrRound(state.ocrRound);
            }
          } else if (event.type === 'image_done') {
            var doneItem = findOcrItem(event.image_id);
            if (doneItem) {
              doneItem.done = true;
              renderOcrRound(state.ocrRound);
            }
          } else if (event.type === 'image_error') {
            var errorItem = findOcrItem(event.image_id);
            if (errorItem) {
              errorItem.failed = true;
              errorItem.error_message = event.message || '图转文失败';
              refreshOcrContinue();
              renderOcrRound(state.ocrRound);
            }
          } else if (event.type === 'output') chat.feedOutput(event.content);
          else if (event.type === 'think') chat.feedThinking(event.content);
          else if (event.type === 'error') {
            chat.endOutput();
            chat.showNotification('错误: ' + (event.message || ''), { type: 'error' });
            state.streaming = false;
            chat.setStreaming(false);
          }
        }, function () {
          chat.endOutput();
          state.streaming = false;
          chat.setStreaming(false);
          if (typeof chat.clearAttachments === 'function') chat.clearAttachments();
        });
      }

      function collectWeaknesses() {
        if (!state.session_id || state.streaming) return;
        state.streaming = true;
        chat.setStreaming(true);
        var outputBuf = '';
        if (state.mode !== 'collect') {
          state.mode = 'collect';
          refreshInputExtras();
          persistModeState();
          switchRole('weakness_diagnostician');
          chat.showNotification('已进入错题收录模式');
        }
        var stream = api.call('exercise.collect', { session_id: state.session_id }).stream;
        chat.startOutput();
        consumeStream(stream, function (event) {
          if (event.type === 'output') {
            outputBuf += event.content || '';
            chat.feedOutput(event.content);
          } else if (event.type === 'think') {
            chat.feedThinking(event.content);
          } else if (event.type === 'error') {
            chat.endOutput();
            chat.showNotification('收录失败: ' + (event.message || ''), { type: 'error' });
            state.streaming = false;
            chat.setStreaming(false);
          }
        }, function () {
          checkEmptyResult(outputBuf, '未检测到新的薄弱点');
          state.streaming = false;
          chat.setStreaming(false);
        });
      }

      function preferenceAnalysis() {
        if (!state.session_id || state.streaming) return;
        state.streaming = true;
        chat.setStreaming(true);
        var outputBuf = '';
        if (state.mode !== 'preference') {
          state.mode = 'preference';
          refreshInputExtras();
          persistModeState();
          switchRole('preference_analyst');
          chat.showNotification('已进入偏好收录模式');
        }
        var stream = api.call('exercise.preference', { session_id: state.session_id }).stream;
        chat.startOutput();
        consumeStream(stream, function (event) {
          if (event.type === 'output') {
            outputBuf += event.content || '';
            chat.feedOutput(event.content);
          } else if (event.type === 'think') {
            chat.feedThinking(event.content);
          } else if (event.type === 'error') {
            chat.endOutput();
            chat.showNotification('分析失败: ' + (event.message || ''), { type: 'error' });
            state.streaming = false;
            chat.setStreaming(false);
          }
        }, function () {
          checkEmptyResult(outputBuf, '未检测到新的偏好变化');
          state.streaming = false;
          chat.setStreaming(false);
        });
      }

      function summaryQuestion() {
        if (!state.session_id || state.streaming) return;
        if (state.hasSummary) {
          chat.showNotification('本题已总结');
          return;
        }
        var entryQ = state.questions[0];
        if (!entryQ) return;
        state.streaming = true;
        chat.setStreaming(true);
        var stream = api.call('exercise.summary', { session_id: state.session_id }).stream;
        consumeStream(stream, function (event) {
          if (event.type === 'summary_started') {
            state.streaming = false;
            chat.setStreaming(false);
            if (typeof window._reloadSessions === 'function') window._reloadSessions();
            if (event.next_session_id) {
              ViewManager.show(createExerciseView, {
                view: 'exercise',
                project_id: state.project_id,
                bank_id: state.bank_id,
                group_id: state.group_id,
                session_id: event.next_session_id,
              });
            } else {
              chat.showNotification('没有下一题了');
            }
          } else if (event.type === 'error') {
            chat.showNotification('总结失败: ' + (event.message || ''), { type: 'error' });
            state.streaming = false;
            chat.setStreaming(false);
          }
        });
      }

      function openDrawBoard() {
        if (!window._drawView) {
          chat.showNotification('画图页未加载', { type: 'error' });
          return;
        }
        ViewManager.open(window._drawView, {
          questions: state.questions.map(function (item) {
            return { content: item.content || '' };
          }),
          currentQuestionIndex: state.currentIdx || 0,
        });
      }
      function refreshInputExtras() {
        if (chat && typeof chat.setExtras === 'function') {
          chat.setExtras(buildInputExtras(state.mode, { hasSummary: state.hasSummary }));
        }
      }

      function persistModeState() {
        if (!state.session_id) return;
        var result = api.call('exercise.extern_update', {
          session_id: state.session_id,
          path: 'ui_state.current_mode',
          value: resolveModeFromUiState({ current_mode: state.mode }),
        });
        if (result && result.stream) {
          consumeStream(result.stream, function () {});
        }
      }

      function switchRole(role, onDone) {
        if (!state.session_id || !role) {
          if (typeof onDone === 'function') onDone();
          return;
        }
        var result = api.call('exercise.switch_role', {
          session_id: state.session_id,
          role: role,
        });
        if (result && result.stream) {
          consumeStream(result.stream, function (event) {
            if (event.type === 'error') {
              chat.showNotification('切换模式失败: ' + (event.message || ''), { type: 'error' });
            }
          }, onDone);
          return;
        }
        if (typeof onDone === 'function') onDone();
      }

      function checkEmptyResult(buf, defaultMsg) {
        var matches = String(buf || '').match(/```json\s*([\s\S]*?)```/g);
        if (!matches || !matches.length) return;
        var last = matches[matches.length - 1].replace(/```json\s*/, '').replace(/```$/, '').trim();
        try {
          var obj = JSON.parse(last);
          if (obj && obj.type === 'empty') {
            chat.showNotification(obj.message || defaultMsg);
          }
        } catch (e) {}
      }

      async function consumeStream(stream, onEvent, onDone) {
        try {
          for await (var event of stream) {
            if (event.type === 'done') break;
            if (typeof onEvent === 'function') onEvent(event);
          }
        } catch (e) {
          console.error('[Exercise] stream error', e);
          chat.showNotification('网络错误: ' + (e.message || e), { type: 'error' });
        }
        if (typeof onDone === 'function') onDone();
      }

      function replaceCard(cardEl, type, data) {
        if (chat && typeof chat.replaceCard === 'function') {
          return chat.replaceCard(cardEl, type, data);
        }
        return null;
      }

      function disableCollectCard(cardEl, items, activeCount, draftId, round) {
        if (!cardEl) return;
        replaceCard(cardEl, 'collect_draft', {
          draft_id: draftId || '',
          round: round,
          items: items || [],
          disabled: true,
          confirmedCount: activeCount,
        });
      }

      function disablePrefCard(cardEl, items, activeCount, draftId, round) {
        if (!cardEl) return;
        replaceCard(cardEl, 'preference_actions', {
          draft_id: draftId || '',
          round: round,
          items: items || [],
          disabled: true,
          confirmedCount: activeCount,
        });
      }

      function openNavigatorQuestion(item) {
        if (!item) return;
        if (item.has_summary) {
          openSummary(item);
          return;
        }
        closeNavigator();
        ViewManager.show(createExerciseView, {
          view: 'exercise',
          project_id: item.project_id || state.project_id,
          bank_id: item.bank_id || state.bank_id,
          group_id: item.group_id || state.group_id,
          question_id: item.question_id,
          _forceNew: true,
        });
      }

      function openAttachmentPicker() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        input.addEventListener('change', function () {
          if (input.files && input.files.length && typeof chat.addAttachments === 'function') {
            chat.addAttachments(input.files);
          }
        });
        input.click();
      }

      function stopStreaming() {
        if (!state.session_id || !state.streaming) return;
        var result = api.call('exercise.stop', { session_id: state.session_id });
        if (result && result.stream) {
          consumeStream(result.stream, function (event) {
            if (event.type === 'error') {
              chat.showNotification('停止失败: ' + (event.message || ''), { type: 'error' });
            }
          });
        }
        state.streaming = false;
        chat.setStreaming(false);
      }

      chat.on('input:send', function (text) {
        sendMessage(text);
      });

      chat.on('input:stop', function () {
        stopStreaming();
      });

      chat.on('input:attach', function () {
        openAttachmentPicker();
      });

      chat.on('input:extras', function (action) {
        if (action === 'draw') {
          openDrawBoard();
          return;
        }
        if (action === 'collect') {
          collectWeaknesses();
          return;
        }
        if (action === 'summary') {
          summaryQuestion();
          return;
        }
        if (action === 'preference') {
          preferenceAnalysis();
          return;
        }
        if (action === 'continue') {
          state.mode = 'teacher';
          refreshInputExtras();
          persistModeState();
          switchRole('teacher');
          chat.showNotification('已返回教师模式');
        }
      });

      chat.on('question', function (ev) {
        if (!ev) return;
        state.questionSeq += 1;
        addQuestion({
          id: 'q_' + state.questionSeq,
          content: ev.content || '',
          source: 'AI',
          domRef: ev.domRef || null,
        });
      });

      chat.on('session:restored', function () {
        renderSessionBanner();
        refreshInputExtras();
      });

      chat.on('collect:confirm', function (d) {
        if (!state.session_id) return;
        var draftId = d.draft_id || '';
        var round = d.round || 1;
        var items = (d.items || []).slice();
        var activeCount = items.filter(function (it) { return it.active !== false; }).length;
        var itemsState = {};
        items.forEach(function (it) {
          itemsState[it.id] = {
            active: it.active !== false,
            mastery: it.mastery,
          };
        });
        var uiState = { card_states: {} };
        uiState.card_states['collect_' + (draftId || round)] = {
          confirmed: true,
          items: itemsState,
        };
        var result = api.call('exercise.confirm_collect', {
          session_id: state.session_id,
          draft_id: draftId,
          round: round,
          items: items,
          ui_state: uiState,
        });
        consumeStream(result.stream, function (event) {
          if (event.type === 'confirmed') {
            disableCollectCard(d.cardEl, items, activeCount, event.draft_id || draftId, round);
            chat.showNotification('已收录 ' + activeCount + ' 个知识点');
          } else if (event.type === 'error') {
            chat.showNotification('收录失败: ' + (event.message || ''), { type: 'error' });
          }
        });
      });

      chat.on('pref:confirm', function (d) {
        if (!state.session_id) return;
        var draftId = d.draft_id || '';
        var round = d.round || 1;
        var items = (d.items || []).slice();
        var activeCount = items.filter(function (it) { return it.active !== false; }).length;
        var itemsState = {};
        items.forEach(function (it) {
          itemsState[it.id] = {
            active: it.active !== false,
          };
        });
        var uiState = { card_states: {} };
        uiState.card_states['pref_' + (draftId || round)] = {
          confirmed: true,
          items: itemsState,
        };
        var result = api.call('exercise.confirm_preference', {
          session_id: state.session_id,
          draft_id: draftId,
          round: round,
          items: items,
          ui_state: uiState,
        });
        consumeStream(result.stream, function (event) {
          if (event.type === 'confirmed') {
            disablePrefCard(d.cardEl, items, activeCount, event.draft_id || draftId, round);
            chat.showNotification('已收录 ' + activeCount + ' 个偏好');
          } else if (event.type === 'error') {
            chat.showNotification('收录失败: ' + (event.message || ''), { type: 'error' });
          }
        });
      });

      chat.setInput('input-text', {
        placeholder: '输入你的答案...',
        extras: buildInputExtras(state.mode, { hasSummary: state.hasSummary }),
      });

      function restoreSession() {
        var argSid = args && args.session_id;
        var urlSid = null;
        var forceNew = !!(args && args._forceNew);
        try { urlSid = new URL(location.href).searchParams.get('session_id'); } catch (e) {}
        if (forceNew) {
          startExercise();
          return;
        }
        var sid = argSid || urlSid;
        if (!sid) {
          startExercise();
          return;
        }
        api.query('session.get', { id: parseInt(sid, 10) || sid }).then(function (sessionData) {
          if (!sessionData || !sessionData.messages) {
            startExercise();
            return;
          }
          var route = sessionData.route || (sessionData.extern && sessionData.extern.route);
          if (route && route !== 'exercise') {
            startExercise();
            return;
          }
          state.session_id = parseInt(sid, 10) || sid;
          var ext = sessionData.extern || {};
          state.mode = resolveModeFromUiState(ext.ui_state || {});
          state.hasSummary = !!ext.summary;
          var entryQid = null;
          var ref = ext._question_ref || '';
          var parts = ref.split('.');
          if (parts.length === 4) {
            entryQid = parseInt(parts[3], 10) || null;
          }
          var entryQuestion = {
            id: 'q_restore_' + (entryQid || '0'),
            real_id: entryQid,
            label: '',
            content: ext._question_content || '',
            source: '题库',
            domRef: null,
          };
          rebuildQuestionsFromMessages(sessionData.messages, entryQuestion);
          if (entryQid) {
            updatePathFromQuestion(entryQid).then(function () {
              refreshNavigator();
            });
          } else {
            refreshNavigator();
          }
          chat.loadSession(buildRestoreMessages(sessionData.messages, entryQuestion), { uiState: ext.ui_state || {} });
          refreshInputExtras();
          try {
            var url = new URL(location.href);
            url.searchParams.set('session_id', state.session_id);
            history.pushState({}, '', url);
          } catch (e) {}
          if (typeof window._reloadSessions === 'function') window._reloadSessions();
        }).catch(function () {
          startExercise();
        });
      }

      return {
        activate: function (ctx, result) {
          if (result && result.image) {
            state.drawAttachment = {
              name: 'handwrite-note.png',
              dataUrl: result.preview || result.image,
              fullImage: result.image,
              bounds: clone(result.bounds || {}),
            };
            if (typeof chat.setAttachments === 'function') {
              chat.setAttachments([{
                name: state.drawAttachment.name,
                dataUrl: state.drawAttachment.dataUrl,
                fullImage: state.drawAttachment.fullImage,
                bounds: clone(state.drawAttachment.bounds || {}),
              }]);
            }
            chat.showNotification('已插入手写图片');
          }
          restoreSession();
          renderShellContext();
          return {
            title: '顺序做题',
            content: chat.html,
            mount: function () {
              chat.bind();
            },
          };
        },
        suspend: function () {
          chat.unbind();
          closeNavigator();
          closeSummary();
          if (window.Shell) window.Shell.clearActions();
        },
        deactivate: function () {
          chat.destroy();
          if (window.Shell) window.Shell.clearActions();
        },
        match: function () { return false; },
      };
    },
  });

  window._exerciseView = createExerciseView;
  window.__exerciseViewTest = {
    buildChatRequestPayload: buildChatRequestPayload,
    buildOcrCardData: buildOcrCardData,
    buildInputExtras: buildInputExtras,
    resolveModeFromUiState: resolveModeFromUiState,
    buildModeUiState: buildModeUiState,
    buildQuestionPreview: buildQuestionPreview,
    buildRestoreMessages: buildRestoreMessages,
  };
})();
