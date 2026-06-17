# PrivateTeacher

**AI 私人教师** — 不是答疑机器人、不是搜题工具，是一个完整的、个性化的、可以替代真人私教的 AI 教师。

> 系统会记住每个学生怎么学最好，并在做题过程中越来越懂他，最终做到"你出的题刚好卡在我的边界区，你的回答我一看就懂而且学得很扎实"。

---

## 核心理念

### 偏好是核心

不存在独立的"记忆引擎"。学生的偏好、习惯、薄弱点、做题记录——所有"系统知道关于这个学生的事"都归**偏好系统**管。偏好即记忆，学习记录即记忆。

### 学习项目 = 题库容器

学习项目就是把若干题库聚合在一起的一个壳。目标硬性固定：做完这个项目里的所有题，每题及其变式条件反射级会做。系统始终掌握教学主动权。

### 做题、复习、收录、总结 四步流程

```
开始做题 → 多轮对话 →
  可选: 收录错题本（LLM 生成草稿 → 用户自然语言修订 → 确认）
  终点: 总结（记录写入 + 偏好后台生成）→ 自动跳下一题
```

### 三池结构

| 结果 | 复习池 | 出题策略 |
|---|---|---|
| 做对了（无收录） | consolidate | 作为"安全底座"融入新题 |
| 做错了（无收录） | mistake | LLM 自行判断问题出在哪 |
| 主动收录了 | weakness | 靶向变体，精准覆盖薄弱点 |

---

## 架构总览

```
Pipeline (场景交互流程定义器)
│
├── strategies/           ← 业务逻辑
│   ├── calculus/         ← 微积分（做题、复习、答疑）
│   └── system/           ← 系统流程（题库导入等）
│
├── SessionManager        ← LLM 会话管理
│   └── Session           ← 一次对话，内存活跃，destroy 写回
│
├── PreferenceEngine      ← 偏好 + 弱信号积累
│
├── PromptManager         ← 提示词模板管理
│
└── Store                 ← 统一存储（JSON / MySQL 可切换）
```

### 模块层级

| 模块 | 层级 | 职责 |
|---|---|---|
| Log | 0 | 日志，独立于所有模块的监管者 |
| Store | 1 | 统一存储 CRUD，不感知数据模型，主键自管理 |
| LLMGateway | 2 | LLM 调用，Session 生命周期，计费 |
| PromptManager | 3 | 提示词模板，文件驱动 |
| PreferenceEngine | 4 | 偏好提取 / 渐进披露 / 弱信号积累 |
| Pipeline | 5 | 编排所有基础设施，定义交互流程 |

---

## 快速开始

```bash
# 安装依赖
pip install -r requirements.txt

# 配置 API 密钥（环境变量）
set DEEPSEEK_API_KEY=sk-xxx
set ARK_API_KEY=sk-xxx   # 如果使用视觉模型

# 启动 Web 服务
python web/server.py
```

---

## 当前状态

模块设计阶段。已完成的底层模块：

- [x] Store — 统一存储（JSON 实现已完成，MySQL 接口待实现）
- [x] Log — 日志系统
- [x] LLMGateway — SessionManager + Session
- [x] PromptManager — 模板管理
- [x] PreferenceEngine — 偏好引擎（弱信号积累、合并确认、渐进披露）
- [ ] Pipeline — 完整教学编排
- [ ] UserAuth — 用户鉴权
- [ ] 复习流程（系统出题）
- [ ] 跨对话教师记忆

---

## 技术栈

- Python 3.11+
- FastAPI（Web 服务）
- OpenAI SDK（LLM 调用）
- JSON 文件存储（开发期）/ MySQL（上线）
- 纯 Python 标准库 + Pydantic

---

## 许可

MIT
>>>>>>> d437d5c (feat: initial commit - PrivateTeacher project)
