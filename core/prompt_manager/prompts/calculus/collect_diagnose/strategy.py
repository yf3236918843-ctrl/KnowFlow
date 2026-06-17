from pathlib import Path
from prompt_manager import register


@register("calculus_collect_diagnose")
def render(profile: str = "", extern: str = "") -> str:
    template = Path(__file__).with_name("prompt.txt").read_text(encoding="utf-8")
    return template.replace("{profile}", profile).replace("{extern}", extern)
