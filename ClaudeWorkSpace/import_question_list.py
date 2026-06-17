import json
import sys
from pathlib import Path


PROJECT_ROOT = Path(r"D:\FIles\documents\Project FIles\PT\Project")
CORE_ROOT = PROJECT_ROOT / "core"
if str(CORE_ROOT) not in sys.path:
    sys.path.insert(0, str(CORE_ROOT))

from log import Log
from store import JsonStore
from pipeline.Tools import Models as ToolModels
from pipeline.Tools.Repo import (
    project_create,
    bank_create,
    group_create,
    question_batch_create,
)


def _bind_store(store):
    ToolModels._get_store = lambda: store
    ToolModels._get_filestore = lambda: None


def _load_question_texts(source_path: Path) -> list[str]:
    data = json.loads(source_path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("question.json 必须是字符串数组")
    texts = []
    for idx, item in enumerate(data, start=1):
        if not isinstance(item, str):
            raise ValueError(f"第 {idx} 项不是字符串")
        text = item.strip()
        if not text:
            raise ValueError(f"第 {idx} 项为空字符串")
        texts.append(text)
    if not texts:
        raise ValueError("question.json 不能为空数组")
    return texts


def import_question_list(
    source_path: str | Path,
    user_id: int = 2,
    project_name: str = "导入题库项目",
    bank_name: str = "导入题库",
    group_name: str = "顺序题组",
    store: JsonStore | None = None,
):
    path = Path(source_path)
    if not path.is_file():
        raise FileNotFoundError(path)

    texts = _load_question_texts(path)
    active_store = store or JsonStore(log=Log())
    _bind_store(active_store)

    project_id = project_create(user_id, project_name)
    bank_id = bank_create(user_id, project_id, bank_name)
    group_id = group_create(user_id, bank_id, group_name, order=1)

    questions = [{
        "number": str(idx),
        "content": text,
        "status": "",
    } for idx, text in enumerate(texts, start=1)]
    question_ids = question_batch_create(user_id, group_id, questions)

    return {
        "project_id": project_id,
        "bank_id": bank_id,
        "group_id": group_id,
        "question_ids": question_ids,
        "count": len(question_ids),
    }


def main(argv: list[str] | None = None) -> int:
    argv = list(argv or sys.argv[1:])
    if not argv:
        print("用法: py -3 import_question_list.py <question.json> [project_name] [bank_name] [group_name]")
        return 1

    source_path = Path(argv[0])
    project_name = argv[1] if len(argv) > 1 else "导入题库项目"
    bank_name = argv[2] if len(argv) > 2 else "导入题库"
    group_name = argv[3] if len(argv) > 3 else "顺序题组"

    result = import_question_list(
        source_path=source_path,
        user_id=2,
        project_name=project_name,
        bank_name=bank_name,
        group_name=group_name,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
