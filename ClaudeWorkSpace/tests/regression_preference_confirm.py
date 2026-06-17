import asyncio
import os
import shutil
import sys
from pathlib import Path


PROJECT_ROOT = Path(r"D:\FIles\documents\Project FIles\PT\Project")
CORE_ROOT = PROJECT_ROOT / "core"
TMP_ROOT = PROJECT_ROOT / "ClaudeWorkSpace" / "_tmp" / "pref_confirm_regression"

if str(CORE_ROOT) not in sys.path:
    sys.path.insert(0, str(CORE_ROOT))

from log import Log
from store import JsonStore
from prompt_manager import PromptManager
from preference_engine import PreferenceEngine
from llm_gateway import SessionManager
from pipeline.strategies.exercise_workflow import ExerciseWorkflow


class DummyLogger:
    def warning(self, *args, **kwargs):
        pass

    def info(self, *args, **kwargs):
        pass


async def _collect_events(agen):
    events = []
    async for item in agen:
        events.append(item)
    return events


def _make_services():
    if TMP_ROOT.exists():
        shutil.rmtree(TMP_ROOT)
    TMP_ROOT.mkdir(parents=True, exist_ok=True)

    log = Log()
    store = JsonStore(data_root=str(TMP_ROOT), log=log)
    pm = PromptManager(log=log)
    pe = PreferenceEngine(store, pm, log)
    pe.register_processor("tutoring", "## 辅导互动", "关注学生对讲解方式的偏好")
    sm = SessionManager(store, log, {"Default": {
        "api_key": "test",
        "model_name": "test-model",
        "is_think": False,
        "base_url": "https://example.invalid",
        "max_tokens": 128,
        "temperature": 0.0,
        "vision": False,
    }})
    return log, store, pm, pe, sm


async def main():
    log, store, pm, pe, sm = _make_services()
    workflow = ExerciseWorkflow()

    session = sm.create(2, "exercise", extern={
        "pref_rounds": {
            "1": {
                "data": [{
                    "action": "insert",
                    "entry": {
                        "type": "tutoring",
                        "rule": "解释简短，先给思路",
                        "examples": [{
                            "input": "学生追问极限题",
                            "bad": "上来展开完整证明",
                            "good": "先给核心思路再追问",
                        }],
                    },
                }],
                "confirmed": False,
            }
        }
    })
    sid = session.id
    session.destroy()

    ctx = {
        "session_id": sid,
        "round": 1,
        "items": [{"id": "pref_action_1", "active": True}],
    }
    events = await _collect_events(
        workflow._confirm_preference(ctx, 2, sm, pm, pe, store, DummyLogger())
    )

    pref_dir = TMP_ROOT / "2" / "preferences_active"
    session_file = TMP_ROOT / "2" / "sessions" / f"{sid}.json"
    assert session_file.exists(), "session file missing"

    import json
    with session_file.open("r", encoding="utf-8") as f:
        session_data = json.load(f)

    assert any(e.get("type") == "confirmed" for e in events), events
    assert session_data["extern"]["pref_rounds"]["1"]["confirmed"] is True, session_data
    assert pref_dir.exists(), "preferences_active dir should be created"
    pref_files = list(pref_dir.glob("*.json"))
    assert len(pref_files) == 1, pref_files

    with pref_files[0].open("r", encoding="utf-8") as f:
        pref = json.load(f)
    assert pref["rule"] == "解释简短，先给思路", pref

    print("PASS: preference confirm persists actions without preexisting action ids")


if __name__ == "__main__":
    asyncio.run(main())
