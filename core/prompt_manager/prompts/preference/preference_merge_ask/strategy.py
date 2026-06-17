from prompt_manager import register


@register("preference_merge_ask")
def render(type: str = "", section_title: str = "", signals: list | None = None) -> str:
    """渲染弱信号合并时的主动询问文本。"""
    signals = signals or []
    count = len(signals)

    # 收集信号摘要，去重
    raw_items = []
    seen = set()
    for sig in signals:
        raw = sig.get("raw", "")
        if raw and raw not in seen:
            raw_items.append(raw)
            seen.add(raw)

    summary = "、".join(raw_items[:3])
    if len(raw_items) > 3:
        summary += f"等"

    return (
        f"我注意到你最近 {count} 次提到了类似的想法（{summary}）。\n\n"
        f"为了更好地{section_title}，可以告诉我你的具体偏好是什么吗？"
    )
