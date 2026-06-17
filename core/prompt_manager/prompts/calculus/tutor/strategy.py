from pathlib import Path

from prompt_manager import register


@register("calculus_tutor")
def render(
    QuestionSource: str = "",
    Question: str = "",
    UserPicture: str = "占位符：功能未启用",
    profile: str = "",
    recent_session_outlines: str = "暂无。",
) -> str:
    template = Path(__file__).with_name("prompt.txt").read_text(encoding="utf-8")
    return (
        template
        .replace("{QuestionSource}", QuestionSource)
        .replace("{Question}", Question)
        .replace("{UserPicture}", UserPicture)
        .replace("{profile}", profile)
        .replace("{recent_session_outlines}", recent_session_outlines)
    )
