import asyncio
import json
import shutil
import sys
from pathlib import Path


PROJECT_ROOT = Path(r"D:\FIles\documents\Project FIles\PT\Project")
CORE_ROOT = PROJECT_ROOT / "core"
TMP_ROOT = PROJECT_ROOT / "ClaudeWorkSpace" / "_tmp" / "collect_round_regression"

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


async def test_collect_persists_llm_draft_id():
    tmp_root, store, pm, pe, sm = _make_services("persist_draft")
    workflow = ExerciseWorkflow()
    session = sm.create(2, "exercise", extern={"collect_format_done": True})
    sid = session.id
    session.destroy()

    live_session = sm.get(sid, 2)

    async def fake_stream(messages):
        yield StreamChunk(content="/* draft */\n```json\n{\"type\":\"collect_draft\",\"draft_id\":\"collect_alpha\",\"round\":2,\"items\":[{\"id\":\"w2\",\"title\":\"second\",\"source\":\"src2\",\"detail\":\"detail2\",\"types\":[\"concept\"],\"mastery\":20}]}\n```")

    live_session.stream = fake_stream
    events = await _collect_events(workflow._do_collect(pm, pe)(live_session))

    session_data = _load_json(tmp_root / "2" / "sessions" / f"{sid}.json")
    assert any(e.get("type") == "output" for e in events), events
    assert session_data["extern"]["collect_drafts"]["collect_alpha"]["data"][0]["id"] == "w2", session_data


async def test_confirm_collect_uses_payload_draft_id():
    tmp_root, store, pm, pe, sm = _make_services("payload_confirm")
    workflow = ExerciseWorkflow()
    session = sm.create(2, "exercise", extern={})
    sid = session.id
    session.destroy()

    events = await _collect_events(
        workflow._confirm_collect(
            {
                "session_id": sid,
                "draft_id": "collect_payload",
                "items": [{
                    "id": "w2",
                    "title": "??????",
                    "source": "????",
                    "detail": "????????????",
                    "types": ["????"],
                    "active": True,
                    "mastery": 20,
                }],
            },
            2, sm, pm, pe, store, DummyLogger()
        )
    )

    session_data = _load_json(tmp_root / "2" / "sessions" / f"{sid}.json")
    records = store.list("exercise_records", 2)
    assert any(e.get("type") == "confirmed" for e in events), events
    assert session_data["extern"]["collect_drafts"]["collect_payload"]["confirmed"] is True, session_data
    assert records[0]["items"][0]["title"] == "??????", records


async def test_confirm_collect_legacy_round_can_backfill_draft_id():
    tmp_root, store, pm, pe, sm = _make_services("legacy_round")
    workflow = ExerciseWorkflow()
    session = sm.create(2, "exercise", extern={
        "collect_rounds": {
            "2": {
                "data": [{
                    "id": "w2",
                    "title": "legacy item",
                    "source": "src",
                    "detail": "detail",
                    "types": ["concept"],
                    "mastery": 10,
                    "active": True,
                }],
                "confirmed": False,
            }
        }
    })
    sid = session.id
    session.destroy()

    events = await _collect_events(
        workflow._confirm_collect(
            {
                "session_id": sid,
                "round": 2,
                "items": [{
                    "id": "w2",
                    "title": "legacy item",
                    "source": "src",
                    "detail": "detail",
                    "types": ["concept"],
                    "mastery": 10,
                    "active": True,
                }],
            },
            2, sm, pm, pe, store, DummyLogger()
        )
    )

    session_data = _load_json(tmp_root / "2" / "sessions" / f"{sid}.json")
    assert any(e.get("type") == "confirmed" for e in events), events
    assert session_data["extern"]["collect_rounds"]["2"]["confirmed"] is True, session_data
    assert session_data["extern"]["collect_rounds"]["2"].get("draft_id"), session_data


async def main():
    await test_collect_persists_llm_draft_id()
    await test_confirm_collect_uses_payload_draft_id()
    await test_confirm_collect_legacy_round_can_backfill_draft_id()
    print("PASS: collect draft regressions")


if __name__ == "__main__":
    asyncio.run(main())
