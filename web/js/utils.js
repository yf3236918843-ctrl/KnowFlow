/**
 * utils.js — 通用工具函数
 *
 * 所有组件共享的基础工具，不包含业务逻辑。
 * 依赖：无（renderMath 依赖 KaTeX CDN，调用时才检查）
 */

// =============================================
// HTML 转义
// =============================================
function esc(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

// =============================================
// LaTeX 渲染（$...$ → KaTeX）
// =============================================
function renderMath(html) {
  if (typeof katex === 'undefined') return html || '';
  let result = String(html);
  // 块级公式 $$...$$
  result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_, expr) => {
    try {
      var raw = _decodeMathEntities(expr.trim());
      var safe = _escAttr(raw);
      var h = katex.renderToString(raw, { displayMode: true, throwOnError: false });
      return h.replace('<span class="katex-display">', '<span class="katex-display" data-latex="' + safe + '">');
    } catch (e) { return '$$' + expr + '$$'; }
  });
  // 行内公式 $...$
  result = result.replace(/\$([^$\n]+?)\$/g, (_, expr) => {
    try {
      var raw = _decodeMathEntities(expr.trim());
      var safe = _escAttr(raw);
      var h = katex.renderToString(raw, { displayMode: false, throwOnError: false });
      return h.replace('<span class="katex">', '<span class="katex" data-latex="' + safe + '">');
    } catch (e) { return '$' + expr + '$'; }
  });
  return result;
}

function _decodeMathEntities(str) {
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// 属性转义（用于 data-latex）
function _escAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 点击 LaTeX 复制（全局监听，初始化后生效）
var _latexCopyInit = false;
function enableLatexCopy() {
  if (_latexCopyInit) return;
  _latexCopyInit = true;
  document.addEventListener('click', function (e) {
    var el = e.target.closest('.katex, .katex-display');
    if (!el) return;
    var latex = el.getAttribute('data-latex');
    if (!latex) return;
    e.stopPropagation();
    navigator.clipboard.writeText(latex).then(function () {
      showToast('已复制 LaTeX: ' + latex.slice(0, 40) + (latex.length > 40 ? '…' : ''));
    }).catch(function () {
      showToast('复制失败');
    });
  });
}

// =============================================
// Toast 提示
// =============================================
function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(() => el.remove(), 300);
  }, 2500);
}

// =============================================
// 滑动展开/收起（高度动画）
// =============================================
//
// 用法：
//   任意 .slide-wrap 元素，调 slideToggle(wrapEl) 自动展开/收起。
//   配合 CSS：.slide-wrap { overflow:hidden; transition:height 0.2s cubic-bezier(0.15,0,0.2,1); height:0; }
//
//   HTML 结构：
//     <div class="slide-wrap">
//       <div>内容...</div>
//     </div>
//
//   点击触发：
//     triggerEl.addEventListener('click', function() { slideToggle(wrapEl); });
//
function slideToggle(el) {
  if (!el) return;
  var isOpen = el.classList.contains('open');

  if (isOpen) {
    // 收起：固定当前高度 → 过渡到 0 → 动画结束后移 open
    var cur = el.scrollHeight;
    el.style.height = cur + 'px';
    requestAnimationFrame(function () {
      el.style.height = '0';
      el.addEventListener('transitionend', function done() {
        el.classList.remove('open');
        el.removeEventListener('transitionend', done);
      });
    });
  } else {
    // 展开：加 open 让内容可见 → 测量高度 → 从 0 过渡到实际高度
    requestAnimationFrame(function () {
      el.classList.add('open');
      var h = el.scrollHeight;
      el.style.height = '0';
      requestAnimationFrame(function () {
        el.style.height = h + 'px';
      });
    });
  }

  return !isOpen; // 返回展开后的状态
}


// =============================================
// Markdown 渲染（轻量）
// =============================================
function renderMarkdown(text) {
  // Bold（先做，防止 ** 被 * 吃掉）
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // 行内代码
  text = text.replace(/`([^`]+?)`/g, '<code>$1</code>');
  // 链接
  text = text.replace(/\[([^\]]+?)\]\(([^)]+?)\)/g, '<a href="$2" target="_blank">$1</a>');
  return text;
}

// =============================================
// 全局 LaTeX + Markdown 渲染
// =============================================
//
// 用法：
//   renderAll(document.getElementById('contentArea'))
//   扫描容器内所有文本节点，自动渲染 LaTeX ($...$) 和 Markdown。
//   安全重复调用，不会二次处理已有输出。
//
function renderAll(root) {
  if (!root) return;
  // 跳过整个 KaTeX 子树
  if (root.classList && (root.classList.contains('katex') || root.classList.contains('katex-display'))) return;

  var walker = document.createTreeWalker(root, 4); // NodeFilter.SHOW_TEXT
  var nodes = [];

  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (var i = 0; i < nodes.length; i++) {
    var textNode = nodes[i];
    var text = textNode.textContent;

    // 快速跳过：不含任何标记
    if (text.indexOf('$') < 0 && text.indexOf('**') < 0 && text.indexOf('*') < 0 && text.indexOf('`') < 0 && text.indexOf('[') < 0) continue;

    var parent = textNode.parentNode;
    if (!parent) continue;
    // 跳过代码/链接/已渲染的上下文
    var tag = parent.tagName;
    if (tag === 'CODE' || tag === 'PRE' || tag === 'A' || tag === 'SCRIPT' || tag === 'STYLE') continue;
    if (parent.classList && (parent.classList.contains('katex') || parent.classList.contains('katex-mathml') || parent.classList.contains('katex-html'))) continue;

    // 第一步：HTML 转义
    var result = esc(text);

    // 第二步：保护数学块，防止 Markdown 污染
    var mathBlocks = [];
    result = result.replace(/\$\$[\s\S]*?\$\$/g, function (m) {
      mathBlocks.push(m);
      return '\x00M' + (mathBlocks.length - 1) + '\x00';
    });
    result = result.replace(/\$[^$]+?\$/g, function (m) {
      mathBlocks.push(m);
      return '\x00M' + (mathBlocks.length - 1) + '\x00';
    });

    // 第三步：Markdown
    result = renderMarkdown(result);

    // 第四步：恢复数学块
    result = result.replace(/\x00M(\d+)\x00/g, function (_, id) {
      return mathBlocks[parseInt(id)] || '';
    });

    // 第五步：LaTeX 渲染
    result = renderMath(result);

    if (result === text) continue;

    // 替换文本节点
    var temp = document.createElement('span');
    temp.innerHTML = result;
    var frag = document.createDocumentFragment();
    while (temp.firstChild) frag.appendChild(temp.firstChild);
    parent.replaceChild(frag, textNode);
  }
}

// =============================================
// Promise 延时
// =============================================
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// =============================================
// Pipeline 通用执行器
// =============================================
//
// 用法：
//   runPipeline('exercise.chat', { session_id, message }, {
//     output:   (ev) => appendOutput(ev.content),
//     thinking: (ev) => appendThinking(ev.content),
//     error:    (ev) => showToast(ev.message),
//     done:     ()  => finalize(),
//     _error:   (e) => showToast('连接中断'),
//   });
//
// 事件类型 → handler 同名方法自动映射。
// _error 是所有未预期异常的兜底。
//
async function runPipeline(pipeline, params = {}, handlers = {}) {
  const { stream, cancel } = api.call(pipeline, params);
  let _doneCalled = false;
  try {
    for await (const event of stream) {
      const fn = handlers[event.type];
      if (fn) fn(event);
      if (event.type === 'done') _doneCalled = true;
    }
  } catch (e) {
    if (handlers._error) handlers._error(e);
    return;
  }
  // 流自然结束时若尚未触发 done，补发一次
  if (!_doneCalled && handlers.done) handlers.done();
}

// =============================================
// 流式解析器：逐 chunk 检测 ```json 块
// =============================================
//
// 输入：AsyncGenerator<chunk>（每个 chunk 为 {type: 'output', content: string}）
// 输出：AsyncGenerator<{type: 'text', content: string} | {type: 'json_start'} | {type: 'json_end', data: object} | {type: 'json_fail', raw: string}>
//
async function* parseStream(stream) {
  let state = 'NORMAL'; // NORMAL | BACKTICK_1 | BACKTICK_2 | JSON_CHECK | JSON_COLLECT
  let textBuf = '';
  let jsonBuf = '';
  let prevTail = '';

  function flushText() {
    if (textBuf) {
      const out = textBuf;
      textBuf = '';
      return { type: 'text', content: out };
    }
    return null;
  }

  function reset() {
    state = 'NORMAL';
    jsonBuf = '';
    prevTail = '';
  }

  for await (const event of stream) {
    if (event.type !== 'output' && event.type !== 'text') {
      const t = flushText();
      if (t) yield t;
      yield event;
      continue;
    }

    const chunk = (event.content || '');
    const text = prevTail + chunk;
    prevTail = '';

    let i = 0;
    while (i < text.length) {
      const remaining = text.length - i;

      switch (state) {

        case 'NORMAL':
          if (remaining >= 3 && text.slice(i, i + 3) === '```') {
            i += 3;
            state = 'JSON_CHECK';
            break;
          }
          if (remaining === 1 && text[i] === '`') {
            prevTail = '`';
            i++;
            break;
          }
          if (remaining === 2 && text.slice(i, i + 2) === '``') {
            prevTail = '``';
            i += 2;
            break;
          }
          textBuf += text[i];
          i++;
          break;

        case 'JSON_CHECK':
          if (remaining >= 4 && text.slice(i, i + 4) === 'json') {
            i += 4;
            state = 'JSON_COLLECT';
            jsonBuf = '';
            const t = flushText();
            if (t) yield t;
            yield { type: 'json_start' };
            break;
          }
          // 不是 json → 退回 NORMAL，输出 ``` 和后续字符
          state = 'NORMAL';
          textBuf += '```';
          // 不 break，重新处理当前字符
          break;

        case 'JSON_COLLECT':
          if (remaining >= 3 && text.slice(i, i + 3) === '```') {
            i += 3;
            // 尝试解析
            try {
              const sanitized = jsonBuf.replace(/\\(?![\\"/bfnrtu])/g, '\\\\');
              const data = JSON.parse(sanitized);
              yield { type: 'json_end', data: data };
            } catch (e) {
              yield { type: 'json_fail', raw: jsonBuf };
            }
            reset();
            break;
          }
          if (text[i] === '`') {
            prevTail = (prevTail || '') + text.slice(i);
            i = text.length;
            break;
          }
          jsonBuf += text[i];
          i++;
          break;
      }
    }
  }

  // 流结束：刷新残留
  if (prevTail) {
    textBuf += prevTail;
    prevTail = '';
  }
  if (state === 'JSON_COLLECT' && jsonBuf) {
    yield { type: 'json_fail', raw: jsonBuf };
  }
  const t = flushText();
  if (t) yield t;
}

// =============================================
// 纯函数：解析完整 messages 数组 → DOM 片段
// =============================================
//
// 输入：messages（后端 session.messages 数组）
// 输出：[{role, html}] 数组，供前端渲染
//
function parseMessages(messages) {
  const result = [];
  for (const msg of messages) {
    const role = msg.role;
    if (role === 'system') continue;
    if (role === 'user') {
      result.push({ role: 'user', html: escHtml(msg.content) });
      continue;
    }
    if (role === 'assistant') {
      const content = msg.content || '';
      const segments = parseAssistantContent(content);
      for (const seg of segments) {
        result.push({ role: 'assistant', html: seg.html, type: seg.type, data: seg.data });
      }
    }
  }
  return result;
}

function parseAssistantContent(content) {
  const segments = [];
  const pattern = /(\/\*[\s\S]*?\*\/)|(```json[\s\S]*?```)/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const before = content.slice(lastIndex, match.index);
      if (before) segments.push({ type: 'text', html: escHtml(before) });
    }
    if (match[1]) {
      const inner = match[1].slice(2, -2);
      if (inner) segments.push({ type: 'text', html: escHtml(inner) });
    } else if (match[2]) {
      const jsonStr = match[2].slice(7, -3);
      try {
        const data = JSON.parse(jsonStr);
        segments.push({ type: 'card', html: '', data: data });
      } catch (e) {
        segments.push({ type: 'text', html: escHtml(match[2]) });
      }
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex);
    if (remaining) segments.push({ type: 'text', html: escHtml(remaining) });
  }

  // 合并相邻 text 段
  const merged = [];
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].type === 'text' && merged.length && merged[merged.length - 1].type === 'text') {
      merged[merged.length - 1].html += segments[i].html;
    } else {
      merged.push(segments[i]);
    }
  }
  return merged;
}
