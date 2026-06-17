import shutil
import sys
from pathlib import Path


PROJECT_ROOT = Path(r"D:\FIles\documents\Project FIles\PT\Project")
CORE_ROOT = PROJECT_ROOT / "core"
TMP_ROOT = PROJECT_ROOT / "ClaudeWorkSpace" / "_tmp" / "pref_preview_regression"

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


def _fresh_tmp(name: str) -> Path:
    root = TMP_ROOT / name
    if root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _register_processors(pe: PreferenceEngine):
    pe.register_processor("tutoring", "## 辅导互动", "关注辅导偏好")
    pe.register_processor("summary", "## 总结", "关注总结偏好")


def _make_engine(name: str):
    tmp_root = _fresh_tmp(name)
    log = Log()
    store = JsonStore(data_root=str(tmp_root), log=log)
    pm = PromptManager(log=log)
    pe = PreferenceEngine(store, pm, log)
    _register_processors(pe)
    return store, pe


def _make_pipeline(name: str):
    tmp_root = _fresh_tmp(name)
    log = Log()
    store = JsonStore(data_root=str(tmp_root), log=log)
    pm = PromptManager(log=log)
    pe = PreferenceEngine(store, pm, log)
    _register_processors(pe)
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
    return store, pipeline


def _run_query(pipeline: Pipeline, user_id: int, name: str, params: dict):
    task_type, _, func = name.partition(".")
    ctx = dict(params)
    ctx["task_type"] = task_type
    ctx["user_id"] = user_id
    if func:
        ctx["func"] = func
    return pipeline.run(ctx)


def test_preference_preview_returns_grouped_active_and_signals():
    store, pe = _make_engine("grouped")

    store.insert("preferences_active", 2, {
        "entry_id": "pref_global_1",
        "type": "tutoring",
        "rule": "先指出错误再展开讲解",
        "count": 3,
        "examples": [{"input": "答错题", "bad": "直接给答案", "good": "先指出错误"}],
        "change_history": [],
    })
    store.insert("preferences_active", 2, {
        "entry_id": "pref_project_1",
        "type": "summary",
        "rule": "总结保持简洁",
        "count": 2,
        "examples": [{"input": "做完题", "bad": "过长总结", "good": "100字内"}],
        "change_history": [],
        "project_id": 11,
    })
    store.insert("weak_signals", 2, {
        "type": "tutoring",
        "raw": "以后不要一上来就讲太多",
        "examples": [{"input": "用户反馈", "bad": "长篇讲解", "good": "先简要回应"}],
        "source_session": 91,
    })

    payload = pe.preview(user_id=2)

    assert payload["active_total"] == 2, payload
    assert payload["signal_total"] == 1, payload
    assert [g["type"] for g in payload["active_groups"]] == ["tutoring", "summary"], payload
    assert payload["active_groups"][0]["entries"][0]["entry_id"] == "pref_global_1", payload
    assert payload["signal_groups"][0]["entries"][0]["raw"] == "以后不要一上来就讲太多", payload


def test_preference_preview_filters_by_project():
    store, pe = _make_engine("project")

    store.insert("preferences_active", 2, {
        "entry_id": "pref_global_1",
        "type": "tutoring",
        "rule": "全局偏好",
        "count": 1,
        "examples": [],
        "change_history": [],
    })
    store.insert("preferences_active", 2, {
        "entry_id": "pref_project_keep",
        "type": "summary",
        "rule": "项目内总结偏好",
        "count": 2,
        "examples": [],
        "change_history": [],
        "project_id": 22,
    })
    store.insert("preferences_active", 2, {
        "entry_id": "pref_project_hide",
        "type": "summary",
        "rule": "其他项目偏好",
        "count": 2,
        "examples": [],
        "change_history": [],
        "project_id": 77,
    })
    store.insert("weak_signals", 2, {
        "type": "summary",
        "raw": "这次总结短一点",
        "examples": [],
        "source_session": 10,
        "project_id": 22,
    })
    store.insert("weak_signals", 2, {
        "type": "summary",
        "raw": "另一个项目的信号",
        "examples": [],
        "source_session": 11,
        "project_id": 77,
    })

    payload = pe.preview(user_id=2, project_id=22)

    active_ids = [entry["entry_id"] for group in payload["active_groups"] for entry in group["entries"]]
    signal_raws = [entry["raw"] for group in payload["signal_groups"] for entry in group["entries"]]

    assert active_ids == ["pref_global_1", "pref_project_keep"], payload
    assert signal_raws == ["这次总结短一点"], payload


def test_preference_preview_pipeline_query_returns_preview_payload():
    store, pipeline = _make_pipeline("pipeline")

    store.insert("preferences_active", 2, {
        "entry_id": "pref_global_1",
        "type": "tutoring",
        "rule": "先给思路再展开",
        "count": 2,
        "examples": [],
        "change_history": [],
    })
    store.insert("weak_signals", 2, {
        "type": "summary",
        "raw": "总结再短一点",
        "examples": [],
        "source_session": 18,
    })

    result = _run_query(pipeline, 2, "preference.preview", {})

    assert result["type"] == "result", result
    assert result["data"]["active_total"] == 1, result
    assert result["data"]["signal_total"] == 1, result
    assert result["data"]["active_groups"][0]["entries"][0]["rule"] == "先给思路再展开", result
    assert result["data"]["signal_groups"][0]["entries"][0]["raw"] == "总结再短一点", result


def main():
    test_preference_preview_returns_grouped_active_and_signals()
    test_preference_preview_filters_by_project()
    test_preference_preview_pipeline_query_returns_preview_payload()
    print("PASS: preference preview regressions")


if __name__ == "__main__":
    main()
