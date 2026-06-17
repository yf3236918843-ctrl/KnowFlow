"""
PreferenceEngine — 偏好引擎

第 3 层（依赖 Store、PromptManager、Log）。
管理偏好的全生命周期：从原始信号提取、弱信号积累、用户确认到应用于系统输出。

核心原则：
1. 引擎不主动调 LLM — 只提供工具（构建 prompt、解析输出、管理数据）
2. 类型系统可插拔 — processor 通过 register_processor 动态注册
3. 偏好就是记忆 — 所有学生信息要么是偏好，要么是记录
4. 渐进式披露 — LLM 先看索引，按需搜索详情
"""

import json
import re
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timezone

from log import Log
from app_error import AppError
from store import Store
from prompt_manager import PromptManager


# ── 常量 ──────────────────────────────────────────────────────────

_COLL_ACTIVE = "preferences_active"
_COLL_SIGNALS = "weak_signals"

_MIN_SIGNALS_FOR_MERGE = 3
_MAX_SIGNAL_AGE_DAYS = 7
_DEFAULT_CONTEXT_MAX_CHARS = 3000


# ==================================================================
# 异常体系
# ==================================================================


class ErrorCode:
    """预定义错误码"""
    PREFERENCE_NOT_FOUND = "PREFERENCE_NOT_FOUND"
    SAVE_FAILED = "SAVE_FAILED"
    MERGE_FAILED = "MERGE_FAILED"
    INVALID_ACTION = "INVALID_ACTION"
    PARSE_FAILED = "PARSE_FAILED"


class PreferenceError(AppError):
    """偏好引擎统一异常。继承 AppError。"""
    pass


class PreferenceNotFoundError(PreferenceError):
    """偏好条目不存在时抛出。"""
    pass


class InvalidActionError(PreferenceError):
    """无效的 action 操作时抛出。"""
    pass


def _safely(context: str, log: Log | None, fn, *args, **kwargs):
    """兜底执行器：未预期异常被 PreferenceError 包裹并记录。

    识别 AppError 并透传（不吞下层异常信息）。
    """
    try:
        return fn(*args, **kwargs)
    except AppError:
        raise
    except Exception as e:
        raise PreferenceError(
            ErrorCode.SAVE_FAILED,
            f"[{context}] {e}",
            cause=e,
            extras={"context": context},
            log=log,
        ) from e


# ==================================================================
# 数据结构
# ==================================================================


@dataclass
class ProcessorDef:
    """已注册的处理器定义。"""
    name: str
    section_title: str
    prompt_fragment: str


@dataclass
class AnalysisResult:
    """LLM 输出解析结果。"""
    type: str  # "action_set" | "search" | "empty"
    actions: list[dict] | None = None
    index_map: dict[str, list[int]] | None = None


@dataclass
class MergeSuggestion:
    """弱信号合并建议。"""
    type: str
    signals: list[dict]
    prompt: str


@dataclass
class MergeResult:
    """弱信号合并检查结果。"""
    should_ask: bool
    suggestions: list[MergeSuggestion] | None = None


# ==================================================================
# PreferenceEngine
# ==================================================================


class PreferenceEngine:
    """偏好引擎。管理偏好的全生命周期。"""

    def __init__(self, store: Store, pm: PromptManager, log: Log | None = None):
        """
        Args:
            store: Store 实例（JsonStore / MySQLStore）。
            pm: PromptManager 实例，用于渲染偏好 prompt。
            log: Log 实例，不传则创建一个静默 Log（仅 production WARNING）。
        """
        self._store = store
        self._pm = pm
        self._log = log or Log(mode="production")
        self._processors: dict[str, ProcessorDef] = {}

    # ── Processor 注册 ──────────────────────────────────────────────

    def register_processor(self, name: str, section_title: str,
                           prompt_fragment: str):
        """注册一个分析维度。

        Args:
            name: 偏好 type 值，如 "tutoring"、"question"。
            section_title: prompt 中的标题，如 "## 辅导互动"。
            prompt_fragment: 告诉 LLM 关注什么信号。
        """
        self._processors[name] = ProcessorDef(
            name=name,
            section_title=section_title,
            prompt_fragment=prompt_fragment,
        )
        self._log.info("PreferenceEngine", f"Registered processor: {name}")

    # ── 构建 prompt 块 ──────────────────────────────────────────────

    def build_index(self, user_id: int, project_id: int | None = None) -> str:
        """构建渐进式披露的偏好索引。

        从 Store 查出活跃偏好 → 按 type 分组 → 渲染为格式化文本。
        project_id 不为 None 时只返回该项目 + 全局偏好。
        """
        grouped = self._group_active_entries(user_id, project_id)

        # 按注册顺序排列，未注册的 type 按字母序排在最后
        type_info = []
        seen = set()
        for p_name in self._processors:
            if p_name in grouped:
                proc = self._processors[p_name]
                type_info.append({
                    "name": p_name,
                    "section_title": proc.section_title,
                    "entries": grouped[p_name],
                })
                seen.add(p_name)
        for t in sorted(grouped.keys()):
            if t not in seen:
                type_info.append({
                    "name": t,
                    "section_title": t,
                    "entries": grouped[t],
                })

        return self._pm.render("preference_index", {"type_info": type_info})

    def get_output_format(self) -> str:
        """返回 LLM 输出格式说明。

        根据已注册 processor 动态生成 action_set 中各 action 的字段说明。
        """
        types_list = [
            {"name": p.name, "section_title": p.section_title}
            for p in self._processors.values()
        ]
        return self._pm.render("preference_output_format", {"types": types_list})

    def get_processor_hints(self) -> str:
        """返回所有已注册 processor 的关注信号。

        告诉 LLM 在每个维度下应关注哪些类型的用户反馈。
        """
        processors = [
            {
                "name": p.name,
                "section_title": p.section_title,
                "fragment": p.prompt_fragment,
            }
            for p in self._processors.values()
        ]
        return self._pm.render("preference_hints", {"processors": processors})

    # ── 解析 LLM 输出 ──────────────────────────────────────────────

    def process_llm_output(self, llm_text: str) -> AnalysisResult:
        """解析 LLM 输出，返回 AnalysisResult。

        支持三种类型：
        - "search": LLM 需要查看更多偏好详情
        - "action_set": LLM 输出具体的增删改查动作
        - "empty": 无偏好变更

        Raises:
            PreferenceError(ErrorCode.PARSE_FAILED): JSON 解析失败。
        """
        try:
            data = PreferenceEngine._parse_json(llm_text)
        except Exception as e:
            raise PreferenceError(
                ErrorCode.PARSE_FAILED,
                f"Failed to parse LLM output: {e}",
                cause=e,
                log=self._log,
            ) from e

        msg_type = data.get("type", "empty")

        if msg_type == "search":
            index_map = {k: v for k, v in data.items() if k != "type"}
            return AnalysisResult(type="search", index_map=index_map)

        if msg_type == "action_set":
            return AnalysisResult(
                type="action_set",
                actions=data.get("actions", []),
            )

        return AnalysisResult(type="empty")

    def execute_search(self, user_id: int, search_req: dict,
                       project_id: int | None = None) -> str:
        """执行 search 请求。

        根据索引请求中的 type 和 indices，返回对应条目的完整 JSON 详情。
        结果末尾自动追加"必须输出 action_set"要求，强制 LLM 继续。
        """
        grouped = self._group_active_entries(user_id, project_id)

        results: list[str] = []
        for pref_type, indices in search_req.items():
            entries = grouped.get(pref_type, [])
            for idx in indices:
                if 0 <= idx < len(entries):
                    entry = entries[idx]
                    # 移除 Store 内部 id，使用 entry_id 供 LLM 引用
                    display = dict(entry)
                    display.pop("id", None)
                    results.append(
                        f"[{pref_type}:{idx}] {json.dumps(display, ensure_ascii=False, indent=2)}"
                    )

        formatted = "\n\n".join(results) if results else "（无匹配结果）"
        formatted += (
            "\n\n---\n"
            "以上为完整偏好详情。请基于这些信息输出 action_set。"
        )
        return formatted

    # ── 执行动作 ────────────────────────────────────────────────────

    def save_actions(self, user_id: int, actions: list[dict],
                     project_id: int | None = None,
                     source_session: int = 0):
        """执行 action_set。

        Args:
            user_id: 用户 ID。
            actions: action 列表，每项包含 action 类型和对应数据。
            project_id: 所属学习项目 ID。None 表示全局偏好。
            source_session: 来源会话 ID。

        Raises:
            InvalidActionError: 未知 action 类型。
            PreferenceNotFoundError: target_id 不存在。
            PreferenceError: 存储操作失败。
        """
        for action in actions:
            act = action.get("action")
            try:
                if act == "insert":
                    self._handle_insert(user_id, project_id, action, source_session)
                elif act == "update":
                    self._handle_update(user_id, action, source_session)
                elif act == "delete":
                    self._handle_delete(user_id, action)
                elif act == "increment":
                    self._handle_increment(user_id, action)
                elif act == "mark_signal":
                    self._handle_mark_signal(user_id, project_id, action, source_session)
                elif act == "message":
                    self._log.info(
                        "PreferenceEngine",
                        f"Message to user: {action.get('message', '')}",
                        user_id=user_id,
                    )
                else:
                    raise InvalidActionError(
                        ErrorCode.INVALID_ACTION,
                        f"Unknown action: {act}",
                        log=self._log,
                    )
            except PreferenceError:
                raise
            except Exception as e:
                raise PreferenceError(
                    ErrorCode.SAVE_FAILED,
                    f"[save_actions/{act}] {e}",
                    cause=e,
                    log=self._log,
                ) from e

    def _handle_insert(self, user_id: int, project_id: int | None,
                       action: dict, source_session: int):
        entry = action.get("entry", {})
        data = self._build_entry_data(entry, user_id, project_id, source_session,
                                       action.get("source_ids"))
        _safely(f"insert", self._log,
                self._store.insert, _COLL_ACTIVE, user_id, data)
        self._log.info("PreferenceEngine", "Inserted preference",
                       user_id=user_id)

    def _handle_update(self, user_id: int, action: dict, source_session: int):
        target_id = action.get("target_id")
        entry = action.get("entry", {})

        entry_type = self._resolve_type(entry.get("type", []))
        existing = self._resolve_entry_target(user_id, target_id, preferred_type=entry_type)
        if existing is None:
            raise PreferenceNotFoundError(
                ErrorCode.PREFERENCE_NOT_FOUND,
                f"Entry not found: {target_id}",
                log=self._log,
            )

        update_data = {}
        for field in ("rule", "examples"):
            if field in entry:
                update_data[field] = entry[field]

        update_data["change_history"] = self._append_change(
            existing, "update", action.get("reason", ""),
            action.get("source_ids"), action.get("analysis"), source_session,
        )
        update_data["updated_at"] = datetime.now(timezone.utc).strftime(
            "%Y-%m-%dT%H:%M:%S")

        self._store.update(existing["_collection"], user_id,
                          existing["id"], update_data)
        self._log.info("PreferenceEngine", f"Updated {target_id}",
                       user_id=user_id)

    def _handle_delete(self, user_id: int, action: dict):
        target_id = action.get("target_id")
        existing = self._resolve_entry_target(user_id, target_id)
        if existing is None:
            raise PreferenceNotFoundError(
                ErrorCode.PREFERENCE_NOT_FOUND,
                f"Entry not found: {target_id}",
                log=self._log,
            )
        self._store.delete(existing["_collection"], user_id, existing["id"])
        self._log.info("PreferenceEngine", f"Deleted {target_id}",
                       user_id=user_id)

    def _handle_increment(self, user_id: int, action: dict):
        target_id = action.get("target_id")
        existing = self._resolve_entry_target(user_id, target_id)
        if existing is None:
            raise PreferenceNotFoundError(
                ErrorCode.PREFERENCE_NOT_FOUND,
                f"Entry not found: {target_id}",
                log=self._log,
            )
        new_count = existing.get("count", 1) + 1
        self._store.update(existing["_collection"], user_id,
                          existing["id"], {"count": new_count})
        self._log.info("PreferenceEngine", f"Incremented {target_id}",
                       user_id=user_id)

    def _handle_mark_signal(self, user_id: int, project_id: int | None,
                            action: dict, source_session: int):
        entry = action.get("entry", {})
        pref_type = self._resolve_type(entry.get("type", []))
        signal_data = {
            "type": pref_type,
            "raw": entry.get("raw", ""),
            "examples": entry.get("examples", []),
            "source_session": source_session,
        }
        if project_id is not None:
            signal_data["project_id"] = project_id
        self.add_signal(user_id, signal_data)

    # ── 弱信号管理 ──────────────────────────────────────────────────

    def add_signal(self, user_id: int, signal_data: dict) -> int:
        """添加一条弱信号。

        signal_data 必须包含：type, raw。
        可选：examples, source_session。
        """
        data = dict(signal_data)
        data.setdefault("examples", [])
        data.setdefault("source_session", 0)
        data.setdefault("created_at",
                        datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00"))

        rid = _safely("add_signal", self._log,
                      self._store.insert, _COLL_SIGNALS, user_id, data)
        self._log.info("PreferenceEngine",
                       f"Added signal: {data.get('raw', '')[:40]}",
                       user_id=user_id)
        return rid

    def try_merge(self, user_id: int, project_id: int | None = None) -> MergeResult:
        """尝试合并弱信号为偏好。

        project_id=None 检查所有信号。project_id=X 只检查该项目 + 全局信号。

        合并条件（任一满足）：
        1. 某 type 下 >= 3 条弱信号
        2. 某 type 下最早一条距今 > 7 天

        Returns:
            MergeResult(should_ask=True, suggestions=[...]) 或
            MergeResult(should_ask=False)
        """
        signals = self._store.list(_COLL_SIGNALS, user_id)
        signals = self._filter_by_project(signals, project_id)

        grouped: dict[str, list[dict]] = {}
        for sig in signals:
            t = sig.get("type", "unknown")
            grouped.setdefault(t, []).append(sig)

        suggestions = []
        now = datetime.now(timezone.utc)

        for sig_type, sig_list in grouped.items():
            if not sig_list:
                continue

            # 条件 1：数量 >= 阈值
            should_merge = len(sig_list) >= _MIN_SIGNALS_FOR_MERGE

            # 条件 2：最早一条超过 N 天
            if not should_merge:
                dates = [
                    sig.get("created_at") for sig in sig_list
                    if sig.get("created_at")
                ]
                if dates:
                    try:
                        earliest = min(dates)
                        sig_time = datetime.fromisoformat(earliest)
                        if sig_time.tzinfo is None:
                            sig_time = sig_time.replace(tzinfo=timezone.utc)
                        if (now - sig_time).days > _MAX_SIGNAL_AGE_DAYS:
                            should_merge = True
                    except (ValueError, TypeError):
                        pass

            if should_merge and sig_type in self._processors:
                proc = self._processors[sig_type]
                prompt = self._pm.render("preference_merge_ask", {
                    "type": sig_type,
                    "section_title": proc.section_title,
                    "signals": sig_list,
                })
                suggestions.append(MergeSuggestion(
                    type=sig_type,
                    signals=sig_list,
                    prompt=prompt,
                ))

        if suggestions:
            return MergeResult(should_ask=True, suggestions=suggestions)
        return MergeResult(should_ask=False)

    # ── 上下文注入 ──────────────────────────────────────────────────

    def get_context(self, user_id: int, project_id: int | None = None,
                    type: str | None = None,
                    max_chars: int = _DEFAULT_CONTEXT_MAX_CHARS) -> str:
        """获取当前生效偏好的格式化文本，供注入 system prompt。

        只返回 rule + count，按 type / project_id 过滤。超过 max_chars 截断。
        project_id 不为 None 时只返回该项目 + 全局偏好。
        """
        all_active = self._store.list(_COLL_ACTIVE, user_id)
        all_active = self._filter_by_project(all_active, project_id)
        entries = [
            e for e in all_active
            if type is None or e.get("type") == type
        ]

        lines = ["## 当前偏好"]
        for entry in entries:
            rule = entry.get("rule", "?")
            count = entry.get("count", 1)
            lines.append(f"- {rule}（x{count}）")

        text = "\n".join(lines)
        if len(text) > max_chars:
            text = text[:max_chars] + "\n...（截断）"
        return text

    def preview(self, user_id: int, project_id: int | None = None) -> dict:
        active_entries = self._store.list(_COLL_ACTIVE, user_id)
        active_entries = self._filter_by_project(active_entries, project_id)
        active_entries = [self._with_collection(entry, _COLL_ACTIVE) for entry in active_entries]

        signal_entries = self._store.list(_COLL_SIGNALS, user_id)
        signal_entries = self._filter_by_project(signal_entries, project_id)
        signal_entries = [self._with_collection(entry, _COLL_SIGNALS) for entry in signal_entries]

        return {
            "active_total": len(active_entries),
            "signal_total": len(signal_entries),
            "active_groups": self._serialize_grouped_entries(self._group_entries(active_entries), include_rule=True),
            "signal_groups": self._serialize_grouped_entries(self._group_entries(signal_entries), include_rule=False),
        }

    # ── 内部工具 ────────────────────────────────────────────────────

    @staticmethod
    def _parse_json(text: str) -> dict:
        """从 LLM 输出文本中提取 JSON 对象。

        优先级：
        1. ```json ... ``` 代码块
        2. 纯 JSON 对象（{...}）
        3. 文本中嵌入的第一个 {...}
        """
        # 尝试 markdown 代码块
        match = re.search(r'```(?:json)?\s*\n?(.*?)```', text, re.DOTALL)
        if match:
            return json.loads(match.group(1).strip())
        # 尝试纯 JSON
        text = text.strip()
        if text.startswith("{") and text.endswith("}"):
            return json.loads(text)
        # 尝试从文本提取第一个 JSON 对象
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            return json.loads(match.group())
        raise ValueError("No JSON object found in text")

    def _find_by_entry_id(self, user_id: int, target_id: str) -> dict | None:
        """按 entry_id 跨所有偏好集合查找条目。

        Returns:
            匹配的条目 dict，含额外 _collection 字段标识来源集合。
            未找到返回 None。
        """
        for coll in (_COLL_ACTIVE,):
            entries = self._store.list(coll, user_id,
                                       filter={"entry_id": target_id})
            if entries:
                entries[0]["_collection"] = coll
                return entries[0]
        return None

    def _resolve_entry_target(
        self,
        user_id: int,
        target_id,
        project_id: int | None = None,
        preferred_type: str | None = None,
    ) -> dict | None:
        exact = self._find_by_entry_id(user_id, str(target_id))
        if exact is not None:
            return exact

        entries = self._store.list(_COLL_ACTIVE, user_id)
        entries = self._filter_by_project(entries, project_id)
        entries = [self._with_collection(entry, _COLL_ACTIVE) for entry in entries]
        return self._resolve_target_ref(entries, target_id, preferred_type)

    @staticmethod
    def _filter_by_project(entries: list[dict],
                           project_id: int | None) -> list[dict]:
        """按项目过滤条目。

        project_id=None: 返回全部（不过滤）。
        project_id=X: 只返回 project_id=X 或 project_id=None 的全局条目。
        """
        if project_id is None:
            return entries
        return [
            e for e in entries
            if e.get("project_id") == project_id or e.get("project_id") is None
        ]

    @staticmethod
    def _resolve_type(type_field):
        """统一处理 type 字段（可能是 list 或 str）。"""
        if isinstance(type_field, list):
            return type_field[0] if type_field else "unknown"
        return str(type_field) if type_field else "unknown"

    def _group_active_entries(self, user_id: int, project_id: int | None = None) -> dict[str, list[dict]]:
        entries = self._store.list(_COLL_ACTIVE, user_id)
        entries = self._filter_by_project(entries, project_id)
        entries = [self._with_collection(entry, _COLL_ACTIVE) for entry in entries]
        return self._group_entries(entries)

    @staticmethod
    def _group_entries(entries: list[dict]) -> dict[str, list[dict]]:
        grouped: dict[str, list[dict]] = {}
        for entry in entries:
            pref_type = entry.get("type", "unknown")
            grouped.setdefault(pref_type, []).append(entry)
        for pref_type, pref_entries in grouped.items():
            grouped[pref_type] = sorted(pref_entries, key=lambda item: item.get("id", 0))
        return grouped

    def _serialize_grouped_entries(self, grouped: dict[str, list[dict]], include_rule: bool) -> list[dict]:
        ordered_types = [name for name in self._processors if name in grouped]
        ordered_types.extend(sorted(name for name in grouped if name not in self._processors))

        result = []
        for pref_type in ordered_types:
            proc = self._processors.get(pref_type)
            entries = grouped.get(pref_type, [])
            result.append({
                "type": pref_type,
                "title": proc.section_title if proc else pref_type,
                "count": len(entries),
                "entries": [self._serialize_preview_entry(entry, include_rule) for entry in entries],
            })
        return result

    @staticmethod
    def _serialize_preview_entry(entry: dict, include_rule: bool) -> dict:
        data = {
            "id": entry.get("id"),
            "entry_id": entry.get("entry_id"),
            "type": entry.get("type", "unknown"),
            "project_id": entry.get("project_id"),
            "count": entry.get("count", 1),
            "examples": entry.get("examples", []),
            "change_history": entry.get("change_history", []),
            "source_ids": entry.get("source_ids", []),
            "source_session": entry.get("source_session", 0),
            "created_at": entry.get("created_at"),
            "updated_at": entry.get("updated_at"),
            "_collection": entry.get("_collection"),
        }
        if include_rule:
            data["rule"] = entry.get("rule", "")
        else:
            data["raw"] = entry.get("raw", "")
        return data

    def _resolve_target_ref(self, entries: list[dict], target_id, preferred_type: str | None) -> dict | None:
        grouped = self._group_entries(entries)

        if isinstance(target_id, str) and ":" in target_id:
            scope, _, raw_idx = target_id.partition(":")
            try:
                idx = int(raw_idx)
            except (TypeError, ValueError):
                return None
            scoped_entries = grouped.get(scope, [])
            return scoped_entries[idx] if 0 <= idx < len(scoped_entries) else None

        try:
            idx = int(target_id)
        except (TypeError, ValueError):
            return None

        if preferred_type:
            scoped_entries = grouped.get(preferred_type, [])
            if 0 <= idx < len(scoped_entries):
                return scoped_entries[idx]

        if len(grouped) == 1:
            only_entries = next(iter(grouped.values()))
            return only_entries[idx] if 0 <= idx < len(only_entries) else None

        flat_entries = []
        ordered_types = [name for name in self._processors if name in grouped]
        ordered_types.extend(sorted(name for name in grouped if name not in self._processors))
        for pref_type in ordered_types:
            flat_entries.extend(grouped[pref_type])
        return flat_entries[idx] if 0 <= idx < len(flat_entries) else None

    @staticmethod
    def _with_collection(entry: dict, collection: str) -> dict:
        merged = dict(entry)
        merged["_collection"] = collection
        return merged

    @staticmethod
    def _build_entry_data(entry: dict, user_id: int,
                          project_id: int | None = None,
                          source_session: int = 0,
                          source_ids: list[str] | None = None) -> dict:
        """构建新 entry 的存储数据。"""
        pref_type = PreferenceEngine._resolve_type(entry.get("type", []))
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")

        data = {
            "entry_id": "pref_" + secrets.token_hex(6),
            "user_id": user_id,
            "type": pref_type,
            "project_id": project_id,
            "rule": entry.get("rule", ""),
            "count": 1,
            "examples": entry.get("examples", []),
            "source_session": source_session,
            "created_at": now,
            "updated_at": now,
            "change_history": [],
        }
        if source_ids:
            data["source_ids"] = source_ids
        return data

    @staticmethod
    def _append_change(entry: dict, change_type: str, reason: str,
                       source_ids: list[str] | None = None,
                       analysis: str | None = None,
                       session_id: int | None = None) -> list:
        """追加一条变更记录到 change_history。"""
        change = {
            "type": change_type,
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00"),
            "reason": reason,
            "source_ids": source_ids or [],
        }
        if analysis:
            change["analysis"] = analysis
        if session_id:
            change["session_id"] = session_id

        history = list(entry.get("change_history", []))
        history.append(change)
        return history
