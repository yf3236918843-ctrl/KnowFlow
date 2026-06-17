/**
 * client.js — 简学 API 通信层
 *
 * 鉴权方式：Cookie Session
 *   - 登录由后端设 HttpOnly cookie，浏览器自动带
 *   - 所有请求（含 SSE stream / 文件直读）自动携带 cookie
 *   - 前端不管理 token，无 Authorization header
 *
 * 五个原语：
 *   api.call(pipeline, params)        → { stream: AsyncGenerator, cancel: fn }   流式
 *   api.query(pipeline, params)       → Promise<data>                            简式
 *   api.upload(files)                 → Promise<{ok, file_ids}>                  文件上传
 *   api.getFileUrl(fileId)            → string                                   文件直读 URL
 *   api.setToken(token)               → void                                     兼容层（空操作）
 *
 * 约定：
 *   - 流式用 for await...of 消费事件，事件格式由各 pipeline 自行定义
 *   - 简式自动等待至接收到 result 或 error 事件后返回
 *   - 文件上传走 POST /api/upload (multipart)
 *   - 文件直读走 GET /api/files/{id}，cookie 鉴权
 */

const api = (() => {
  'use strict';

  // =============================================
  // 原语 1: 流式调用
  // =============================================
  function call(pipeline, params = {}) {
    const controller = new AbortController();
    const stream = _createAsyncGenerator('/api/pipeline/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipeline, params }),
      signal: controller.signal,
    });
    return { stream, cancel: () => controller.abort() };
  }

  // =============================================
  // 原语 2: 简式调用（等待 result/error 后返回）
  // =============================================
  async function query(pipeline, params = {}) {
    const { stream, cancel } = api.call(pipeline, params);
    try {
      for await (const event of stream) {
        if (event.type === 'result') { cancel(); return event.data; }
        if (event.type === 'error')  { cancel(); return { ok: false, error: event.message, code: event.code }; }
        // 跳过 progress / thinking 等中间事件
      }
    } catch (e) {
      return { ok: false, error: e.message };
    }
    return { ok: false, error: '无返回数据' };
  }

  // =============================================
  // 原语 3: 文件上传
  // =============================================
  async function upload(files) {
    if (!files || files.length === 0)
      return { ok: false, error: '未选择文件' };
    if (files.length > 10)
      return { ok: false, error: '一次最多上传 10 个文件' };
    for (const f of files) {
      if (f.size > 10 * 1024 * 1024)
        return { ok: false, error: `文件 ${f.name} 超过 10MB` };
    }
    const fd = new FormData();
    [...files].forEach(f => fd.append('files', f));
    try {
      const resp = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        return { ok: false, error: err.error || `上传失败: ${resp.status}` };
      }
      return resp.json();
    } catch (e) {
      return { ok: false, error: '上传失败: ' + e.message };
    }
  }

  // =============================================
  // 原语 4: 文件直读 URL
  // =============================================
  function getFileUrl(fileId) {
    if (!fileId) return '';
    return '/api/files/' + encodeURIComponent(fileId);
  }

  // =============================================
  // 原语 5: 获取当前登录用户（唯一 GET 端点）
  // =============================================
  async function me() {
    try {
      const resp = await fetch('/api/me');
      return resp.json();
    } catch (e) {
      return { ok: false, error: '网络错误: ' + e.message };
    }
  }

  // =============================================
  // 兼容层 — 留空，切换到 cookie 后前端不再管理 token
  // =============================================
  function setToken(_token) { /* 由 Cookie Session 接管 */ }

  // =============================================
  // SSE 解析
  // =============================================
  async function* _createAsyncGenerator(url, opts) {
    const resp = await fetch(url, opts);
    if (!resp.ok) {
      yield { type: 'error', code: 'HTTP_' + resp.status, message: `请求失败: ${resp.status}` };
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    // 读第一块判断格式
    const { done, value } = await reader.read();
    if (done) return;
    buf += decoder.decode(value, { stream: true });

    // 纯 JSON 模式（无 data: 前缀）— 继续读完所有块然后解析
    if (!buf.startsWith('data: ')) {
      try {
        while (true) {
          const n = await reader.read();
          if (n.done) break;
          buf += decoder.decode(n.value, { stream: true });
        }
        try { yield JSON.parse(buf); }
        catch (e) { yield { type: 'error', message: 'JSON 解析失败' }; }
      } finally { reader.releaseLock(); }
      return;
    }

    // SSE 模式
    try {
      while (true) {
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try { yield JSON.parse(line.slice(6)); }
          catch (e) { /* 忽略格式错误 */ }
        }
        const next = await reader.read();
        if (next.done) break;
        buf += decoder.decode(next.value, { stream: true });
      }
      // 处理残留
      if (buf.startsWith('data: ')) {
        try { yield JSON.parse(buf.slice(6)); } catch (e) {}
      }
    } finally {
      reader.releaseLock();
    }
  }

  return { call, query, upload, getFileUrl, me, setToken };
})();
