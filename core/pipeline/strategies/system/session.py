"""
SessionStrategy – Session 管理

功能：
  - session.list：列出用户所有 session
  - session.get：获取单个 session 完整数据（含 messages、extern）
  - session.catalog：按 project/bank 聚合 exercise session
"""

from pipeline import register_pipeline
from pipeline.Tools.Repo import project_get, bank_get, group_get, question_get


@register_pipeline("session")
class SessionStrategy:

    def run(self, ctx, sm, pm, pe, store, log) -> dict:
        func = ctx.get("func", "")
        user_id = ctx.get("user_id")

        if func == "list":
            sessions = sm.list(user_id)
            return {"type": "result", "data": sessions}

        if func == "get":
            session_id = ctx.get("id")
            if not session_id:
                return {"type": "error", "message": "Missing id"}
            session = sm.get(session_id, user_id)
            if not session:
                return {"type": "error", "message": "Session not found"}
            return {"type": "result", "data": {
                "id": session.id,
                "route": session.route,
                "messages": session.messages,
                "extern": session.extern,
                "status": session.status,
                "created_at": session.created_at,
                "completed_at": session.completed_at,
            }}

        if func == "catalog":
            sessions = sm.list(user_id)
            groups = {}
            for item in sessions:
                if item.get("route") != "exercise":
                    continue
                session = sm.get(item["id"], user_id)
                if not session:
                    continue
                ext = session.extern or {}
                q_ref = ext.get("_question_ref", "")
                parts = q_ref.split(".")
                if len(parts) != 4:
                    continue
                try:
                    project_id = int(parts[0])
                    bank_id = int(parts[1])
                    group_id = int(parts[2])
                    question_id = int(parts[3])
                except ValueError:
                    continue

                project = project_get(user_id, project_id) or {}
                bank = bank_get(user_id, bank_id) or {}
                group = group_get(user_id, group_id) or {}
                question = question_get(user_id, question_id) or {}
                key = f"{project_id}.{bank_id}"
                if key not in groups:
                    groups[key] = {
                        "project_id": project_id,
                        "project_name": project.get("name", ""),
                        "bank_id": bank_id,
                        "bank_name": bank.get("name", ""),
                        "sessions": [],
                    }
                groups[key]["sessions"].append({
                    "session_id": session.id,
                    "group_id": group_id,
                    "group_name": group.get("name", ""),
                    "question_id": question_id,
                    "question_number": question.get("number", ""),
                    "question_content": ext.get("_question_content") or question.get("content", ""),
                    "has_summary": bool(ext.get("summary")),
                    "created_at": session.created_at,
                    "completed_at": session.completed_at,
                })

            catalog = list(groups.values())
            catalog.sort(key=lambda x: (x.get("project_name", ""), x.get("bank_name", "")))
            for item in catalog:
                item["sessions"].sort(key=lambda s: s.get("created_at") or "", reverse=True)
            return {"type": "result", "data": {"groups": catalog}}

        return {"type": "error", "message": f"Unknown func: {func}"}
