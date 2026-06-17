"""
Algorithm — 掌握度 / 紧迫度 / 选题算法

纯函数，不依赖 Store 或其他模块。
从旧项目迁移的 SM-2 风格算法。
"""

import math
from datetime import datetime, timezone


# 信号衰减值
_SIGNAL_MAP = {
    "+强": 0.30, "+中": 0.15, "+弱": 0.05,
    "中": 0.00,
    "-弱": -0.05, "-中": -0.15, "-强": -0.30,
}


def calc_mastery_update(extern: dict, signal: str) -> dict:
    """SM-2 风格掌握度更新。

    Args:
        extern: 当前掌握度状态 dict，需含 "mastery" 字段（float, 0~1）。
        signal: 信号值，支持 "+强"/"+中"/"+弱"/"中"/"-弱"/"-中"/"-强"。

    Returns:
        新 extern dict（含 mastery、last_signal、last_review 等字段）。
    """
    delta = _SIGNAL_MAP.get(signal, 0.0)
    current = extern.get("mastery", 0.5)
    new_mastery = max(0.0, min(1.0, current + delta))

    new_extern = dict(extern)
    new_extern["mastery"] = new_mastery
    new_extern["last_signal"] = signal
    new_extern["last_review"] = datetime.now(timezone.utc).isoformat()
    return new_extern


def calc_daily_decay(mastery: float, days: float = 1.0) -> float:
    """掌握度日常衰减。mastery 越高掉越慢。

    公式: new = mastery * (1 - 0.02 / (1 + mastery * 2))
    """
    decay_rate = 0.02 / (1.0 + mastery * 2.0)
    return mastery * ((1.0 - decay_rate) ** days)


def calc_proficiency(memory: dict) -> float:
    """计算有效掌握度。

    若 memory 含 "weakness" 结构（弱点列表），取 mastery 与弱点覆盖率的
    调和平均。否则直接返回 extern.mastery。
    """
    extern = memory.get("extern", {})
    mastery = extern.get("mastery", 0.0)
    weakness = memory.get("weakness", [])

    if not weakness:
        return mastery

    # 弱点覆盖率：已掌握的弱点 / 总弱点
    covered = sum(1 for w in weakness if w.get("mastered", False))
    coverage = covered / len(weakness) if weakness else 1.0

    if mastery + coverage == 0:
        return 0.0
    # 调和平均
    return 2.0 * mastery * coverage / (mastery + coverage)


def calc_urgency(params: dict) -> float:
    """计算紧迫度。指数逼近模型。

    Args:
        params: 含 mastery、last_signal、last_review 等。
                越高 mastery、越近 last_review → 紧迫度越低。

    Returns:
        0~1 的紧迫度值，越高越紧急。
    """
    mastery = params.get("mastery", 0.5)
    last_review_str = params.get("last_review")

    if not last_review_str:
        return 1.0  # 从未复习 → 最高紧迫度

    try:
        last_review = datetime.fromisoformat(last_review_str)
        if last_review.tzinfo is None:
            last_review = last_review.replace(tzinfo=timezone.utc)
        days_since = (datetime.now(timezone.utc) - last_review).days
    except (ValueError, TypeError):
        return 0.5

    # 指数逼近：mastery 高的掉得慢，低的掉得快
    half_life = 1.0 + mastery * 30.0  # mastery=0 → 1天, mastery=1 → 31天
    decay = math.exp(-days_since / half_life)

    # 最近信号影响：负信号提高紧迫度
    signal_penalty = _SIGNAL_MAP.get(params.get("last_signal", "中"), 0.0)
    urgency = (1.0 - mastery) * (1.0 - decay) - signal_penalty * 0.3

    return max(0.0, min(1.0, urgency))


def select_for_review(problems: list[dict], limit: int = 10) -> list[dict]:
    """三池选题：weakness / mistake / consolidate，按紧迫度降序采样。

    Args:
        problems: 题目列表，每项应含可用于 calc_urgency 的字段。
        limit: 返回题目数量上限。

    Returns:
        按紧迫度降序排列的题目列表。
    """
    pools: dict[str, list[dict]] = {"weakness": [], "mistake": [], "consolidate": []}

    for p in problems:
        pool = classify_pool(p)
        urgency = calc_urgency(p.get("memory", {}).get("extern", {}))
        p["_urgency"] = urgency
        pools[pool].append(p)

    # 池内排序
    result = []
    for pool_name in ("weakness", "mistake", "consolidate"):
        items = sorted(pools[pool_name], key=lambda x: x["_urgency"], reverse=True)
        # weakness 优先分配 50%，mistake 30%，consolidate 20%
        pool_limit = {
            "weakness": max(1, int(limit * 0.5)),
            "mistake": max(1, int(limit * 0.3)),
            "consolidate": limit,
        }[pool_name]
        result.extend(items[:pool_limit])

    result.sort(key=lambda x: x["_urgency"], reverse=True)
    return result[:limit]


def classify_pool(problem: dict) -> str:
    """判断题目属于哪个池。

    Returns:
        "weakness" | "mistake" | "consolidate"
    """
    memory = problem.get("memory", {})
    weakness = memory.get("weakness", [])
    extern = memory.get("extern", {})

    if weakness:
        return "weakness"
    if extern.get("last_signal", "").startswith("-"):
        return "mistake"
    return "consolidate"
