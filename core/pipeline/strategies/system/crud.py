"""
CRUD strategies for project / bank / group / question.
"""

from pipeline import register_pipeline
from pipeline.Tools.Repo import (
    project_create, project_list, project_get, project_update, project_delete,
    bank_create, bank_list, bank_get, bank_update, bank_delete,
    group_create, group_list, group_get, group_update, group_reorder, group_delete,
    question_list_by_bank, question_list_by_group, question_get,
    question_update_content, question_delete, question_mark_done,
    question_batch_create, question_append_texts, question_navigation_summary, question_path,
)


def _dispatch(
    ctx,
    create_fn=None,
    list_fn=None,
    get_fn=None,
    update_fn=None,
    delete_fn=None,
    extra=None,
):
    func = ctx.get("func", "")
    user_id = ctx.get("user_id")

    if func == "create" and create_fn:
        name = ctx.get("name")
        if not name:
            return {"type": "error", "message": "Missing name"}
        kwargs = {k: v for k, v in ctx.items() if k not in ("func", "user_id", "task_type", "name")}
        rid = create_fn(user_id, name, **kwargs)
        return {"type": "result", "data": {"id": rid}}

    if func == "list" and list_fn:
        kwargs = {k: v for k, v in ctx.items() if k not in ("func", "user_id", "task_type")}
        return {"type": "result", "data": list_fn(user_id, **kwargs)}

    if func == "get" and get_fn:
        item_id = ctx.get("id")
        if not item_id:
            return {"type": "error", "message": "Missing id"}
        return {"type": "result", "data": get_fn(user_id, item_id)}

    if func == "update" and update_fn:
        item_id = ctx.get("id")
        name = ctx.get("name")
        if not item_id:
            return {"type": "error", "message": "Missing id"}
        if not name:
            return {"type": "error", "message": "Missing name"}
        ok = update_fn(user_id, item_id, name)
        return {"type": "result", "data": {"ok": bool(ok)}}

    if func == "delete" and delete_fn:
        item_id = ctx.get("id")
        if not item_id:
            return {"type": "error", "message": "Missing id"}
        delete_fn(user_id, item_id)
        return {"type": "result", "data": {"ok": True}}

    if extra:
        return extra(ctx, user_id)

    return {"type": "error", "message": f"Unknown func: {func}"}


@register_pipeline("project")
class ProjectStrategy:
    def run(self, ctx, sm, pm, pe, store, log) -> dict:
        return _dispatch(
            ctx,
            create_fn=lambda uid, name, **kw: project_create(uid, name),
            list_fn=lambda uid, **kw: project_list(uid),
            get_fn=project_get,
            update_fn=project_update,
            delete_fn=project_delete,
        )


@register_pipeline("bank")
class BankStrategy:
    def run(self, ctx, sm, pm, pe, store, log) -> dict:
        return _dispatch(
            ctx,
            create_fn=lambda uid, name, **kw: bank_create(uid, kw.get("project_id"), name),
            list_fn=lambda uid, **kw: bank_list(uid, kw.get("project_id")),
            get_fn=bank_get,
            update_fn=bank_update,
            delete_fn=bank_delete,
        )


@register_pipeline("group")
class GroupStrategy:
    def run(self, ctx, sm, pm, pe, store, log) -> dict:
        return _dispatch(
            ctx,
            create_fn=lambda uid, name, **kw: group_create(uid, kw.get("bank_id"), name),
            list_fn=lambda uid, **kw: group_list(uid, kw.get("bank_id")),
            get_fn=group_get,
            update_fn=group_update,
            delete_fn=group_delete,
            extra=lambda raw, uid: _group_extra(raw, uid),
        )


def _group_extra(ctx, user_id):
    func = ctx.get("func")
    if func == "reorder":
        group_reorder(user_id, ctx.get("bank_id"), ctx.get("group_ids", []))
        return {"type": "result", "data": {"ok": True}}
    return {"type": "error", "message": f"Unknown func: {func}"}


@register_pipeline("question")
class QuestionStrategy:
    def run(self, ctx, sm, pm, pe, store, log) -> dict:
        func = ctx.get("func", "")
        user_id = ctx.get("user_id")

        if func == "list":
            bank_id = ctx.get("bank_id")
            group_id = ctx.get("group_id")
            if group_id:
                return {"type": "result", "data": question_list_by_group(user_id, group_id)}
            if bank_id:
                return {"type": "result", "data": question_list_by_bank(user_id, bank_id)}
            return {"type": "error", "message": "Missing bank_id or group_id"}

        if func == "get":
            qid = ctx.get("id")
            if not qid:
                return {"type": "error", "message": "Missing id"}
            return {"type": "result", "data": question_get(user_id, qid)}

        if func == "update":
            qid = ctx.get("id")
            content = ctx.get("content", "").strip()
            if not qid:
                return {"type": "error", "message": "Missing id"}
            if not content:
                return {"type": "error", "message": "Missing content"}
            ok = question_update_content(user_id, qid, content)
            return {"type": "result", "data": {"ok": bool(ok)}}

        if func == "mark_done":
            qid = ctx.get("id")
            if not qid:
                return {"type": "error", "message": "Missing id"}
            question_mark_done(user_id, qid)
            return {"type": "result", "data": {"ok": True}}

        if func == "delete":
            qid = ctx.get("id")
            if not qid:
                return {"type": "error", "message": "Missing id"}
            question_delete(user_id, qid)
            return {"type": "result", "data": {"ok": True}}

        if func == "batch_create":
            group_id = ctx.get("group_id")
            questions = ctx.get("questions", [])
            if not group_id:
                return {"type": "error", "message": "Missing group_id"}
            if not questions or not isinstance(questions, list):
                return {"type": "error", "message": "Missing questions array"}
            ids = question_batch_create(user_id, group_id, questions)
            return {"type": "result", "data": {"ids": ids, "count": len(ids)}}

        if func == "append_json":
            group_id = ctx.get("group_id")
            texts = ctx.get("questions", [])
            if not group_id:
                return {"type": "error", "message": "Missing group_id"}
            if not isinstance(texts, list) or not texts:
                return {"type": "error", "message": "Missing questions array"}
            normalized = []
            for idx, text in enumerate(texts, start=1):
                if not isinstance(text, str):
                    return {"type": "error", "message": f"Question #{idx} is not a string"}
                content = text.strip()
                if not content:
                    return {"type": "error", "message": f"Question #{idx} is empty"}
                normalized.append(content)
            inserted = question_append_texts(user_id, group_id, normalized)
            return {
                "type": "result",
                "data": {
                    "count": len(inserted),
                    "ids": [q["id"] for q in inserted],
                    "numbers": [q.get("number", "") for q in inserted],
                },
            }

        if func == "navigator":
            project_id = ctx.get("project_id")
            bank_id = ctx.get("bank_id")
            if not project_id or not bank_id:
                return {"type": "error", "message": "Missing project_id or bank_id"}
            items = question_navigation_summary(user_id, project_id, bank_id)
            return {"type": "result", "data": {"items": items}}

        if func == "path":
            qid = ctx.get("id")
            if not qid:
                return {"type": "error", "message": "Missing id"}
            data = question_path(user_id, qid)
            if not data:
                return {"type": "error", "message": "Question not found"}
            return {"type": "result", "data": data}

        return {"type": "error", "message": f"Unknown func: {func}"}


@register_pipeline("stats")
class StatsStrategy:
    def run(self, ctx, sm, pm, pe, store, log) -> dict:
        user_id = ctx.get("user_id")
        questions = store.list("questions", user_id)
        total = len(questions)
        done = len([q for q in questions if q.get("status") == "done"])
        return {
            "type": "result",
            "data": {"total_questions": total, "completed": done},
        }
