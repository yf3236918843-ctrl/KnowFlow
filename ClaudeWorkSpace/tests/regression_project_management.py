import asyncio
import json
import shutil
import sys
from pathlib import Path


PROJECT_ROOT = Path(r"D:\FIles\documents\Project FIles\PT\Project")
CORE_ROOT = PROJECT_ROOT / "core"
TMP_ROOT = PROJECT_ROOT / "ClaudeWorkSpace" / "_tmp" / "project_management_regression"

if str(CORE_ROOT) not in sys.path:
    sys.path.insert(0, str(CORE_ROOT))

from log import Log
from store import JsonStore
from prompt_manager import PromptManager
from preference_engine import PreferenceEngine
from llm_gateway import SessionManager
from pipeline import Pipeline
from pipeline.Tools import Models as ToolModels
from pipeline.Tools import Repo as RepoModule
from pipeline.Tools.Repo import (
    project_create,
    bank_create,
    group_create,
    question_batch_create,
)


def _fresh_tmp(name: str) -> Path:
    root = TMP_ROOT / name
    if root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _make_pipeline(name: str):
    tmp_root = _fresh_tmp(name)
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
    ToolModels._get_store = lambda: store
    ToolModels._get_filestore = lambda: None
    RepoModule._get_store = lambda: store
    RepoModule._get_filestore = lambda: None
    pipeline = Pipeline(store=store, log=log, session_manager=sm, prompt_manager=pm, preference_engine=pe)
    return tmp_root, store, sm, pipeline


def _run_query(pipeline: Pipeline, user_id: int, name: str, params: dict):
    task_type, _, func = name.partition(".")
    ctx = dict(params)
    ctx["task_type"] = task_type
    ctx["user_id"] = user_id
    if func:
        ctx["func"] = func
    return pipeline.run(ctx)


def _load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


async def _collect_events(agen):
    items = []
    async for item in agen:
        items.append(item)
    return items


def test_question_append_and_resequence_after_delete():
    _, store, _, pipeline = _make_pipeline("append_delete")
    project_id = project_create(2, "项目A")
    bank_id = bank_create(2, project_id, "题库A")
    group_id = group_create(2, bank_id, "题组A", order=1)
    question_batch_create(2, group_id, [
        {"number": "1", "content": "题目1", "status": ""},
        {"number": "2", "content": "题目2", "status": ""},
    ])

    append_result = _run_query(pipeline, 2, "question.append_json", {
        "group_id": group_id,
        "questions": ["题目3", "题目4"],
    })
    assert append_result["type"] == "result", append_result
    assert append_result["data"]["count"] == 2, append_result
    assert append_result["data"]["numbers"] == ["3", "4"], append_result

    list_result = _run_query(pipeline, 2, "question.list", {"group_id": group_id})
    assert [q["number"] for q in list_result["data"]] == ["1", "2", "3", "4"], list_result
    assert [q["content"] for q in list_result["data"]] == ["题目1", "题目2", "题目3", "题目4"], list_result

    delete_target = list_result["data"][1]["id"]
    delete_result = _run_query(pipeline, 2, "question.delete", {"id": delete_target})
    assert delete_result["type"] == "result", delete_result

    list_after_delete = _run_query(pipeline, 2, "question.list", {"group_id": group_id})
    assert [q["number"] for q in list_after_delete["data"]] == ["1", "2", "3"], list_after_delete
    assert [q["content"] for q in list_after_delete["data"]] == ["题目1", "题目3", "题目4"], list_after_delete


def test_project_bank_group_question_updates():
    _, _, _, pipeline = _make_pipeline("updates")
    project_id = _run_query(pipeline, 2, "project.create", {"name": "旧项目"})["data"]["id"]
    bank_id = _run_query(pipeline, 2, "bank.create", {"project_id": project_id, "name": "旧题库"})["data"]["id"]
    group_id = _run_query(pipeline, 2, "group.create", {"bank_id": bank_id, "name": "旧题组"})["data"]["id"]
    question_id = _run_query(pipeline, 2, "question.batch_create", {
        "group_id": group_id,
        "questions": [{"number": "1", "content": "旧题目", "status": ""}],
    })["data"]["ids"][0]

    assert _run_query(pipeline, 2, "project.update", {"id": project_id, "name": "新项目"})["type"] == "result"
    assert _run_query(pipeline, 2, "bank.update", {"id": bank_id, "name": "新题库"})["type"] == "result"
    assert _run_query(pipeline, 2, "group.update", {"id": group_id, "name": "新题组"})["type"] == "result"
    assert _run_query(pipeline, 2, "question.update", {"id": question_id, "content": "新题目内容"})["type"] == "result"

    assert _run_query(pipeline, 2, "project.get", {"id": project_id})["data"]["name"] == "新项目"
    assert _run_query(pipeline, 2, "bank.get", {"id": bank_id})["data"]["name"] == "新题库"
    assert _run_query(pipeline, 2, "group.get", {"id": group_id})["data"]["name"] == "新题组"
    assert _run_query(pipeline, 2, "question.get", {"id": question_id})["data"]["content"] == "新题目内容"


def test_question_navigation_query_returns_path_and_summary_state():
    tmp_root, _, sm, pipeline = _make_pipeline("navigator")
    project_id = _run_query(pipeline, 2, "project.create", {"name": "高数项目"})["data"]["id"]
    bank_id = _run_query(pipeline, 2, "bank.create", {"project_id": project_id, "name": "极限题库"})["data"]["id"]
    group_a = _run_query(pipeline, 2, "group.create", {"bank_id": bank_id, "name": "第一组"})["data"]["id"]
    group_b = _run_query(pipeline, 2, "group.create", {"bank_id": bank_id, "name": "第二组"})["data"]["id"]
    qids_a = _run_query(pipeline, 2, "question.batch_create", {
        "group_id": group_a,
        "questions": [
            {"number": "1", "content": "第一题", "status": ""},
            {"number": "2", "content": "第二题", "status": ""},
        ],
    })["data"]["ids"]
    qid_b = _run_query(pipeline, 2, "question.batch_create", {
        "group_id": group_b,
        "questions": [{"number": "1", "content": "第三题", "status": ""}],
    })["data"]["ids"][0]

    session = sm.create(2, "exercise", extern={
        "_question_ref": f"{project_id}.{bank_id}.{group_a}.{qids_a[0]}",
        "_question_content": "第一题",
        "summary": {"title": "第一题总结", "content": "掌握了夹逼定理"},
    })
    session.append("user", "我的答案是 1")
    session.destroy()

    nav_result = _run_query(pipeline, 2, "question.navigator", {
        "project_id": project_id,
        "bank_id": bank_id,
    })
    assert nav_result["type"] == "result", nav_result
    items = nav_result["data"]["items"]
    assert len(items) == 3, items

    first = next(item for item in items if item["question_id"] == qids_a[0])
    second = next(item for item in items if item["question_id"] == qids_a[1])
    third = next(item for item in items if item["question_id"] == qid_b)

    assert first["project_name"] == "高数项目", first
    assert first["bank_name"] == "极限题库", first
    assert first["group_name"] == "第一组", first
    assert first["question_number"] == "1", first
    assert first["has_summary"] is True, first
    assert first["summary"]["title"] == "第一题总结", first
    assert first["session_id"] == session.id, first
    assert second["has_summary"] is False, second
    assert third["group_name"] == "第二组", third

    path_result = _run_query(pipeline, 2, "question.path", {"id": qids_a[0]})
    assert path_result["type"] == "result", path_result
    assert path_result["data"]["project"]["name"] == "高数项目", path_result
    assert path_result["data"]["bank"]["name"] == "极限题库", path_result
    assert path_result["data"]["group"]["name"] == "第一组", path_result
    assert path_result["data"]["question"]["number"] == "1", path_result


async def test_navigator_pipeline_can_be_called_from_stream_context():
    _, _, _, pipeline = _make_pipeline("navigator_stream")
    result = _run_query(pipeline, 2, "question.navigator", {"project_id": 999, "bank_id": 999})
    assert result["type"] == "result", result
    assert result["data"]["items"] == [], result


def test_session_catalog_groups_exercise_sessions_by_project_and_bank():
    _, _, sm, pipeline = _make_pipeline("session_catalog")
    project_id = _run_query(pipeline, 2, "project.create", {"name": "项目甲"})["data"]["id"]
    bank_id = _run_query(pipeline, 2, "bank.create", {"project_id": project_id, "name": "题库甲"})["data"]["id"]
    group_id = _run_query(pipeline, 2, "group.create", {"bank_id": bank_id, "name": "题组甲"})["data"]["id"]
    qid = _run_query(pipeline, 2, "question.batch_create", {
        "group_id": group_id,
        "questions": [{"number": "1", "content": "题目甲", "status": ""}],
    })["data"]["ids"][0]

    session = sm.create(2, "exercise", extern={
        "_question_ref": f"{project_id}.{bank_id}.{group_id}.{qid}",
        "_question_content": "题目甲",
    })
    session.append("user", "测试消息")
    session.destroy()

    result = _run_query(pipeline, 2, "session.catalog", {})
    assert result["type"] == "result", result
    groups = result["data"]["groups"]
    assert len(groups) == 1, groups
    assert groups[0]["project_name"] == "项目甲", groups
    assert groups[0]["bank_name"] == "题库甲", groups
    assert groups[0]["sessions"][0]["session_id"] == session.id, groups
    assert groups[0]["sessions"][0]["question_number"] == "1", groups


async def main():
    test_question_append_and_resequence_after_delete()
    test_project_bank_group_question_updates()
    test_question_navigation_query_returns_path_and_summary_state()
    test_session_catalog_groups_exercise_sessions_by_project_and_bank()
    await test_navigator_pipeline_can_be_called_from_stream_context()
    print("PASS: project management regressions")


if __name__ == "__main__":
    asyncio.run(main())
