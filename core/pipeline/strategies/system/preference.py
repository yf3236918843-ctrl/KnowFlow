"""
Preference query strategies.
"""

from pipeline import register_pipeline


@register_pipeline("preference")
class PreferenceStrategy:
    def run(self, ctx, sm, pm, pe, store, log) -> dict:
        func = ctx.get("func", "")
        user_id = ctx.get("user_id")

        if func == "preview":
            project_id = ctx.get("project_id")
            return {
                "type": "result",
                "data": pe.preview(user_id=user_id, project_id=project_id),
            }

        return {"type": "error", "message": f"Unknown func: {func}"}
