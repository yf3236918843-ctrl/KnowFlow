from pathlib import Path
from prompt_manager import register


@register("calculus_summary")
def render() -> str:
    template = Path(__file__).with_name("prompt.txt").read_text(encoding="utf-8")
    return template
