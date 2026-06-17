import asyncio
import shutil
import sys
from pathlib import Path


PROJECT_ROOT = Path(r"D:\FIles\documents\Project FIles\PT\Project")
CORE_ROOT = PROJECT_ROOT / "core"
TMP_ROOT = PROJECT_ROOT / "ClaudeWorkSpace" / "_tmp" / "session_memory_message_append_regression"

if str(CORE_ROOT) not in sys.path:
    sys.path.insert(0, str(CORE_ROOT))

from log import Log
from prompt_manager import PromptManager
from llm_gateway import StreamChunk
from pipeline.strategies.exercise_workflow import ExerciseWorkflow


class DummyLogger:
    def warning(self, *args, **kwargs):
        pass

    def info(self, *args, **kwargs):
        pass


def _fresh_tmp(name: str) -> Path:
    root = TMP_ROOT / name
    if root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True, exist_ok=True)
    return root


class FakeSession:
    def __init__(self):
        self.id = 1
        self.user_id = 2
        self.extern = {}
        self.messages = [
            {"role": "user", "content": "答案是1"},
            {"role": "assistant", "content": "对的，我们再看洛必达的适用条件。"},
        ]
        self.destroyed = False

    async def stream(self, messages):
        yield StreamChunk(content=(
            "/* 正在生成学习总结... */\n"
            "```json\n"
            "{"
            "\"type\":\"session_memory\","
            "\"student_card\":{\"type\":\"summary\",\"summary\":\"本题通过老师引导后完成，并接触到洛必达的适用条件。\",\"result\":\"False\",\"mastery\":0.2},"
            "\"session_outline\":\"学生: 一开始不会。老师: 先引导判断极限形式，再提到洛必达条件。学生: 在提示后完成。\","
            "\"stu_signal\":\"学生已经接触到洛必达，但还不能默认会独立判断是否可用。\","
            "\"tec_signal\":\"先让学生判断形式，再引入洛必达，比直接给结论更顺。\","
            "\"meta_signal\":\"当前更需要建立方法适用条件的边界感，而不是继续扩新技巧。\""
            "}\n"
            "```"
        ))

    def update_extern(self, extern: dict):
        self.extern = dict(extern)

    def append(self, role: str, content: str):
        self.messages.append({"role": role, "content": content})

    def destroy(self):
        self.destroyed = True


class FakeSM:
    def __init__(self, session):
        self.session = session

    def get(self, sid, user_id):
        return self.session


async def test_summary_background_appends_visible_cards_message():
    _fresh_tmp("summary_append")
    pm = PromptManager(log=Log())
    workflow = ExerciseWorkflow()
    session = FakeSession()
    sm = FakeSM(session)

    await workflow._summary_background(session.id, 2, sm, pm, None, None, DummyLogger())

    assert session.extern["summary"]["type"] == "summary"
    assert session.extern["session_memory"]["stu_signal"]
    assert session.messages[-1]["role"] == "assistant"
    assert '"type": "summary"' in session.messages[-1]["content"]
    assert '"type": "session_memory"' in session.messages[-1]["content"]
    assert "洛必达" in session.messages[-1]["content"]


async def main():
    await test_summary_background_appends_visible_cards_message()
    print("PASS: session memory message append regression")


if __name__ == "__main__":
    asyncio.run(main())
