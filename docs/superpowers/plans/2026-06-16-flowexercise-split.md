# FlowExercise Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the monolithic `FlowExercise/exercise_workflow.py` into a thin pipeline entry plus focused support modules without changing the external `exercise` pipeline protocol.

**Architecture:** Keep `@register_pipeline("exercise")`, `run`, and `run_stream` stable in a single scanned file, and move helper logic into package-local modules organized by orchestration concerns. Preserve existing runtime behavior first; do not redesign persistence, session schema, or frontend event contracts during this split.

**Tech Stack:** Python 3, existing pipeline registry, `SessionManager`, `PreferenceEngine`, JSON file store, existing regression scripts in `ClaudeWorkSpace/tests`

---

### Task 1: Freeze the Existing Behavior Surface

**Files:**
- Modify: `D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_collect_rounds.py`
- Modify: `D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_preference_flow.py`
- Test: `D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_draft_id_confirm.py`

- [ ] **Step 1: Write the failing seam assertions**

Add assertions that import the current module and exercise the helpers that must survive the split:

```python
from pipeline.strategies.calculus.FlowExercise.exercise_workflow import ExerciseWorkflow


def test_collect_helpers_still_normalize_and_parse():
    wf = ExerciseWorkflow()
    parsed = wf._parse_json('```json\\n{\"type\":\"collect_draft\",\"items\":[{\"title\":\"A\"}]}\\n```')
    items = wf._normalize_collect_items(parsed["items"])
    assert parsed["type"] == "collect_draft"
    assert items[0]["id"] == "w1"
    assert items[0]["active"] is True
```
```

- [ ] **Step 2: Run test to verify it fails**

Run: `py -3 -m pytest D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_collect_rounds.py -q`

Expected: FAIL because the new seam assertions are not present yet or helper import path is unstable.

- [ ] **Step 3: Add only the minimal test code**

Extend the regression files with import-path and helper-behavior assertions, without changing production code yet.

- [ ] **Step 4: Run the targeted regressions again**

Run: `py -3 -m pytest D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_collect_rounds.py D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_preference_flow.py D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_draft_id_confirm.py -q`

Expected: PASS on the old monolith before refactor starts.

- [ ] **Step 5: Commit**

```bash
git -C "D:/FIles/documents/Project FIles/PT/Project" add ClaudeWorkSpace/tests/regression_collect_rounds.py ClaudeWorkSpace/tests/regression_preference_flow.py ClaudeWorkSpace/tests/regression_draft_id_confirm.py
git -C "D:/FIles/documents/Project FIles/PT/Project" commit -m "test: freeze flowexercise split seams"
```

### Task 2: Create the New Package Skeleton

**Files:**
- Create: `D:/FIles/documents/Project FIles/PT/Project/core/pipeline/strategies/calculus/FlowExercise/__init__.py`
- Create: `D:/FIles/documents/Project FIles/PT/Project/core/pipeline/strategies/calculus/FlowExercise/constants.py`
- Create: `D:/FIles/documents/Project FIles/PT/Project/core/pipeline/strategies/calculus/FlowExercise/registry.py`
- Create: `D:/FIles/documents/Project FIles/PT/Project/core/pipeline/strategies/calculus/FlowExercise/helpers.py`
- Modify: `D:/FIles/documents/Project FIles/PT/Project/core/pipeline/strategies/calculus/FlowExercise/exercise_workflow.py`
- Test: `D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_switch_role_context.py`

- [ ] **Step 1: Write the failing import/discovery test**

Add a test that imports the new package-local modules and verifies the workflow still exposes `ExerciseWorkflow`.

```python
from pipeline.strategies.calculus.FlowExercise.exercise_workflow import ExerciseWorkflow
from pipeline.strategies.calculus.FlowExercise.registry import _FUNC_REGISTRY


def test_flowexercise_registry_available():
    assert ExerciseWorkflow is not None
    assert isinstance(_FUNC_REGISTRY, dict)
```
```

- [ ] **Step 2: Run test to verify it fails**

Run: `py -3 -m pytest D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_switch_role_context.py -q`

Expected: FAIL because `registry.py` and `constants.py` do not exist yet.

- [ ] **Step 3: Write minimal package scaffolding**

Create the new support modules and move only these shared items first:
- role map
- system prefixes
- `_FUNC_REGISTRY`
- `_register_func`
- `_with_session`
- helper utilities that do not depend on `self`

- [ ] **Step 4: Run the focused test**

Run: `py -3 -m pytest D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_switch_role_context.py -q`

Expected: PASS, with the workflow import path unchanged.

- [ ] **Step 5: Commit**

```bash
git -C "D:/FIles/documents/Project FIles/PT/Project" add core/pipeline/strategies/calculus/FlowExercise/__init__.py core/pipeline/strategies/calculus/FlowExercise/constants.py core/pipeline/strategies/calculus/FlowExercise/registry.py core/pipeline/strategies/calculus/FlowExercise/helpers.py core/pipeline/strategies/calculus/FlowExercise/exercise_workflow.py ClaudeWorkSpace/tests/regression_switch_role_context.py
git -C "D:/FIles/documents/Project FIles/PT/Project" commit -m "refactor: add flowexercise package scaffolding"
```

### Task 3: Extract Pure Draft and Parsing Logic

**Files:**
- Create: `D:/FIles/documents/Project FIles/PT/Project/core/pipeline/strategies/calculus/FlowExercise/draft_state.py`
- Create: `D:/FIles/documents/Project FIles/PT/Project/core/pipeline/strategies/calculus/FlowExercise/text_codec.py`
- Modify: `D:/FIles/documents/Project FIles/PT/Project/core/pipeline/strategies/calculus/FlowExercise/exercise_workflow.py`
- Test: `D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_draft_id_confirm.py`
- Test: `D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_collect_rounds.py`

- [ ] **Step 1: Write the failing extraction tests**

Add direct module tests for:
- `parse_json`
- `clean_latex`
- `normalize_collect_items`
- `normalize_pref_actions`
- draft resolution helpers

```python
from pipeline.strategies.calculus.FlowExercise.draft_state import normalize_collect_items, resolve_collect_draft
from pipeline.strategies.calculus.FlowExercise.text_codec import parse_json


def test_resolve_collect_draft_prefers_draft_id():
    ext = {"collect_drafts": {"d1": {"draft_id": "d1", "data": [{"id": "w1"}]}}, "collect_rounds": {"1": {"draft_id": "d1"}}}
    draft_id, round_data = resolve_collect_draft(ext, "d1", "1", new_id=lambda prefix: "unused")
    assert draft_id == "d1"
    assert round_data["data"][0]["id"] == "w1"
```
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `py -3 -m pytest D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_draft_id_confirm.py D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_collect_rounds.py -q`

Expected: FAIL because the extracted modules and functions do not exist yet.

- [ ] **Step 3: Move the pure helpers**

Implement minimal extracted functions in:
- `text_codec.py`
- `draft_state.py`

Update `ExerciseWorkflow` methods to delegate to those functions while keeping method names for compatibility if existing tests call them through the class.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `py -3 -m pytest D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_draft_id_confirm.py D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_collect_rounds.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C "D:/FIles/documents/Project FIles/PT/Project" add core/pipeline/strategies/calculus/FlowExercise/draft_state.py core/pipeline/strategies/calculus/FlowExercise/text_codec.py core/pipeline/strategies/calculus/FlowExercise/exercise_workflow.py ClaudeWorkSpace/tests/regression_draft_id_confirm.py ClaudeWorkSpace/tests/regression_collect_rounds.py
git -C "D:/FIles/documents/Project FIles/PT/Project" commit -m "refactor: extract flowexercise draft and text helpers"
```

### Task 4: Extract Question and OCR Services

**Files:**
- Create: `D:/FIles/documents/Project FIles/PT/Project/core/pipeline/strategies/calculus/FlowExercise/question_flow.py`
- Create: `D:/FIles/documents/Project FIles/PT/Project/core/pipeline/strategies/calculus/FlowExercise/ocr_flow.py`
- Modify: `D:/FIles/documents/Project FIles/PT/Project/core/pipeline/strategies/calculus/FlowExercise/exercise_workflow.py`
- Test: `D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_exercise_ocr_context.py`
- Test: `D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_ocr_batch_card.js`

- [ ] **Step 1: Write the failing Python seam tests**

Add tests for:
- `make_question_ref`
- `compose_ocr_augmented_message`
- `parse_data_url`

```python
from pipeline.strategies.calculus.FlowExercise.ocr_flow import compose_ocr_augmented_message, parse_data_url


def test_compose_ocr_augmented_message_keeps_text_and_ocr_blocks():
    text = compose_ocr_augmented_message("补充说明", [{"index": 1, "text": "题干A"}])
    assert "题干A" in text
    assert "补充说明" in text
```
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `py -3 -m pytest D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_exercise_ocr_context.py -q`

Expected: FAIL because the extracted modules do not exist yet.

- [ ] **Step 3: Extract minimal question and OCR functions**

Move only deterministic helpers and thin wrappers around existing tool calls; keep streaming event shapes unchanged.

- [ ] **Step 4: Run Python and JS regressions**

Run: `py -3 -m pytest D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_exercise_ocr_context.py -q`

Run: `node D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_ocr_batch_card.js`

Expected: PASS on both commands.

- [ ] **Step 5: Commit**

```bash
git -C "D:/FIles/documents/Project FIles/PT/Project" add core/pipeline/strategies/calculus/FlowExercise/question_flow.py core/pipeline/strategies/calculus/FlowExercise/ocr_flow.py core/pipeline/strategies/calculus/FlowExercise/exercise_workflow.py ClaudeWorkSpace/tests/regression_exercise_ocr_context.py
git -C "D:/FIles/documents/Project FIles/PT/Project" commit -m "refactor: extract flowexercise question and ocr helpers"
```

### Task 5: Split Handlers from the Workflow Entry

**Files:**
- Create: `D:/FIles/documents/Project FIles/PT/Project/core/pipeline/strategies/calculus/FlowExercise/handlers.py`
- Modify: `D:/FIles/documents/Project FIles/PT/Project/core/pipeline/strategies/calculus/FlowExercise/exercise_workflow.py`
- Test: `D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_preference_flow.py`
- Test: `D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_switch_role_context.py`

- [ ] **Step 1: Write the failing dispatch test**

Add a regression that checks `run_stream` still resolves known funcs through the registry after handlers move out.

```python
from pipeline.strategies.calculus.FlowExercise.exercise_workflow import ExerciseWorkflow


async def test_run_stream_unknown_func_yields_error():
    wf = ExerciseWorkflow()
    chunks = []
    async for chunk in wf.run_stream({"func": "missing", "user_id": 2}, sm=None, pm=None, pe=None, store=None, log=None):
        chunks.append(chunk)
    assert chunks[0]["type"] == "error"
```
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `py -3 -m pytest D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_preference_flow.py D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_switch_role_context.py -q`

Expected: FAIL because the test does not exist yet or the moved registry is not wired.

- [ ] **Step 3: Move handler bodies into `handlers.py`**

Keep the external behavior stable:
- `exercise_workflow.py` owns `ExerciseWorkflow`
- handler functions register themselves via imported decorator
- `run_stream` remains the only dispatch point

- [ ] **Step 4: Run the targeted tests**

Run: `py -3 -m pytest D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_preference_flow.py D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_switch_role_context.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C "D:/FIles/documents/Project FIles/PT/Project" add core/pipeline/strategies/calculus/FlowExercise/handlers.py core/pipeline/strategies/calculus/FlowExercise/exercise_workflow.py ClaudeWorkSpace/tests/regression_preference_flow.py ClaudeWorkSpace/tests/regression_switch_role_context.py
git -C "D:/FIles/documents/Project FIles/PT/Project" commit -m "refactor: split flowexercise handlers from workflow"
```

### Task 6: Full Targeted Verification

**Files:**
- Modify: `D:/FIles/documents/Project FIles/PT/Project/core/pipeline/strategies/calculus/FlowExercise/exercise_workflow.py`
- Modify: `D:/FIles/documents/Project FIles/PT/Project/core/pipeline/strategies/calculus/FlowExercise/*.py` as needed from verification
- Test: `D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_collect_rounds.py`
- Test: `D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_preference_flow.py`
- Test: `D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_draft_id_confirm.py`
- Test: `D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_switch_role_context.py`
- Test: `D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_exercise_ocr_context.py`

- [ ] **Step 1: Run the full Python regression set**

Run:

```bash
py -3 -m pytest ^
  D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_collect_rounds.py ^
  D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_preference_flow.py ^
  D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_draft_id_confirm.py ^
  D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_switch_role_context.py ^
  D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_exercise_ocr_context.py -q
```

Expected: PASS.

- [ ] **Step 2: Run the JS regression set that covers unchanged frontend contracts**

Run:

```bash
node D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_ocr_batch_card.js
node D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_exercise_mode_state.js
node D:/FIles/documents/Project FIles/PT/Project/ClaudeWorkSpace/tests/regression_exercise_mode_extras.js
```

Expected: all scripts exit 0.

- [ ] **Step 3: Run pipeline strategy discovery smoke test**

Run:

```bash
@'
from pipeline import Pipeline
from store import JsonStore
from log import Log

p = Pipeline(store=JsonStore(), log=Log(mode="production"))
print("exercise" in p._Pipeline__dict__ if False else "exercise")
'@ | py -3 -
```

Replace the placeholder smoke snippet with an actual import-and-dispatch check against the registry before finalizing.

- [ ] **Step 4: Fix only discovered regressions**

Patch only the affected FlowExercise support modules until the full verification commands pass without changing the external event schema.

- [ ] **Step 5: Commit**

```bash
git -C "D:/FIles/documents/Project FIles/PT/Project" add core/pipeline/strategies/calculus/FlowExercise ClaudeWorkSpace/tests
git -C "D:/FIles/documents/Project FIles/PT/Project" commit -m "refactor: split flowexercise into focused modules"
```
