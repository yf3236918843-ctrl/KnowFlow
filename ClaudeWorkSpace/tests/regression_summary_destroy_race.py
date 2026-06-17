import sys
from pathlib import Path


PROJECT_ROOT = Path(r"D:\FIles\documents\Project FIles\PT\Project")
CORE_ROOT = PROJECT_ROOT / "core"

if str(CORE_ROOT) not in sys.path:
    sys.path.insert(0, str(CORE_ROOT))

from llm_gateway import _deep_merge_dicts


def simulate_destroy(latest_extern, latest_messages, current_extern, current_messages):
    merged_messages = list(current_messages or [])
    if isinstance(latest_messages, list) and len(latest_messages) > len(merged_messages):
        merged_messages = latest_messages
    return {
        "extern": _deep_merge_dicts(latest_extern or {}, current_extern or {}),
        "messages": merged_messages,
    }


def test_destroy_should_preserve_newer_summary_card_messages():
    stale_messages = [
        {"role": "user", "content": "answer"},
        {"role": "assistant", "content": "ok"},
    ]
    latest_messages = stale_messages + [
        {"role": "assistant", "content": "```json\n{\"type\":\"summary\",\"summary\":\"done\"}\n```"}
    ]
    latest_extern = {
        "summary": {"type": "summary", "summary": "done"},
        "session_memory": {"stu_signal": "student touched lhopital"},
    }

    persisted = simulate_destroy(latest_extern, latest_messages, {}, stale_messages)

    assert persisted["extern"]["summary"]["summary"] == "done"
    assert persisted["messages"] == latest_messages


def main():
    test_destroy_should_preserve_newer_summary_card_messages()
    print("PASS: summary destroy race regression")


if __name__ == "__main__":
    main()
