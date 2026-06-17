"""
Repo entity helpers.

This module wraps Store operations for project/bank/group/image/question CRUD.
"""

from pipeline.Tools.Models import _get_store, _get_filestore


def project_create(user_id: int, name: str) -> int:
    return _get_store().insert("projects", user_id, {"name": name})


def project_list(user_id: int) -> list[dict]:
    return _get_store().list("projects", user_id)


def project_get(user_id: int, project_id: int) -> dict | None:
    return _get_store().get("projects", user_id, project_id)


def project_update(user_id: int, project_id: int, name: str) -> bool:
    return _get_store().update("projects", user_id, project_id, {"name": name})


def project_delete(user_id: int, project_id: int):
    store = _get_store()
    banks = store.list("banks", user_id, filter={"project_id": project_id})
    for bank in banks:
        _cascade_delete_bank(user_id, bank["id"])
        store.delete("banks", user_id, bank["id"])
    store.delete("projects", user_id, project_id)


def bank_create(user_id: int, project_id: int, name: str) -> int:
    return _get_store().insert("banks", user_id, {
        "project_id": project_id,
        "name": name,
    })


def bank_list(user_id: int, project_id: int) -> list[dict]:
    return _get_store().list("banks", user_id, filter={"project_id": project_id})


def bank_get(user_id: int, bank_id: int) -> dict | None:
    return _get_store().get("banks", user_id, bank_id)


def bank_update(user_id: int, bank_id: int, name: str) -> bool:
    return _get_store().update("banks", user_id, bank_id, {"name": name})


def bank_delete(user_id: int, bank_id: int):
    store = _get_store()
    _cascade_delete_bank(user_id, bank_id)
    store.delete("banks", user_id, bank_id)


def group_create(user_id: int, bank_id: int, name: str, order: int = 0) -> int:
    return _get_store().insert("groups", user_id, {
        "bank_id": bank_id,
        "name": name,
        "sort_order": order,
        "status": "editing",
    })


def group_list(user_id: int, bank_id: int) -> list[dict]:
    return _get_store().list(
        "groups",
        user_id,
        filter={"bank_id": bank_id},
        order_by="sort_order",
        order="asc",
    )


def group_get(user_id: int, group_id: int) -> dict | None:
    return _get_store().get("groups", user_id, group_id)


def group_update(user_id: int, group_id: int, name: str) -> bool:
    return _get_store().update("groups", user_id, group_id, {"name": name})


def group_reorder(user_id: int, bank_id: int, group_ids: list[int]):
    store = _get_store()
    for order, gid in enumerate(group_ids):
        store.update("groups", user_id, gid, {"sort_order": order})


def group_confirm(user_id: int, group_id: int, draft_id: str) -> dict:
    store = _get_store()
    group_assert_editing(user_id, group_id)
    draft = store.get("drafts", user_id, int(draft_id))
    if draft is None:
        raise ValueError(f"Draft not found: {draft_id}")

    questions = draft.get("questions", [])
    if not questions:
        raise ValueError("Draft contains no questions")

    for q in questions:
        q["group_id"] = group_id

    ids = store.insert_many("questions", user_id, questions)
    store.update("groups", user_id, group_id, {"status": "imported"})
    store.delete("drafts", user_id, int(draft_id))
    return {"imported": len(ids)}


def group_assert_editing(user_id: int, group_id: int):
    group = group_get(user_id, group_id)
    if group is None:
        raise ValueError(f"Group not found: {group_id}")
    if group.get("status") != "editing":
        raise ValueError(
            f"Group {group_id} status is '{group.get('status')}', expected 'editing'"
        )


def group_delete(user_id: int, group_id: int):
    store = _get_store()
    _cascade_delete_group(user_id, group_id)
    store.delete("groups", user_id, group_id)


def image_upload(user_id: int, group_id: int, image_data: str) -> dict:
    store = _get_store()
    filestore = _get_filestore()

    import base64

    raw_bytes = base64.b64decode(image_data)
    filename = filestore.save("image", raw_bytes)
    existing = store.list("images", user_id, filter={"group_id": group_id})
    max_order = max((e.get("sort_order", 0) for e in existing), default=-1)
    img_id = store.insert("images", user_id, {
        "group_id": group_id,
        "filename": filename,
        "sort_order": max_order + 1,
    })
    record = store.get("images", user_id, img_id)
    return record or {"id": img_id, "filename": filename}


def image_reorder(user_id: int, group_id: int, image_ids: list[int]):
    store = _get_store()
    for order, img_id in enumerate(image_ids):
        store.update("images", user_id, img_id, {"sort_order": order})


def image_list(user_id: int, group_id: int) -> list[dict]:
    return _get_store().list(
        "images",
        user_id,
        filter={"group_id": group_id},
        order_by="sort_order",
        order="asc",
    )


def image_delete(user_id: int, image_id: int):
    store = _get_store()
    filestore = _get_filestore()
    img = store.get("images", user_id, image_id)
    if img is not None:
        filename = img.get("filename")
        if filename:
            filestore.delete(filename)
        store.delete("images", user_id, image_id)


def question_batch_create(user_id: int, group_id: int, questions: list[dict]) -> list[int]:
    store = _get_store()
    for q in questions:
        q["group_id"] = group_id
    return store.insert_many("questions", user_id, questions)


def question_list_by_group(user_id: int, group_id: int) -> list[dict]:
    items = _get_store().list("questions", user_id, filter={"group_id": group_id})
    return _sort_questions(items)


def question_list_by_bank(user_id: int, bank_id: int) -> list[dict]:
    store = _get_store()
    groups = group_list(user_id, bank_id)
    result = []
    for group in groups:
        result.extend(question_list_by_group(user_id, group["id"]))
    return result


def question_get(user_id: int, question_id: int) -> dict | None:
    return _get_store().get("questions", user_id, question_id)


def question_update_content(user_id: int, question_id: int, content: str) -> bool:
    return _get_store().update("questions", user_id, question_id, {"content": content})


def question_append_texts(user_id: int, group_id: int, texts: list[str]) -> list[dict]:
    existing = question_list_by_group(user_id, group_id)
    next_number = len(existing) + 1
    payload = []
    for text in texts:
        payload.append({
            "number": str(next_number),
            "content": text,
            "status": "",
        })
        next_number += 1
    ids = question_batch_create(user_id, group_id, payload)
    return [question_get(user_id, qid) for qid in ids if question_get(user_id, qid)]


def question_delete(user_id: int, question_id: int):
    store = _get_store()
    question = store.get("questions", user_id, question_id)
    group_id = question.get("group_id") if question else None
    store.delete("questions", user_id, question_id)
    if group_id:
        question_resequence_group(user_id, group_id)


def question_mark_done(user_id: int, question_id: int):
    _get_store().update("questions", user_id, question_id, {"status": "done"})


def question_resequence_group(user_id: int, group_id: int):
    store = _get_store()
    questions = question_list_by_group(user_id, group_id)
    for idx, q in enumerate(questions, start=1):
        if q.get("number") != str(idx):
            store.update("questions", user_id, q["id"], {"number": str(idx)})


def question_path(user_id: int, question_id: int) -> dict | None:
    question = question_get(user_id, question_id)
    if not question:
        return None
    group = group_get(user_id, question.get("group_id")) or {}
    bank = bank_get(user_id, group.get("bank_id")) or {}
    project = project_get(user_id, bank.get("project_id")) or {}
    return {
        "question": question,
        "group": group,
        "bank": bank,
        "project": project,
    }


def question_navigation_summary(user_id: int, project_id: int, bank_id: int) -> list[dict]:
    store = _get_store()
    project = project_get(user_id, project_id)
    bank = bank_get(user_id, bank_id)
    if not project or not bank or bank.get("project_id") != project_id:
        return []

    items = []
    for group in group_list(user_id, bank_id):
        for question in question_list_by_group(user_id, group["id"]):
            items.append({
                "project_id": project_id,
                "project_name": project.get("name", ""),
                "bank_id": bank_id,
                "bank_name": bank.get("name", ""),
                "group_id": group.get("id"),
                "group_name": group.get("name", ""),
                "question_id": question.get("id"),
                "question_number": question.get("number", ""),
                "question_content": question.get("content", ""),
                "status": question.get("status", ""),
                "has_summary": False,
                "summary": None,
                "session_id": None,
            })

    ref_to_index = {
        f"{project_id}.{bank_id}.{item['group_id']}.{item['question_id']}": idx
        for idx, item in enumerate(items)
    }
    sessions = store.list("sessions", user_id)
    sessions.sort(key=lambda s: s.get("created_at") or "")
    for session in sessions:
        extern = session.get("extern", {}) or {}
        q_ref = extern.get("_question_ref")
        if not q_ref or q_ref not in ref_to_index:
            continue
        idx = ref_to_index[q_ref]
        if items[idx]["session_id"] is None:
            items[idx]["session_id"] = session.get("id")
        summary = extern.get("summary")
        if summary:
            items[idx]["has_summary"] = True
            items[idx]["summary"] = summary
            items[idx]["session_id"] = session.get("id")
    return items


def image_mark_span(user_id: int, image_ids: list[int], label: str):
    store = _get_store()
    for img_id in image_ids:
        store.update("images", user_id, img_id, {"span_label": label})


def _cascade_delete_bank(user_id: int, bank_id: int):
    store = _get_store()
    groups = store.list("groups", user_id, filter={"bank_id": bank_id})
    for group in groups:
        _cascade_delete_group(user_id, group["id"])
        store.delete("groups", user_id, group["id"])


def _cascade_delete_group(user_id: int, group_id: int):
    store = _get_store()
    filestore = _get_filestore()

    images = store.list("images", user_id, filter={"group_id": group_id})
    for img in images:
        fname = img.get("filename")
        if fname and filestore:
            filestore.delete(fname)
        store.delete("images", user_id, img["id"])

    questions = store.list("questions", user_id, filter={"group_id": group_id})
    for q in questions:
        store.delete("questions", user_id, q["id"])


def _sort_questions(questions: list[dict]) -> list[dict]:
    def _key(q: dict):
        number = q.get("number")
        if isinstance(number, str) and number.isdigit():
            return (0, int(number), q.get("id", 0))
        return (1, str(number or ""), q.get("id", 0))

    return sorted(questions, key=_key)
