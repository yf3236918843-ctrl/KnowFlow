from pathlib import Path
from prompt_manager import register


@register("preference_chat")
def render(existing_prefs: str = "") -> str:
    """渲染偏好管理对话的 system prompt。"""
    template = Path(__file__).with_name("prompt.txt").read_text(encoding="utf-8")
    return template.replace("{existing_prefs}", existing_prefs)
