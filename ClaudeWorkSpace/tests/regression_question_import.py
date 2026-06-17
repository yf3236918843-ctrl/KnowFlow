import asyncio
import json
import shutil
import sys
from pathlib import Path


PROJECT_ROOT = Path(r"D:\FIles\documents\Project FIles\PT\Project")
CORE_ROOT = PROJECT_ROOT / "core"
WORKSPACE_ROOT = PROJECT_ROOT / "ClaudeWorkSpace"
TMP_ROOT = WORKSPACE_ROOT / "_tmp" / "question_import_regression"

if str(CORE_ROOT) not in sys.path:
    sys.path.insert(0, str(CORE_ROOT))
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from log import Log
from store import JsonStore
from prompt_manager import PromptManager
from preference_engine import PreferenceEngine
from llm_gateway import SessionManager
from pipeline.strategies.exercise_workflow import ExerciseWorkflow
from pipeline.Tools import Models as ToolModels
from pipeline.Tools import Repo as RepoModule
from pipeline.Tools.Repo import (
    project_create,
    bank_create,
    group_create,
    question_list_by_group,
)
from import_question_list import import_question_list


class DummyLogger:
    def warning(self, *args, **kwargs):
        pass

    def info(self, *args, **kwargs):
        pass


def _load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _fresh_tmp() -> Path:
    if TMP_ROOT.exists():
        shutil.rmtree(TMP_ROOT)
    TMP_ROOT.mkdir(parents=True, exist_ok=True)
    return TMP_ROOT


def _make_services():
    tmp_root = _fresh_tmp()
    log = Log()
    store = JsonStore(data_root=str(tmp_root), log=log)
    pm = PromptManager(log=log)
    pe = PreferenceEngine(store, pm, log)
    sm = SessionManager(store, log, {"Default": {
        "api_key": "test",
        "model_name": "test-model",
        "is_think": False,
        "base_url": "https://example.invalid",
        "max_tokens": 128,
        "temperature": 0.0,
        "vision": False,
    }})
    return tmp_root, store, pm, pe, sm


def _bind_repo_store(store):
    ToolModels._get_store = lambda: store
    ToolModels._get_filestore = lambda: None
    RepoModule._get_store = lambda: store
    RepoModule._get_filestore = lambda: None


async def _collect_events(agen):
    events = []
    async for item in agen:
        events.append(item)
    return events


async def test_start_uses_question_list_by_group_when_group_id_is_given():
    _, store, pm, pe, sm = _make_services()
    _bind_repo_store(store)
    workflow = ExerciseWorkflow()

    project_id = project_create(2, "Import Test Project")
    bank_id = bank_create(2, project_id, "Import Test Bank")
    group_a = group_create(2, bank_id, "Group A", order=1)
    group_b = group_create(2, bank_id, "Group B", order=2)

    store.insert_many("questions", 2, [
        {"number": "A1", "content": "Question in group A", "group_id": group_a, "status": ""},
        {"number": "B1", "content": "Question in group B", "group_id": group_b, "status": ""},
    ])

    events = await _collect_events(
        workflow._start({"group_id": group_b}, 2, sm, pm, pe, store, DummyLogger())
    )

    question_event = next(e for e in events if e.get("type") == "question")
    assert question_event["content"] == "Question in group B", question_event
    assert all(item["content"] == "Question in group B" for item in question_event["question_list"]), question_event
    assert question_event["path"]["group"]["name"] == "Group B", question_event
    assert question_event["path"]["bank"]["name"] == "Import Test Bank", question_event
    assert question_event["path"]["project"]["name"] == "Import Test Project", question_event


def test_import_question_list_creates_questions_in_input_order():
    tmp_root, store, _, _, _ = _make_services()
    _bind_repo_store(store)

    src = tmp_root / "question.json"
    src.write_text(json.dumps([
        "求极限 lim x->0 sinx/x",
        "计算导数 y=x^2",
        "判断级数是否收敛",
    ], ensure_ascii=False, indent=2), encoding="utf-8")

    result = import_question_list(
        source_path=src,
        user_id=2,
        project_name="My Real Questions",
        bank_name="第一套题",
        group_name="顺序题组",
    )

    questions = question_list_by_group(2, result["group_id"])
    assert result["count"] == 3, result
    assert [q["content"] for q in questions] == [
        "求极限 lim x->0 sinx/x",
        "计算导数 y=x^2",
        "判断级数是否收敛",
    ], questions
    assert [q["number"] for q in questions] == ["1", "2", "3"], questions
    assert all(q.get("status", "") == "" for q in questions), questions


async def main():
    await test_start_uses_question_list_by_group_when_group_id_is_given()
    test_import_question_list_creates_questions_in_input_order()
    print("PASS: question import regressions")


if __name__ == "__main__":
    asyncio.run(main())
