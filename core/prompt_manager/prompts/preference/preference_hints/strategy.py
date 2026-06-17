from prompt_manager import register


@register("preference_hints")
def render(processors: list | None = None) -> str:
    """渲染所有 processor 的关注信号提示。"""
    if not processors:
        return "（未注册分析维度）"

    lines = ["## 偏好分析关注点"]
    for p in processors:
        title = p.get("section_title", p.get("name", "?"))
        fragment = p.get("fragment", "")
        lines.append(f"\n{title}")
        lines.append(fragment)
    return "\n".join(lines)
