/**
 * ContentParser — 流式解析模型输出的 content 字段
 *
 * 解析规则：
 *   /* … *​/  → 用户可见文本（透传字符，不输出定界符）
 *   ```json … ``` → 结构化卡片（缓冲后 JSON.parse，触发 card 事件）
 *   解析失败 → 整段降级为文本输出
 *
 * 用法：
 *   var p = new ContentParser();
 *   p.onText      = function (ch) { … }           // 逐字符
 *   p.onJsonStart = function () { … }             // 开始缓冲 JSON
 *   p.onJsonProgress = function (n) { … }         // 已缓冲 n 字符
 *   p.onJsonEnd   = function (json) { … }         // 解析成功
 *   p.onError     = function (raw) { … }          // 解析失败
 *   p.feed(chunk);                                 // 喂字符
 *   p.feed('');                                    // 刷新残留（close）
 */
(function () {
  'use strict';

  function ContentParser() {
    this._state = 'PLAIN';   // PLAIN | COMMENT | JSON
    this._buf = '';           // JSON 文本缓冲
    this._jsonRaw = '';       // 原始 JSON 文本（降级用）
    this._rawStart = '';      // JSON 起始定界符（降级用）
    this._prevTail = '';      // 跨块残留（定界符被截断时暂存）

    this.onText = null;
    this.onJsonStart = null;
    this.onJsonProgress = null;
    this.onJsonEnd = null;
    this.onError = null;
  }

  /**
   * 喂入一个文本块。
   * @param {string} chunk  流式片段；传空字符串强制刷新残留
   */
  ContentParser.prototype.feed = function (chunk) {
    if (!chunk) {
      this._flushPending();
      return;
    }

    var text = this._prevTail + chunk;
    this._prevTail = '';

    var i = 0;
    while (i < text.length) {
      var remaining = text.length - i;

      switch (this._state) {

        /* ──────────── PLAIN ──────────── */
        case 'PLAIN':
          // 检测 /* — 需要至少 2 字符
          if (remaining >= 2 && text[i] === '/' && text[i + 1] === '*') {
            i += 2;
            this._state = 'COMMENT';
            break;
          }
          // 检测 ```json — 需要至少 7 字符
          if (remaining >= 7 && text.substr(i, 7) === '```json') {
            i += 7;
            this._state = 'JSON';
            this._buf = '';
            this._jsonRaw = '';
            this._rawStart = '```json';
            if (typeof this.onJsonStart === 'function') this.onJsonStart();
            break;
          }
          /* ── 跨块边缘检测 ── */
          // 末尾单独 `/` 可能是 /* 的前一半
          if (remaining === 1 && text[i] === '/') {
            this._prevTail = '/';
            i++;
            break;
          }
          // 末尾以 ` 起头：可能是 ```json 的不完整前缀
          // 合法前缀：` `` ``` ```j ```js ```jso ```json（最多 7 字符）
          // 只要剩余 < 7 且当前是 `，就检查整段剩余是否是 ```json 的前缀
          if (text[i] === '`' && remaining < 7) {
            var tail = text.substr(i);
            if ('```json'.indexOf(tail) === 0) {
              this._prevTail = tail;
              i = text.length;
              break;
            }
          }
          // 普通字符 → 输出
          if (typeof this.onText === 'function') this.onText(text[i]);
          i++;
          break;

        /* ──────────── COMMENT ──────────── */
        case 'COMMENT':
          // 检测 */
          if (remaining >= 2 && text[i] === '*' && text[i + 1] === '/') {
            i += 2;
            this._state = 'PLAIN';
            break;
          }
          // 末尾 `*` 可能是 */ 的前一半
          if (remaining === 1 && text[i] === '*') {
            this._prevTail = '*';
            i++;
            break;
          }
          // 普通字符 → 透传输出
          if (typeof this.onText === 'function') this.onText(text[i]);
          i++;
          break;

        /* ──────────── JSON ──────────── */
        case 'JSON':
          // 检测关闭 ```
          if (remaining >= 3 && text.substr(i, 3) === '```') {
            i += 3;
            this._finishJson();
            this._state = 'PLAIN';
            break;
          }
          // 末尾 `` ` `` 可能是关闭 ``` 的前一半
          if (text[i] === '`') {
            // 把当前位置开始的剩余字符全部放入 prevTail（可能是 ` / `` / ```）
            this._prevTail = (this._prevTail || '') + text.slice(i);
            i = text.length;
            break;
          }
          // 普通字符 → 缓冲
          this._buf += text[i];
          this._jsonRaw += text[i];
          if (typeof this.onJsonProgress === 'function') this.onJsonProgress(this._buf.length);
          i++;
          break;
      }
    }
  };

  // ── 内部 ────────────────────────────────────────

  /** JSON 缓冲结束：尝试解析 */
  ContentParser.prototype._finishJson = function () {
    try {
      var json = JSON.parse(this._buf);
      if (typeof this.onJsonEnd === 'function') this.onJsonEnd(json);
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[ContentParser] JSON.parse 失败，丢弃卡片：', e.message, '\n原始内容：', this._buf);
      }
      if (typeof this.onError === 'function') this.onError(this._rawStart + this._jsonRaw + '```');
    }
    this._buf = '';
    this._jsonRaw = '';
    this._rawStart = '';
  };

  /** 刷新残留：空 chunk 时调用，终结未完成的块 */
  ContentParser.prototype._flushPending = function () {
    if (this._prevTail) {
      for (var i = 0; i < this._prevTail.length; i++) {
        if (typeof this.onText === 'function') this.onText(this._prevTail[i]);
      }
      this._prevTail = '';
    }
    if (this._state === 'JSON' && this._buf) {
      if (typeof this.onError === 'function') this.onError(this._rawStart + this._jsonRaw);
      this._state = 'PLAIN';
      this._buf = '';
      this._jsonRaw = '';
      this._rawStart = '';
    }
  };

  window.ContentParser = ContentParser;
})();
