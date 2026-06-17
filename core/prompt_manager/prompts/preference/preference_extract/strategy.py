from pathlib import Path
from prompt_manager import register


@register("preference_extract")
def render(
    scenes: str = "",
    meta_prefs: str = "",
    index: str = "",
    max_search_rounds: int = 1,
) -> str:
    """偏好提取 prompt。支持两轮协议：search × N → action_set。"""
    template = Path(__file__).with_name("prompt.txt").read_text(encoding="utf-8")
    return (
        template
        .replace("{scenes}", scenes)
        .replace("{meta_prefs}", meta_prefs)
        .replace("{index}", index)
        .replace("{max_search_rounds}", str(max_search_rounds))
    )
