"""
ImportWorkflow — 导入工作流策略

Cover 整个导入流程：创建项目 → 题库 → 题组 → 上传图片 → 提取题目 → 修正 → 确认入库。

前端通过 task_type="import" + func 发送指令，策略逐步执行。
"""

import json
import re

from pipeline import register_pipeline
from pipeline.Tools.Repo import (
    project_create, project_list, project_delete,
    bank_create, bank_list, bank_get, bank_delete,
    group_create, group_list, group_get, group_reorder, group_confirm, group_delete,
    image_upload, image_reorder, image_list, image_delete, image_mark_span,
    question_list_by_group,
)
from pipeline.Tools.Image import image_to_text

from llm_gateway import StreamChunk


# LLM 提取题目的 prompt 模板
_EXTRACT_PROMPT = """以下是从多张图片中识别出的数学题目文本。请按题号逐题提取，整理为 JSON 列表。

{image_sections}

对于每一道独立的题目，提取：
- number: 题号（如 "1"、"2"、"3.(1)"、"9"、"13" 等）
- content: 题目完整内容（保留 LaTeX 公式）

注意：
- 每个编号条目都是一道独立题目（包括大题下的小题如 3.(1) 3.(2)）
- 跨页题合并为一道题，在 image_indices 中列出所有图片序号
- 保留原始 LaTeX 格式
- 填空题保留下划线占位符
- 选择题保留选项

输出格式（仅输出 JSON，不要 markdown 代码块标记）：
{{"questions": [
  {{"number": "1.(1)", "content": "题目内容文字...", "image_indices": [0]}},
  ...
]}}"""


# Refine 修正 prompt 模板
_REFINE_PROMPT = """当前题目草稿（JSON）：

{current_draft}

用户反馈：{message}

请根据反馈修改草稿。只改用户提到的问题，不要改动其他无关内容。
输出完整的题目列表 JSON（仅输出 JSON，不要其他文字）：
{{"questions": [...]}}"""


@register_pipeline("import")
class ImportWorkflow:
    """导入工作流。通过 func 分发不同操作。"""

    async def run_stream(self, ctx: dict, sm, pm, pe, store, log):
        """流式执行导入操作。

        支持的 func：
        - create_project / create_bank / create_group
        - upload_images / reorder_images / mark_span
        - extract / refine / confirm
        - list_projects / list_banks / list_groups / list_images / list_questions
        - delete_project / delete_bank / delete_group / delete_image / delete_question
        """
        func = ctx.get("func", "")
        user_id = ctx.get("user_id")

        if not func:
            yield {"type": "error", "message": "Missing 'func'"}
            return

        # 会话管理：获取或创建 session（用于 extern 状态 + LLM 调用）
        session_id = ctx.get("session_id")
        session = None
        if session_id:
            session = sm.get(session_id, user_id)
        if session is None:
            session = sm.create(user_id, "Import")

        try:
            extern = dict(session.extern)

            # 从 ctx 或 extern 中读取上下文
            project_id = ctx.get("project_id") or extern.get("project_id")
            bank_id = ctx.get("bank_id") or extern.get("bank_id")
            group_id = ctx.get("group_id") or extern.get("group_id")
            vision_route = ctx.get("vision_route", "Vision")

            # ── 项目操作 ───────────────────────────────────
            if func == "create_project":
                pid = project_create(user_id, ctx["name"])
                new_extern = dict(extern)
                new_extern["project_id"] = pid
                session.update_extern(new_extern)
                yield {"type": "result", "project_id": pid,
                       "session_id": session.id}

            elif func == "list_projects":
                projects = project_list(user_id)
                yield {"type": "result", "projects": projects}

            elif func == "delete_project":
                project_delete(user_id, ctx["project_id"])
                yield {"type": "result", "ok": True}

            # ── 题库操作 ───────────────────────────────────
            elif func == "create_bank":
                if not project_id:
                    yield {"type": "error", "message": "Missing project_id"}
                    return
                bid = bank_create(user_id, project_id, ctx["name"])
                new_extern = dict(extern)
                new_extern["bank_id"] = bid
                session.update_extern(new_extern)
                yield {"type": "result", "bank_id": bid,
                       "session_id": session.id}

            elif func == "list_banks":
                if not project_id:
                    yield {"type": "error", "message": "Missing project_id"}
                    return
                banks = bank_list(user_id, project_id)
                yield {"type": "result", "banks": banks}

            elif func == "delete_bank":
                bank_delete(user_id, ctx["bank_id"])
                yield {"type": "result", "ok": True}

            # ── 题组操作 ───────────────────────────────────
            elif func == "create_group":
                if not bank_id:
                    yield {"type": "error", "message": "Missing bank_id"}
                    return
                gid = group_create(user_id, bank_id,
                                   ctx["name"],
                                   ctx.get("order", 0))
                new_extern = dict(extern)
                new_extern["group_id"] = gid
                session.update_extern(new_extern)
                yield {"type": "result", "group_id": gid,
                       "session_id": session.id}

            elif func == "list_groups":
                if not bank_id:
                    yield {"type": "error", "message": "Missing bank_id"}
                    return
                groups = group_list(user_id, bank_id)
                yield {"type": "result", "groups": groups}

            elif func == "reorder_groups":
                group_reorder(user_id, ctx["bank_id"], ctx["group_ids"])
                yield {"type": "result", "ok": True}

            elif func == "delete_group":
                group_delete(user_id, ctx["group_id"])
                yield {"type": "result", "ok": True}

            # ── 图片操作 ───────────────────────────────────
            elif func == "upload_images":
                gid = group_id or ctx.get("group_id")
                if not gid:
                    yield {"type": "error", "message": "Missing group_id"}
                    return
                images = ctx.get("images", [])
                count = 0
                for i, img_data in enumerate(images):
                    record = image_upload(user_id, gid, img_data)
                    yield {"type": "progress", "index": i, "image_id": record["id"]}
                    count += 1
                yield {"type": "result", "count": count}

            elif func == "reorder_images":
                gid = group_id or ctx.get("group_id")
                image_reorder(user_id, gid, ctx["image_ids"])
                yield {"type": "result", "ok": True}

            elif func == "mark_span":
                image_mark_span(user_id, ctx["image_ids"], ctx["label"])
                yield {"type": "result", "ok": True}

            elif func == "list_images":
                gid = group_id or ctx.get("group_id")
                if not gid:
                    yield {"type": "error", "message": "Missing group_id"}
                    return
                images = image_list(user_id, gid)
                yield {"type": "result", "images": images}

            elif func == "delete_image":
                image_delete(user_id, ctx["image_id"])
                yield {"type": "result", "ok": True}

            # ── 提取题目 ───────────────────────────────────
            elif func == "extract":
                gid = group_id or ctx.get("group_id")
                if not gid:
                    yield {"type": "error", "message": "Missing group_id"}
                    return

                # 加载图片（有序）
                images = image_list(user_id, gid)
                if not images:
                    yield {"type": "error", "message": "No images in group"}
                    return

                # 识别每张图片
                image_texts = []
                span_groups: dict[str, list[int]] = {}
                for i, img in enumerate(images):
                    yield {"type": "text",
                           "content": f"正在识别第 {i+1} 页..."}
                    raw_text = ""
                    try:
                        raw_text = await image_to_text(
                            sm, user_id, img["filename"],
                            instruction="请识别图片中的题目文字，包括题号、题目内容。",
                            route=vision_route,
                        )
                    except Exception as e:
                        raw_text = f"（识别失败: {e}）"

                    image_texts.append(raw_text)
                    yield {"type": "text",
                           "content": f"第 {i+1} 页识别完成"}

                    # 收集跨页标记
                    span_label = img.get("span_label")
                    if span_label:
                        span_groups.setdefault(span_label, []).append(i)

                # 构建 prompt
                image_sections = []
                for i, text in enumerate(image_texts):
                    section = f"[Image {i}]\n{text}"
                    # 标注跨页关系
                    for label, indices in span_groups.items():
                        if i in indices:
                            section += f"\n（此页属于跨页题「{label}」，与 Image {[j for j in indices if j != i]} 合并）"
                    image_sections.append(section)

                prompt = _EXTRACT_PROMPT.format(
                    image_sections="\n\n".join(image_sections)
                )

                # 流式调 LLM
                yield {"type": "text", "content": "正在整理题目..."}
                collected = ""
                async for chunk in session.stream(
                    [{"role": "user", "content": prompt}]
                ):
                    if isinstance(chunk, StreamChunk) and chunk.content:
                        collected += chunk.content
                        yield {"type": "text", "content": chunk.content}

                # 解析 LLM 输出
                questions = self._parse_questions(collected)

                # 保存草稿
                draft_data = {
                    "group_id": gid,
                    "questions": questions,
                    "raw_texts": image_texts,
                }
                draft_id = store.insert("drafts", user_id, draft_data)

                yield {"type": "draft_ready",
                       "questions": questions,
                       "draft_id": str(draft_id)}

            # ── 修正题目 ───────────────────────────────────
            elif func == "refine":
                draft_id = ctx.get("draft_id")
                if not draft_id:
                    yield {"type": "error", "message": "Missing draft_id"}
                    return

                message = ctx.get("message", "")
                if not message:
                    yield {"type": "error", "message": "Missing message"}
                    return

                # 读取草稿
                draft = store.get("drafts", user_id, int(draft_id))
                if draft is None:
                    yield {"type": "error", "message": f"Draft not found: {draft_id}"}
                    return

                current_json = json.dumps(
                    draft.get("questions", []),
                    ensure_ascii=False, indent=2
                )

                prompt = _REFINE_PROMPT.format(
                    current_draft=current_json,
                    message=message,
                )

                # 流式调 LLM
                collected = ""
                async for chunk in session.stream(
                    [{"role": "user", "content": prompt}]
                ):
                    if isinstance(chunk, StreamChunk) and chunk.content:
                        collected += chunk.content
                        yield {"type": "text", "content": chunk.content}

                # 解析结果
                updated_questions = self._parse_questions(collected)

                # 更新草稿
                draft["questions"] = updated_questions
                store.update("drafts", user_id, int(draft_id), draft)

                yield {"type": "draft_updated",
                       "questions": updated_questions,
                       "draft_id": draft_id}

            # ── 确认入库 ───────────────────────────────────
            elif func == "confirm":
                gid = ctx.get("group_id")
                did = ctx.get("draft_id")
                if not gid or not did:
                    yield {"type": "error",
                           "message": "Missing group_id or draft_id"}
                    return
                try:
                    result = group_confirm(user_id, gid, did)
                    yield {"type": "result", **result}
                except ValueError as e:
                    yield {"type": "error", "message": str(e)}

            # ── 查询题目 ───────────────────────────────────
            elif func == "list_questions":
                gid = group_id or ctx.get("group_id")
                if not gid:
                    yield {"type": "error", "message": "Missing group_id"}
                    return
                questions = question_list_by_group(user_id, gid)
                yield {"type": "result", "questions": questions}

            else:
                yield {"type": "error",
                       "message": f"Unknown func: {func}"}

        finally:
            session.destroy()

    # ── 同步 run ────────────────────────────────────────────

    def run(self, ctx: dict, sm, pm, pe, store, log) -> dict:
        """同步执行（只支持查询类操作）。"""
        func = ctx.get("func", "")
        user_id = ctx.get("user_id")

        if func == "list_projects":
            return {"type": "result", "projects": project_list(user_id)}
        if func == "list_banks":
            return {"type": "result",
                    "banks": bank_list(user_id, ctx.get("project_id", 0))}
        if func == "list_groups":
            return {"type": "result",
                    "groups": group_list(user_id, ctx.get("bank_id", 0))}
        if func == "list_images":
            return {"type": "result",
                    "images": image_list(user_id, ctx.get("group_id", 0))}
        if func == "list_questions":
            return {"type": "result",
                    "questions": question_list_by_group(
                        user_id, ctx.get("group_id", 0))}

        return {"type": "error",
                "message": f"Sync mode not supported for func: {func}"}

    # ══════════════════════════════════════════════════════════
    # 内部工具
    # ══════════════════════════════════════════════════════════

    @staticmethod
    def _parse_questions(text: str) -> list[dict]:
        """从 LLM 输出中解析题目列表。"""
        # 尝试提取 JSON
        json_str = text.strip()
        # 去掉可能的 markdown 代码块
        match = re.search(r'```(?:json)?\s*\n?(.*?)```', json_str, re.DOTALL)
        if match:
            json_str = match.group(1).strip()
        # 尝试找到 JSON 对象
        if not json_str.startswith("{"):
            match = re.search(r'\{.*\}', json_str, re.DOTALL)
            if match:
                json_str = match.group()
        try:
            data = json.loads(json_str)
            return data.get("questions", [])
        except json.JSONDecodeError:
            # 解析失败，返回空列表
            return []
