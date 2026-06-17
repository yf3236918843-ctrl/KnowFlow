# 简学前端视图系统

## 布局骨架

```
.app (grid: auto 1fr / 48px 1fr)
├── .sidebar          → row 1/3, col 1  (侧栏，跨两行，全局固定)
├── .context-bar      → row 1, col 2    (标题栏，视图可接管内容)
└── .content-area     → row 2, col 2    (功能区，被当前前台栈顶视图完全接管)
```

- 侧栏全局固定，不随视图切换
- context-bar 默认显示面包屑，当前视图可以接管它的内容（加返回箭头、自定义按钮等）
- content-area + context-bar 全是当前前台栈顶视图的地盘

---

## 视图栈

每个视图是一个**实例**，有独立状态。实例属于栈，栈之间互相独立。

```
后台池: [栈A, 栈B, 栈C]
栈A: [视图1, 视图2]    ← 多栈并存，互不干扰
栈B: [视图1]
栈C: [视图1, 视图2, 视图3]
```

### 操作原语

```javascript
show(callable, args)  // 切换栈。拿 callable+args 去后台池匹配→有则恢复，无则新建
open(callable, args)  // 压栈。当前栈顶 suspend，新视图 activate，出现返回箭头
back(result)          // 出栈。调 beforePop 拦截→弹栈顶→新栈顶 activate(null, result)
```

### show 详细流程

```
① 遍历后台池所有栈的所有视图，调 view.match(args)
   → 有人返回 true → 该栈提到前台
   → 无人应答     → 调 callable(args) 创建实例，新栈

② 旧前台栈进后台：遍历调 selfDestruct()，栈顶 suspend()

③ 新栈顶 activate(ctx, null)
   → ctx 有值 = 首次；ctx 为空 = 恢复
   → 返回 { title, content, mount }
```

### open 详细流程

```
① 调 callable(args) 创建实例
② 当前栈顶 suspend()
③ 新实例压栈，context-bar 出现返回箭头
④ 新实例 activate(args, null)
```

### back 详细流程

```
① 当前栈顶 beforePop() → 'block' 则终止
② 当前栈顶 deactivate()
③ 弹栈
④ 新栈顶 activate(null, result)  → 栈只剩一层时返回箭头消失
```

---

## 视图注册

```javascript
registerView('exercise', {
  create(args) {
    return {
      viewId: null,      // 框架注入
      _type: null,

      activate(ctx, result) {
        // ctx 有值 → 首次；ctx 为空 → 恢复
        // result → back() 传回的数据
        // 返回 { title, content, mount? }
        return {
          title: () => `<span>${this.title}</span>`,
          content: () => `<div>...</div>`,
          mount: () => { /* DOM 已插入，绑定事件 */ },
        };
      },

      suspend() { /* 保留状态，释放 DOM */ },
      deactivate() { /* 销毁状态 */ },

      beforePop() { /* 返回 'block' 阻止弹出 */ },
      match(args) { /* 返回 true/false */ },
      selfDestruct() { /* 调 vote(this, true) 表态 */ },
    };
  },
});
```

---

## selfDestruct 投票

```
视图内部 _readyToDie（框架不碰，只读）

selfDestruct() 是表态时机（栈切换时框架遍历调）：
  → vote(this, true)  准备好死了
  → 不动               默认 false

vote(this, bool) 是框架函数，视图调用：
  → 设 _readyToDie = bool
  → 传入 true → 自动调 destroyCheck()

destroyCheck(stack)：
  → 栈内所有视图 _readyToDie === true → 销毁栈
  → 有 false → 等着

视图可在任意时刻调 vote(this, true/false) 修改标记。
```

---

## 视图间通信

### back() 传数据

```javascript
// B 层弹回
back({ image: 'data:...' });

// A 层收到
activate(null, result) {
  if (result) this.image = result.image;
}
```

### 同栈互相调用

```javascript
const aView = this.stack?.findView(v => v._type === 'exercise');
if (aView) aView.getLatestContent();
```

---

## CSS 分层

```
web/test/css/
├── base.css          全局变量、reset、布局骨架、动画
├── sidebar.css       侧栏
├── components.css    按钮、context-bar、badge、toast
├── chat.css          聊天气泡
├── input.css         输入栏、扩展菜单
├── qbar.css          题目栏
├── cards.css         草稿、总结卡片
├── panel.css         面板
└── overlays.css      覆盖层

funcViews/{name}/style.css   视图专有样式（activate 时加载，suspend 时移除）
```

- 全局样式由 main.html 加载，所有视图共享
- 视图专有样式由 ViewManager 动态加载/卸载
- 配色、字体、间距等全局性设计令牌统一在 base.css 的 `:root` 中

---

## 功能视图目录约定

```
FuncViewManager/
├── ViewManager.js        注册模块：registerView / show / open / back / vote
└── FuncViews/
    ├── exercise/
    │   ├── view.js        注册 + 实例工厂
    │   ├── style.css      专有样式（可选）
    │   └── test.html      独立调试入口（可选）
    ├── draw/
    │   ├── view.js
    │   └── style.css
    ├── import-question/
    │   └── view.js
    └── ...
```

### 原则

1. **视图的对外接口只有 `registerView` 那一行注册。** 框架不关心视图内部如何组织。
2. **视图之间不相互 import。** 通信只通过 `back(result)` 和 `stack.findView()`。
3. **每个视图可以独立调试。** 自己的 `test.html` 只需加载 base.css + 自己的 view.js。
4. **视图专有样式放在自己的 `style.css`**，ViewManager 在 activate 时注入，suspend 时移除。
5. **同一个视图的内部文件可以随意耦合**，分几个文件都行，外部看不见。

---

## 视图接口

```javascript
// 视图的 activate() 返回
{
  title: () => string,   // context-bar 的 HTML
  content: () => string,  // content-area 的 HTML
  mount: () => void,      // DOM 插入后回调，绑事件用
}
```

### Shell API（由 main.html 提供）

```javascript
const Shell = {
  setTitle(html),    // 更新 context-bar
  setContent(html),  // 更新 content-area
  showBack(),        // 显示返回箭头
  hideBack(),        // 隐藏返回箭头
}
```

---

## 完整场景

### 顺序做题 → 画图 → 插入 → 恢复

```
当前栈: [exercise]

open(createDraw, {})
  → exercise.suspend()
  → draw.activate({})  // 返回箭头出现

draw.back({ image: '...' })
  → beforePop → 通过
  → draw.deactivate()
  → exercise.activate(null, { image: '...' })
  → exercise 插入图片，返回箭头消失
```

### 多栈切换

```
show(createExercise, { bankId: 1 }) → 新建栈A
show(createExercise, { bankId: 2 }) → 新建栈B（栈A进后台）
show(createExercise, { bankId: 1 }) → 匹配栈A（栈B进后台）
```
