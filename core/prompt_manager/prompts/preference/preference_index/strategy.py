from prompt_manager import register


@register("preference_index")
def render(type_info: list | None = None) -> str:
    """渲染偏好索引。按 type 分组，每条显示 rule + count。"""
    if not type_info:
        return "（无偏好）"

    lines = ["## 活跃偏好索引", ""]
    for group in type_info:
        title = group.get("section_title", group.get("name", "其他"))
        entries = group.get("entries", [])
        lines.append(f"### {title}")
        for idx, entry in enumerate(entries):
            rule = entry.get("rule", "?")
            cnt = entry.get("count", 1)
            lines.append(f"{idx}. {rule}（x{cnt}）")
        lines.append("")

    return "\n".join(lines).strip()
