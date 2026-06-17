import asyncio
import json
import shutil
import sys
from pathlib import Path


PROJECT_ROOT = Path(r"D:\FIles\documents\Project FIles\PT\Project")
CORE_ROOT = PROJECT_ROOT / "core"
TMP_ROOT = PROJECT_ROOT / "ClaudeWorkSpace" / "_tmp" / "draft_id_confirm_regression"

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


def _fresh_tmp(name: str) -> Path:
    root = TMP_ROOT / name
    if root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _make_services(name: str):
    tmp_root = _fresh_tmp(name)
    log = Log()
    store = JsonStore(data_root=str(tmp_root), log=log)
    pm = PromptManager(log=log)
    pe = PreferenceEngine(store, pm, log)
    pe.register_processor("tutoring", "## tutoring", "focus on tutoring preferences")
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


def _load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


async def test_confirm_collect_uses_draft_id_not_first_round():
    tmp_root, store, pm, pe, sm = _make_services("collect")
    workflow = ExerciseWorkflow()
    session = sm.create(2, "exercise", extern={
        "collect_drafts": {
            "draft_a": {
                "data": [{
                    "id": "w1",
                    "title": "same title",
                    "source": "same source",
                    "detail": "same detail",
                    "types": ["concept"],
                    "mastery": 20,
                    "active": True,
                }],
                "confirmed": True,
            },
            "draft_b": {
                "data": [{
                    "id": "w1",
                    "title": "same title",
                    "source": "same source",
                    "detail": "same detail",
                    "types": ["concept"],
                    "mastery": 40,
                    "active": True,
                }],
                "confirmed": False,
            },
        },
    })
    sid = session.id
    session.destroy()

    events = await _collect_events(
        workflow._confirm_collect(
            {
                "session_id": sid,
                "draft_id": "draft_b",
                "items": [{
                    "id": "w1",
                    "title": "same title",
                    "source": "same source",
                    "detail": "same detail",
                    "types": ["concept"],
                    "mastery": 40,
                    "active": True,
                }],
                "ui_state": {
                    "card_states": {
                        "collect_draft_b": {
                            "confirmed": True,
                            "items": {
                                "w1": {"active": True, "mastery": 40},
                            },
                        }
                    }
                },
            },
            2, sm, pm, pe, store, DummyLogger()
        )
    )

    session_data = _load_json(tmp_root / "2" / "sessions" / f"{sid}.json")
    records = store.list("exercise_records", 2)
    assert any(e.get("type") == "confirmed" for e in events), events
    assert session_data["extern"]["collect_drafts"]["draft_a"]["confirmed"] is True, session_data
    assert session_data["extern"]["collect_drafts"]["draft_b"]["confirmed"] is True, session_data
    assert session_data["extern"]["ui_state"]["card_states"]["collect_draft_b"]["confirmed"] is True, session_data
    assert len(records) == 1, records
    assert records[0]["items"][0]["mastery"] == 40, records


async def test_confirm_preference_uses_draft_id_not_first_round():
    tmp_root, store, pm, pe, sm = _make_services("preference")
    workflow = ExerciseWorkflow()
    session = sm.create(2, "exercise", extern={
        "pref_drafts": {
            "draft_a": {
                "data": [{
                    "id": "pref_action_1",
                    "action": "insert",
                    "entry": {
                        "type": "tutoring",
                        "rule": "old rule",
                        "examples": [],
                    },
                    "active": True,
                }],
                "confirmed": True,
            },
            "draft_b": {
                "data": [{
                    "id": "pref_action_1",
                    "action": "insert",
                    "entry": {
                        "type": "tutoring",
                        "rule": "new rule",
                        "examples": [],
                    },
                    "active": True,
                }],
                "confirmed": False,
            },
        },
    })
    sid = session.id
    session.destroy()

    events = await _collect_events(
        workflow._confirm_preference(
            {
                "session_id": sid,
                "draft_id": "draft_b",
                "items": [{
                    "id": "pref_action_1",
                    "action": "insert",
                    "entry": {
                        "type": "tutoring",
                        "rule": "new rule",
                        "examples": [],
                    },
                    "active": True,
                }],
                "ui_state": {
                    "card_states": {
                        "pref_draft_b": {
                            "confirmed": True,
                            "items": {
                                "pref_action_1": {"active": True},
                            },
                        }
                    }
                },
            },
            2, sm, pm, pe, store, DummyLogger()
        )
    )

    session_data = _load_json(tmp_root / "2" / "sessions" / f"{sid}.json")
    prefs = store.list("preferences_active", 2)
    assert any(e.get("type") == "confirmed" for e in events), events
    assert session_data["extern"]["pref_drafts"]["draft_a"]["confirmed"] is True, session_data
    assert session_data["extern"]["pref_drafts"]["draft_b"]["confirmed"] is True, session_data
    assert session_data["extern"]["ui_state"]["card_states"]["pref_draft_b"]["confirmed"] is True, session_data
    assert len(prefs) == 1, prefs
    assert prefs[0]["rule"] == "new rule", prefs


async def main():
    await test_confirm_collect_uses_draft_id_not_first_round()
    await test_confirm_preference_uses_draft_id_not_first_round()
    print("PASS: draft_id confirm regressions")


if __name__ == "__main__":
    asyncio.run(main())
