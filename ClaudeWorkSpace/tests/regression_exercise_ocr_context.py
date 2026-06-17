import importlib.util
import sys
from pathlib import Path


ROOT = Path(r"D:\FIles\documents\Project FIles\PT\Project")
MODULE_PATH = ROOT / "core" / "pipeline" / "strategies" / "exercise_workflow.py"
CORE_ROOT = ROOT / "core"


def load_module():
    if str(CORE_ROOT) not in sys.path:
        sys.path.insert(0, str(CORE_ROOT))
    spec = importlib.util.spec_from_file_location("exercise_workflow_test_mod", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def main():
    module = load_module()
    workflow = module.ExerciseWorkflow
    if not hasattr(workflow, "_compose_ocr_augmented_message"):
      raise AssertionError("_compose_ocr_augmented_message should exist")

    text = workflow._compose_ocr_augmented_message(
        "用户补充说明",
        [
            {"index": 1, "text": "图中题干A"},
            {"index": 2, "text": "图中题干B"},
        ],
    )

    assert "【图片1图转文结果】" in text
    assert "图中题干A" in text
    assert "【图片2图转文结果】" in text
    assert "图中题干B" in text
    assert "【用户补充说明】" in text
    assert "用户补充说明" in text

    print("PASS: exercise ocr context regression")


if __name__ == "__main__":
    main()
