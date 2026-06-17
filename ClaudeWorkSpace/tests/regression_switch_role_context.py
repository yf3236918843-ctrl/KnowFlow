from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.pipeline.strategies.exercise_workflow import ExerciseWorkflow


class FakeSession:
    def __init__(self):
        self.extern = {}
        self.appended = []
        self.destroyed = False

    def update_extern(self, ext):
        self.extern = dict(ext)

    def append(self, role, content):
        self.appended.append((role, content))

    def destroy(self):
        self.destroyed = True


class FakeSM:
    def __init__(self, session):
        self.session = session

    def get(self, sid, user_id):
        return self.session


def collect(gen):
    out = []
    async def _run():
        async for item in gen:
            out.append(item)
    import asyncio
    asyncio.run(_run())
    return out


def test_switch_role_teacher_appends_instruction():
    wf = ExerciseWorkflow()
    session = FakeSession()
    sm = FakeSM(session)
    result = collect(wf._switch_role({'session_id': 1, 'role': 'teacher'}, 2, sm, None, None, None, None))

    assert result == [{'type': 'role_switched', 'role': 'teacher'}]
    assert session.extern.get('_current_role') == 'teacher'
    assert session.appended, 'switch_role should append a role-switch instruction into session messages'
    role, content = session.appended[-1]
    assert role == 'user'
    assert '???????' in content


if __name__ == '__main__':
    test_switch_role_teacher_appends_instruction()
    print('PASS: switch_role appends teacher instruction')
