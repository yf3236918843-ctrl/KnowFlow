# Exercise Image OCR Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add image attachments to the sequential exercise flow so each sent image is OCR-processed first, displayed as a per-image chat block with retry/continue controls, then merged with the user's text before reaching the teaching LLM.

**Architecture:** Keep the current `exercise.chat` stream as the single request path, but extend it with an OCR pre-processing phase. Frontend attachments remain local until send, then they are transferred into a per-round OCR UI group; backend produces OCR stream events and persists final OCR cards as visible session messages while excluding them from later LLM context.

**Tech Stack:** Vanilla JS frontend, existing ChatView / ViewManager stack, FastAPI streaming backend, Python exercise workflow, existing `Vision` route in `llm_gateway`.

---

### Task 1: Add regression coverage for OCR payload shaping and toolbar-safe attachment state

**Files:**
- Create: `D:\FIles\documents\Project FIles\PT\Project\ClaudeWorkSpace\tests\regression_exercise_image_payload.js`
- Create: `D:\FIles\documents\Project FIles\PT\Project\ClaudeWorkSpace\tests\regression_exercise_ocr_context.py`
- Modify: `D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\Process\exercise\view.js`
- Modify: `D:\FIles\documents\Project FIles\PT\Project\core\pipeline\strategies\exercise_workflow.py`

- [ ] **Step 1: Write the failing frontend payload test**

```javascript
const helper = context.window.__exerciseViewTest;
const payload = helper.buildChatRequestPayload({
  session_id: 12,
  message: '用户补充',
  attachments: [{ name: 'a.png', dataUrl: 'data:image/png;base64,AAA' }]
});
if (!payload.attachments || payload.attachments.length !== 1) {
  throw new Error('attachments should be included in exercise.chat payload');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node D:\FIles\documents\Project FIles\PT\Project\ClaudeWorkSpace\tests\regression_exercise_image_payload.js`
Expected: FAIL because `__exerciseViewTest.buildChatRequestPayload` does not exist yet.

- [ ] **Step 3: Write the failing backend OCR context test**

```python
payload = ExerciseWorkflow._compose_ocr_augmented_message(
    "用户补充",
    [{"index": 1, "text": "图中题干A"}],
)
assert "图中题干A" in payload
assert "用户补充" in payload
```

- [ ] **Step 4: Run test to verify it fails**

Run: `py -3 D:\FIles\documents\Project FIles\PT\Project\ClaudeWorkSpace\tests\regression_exercise_ocr_context.py`
Expected: FAIL because helper does not exist yet.

- [ ] **Step 5: Commit after both tests are red**

```bash
git -C "D:\FIles\documents\Project FIles\PT\Project" add ClaudeWorkSpace/tests/regression_exercise_image_payload.js ClaudeWorkSpace/tests/regression_exercise_ocr_context.py
git -C "D:\FIles\documents\Project FIles\PT\Project" commit -m "test: add exercise image ocr regressions"
```

### Task 2: Implement frontend attachment preview and OCR round state

**Files:**
- Modify: `D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\ChatView\js\ChatView.js`
- Modify: `D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\ChatView\css\input.css`
- Modify: `D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\ChatView\css\chat.css`
- Modify: `D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\Process\exercise\view.js`

- [ ] **Step 1: Implement attachment preview in ChatView**

```javascript
node.addEventListener('click', function (event) {
  if (event.target.closest('[data-attach-del]')) return;
  openImagePreview(item);
});
```

- [ ] **Step 2: Add OCR round helper state in exercise view**

```javascript
state.pendingImages = [];
state.ocrRound = null;
```

- [ ] **Step 3: Implement request payload helper and OCR UI block lifecycle**

```javascript
function buildChatRequestPayload(input) {
  return {
    session_id: input.session_id,
    message: input.message,
    attachments: (input.attachments || []).map(function (item, index) {
      return {
        id: item.id || ('img_' + (index + 1)),
        name: item.name || ('image-' + (index + 1) + '.png'),
        dataUrl: item.fullImage || item.dataUrl,
      };
    }),
  };
}
```

- [ ] **Step 4: Wire OCR stream events to per-image blocks with retry / continue**

```javascript
if (event.type === 'image_think') updateOcrCard(event.image_id, 'thinking', event.content);
if (event.type === 'image_output') updateOcrCard(event.image_id, 'output', event.content);
if (event.type === 'image_error') markOcrCardFailed(event.image_id, event.message);
```

- [ ] **Step 5: Run frontend regression and syntax checks**

Run:
- `node --check D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\ChatView\js\ChatView.js`
- `node --check D:\FIles\documents\Project FIles\PT\Project\web\test\FuncViewManager\FuncViews\ChatView\Process\exercise\view.js`
- `node D:\FIles\documents\Project FIles\PT\Project\ClaudeWorkSpace\tests\regression_exercise_image_payload.js`

Expected: all PASS.

### Task 3: Implement backend OCR pre-processing and message persistence

**Files:**
- Modify: `D:\FIles\documents\Project FIles\PT\Project\core\pipeline\strategies\exercise_workflow.py`
- Modify: `D:\FIles\documents\Project FIles\PT\Project\core\pipeline\Tools\Image\__init__.py`
- Modify: `D:\FIles\documents\Project FIles\PT\Project\core\llm_gateway\__init__.py`

- [ ] **Step 1: Add pure helpers for data-url parsing, OCR card serialization, and final chat message composition**

```python
def _compose_ocr_augmented_message(user_text: str, ocr_results: list[dict]) -> str:
    blocks = []
    for item in ocr_results:
        blocks.append(f"【图片{item['index']}图转文结果】\n{item['text']}")
    if user_text.strip():
        blocks.append(f"【用户补充说明】\n{user_text.strip()}")
    return "\n\n".join(blocks).strip()
```

- [ ] **Step 2: Extend `exercise.chat` to accept attachments and stream OCR events first**

```python
attachments = ctx.get("attachments") or []
async for chunk in _with_session(sid, user_id, sm, self._do_chat(msg, attachments)):
    yield chunk
```

- [ ] **Step 3: Persist visible OCR card messages while excluding them from future LLM calls**

```python
session.append("assistant", {
    "content": card_text,
    "_omit_from_llm": True
})
```

- [ ] **Step 4: Teach `Session._build_request()` and `_fmt_conv()` to skip `_omit_from_llm`**

```python
if msg.get("_omit_from_llm"):
    continue
```

- [ ] **Step 5: Run backend regression**

Run:
- `py -3 D:\FIles\documents\Project FIles\PT\Project\ClaudeWorkSpace\tests\regression_exercise_ocr_context.py`
- `py -3 -m compileall D:\FIles\documents\Project FIles\PT\Project\core\pipeline\strategies\exercise_workflow.py D:\FIles\documents\Project FIles\PT\Project\core\pipeline\Tools\Image\__init__.py D:\FIles\documents\Project FIles\PT\Project\core\llm_gateway\__init__.py`

Expected: PASS / no syntax errors.

### Task 4: Final integration verification and cache busting

**Files:**
- Modify: `D:\FIles\documents\Project FIles\PT\Project\web\test\main.html`

- [ ] **Step 1: Bump frontend asset versions for changed ChatView / exercise files**

```html
<script src="FuncViewManager/FuncViews/ChatView/ChatView/js/ChatView.js?v=20260614i"></script>
<script src="FuncViewManager/FuncViews/ChatView/Process/exercise/view.js?v=20260614g"></script>
```

- [ ] **Step 2: Run the full targeted regression set**

Run:
- `node D:\FIles\documents\Project FIles\PT\Project\ClaudeWorkSpace\tests\regression_draw_toolbar_mount.js`
- `node D:\FIles\documents\Project FIles\PT\Project\ClaudeWorkSpace\tests\regression_draw_return_bridge.js`
- `node D:\FIles\documents\Project FIles\PT\Project\ClaudeWorkSpace\tests\regression_draw_crop_bounds.js`
- `node D:\FIles\documents\Project FIles\PT\Project\ClaudeWorkSpace\tests\regression_exercise_image_payload.js`
- `py -3 D:\FIles\documents\Project FIles\PT\Project\ClaudeWorkSpace\tests\regression_exercise_ocr_context.py`

Expected: all PASS.

- [ ] **Step 3: Commit the feature**

```bash
git -C "D:\FIles\documents\Project FIles\PT\Project" add web/test/main.html web/test/FuncViewManager/FuncViews/ChatView/ChatView/js/ChatView.js web/test/FuncViewManager/FuncViews/ChatView/Process/exercise/view.js web/test/FuncViewManager/FuncViews/ChatView/ChatView/css/input.css web/test/FuncViewManager/FuncViews/ChatView/ChatView/css/chat.css core/pipeline/strategies/exercise_workflow.py core/pipeline/Tools/Image/__init__.py core/llm_gateway/__init__.py ClaudeWorkSpace/tests/regression_exercise_image_payload.js ClaudeWorkSpace/tests/regression_exercise_ocr_context.py
git -C "D:\FIles\documents\Project FIles\PT\Project" commit -m "feat: add exercise image ocr pre-processing flow"
```
