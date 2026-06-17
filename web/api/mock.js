/**
 * mock.js — Pipeline 模拟实现
 *
 * 加载此文件会拦截 api.call()，根据 pipeline 名称返回模拟数据。
 * 所有模拟数据集中在此文件，与 client.js 解耦。
 *
 * 原理：
 *   - 覆盖 api.call(pipeline, params) → 根据 pipeline 路由到模拟处理函数
 *   - 覆盖 api.upload(files) → 模拟上传返回 file_ids
 *   - api.query(pipeline, params) 内部调 api.call，自动被模拟
 */

(function () {
  'use strict';

  // =============================================
  // Helpers
  // =============================================
  function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  /** 流式模拟：逐步 yield chunk */
  async function* _mockAsyncGen(chunks, interval) {
    for (const chunk of chunks) {
      await delay(interval || 80);
      yield chunk;
    }
  }

  function mockStream(chunks, interval) {
    const ctrl = { aborted: false };
    const stream = (async function* () {
      for (const chunk of chunks) {
        if (ctrl.aborted) break;
        await delay(interval || 80);
        yield chunk;
      }
    })();
    return { stream, cancel: () => { ctrl.aborted = true; } };
  }

  // =============================================
  // Mock Data
  // =============================================

  const MOCK_PROJECTS = [
    { id: 1, name: '高等数学', bank_count: 2, question_count: 247, progress: 72 },
    { id: 2, name: '线性代数', bank_count: 1, question_count: 134, progress: 45 },
    { id: 3, name: '概率论',   bank_count: 1, question_count: 89,  progress: 12 },
  ];

  const MOCK_BANKS = [
    { id: 1, project_id: 1, name: '同济高数上册', group_count: 3, question_count: 120 },
    { id: 2, project_id: 1, name: '同济高数下册', group_count: 2, question_count: 127 },
    { id: 3, project_id: 2, name: '工程数学线代', group_count: 2, question_count: 134 },
  ];

  const MOCK_GROUPS = [
    { id: 1, bank_id: 1, name: '第一章 函数与极限', order: 1, status: 'done' },
    { id: 2, bank_id: 1, name: '第二章 导数与微分', order: 2, status: 'done' },
    { id: 3, bank_id: 1, name: '第三章 微分中值定理', order: 3, status: 'importing' },
  ];

  const MOCK_QUESTIONS = [];
  for (let i = 1; i <= 20; i++) {
    const statuses = ['unfinished', 'unfinished', 'unfinished', 'done', 'weakness'];
    MOCK_QUESTIONS.push({
      id: i,
      bank_id: 1,
      group_id: 1,
      label: `1.1.${i}`,
      content: i <= 10
        ? `计算极限 $\\lim_{x \\to ${i}} \\frac{\\sin(x)}{x}$`
        : `求导 $f(x) = x^{${i}} + ${i - 5}x^2 + 1$`,
      status: statuses[i % statuses.length],
      mastery: Math.random() * 0.6 + 0.2,
    });
  }

  const AI_RESPONSES = [
    '这道题考察的是 **重要极限** 的概念。\n\n$$\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1$$\n\n这是一个基础但非常重要的结论。你能想到从哪个角度入手吗？',
    '不错，有思路了！我们可以用 **夹逼准则** 来证明：\n\n在单位圆中，当 $0 < x < \\frac{\\pi}{2}$ 时，有\n\n$$\\sin x < x < \\tan x$$\n\n两边除以 $\\sin x$ 得到...你能继续推下去吗？',
    '很好！再考虑一下这个变体：\n\n$$\\lim_{x \\to 0} \\frac{\\sin(2x)}{x}$$\n\n你觉得答案是多少？提示：可以用换元法。',
    '完全正确！$\\lim_{x \\to 0} \\frac{\\sin(2x)}{x} = 2$。\n\n推广一下：\n\n$$\\lim_{x \\to 0} \\frac{\\sin(ax)}{bx} = \\frac{a}{b}$$\n\n这个公式很常用，建议记住。',
    '来看一个综合题：\n\n$$\\lim_{x \\to 0} \\frac{1 - \\cos x}{x^2}$$\n\n提示：用 $1 - \\cos x = 2\\sin^2\\frac{x}{2}$',
    '做得很好！现在我们来看这个极限的 **几何意义**...\n\n在单位圆中，$\\sin x$ 表示弧长 $x$ 对应的正弦线长度。当 $x$ 很小时，弧长和正弦线长度几乎相等，所以比值趋近于 1。',
    '你掌握得不错！记住这个核心思想：**重要极限的本质是局部线性化**。\n\n来看一道应用题：\n\n$$\\lim_{x \\to 0} \\frac{\\tan x - \\sin x}{x^3}$$',
  ];

  const LLM_THINKING_PARTS = [
    '分析题目要求：需要计算极限值，这是典型的 0/0 型未定式。',
    '回顾洛必达法则适用条件：分子分母在极限点处同时趋于 0，且导数存在。',
    '检查发现 sin(x) 在 x→0 时趋于 0，x 也趋于 0，满足洛必达条件。',
    '尝试用等价无穷小代换：sin(x) ~ x，所以极限值为 1。',
    '也可以从几何意义上理解：单位圆中 sin(x) 对应角度 x 的对边，当 x 很小时两者近似相等。',
  ];

  let _mockSessionId = 100;
  /** 模拟文件存储（upload 写入，file.list 读取） */
  const _mockFiles = [
    { id: 'f_001', group_id: 1, name: 'IMG_001.jpg', size: 2048576, uploaded_at: '2026-06-01T10:30:00Z' },
    { id: 'f_002', group_id: 1, name: 'IMG_002.jpg', size: 1572864, uploaded_at: '2026-06-01T10:31:00Z' },
    { id: 'f_003', group_id: 1, name: 'IMG_003.jpg', size: 3100672, uploaded_at: '2026-06-01T10:32:00Z' },
  ];
  let _mockFileSeq = 4;

  // =============================================
  // Pipeline 模拟注册表
  // =============================================

  const _handlers = {};

  function _register(pipeline, handler) {
    _handlers[pipeline] = handler;
  }

  // ── 拦截 api.call ──
  const _origCall = api.call;
  api.call = function (pipeline, params) {
    const handler = _handlers[pipeline];
    if (handler) return handler(params);
    console.warn('[Mock] 未注册的 pipeline:', pipeline);
    return mockStream([
      { type: 'error', code: 'UNKNOWN_PIPELINE', message: `未注册的 pipeline: ${pipeline}` }
    ]);
  };

  // ── 拦截 api.upload ──
  const _origUpload = api.upload;
  api.upload = async function (files) {
    await delay(800);
    const fileIds = [];
    for (let i = 0; i < (files ? files.length : 0); i++) {
      const id = 'f_' + String(_mockFileSeq++).padStart(3, '0');
      fileIds.push(id);
      _mockFiles.push({
        id,
        group_id: 0,
        name: files[i].name || '未命名',
        size: files[i].size || 0,
        uploaded_at: new Date().toISOString(),
      });
    }
    return { ok: true, file_ids: fileIds };
  };

  // =============================================
  // Pipeline 模拟实现
  // =============================================

  // --- auth.login ---
  _register('auth.login', (params) => {
    if (params.account === 'demo' && params.password === 'demo') {
      return mockStream([
        { type: 'result', data: { ok: true, user: { id: 1, name: 'Demo 用户' } } }
      ], 500);
    }
    return mockStream([
      { type: 'result', data: { ok: false, error: '账号或密码错误' } }
    ], 400);
  });

  // --- auth.register ---
  _register('auth.register', (params) => {
    return mockStream([
      { type: 'result', data: { ok: true, user: { id: Date.now(), name: params.account } } }
    ], 600);
  });

  // --- project.list ---
  _register('project.list', () => {
    return mockStream([
      { type: 'result', data: { projects: MOCK_PROJECTS } }
    ], 300);
  });

  // --- project.create ---
  _register('project.create', (params) => {
    const p = { id: Date.now(), name: params.name, bank_count: 0, question_count: 0, progress: 0 };
    MOCK_PROJECTS.push(p);
    return mockStream([
      { type: 'result', data: { ok: true, project: p } }
    ], 400);
  });

  // --- bank.list ---
  _register('bank.list', (params) => {
    return mockStream([
      { type: 'result', data: { banks: MOCK_BANKS.filter(b => b.project_id === params.project_id) } }
    ], 300);
  });

  // --- bank.create ---
  _register('bank.create', (params) => {
    const b = { id: Date.now(), project_id: params.project_id, name: params.name, group_count: 0, question_count: 0 };
    MOCK_BANKS.push(b);
    return mockStream([
      { type: 'result', data: { ok: true, bank: b } }
    ], 400);
  });

  // --- group.list ---
  _register('group.list', (params) => {
    return mockStream([
      { type: 'result', data: { groups: MOCK_GROUPS.filter(g => g.bank_id === params.bank_id) } }
    ], 300);
  });

  // --- group.create ---
  _register('group.create', (params) => {
    const g = { id: Date.now(), bank_id: params.bank_id, name: params.name, order: 1, status: 'empty' };
    MOCK_GROUPS.push(g);
    return mockStream([
      { type: 'result', data: { ok: true, group: g } }
    ], 400);
  });

  // --- import.questions (流式) ---
  _register('import.questions', (params) => {
    const n = (params.image_ids || []).length || 3;
    const chunks = [
      { type: 'text', content: `开始处理 ${n} 张图片...` },
    ];

    for (let i = 0; i < n; i++) {
      chunks.push(
        { type: 'text', content: `第 ${i + 1} 页 OCR 识别中...` },
      );
    }

    chunks.push(
      { type: 'draft_ready',
        draft_id: `draft_${Date.now()}`,
        questions: [
          { label: '1.1.1', content: '计算极限 $\\lim_{x \\to 0} \\frac{\\sin x}{x}$', page: 1 },
          { label: '1.1.2', content: '计算极限 $\\lim_{x \\to 1} \\frac{x^2 - 1}{x - 1}$', page: 1 },
          { label: '1.1.3', content: '判断函数 $f(x) = \\begin{cases} x\\sin\\frac{1}{x}, & x \\neq 0 \\\\ 0, & x = 0 \\end{cases}$ 在 $x=0$ 处的连续性', page: 2 },
          { label: '1.1.4', content: '求 $\\lim_{n \\to \\infty} (1 + \\frac{1}{n})^n$', page: 3 },
          { label: '1.1.5', content: '证明 $\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1$ 并用其求 $\\lim_{x \\to 0} \\frac{\\tan x}{x}$', page: 3 },
        ],
      },
    );

    return mockStream(chunks, 800);
  });

  // --- exercise.start (流式) ---
  _register('exercise.start', () => {
    _mockSessionId++;
    const q = MOCK_QUESTIONS.find(q => q.status === 'unfinished') || MOCK_QUESTIONS[0];
    const allQs = MOCK_QUESTIONS.filter(x => x.status !== 'done').map(function(x) {
      return { id: x.id, label: x.label, content: x.content, status: x.status };
    });
    return mockStream([
      {
        type: 'question',
        question_id: q.id,
        label: q.label,
        content: q.content,
        session_id: _mockSessionId,
        question_list: allQs,
      },
    ], 300);
  });

  // --- exercise.chat (流式) ---
  _register('exercise.chat', () => {
    const turn = Math.floor(Math.random() * AI_RESPONSES.length);
    const response = AI_RESPONSES[turn % AI_RESPONSES.length];
    const chars = response.split('');
    const chunks = [];
    for (let i = 0; i < chars.length; i += 3) {
      chunks.push({ type: 'output', content: chars.slice(i, i + 3).join('') });
    }
    return mockStream(chunks, 25);
  });

  // --- exercise.collect (流式) ---
  _register('exercise.collect', () => {
    const items = [
      { id: 'w1', title: '等价无穷小', source: '求 $\\lim_{x \\to 0} \\frac{\\sin x}{x}$', detail: '未掌握 sin x ~ x 的代换条件', types: ['方法技巧'], mastery: 20 },
      { id: 'w2', title: '洛必达条件', source: '求 $\\lim_{x \\to 0} \\frac{\\sin x}{x}$', detail: '洛必达法则适用条件判断不准确', types: ['概念理解'], mastery: 20 },
    ];
    const outputText = '/* 正在分析对话历史，提取薄弱点... */```json\n' + JSON.stringify({ type: 'collect_draft', round: 1, items: items }) + '\n```';
    const chars = outputText.split('');
    const chunks = [];
    for (let i = 0; i < chars.length; i += 5) {
      chunks.push({ type: 'output', content: chars.slice(i, i + 5).join('') });
    }
    chunks.push({
      type: 'collect_draft',
      session_id: _mockSessionId,
      round: 1,
      items: items,
    });
    return mockStream(chunks, 15);
  });


  // --- exercise.summary (流式) ---
  _register('exercise.summary', () => {
    const outputText = '/* 正在生成学习总结... */```json\n{"type":"summary","summary":"学生能够独立应用重要极限解决相关问题，但对等价无穷小的代换仍不够熟练。建议后续练习中增加变式训练。","result":"True","mastery":0.45}\n```';
    const chars = outputText.split('');
    const chunks = [];
    for (let i = 0; i < chars.length; i += 5) {
      chunks.push({ type: 'output', content: chars.slice(i, i + 5).join('') });
    }
    chunks.push({
      type: 'result',
      summary: '学生能够独立应用重要极限解决相关问题，但对等价无穷小的代换仍不够熟练。',
      result: 'True',
    });
    chunks.push({
      type: 'next_question',
      question_id: 11,
      label: '1.1.11',
      content: '求导数 $f\'(x)$ 已知 $f(x) = x^3 + 2x^2 - 5x + 3$',
    });
    // 偏好检测结果（非阻塞）
    chunks.push({
      type: 'preference_actions',
      round: 1,
      actions: [
        { id: 'pref_1', action: 'insert', label: '新增', icon: '➕',
          typeBadge: 'tutoring', rule: '采用逐步引导式教学，不直接给完整解答',
          reason: '学生对引导式教学反馈积极',
          step: 1, stepActive: true,
          examples: [
            { label: '触发', text: '学生提问' },
            { label: '符合偏好', text: '给出提示和思路，引导学生自己推导', good: true },
          ],
        },
      ],
    });
    return mockStream(chunks, 15);
  });

  // --- stats.get ---
  _register('stats.get', () => {
    return mockStream([
      {
        type: 'result',
        data: {
          total_questions: 470,
          done_questions: 247,
          mastery: 0.68,
          streak_days: 12,
          review_pending: 8,
          weak_areas: 5,
        },
      }
    ], 300);
  });

  // --- question.list ---
  _register('question.list', () => {
    return mockStream([
      { type: 'result', data: { questions: MOCK_QUESTIONS } }
    ], 400);
  });

  // ── 拦截 api.me ──

  // --- session.list ---
  _register('session.list', () => {
    const sessions = [
      { id: 1, user_id: 1, route: 'exercise', status: 'active', created_at: '2026-06-11T09:00:00Z', completed_at: null },
      { id: 2, user_id: 1, route: 'exercise', status: 'active', created_at: '2026-06-11T08:30:00Z', completed_at: null },
      { id: 3, user_id: 1, route: 'Chat', status: 'idle', created_at: '2026-06-10T14:00:00Z', completed_at: '2026-06-10T14:30:00Z' },
    ];
    return mockStream([
      { type: 'result', data: sessions }
    ], 200);
  });

  // --- session.get ---
  function _makeSession1Messages() {
    var qContent = '计算极限 $\\lim_{x \\to 0} \\frac{\\sin x}{x}$';
    var items = [
      { id: 'w1', title: '等价无穷小', source: qContent, detail: '代换条件不明确', types: ['方法技巧'], mastery: 20 },
      { id: 'w2', title: '洛必达条件', source: qContent, detail: '适用条件判断不准确', types: ['概念理解'], mastery: 20 },
    ];
    var prefActions = [
      { id: 'pref_1', action: 'insert', label: '新增', icon: '➕', typeBadge: 'tutoring', rule: '采用逐步引导式教学', reason: '反馈积极', step: 1, stepActive: true, examples: [{ label: '触发', text: '学生提问' }, { label: '符合', text: '提示引导', good: true }] },
    ];
    return [
      { role: 'user', content: qContent },
      { role: 'assistant', content: '这是一道重要极限题。/* 思考过程 */```json\n{"type":"question","content":"副题：你能想到用夹逼准则吗？"}\n```讲讲你的思路。' },
      { role: 'user', content: '用洛必达' },
      { role: 'assistant', content: '/* 分析 */```json\n' + JSON.stringify({ type: 'collect_draft', round: 1, items: items }) + '\n```' },
      { role: 'user', content: '【系统指令】收录错题' },
      { role: 'assistant', content: '/* 偏好 */```json\n' + JSON.stringify({ type: 'preference_actions', round: 1, actions: prefActions }) + '\n```' },
    ];
  }
  _register('session.get', (params) => {
    var id = parseInt(params.id, 10) || 0;
    var data;
    if (id === 1) {
      data = {
        id: 1,
        route: 'exercise',
        messages: _makeSession1Messages(),
        extern: {
          current_question_id: 'q_ex_001',
          ui_state: {
            card_states: {
              collect_1: { confirmed: true, items: { w1: { active: true, mastery: 20 }, w2: { active: true, mastery: 20 } } },
              pref_1: { confirmed: true, items: { pref_1: { active: true } } },
            },
          },
          collect_rounds: { data: [] },
          pref_rounds: { data: [] },
        },
        status: 'active',
        created_at: '2026-06-11T09:00:00Z',
        completed_at: null,
      };
    } else if (id === 2) {
      data = {
        id: 2, route: 'exercise',
        messages: [{ role: 'user', content: '求导数 $f(x)=x^2$' }, { role: 'assistant', content: '答案是 $2x$。' }],
        extern: { ui_state: {}, collect_rounds: { data: [] }, pref_rounds: { data: [] } },
        status: 'active', created_at: '2026-06-11T08:30:00Z', completed_at: null,
      };
    } else {
      data = {
        id: id, route: 'Chat',
        messages: [{ role: 'user', content: '你好' }, { role: 'assistant', content: '你好！有什么可以帮你的？' }],
        extern: {},
        status: 'idle', created_at: '2026-06-10T14:00:00Z', completed_at: '2026-06-10T14:30:00Z',
      };
    }
    return mockStream([{ type: 'result', data: data }], 200);
  });

  // --- exercise.confirm_collect ---
  _register('exercise.confirm_collect', (params) => {
    console.log('[Mock] confirm_collect ui_state=', JSON.stringify(params.ui_state));
    return mockStream([
      { type: 'result', ok: true }
    ], 300);
  });

  // --- exercise.confirm_preference ---
  _register('exercise.confirm_preference', (params) => {
    console.log('[Mock] confirm_preference ui_state=', JSON.stringify(params.ui_state));
    return mockStream([
      { type: 'result', ok: true }
    ], 300);
  });

  api.me = async function () {
    await delay(200);
    return { ok: true, data: { id: 1, name: 'Demo 用户' } };
  };

  console.log('[Mock] API 已切换到模拟模式 — 所有请求返回模拟数据');
})();