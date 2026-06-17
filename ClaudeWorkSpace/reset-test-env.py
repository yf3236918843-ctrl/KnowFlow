#!/usr/bin/env python3
"""
测试环境重建脚本 — 一键清理测试数据
用法:
  python reset-test-env.py          # 交互模式（确认后执行）
  python reset-test-env.py -f       # 强制模式（跳过确认）
"""
import json
import os
import shutil
import sys

BASE_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "core", "store", "data", "2"
)
BASE_DIR = os.path.normpath(BASE_DIR)

FORCE = len(sys.argv) >= 2 and sys.argv[1] == "-f"


def confirm(prompt: str) -> bool:
    if FORCE:
        return True
    reply = input(f"{prompt} (y/N): ").strip().lower()
    return reply == "y"


def main():
    print("=" * 40)
    print("  测试环境重建")
    print(f"  数据目录: {BASE_DIR}")
    print("=" * 40)

    if not FORCE:
        print()
        print("即将执行以下清理操作：")
        print("  1. 删除 sessions/ 下所有 .json 文件")
        print("  2. 删除 exercise_records/（如存在）")
        print("  3. 删除 preferences_active/（如存在）")
        print("  4. 删除 weak_signals/（如存在）")
        print("  5. 移除 questions/ 下所有题目的 status 字段")
        print()

    if not confirm("确认继续"):
        print("已取消")
        return

    print()

    # ---- 1. 清理 sessions ----
    sessions_dir = os.path.join(BASE_DIR, "sessions")
    if os.path.isdir(sessions_dir):
        count = 0
        for fname in os.listdir(sessions_dir):
            if fname.endswith(".json"):
                os.remove(os.path.join(sessions_dir, fname))
                count += 1
        print(f"[OK] 已清理 sessions/  ({count} 个文件)")
    else:
        print("[SKIP] sessions/ 目录不存在")

    # ---- 2. 清理 exercise_records ----
    exercise_dir = os.path.join(BASE_DIR, "exercise_records")
    if os.path.isdir(exercise_dir):
        shutil.rmtree(exercise_dir)
        print("[OK] 已删除 exercise_records/")
    else:
        print("[SKIP] exercise_records/ 不存在，跳过")

    # ---- 3. 清理 preferences_active ----
    pref_dir = os.path.join(BASE_DIR, "preferences_active")
    if os.path.isdir(pref_dir):
        shutil.rmtree(pref_dir)
        print("[OK] 已删除 preferences_active/")
    else:
        print("[SKIP] preferences_active/ 不存在，跳过")

    # ---- 4. 清理 weak_signals ----
    weak_dir = os.path.join(BASE_DIR, "weak_signals")
    if os.path.isdir(weak_dir):
        shutil.rmtree(weak_dir)
        print("[OK] 已删除 weak_signals/")
    else:
        print("[SKIP] weak_signals/ 不存在，跳过")

    # ---- 5. 移除 questions/ 下所有题目的 status 字段 ----
    questions_dir = os.path.join(BASE_DIR, "questions")
    if os.path.isdir(questions_dir):
        for fname in sorted(os.listdir(questions_dir)):
            if not fname.endswith(".json"):
                continue
            fpath = os.path.join(questions_dir, fname)
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
            if "status" in data:
                del data["status"]
                with open(fpath, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                print(f"[OK] 已移除 {fname} 的 status 字段")
            else:
                print(f"[SKIP] {fname} 无 status 字段")
    else:
        print("[SKIP] questions/ 目录不存在")

    print()
    print("=" * 40)
    print("  环境重建完成")
    print("=" * 40)


if __name__ == "__main__":
    main()
