import shutil
import sys
from pathlib import Path


PROJECT_ROOT = Path(r"D:\FIles\documents\Project FIles\PT\Project")
CORE_ROOT = PROJECT_ROOT / "core"
TMP_ROOT = PROJECT_ROOT / "ClaudeWorkSpace" / "_tmp" / "recent_session_outline_prompt_regression"

if str(CORE_ROOT) not in sys.path:
    sys.path.insert(0, str(CORE_ROOT))

from log import Log
from prompt_manager import PromptManager
from pipeline.strategies.calculus.FlowExercise.summary_memory import (
    format_recent_session_outlines,
    load_recent_session_outlines,
)
from store import JsonStore


def _fresh_tmp(name: str) -> Path:
    root = TMP_ROOT / name
    if root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _make_store(name: str) -> JsonStore:
    root = _fresh_tmp(name)
    data_dir = root / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return JsonStore(data_root=str(data_dir), log=Log())


def _insert_session(
    store: JsonStore,
    user_id: int,
    created_at: str,
    session_outline: str | None = None,
    *,
    session_id: int | None = None,
    route: str = "exercise",
) -> int:
    record = {
        "user_id": user_id,
        "route": route,
        "extern": {},
        "messages": [],
        "status": "idle",
        "billing": {},
        "created_at": created_at,
        "completed_at": None,
    }
    if session_outline is not None:
        record["extern"]["session_memory"] = {
            "session_outline": session_outline,
            "stu_signal": f"signal:{session_outline}",
            "tec_signal": f"tec:{session_outline}",
            "meta_signal": f"meta:{session_outline}",
        }
    if session_id is not None:
        record["id"] = session_id
    return store.insert("sessions", user_id, record)


def test_load_recent_session_outlines_returns_latest_five_exercise_sessions_only():
    store = _make_store("load_recent")
    user_id = 2

    _insert_session(store, user_id, "2026-06-15T10:00:00", "outline-1")
    _insert_session(store, user_id, "2026-06-15T10:05:00", "outline-2")
    _insert_session(store, user_id, "2026-06-15T10:10:00", "outline-3")
    _insert_session(store, user_id, "2026-06-15T10:15:00", "outline-4")
    current_id = _insert_session(store, user_id, "2026-06-15T10:20:00", "outline-5")
    _insert_session(store, user_id, "2026-06-15T10:25:00", "outline-6")
    _insert_session(store, user_id, "2026-06-15T10:30:00", "outline-7")
    _insert_session(store, user_id, "2026-06-15T10:35:00", None)
    _insert_session(store, user_id, "2026-06-15T10:40:00", "non-exercise", route="chat")

    outlines = load_recent_session_outlines(store, user_id, exclude_session_id=current_id, limit=5)

    assert outlines == [
        "outline-7",
        "outline-6",
        "outline-4",
        "outline-3",
        "outline-2",
    ], outlines


def test_format_recent_session_outlines_is_prompt_ready_and_contains_only_outlines():
    rendered = format_recent_session_outlines(["第一条", "第二条"])
    assert "第一条" in rendered
    assert "第二条" in rendered
    assert "stu_signal" not in rendered
    assert "tec_signal" not in rendered


def test_tutor_prompt_includes_recent_session_outlines_block():
    pm = PromptManager(log=Log())

    prompt = pm.render("calculus_tutor", {
        "QuestionSource": "测试题库",
        "Question": "求极限 $\\lim_{x \\to 0} \\frac{\\sin x}{x}$",
        "UserPicture": "",
        "profile": "不要直接给答案",
        "recent_session_outlines": "- 最近记忆A\n- 最近记忆B",
    })

    assert "最近 5 次" in prompt
    assert "最近记忆A" in prompt
    assert "最近记忆B" in prompt


def main():
    test_load_recent_session_outlines_returns_latest_five_exercise_sessions_only()
    test_format_recent_session_outlines_is_prompt_ready_and_contains_only_outlines()
    test_tutor_prompt_includes_recent_session_outlines_block()
    print("PASS: recent session outline prompt regression")


if __name__ == "__main__":
    main()
