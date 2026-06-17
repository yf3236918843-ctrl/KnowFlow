from pathlib import Path
from prompt_manager import register


@register("calculus_review_gen")
def render(history: str = "") -> str:
    template = Path(__file__).with_name("prompt.txt").read_text(encoding="utf-8")
    return template.replace("{history}", history)
