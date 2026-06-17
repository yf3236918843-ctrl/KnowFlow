import asyncio
import json
import shutil
import sys
from pathlib import Path


PROJECT_ROOT = Path(r"D:\FIles\documents\Project FIles\PT\Project")
CORE_ROOT = PROJECT_ROOT / "core"
TMP_ROOT = PROJECT_ROOT / "ClaudeWorkSpace" / "_tmp" / "pref_flow_regression"

if str(CORE_ROOT) not in sys.path:
    sys.path.insert(0, str(CORE_ROOT))

from log import Log
from store import JsonStore
from prompt_manager import PromptManager
from preference_engine import PreferenceEngine
from llm_gateway import SessionManager, StreamChunk
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


async def test_increment_target_index():
    tmp_root, store, pm, pe, sm = _make_services("increment")
    workflow = ExerciseWorkflow()
    pref_id = store.insert("preferences_active", 2, {
        "entry_id": "pref_seed",
        "type": "tutoring",
        "rule": "Keep explanations structured",
        "count": 1,
        "examples": [],
        "change_history": [],
    })

    session = sm.create(2, "exercise", extern={
        "pref_rounds": {
            "1": {
                "data": [{"action": "increment", "target_id": 0, "id": "pref_action_1"}],
                "confirmed": False,
            }
        }
    })
    sid = session.id
    session.destroy()

    events = await _collect_events(
        workflow._confirm_preference(
            {"session_id": sid, "round": 1, "items": [{"id": "pref_action_1", "active": True}]},
            2, sm, pm, pe, store, DummyLogger()
        )
    )

    pref = _load_json(tmp_root / "2" / "preferences_active" / f"{pref_id}.json")
    session_data = _load_json(tmp_root / "2" / "sessions" / f"{sid}.json")
    assert any(e.get("type") == "confirmed" for e in events), events
    assert pref["count"] == 2, pref
    assert any(v.get("confirmed") is True for v in session_data["extern"].get("pref_drafts", {}).values()), session_data


async def test_update_target_index_with_type_hint():
    tmp_root, store, pm, pe, sm = _make_services("update")
    workflow = ExerciseWorkflow()
    pref_id = store.insert("preferences_active", 2, {
        "entry_id": "pref_seed",
        "type": "tutoring",
        "rule": "Old tutoring rule",
        "count": 1,
        "examples": [],
        "change_history": [],
    })

    session = sm.create(2, "exercise", extern={
        "pref_rounds": {
            "1": {
                "data": [{
                    "action": "update",
                    "target_id": 0,
                    "entry": {
                        "type": "tutoring",
                        "rule": "Updated tutoring rule",
                        "examples": [{
                            "input": "user asks for a different structure",
                            "bad": "old structure",
                            "good": "new structure",
                        }],
                    },
                    "id": "pref_action_1",
                }],
                "confirmed": False,
            }
        }
    })
    sid = session.id
    session.destroy()

    events = await _collect_events(
        workflow._confirm_preference(
            {"session_id": sid, "round": 1, "items": [{"id": "pref_action_1", "active": True}]},
            2, sm, pm, pe, store, DummyLogger()
        )
    )

    pref = _load_json(tmp_root / "2" / "preferences_active" / f"{pref_id}.json")
    session_data = _load_json(tmp_root / "2" / "sessions" / f"{sid}.json")
    assert any(e.get("type") == "confirmed" for e in events), events
    assert pref["rule"] == "Updated tutoring rule", pref
    assert pref["examples"][0]["good"] == "new structure", pref
    assert pref["change_history"], pref
    assert any(v.get("confirmed") is True for v in session_data["extern"].get("pref_drafts", {}).values()), session_data


async def test_delete_scoped_target_plus_insert():
    tmp_root, store, pm, pe, sm = _make_services("delete_insert")
    workflow = ExerciseWorkflow()
    old_pref_id = store.insert("preferences_active", 2, {
        "entry_id": "pref_seed",
        "type": "tutoring",
        "rule": "Old rigid template",
        "count": 1,
        "examples": [],
        "change_history": [],
    })

    session = sm.create(2, "exercise", extern={
        "pref_rounds": {
            "1": {
                "data": [
                    {"action": "delete", "target_id": "tutoring:0", "id": "pref_action_1"},
                    {
                        "action": "insert",
                        "entry": {
                            "type": "tutoring",
                            "rule": "Explain directly without a fixed template",
                            "examples": [{
                                "input": "user asks for a direct explanation",
                                "bad": "forces the old template",
                                "good": "explains directly",
                            }],
                        },
                        "id": "pref_action_2",
                    },
                ],
                "confirmed": False,
            }
        }
    })
    sid = session.id
    session.destroy()

    events = await _collect_events(
        workflow._confirm_preference(
            {
                "session_id": sid,
                "round": 1,
                "items": [
                    {"id": "pref_action_1", "active": True},
                    {"id": "pref_action_2", "active": True},
                ],
            },
            2, sm, pm, pe, store, DummyLogger()
        )
    )

    prefs = store.list("preferences_active", 2)
    session_data = _load_json(tmp_root / "2" / "sessions" / f"{sid}.json")
    assert any(e.get("type") == "confirmed" for e in events), events
    assert all(p["id"] != old_pref_id for p in prefs), prefs
    assert len(prefs) == 1, prefs
    assert prefs[0]["rule"] == "Explain directly without a fixed template", prefs
    assert any(v.get("confirmed") is True for v in session_data["extern"].get("pref_drafts", {}).values()), session_data


class FakePreferenceSession:
    def __init__(self, responses: list[str]):
        self.user_id = 2
        self.extern = {"pref_format_done": False}
        self._responses = list(responses)
        self.stream_inputs = []

    def update_extern(self, extern: dict):
        self.extern = dict(extern)

    async def stream(self, messages):
        self.stream_inputs.append(messages)
        payload = self._responses.pop(0)
        yield StreamChunk(content=payload)


async def test_preference_search_followup():
    _, store, pm, pe, _ = _make_services("search")
    workflow = ExerciseWorkflow()
    store.insert("preferences_active", 2, {
        "entry_id": "pref_seed",
        "type": "tutoring",
        "rule": "Keep explanations structured",
        "count": 1,
        "examples": [],
        "change_history": [],
    })

    session = FakePreferenceSession([
        "/* need more detail */\n```json\n{\"type\":\"search\",\"tutoring\":[0]}\n```",
        "/* done */\n```json\n{\"type\":\"action_set\",\"actions\":[{\"action\":\"increment\",\"target_id\":\"tutoring:0\"}],\"round\":1}\n```",
    ])

    events = await _collect_events(workflow._do_preference(pm, pe)(session))
    round_data = next(iter(session.extern["pref_drafts"].values()))

    assert len(session.stream_inputs) == 2, session.stream_inputs
    assert "[tutoring:0]" in session.stream_inputs[1][0]["content"], session.stream_inputs[1]
    assert "\"entry_id\": \"pref_seed\"" in session.stream_inputs[1][0]["content"], session.stream_inputs[1]
    assert round_data["confirmed"] is False, round_data
    assert round_data["data"][0]["action"] == "increment", round_data
    assert round_data["data"][0]["target_id"] == "tutoring:0", round_data
    assert round_data.get("draft_id"), round_data
    assert any(e.get("type") == "output" for e in events), events


async def test_confirm_collect_persists_ui_state_when_extern_update_happens_first():
    tmp_root, store, pm, pe, sm = _make_services("collect_ui_state_race")
    workflow = ExerciseWorkflow()
    session = sm.create(2, "exercise", extern={
        "collect_rounds": {
            "1": {
                "data": [{
                    "id": "item_1",
                    "title": "Limit concept",
                    "source": "dialog",
                    "detail": "confused about removable discontinuity",
                    "types": ["concept"],
                }],
                "confirmed": False,
            }
        }
    })
    sid = session.id
    session.destroy()

    await _collect_events(
        workflow._extern_update(
            {
                "session_id": sid,
                "path": "ui_state.card_states.collect_1",
                "value": {
                    "confirmed": True,
                    "items": {"item_1": {"active": True, "mastery": 0}},
                },
            },
            2, sm, pm, pe, store, DummyLogger()
        )
    )

    events = await _collect_events(
        workflow._confirm_collect(
            {
                "session_id": sid,
                "round": 1,
                "items": [{"id": "item_1", "active": True, "mastery": 0}],
            },
            2, sm, pm, pe, store, DummyLogger()
        )
    )

    session_data = _load_json(tmp_root / "2" / "sessions" / f"{sid}.json")
    assert any(e.get("type") == "confirmed" for e in events), events
    assert session_data["extern"]["collect_rounds"]["1"]["confirmed"] is True, session_data
    assert session_data["extern"]["ui_state"]["card_states"]["collect_1"]["confirmed"] is True, session_data


async def test_confirm_collect_does_not_overwrite_ui_state_written_after_confirm_yield():
    tmp_root, store, pm, pe, sm = _make_services("collect_ui_state_interleaving")
    workflow = ExerciseWorkflow()
    session = sm.create(2, "exercise", extern={
        "collect_rounds": {
            "1": {
                "data": [{
                    "id": "item_1",
                    "title": "Limit concept",
                    "source": "dialog",
                    "detail": "confused about removable discontinuity",
                    "types": ["concept"],
                }],
                "confirmed": False,
            }
        }
    })
    sid = session.id
    session.destroy()

    agen = workflow._confirm_collect(
        {
            "session_id": sid,
            "round": 1,
            "items": [{"id": "item_1", "active": True, "mastery": 0}],
        },
        2, sm, pm, pe, store, DummyLogger()
    )
    first = await agen.__anext__()
    assert first["type"] == "confirmed", first

    await _collect_events(
        workflow._extern_update(
            {
                "session_id": sid,
                "path": "ui_state.card_states.collect_1",
                "value": {
                    "confirmed": True,
                    "items": {"item_1": {"active": True, "mastery": 0}},
                },
            },
            2, sm, pm, pe, store, DummyLogger()
        )
    )

    try:
        await agen.__anext__()
    except StopAsyncIteration:
        pass

    session_data = _load_json(tmp_root / "2" / "sessions" / f"{sid}.json")
    assert session_data["extern"]["collect_rounds"]["1"]["confirmed"] is True, session_data
    assert session_data["extern"]["ui_state"]["card_states"]["collect_1"]["confirmed"] is True, session_data


async def test_confirm_preference_can_use_payload_without_session_round():
    tmp_root, store, pm, pe, sm = _make_services("payload_only_preference")
    workflow = ExerciseWorkflow()
    session = sm.create(2, "exercise", extern={})
    sid = session.id
    session.destroy()

    events = await _collect_events(
        workflow._confirm_preference(
            {
                "session_id": sid,
                "draft_id": "pref_payload", "round": 3,
                "items": [{
                    "id": "pref_action_1",
                    "action": "insert",
                    "entry": {
                        "type": "tutoring",
                        "rule": "讲解时先给直观解释再给定义",
                        "examples": [{
                            "input": "学生先追问直觉",
                            "good": "先说图像直觉，再补正式定义",
                            "bad": "直接上抽象定义",
                        }],
                    },
                    "active": True,
                }],
            },
            2, sm, pm, pe, store, DummyLogger()
        )
    )

    session_data = _load_json(tmp_root / "2" / "sessions" / f"{sid}.json")
    prefs = store.list("preferences_active", 2)
    assert any(e.get("type") == "confirmed" for e in events), events
    assert any(v.get("confirmed") is True for v in session_data["extern"].get("pref_drafts", {}).values()), session_data
    assert prefs[0]["rule"] == "讲解时先给直观解释再给定义", prefs


async def main():
    await test_increment_target_index()
    await test_update_target_index_with_type_hint()
    await test_delete_scoped_target_plus_insert()
    await test_preference_search_followup()
    await test_confirm_collect_persists_ui_state_when_extern_update_happens_first()
    await test_confirm_collect_does_not_overwrite_ui_state_written_after_confirm_yield()
    await test_confirm_preference_can_use_payload_without_session_round()
    print("PASS: preference flow regressions")


if __name__ == "__main__":
    asyncio.run(main())
