"""
LLMGateway — LLM 调用网关

第 2 层基础设施。所有 LLM 调用的统一入口。
管理会话生命周期，承载调用方自定义状态（extern），记录调用历史与 token 消耗。

依赖: Store (第 1 层), Log (第 0 层)
"""

import os
import copy
import json
import threading
from dataclasses import dataclass
from datetime import datetime
from typing import Callable, AsyncIterator

from log import Log
from app_error import AppError
from store import Store


# ── OpenAI 客户端（延迟导入） ──────────────────────────────────────

_AsyncOpenAI = None


def _ensure_openai():
    global _AsyncOpenAI
    if _AsyncOpenAI is None:
        try:
            from openai import AsyncOpenAI as _AsyncOpenAI
        except ImportError:
            raise ImportError(
                "LLMGateway requires the 'openai' package. "
                "Install with: pip install openai"
            )
    return _AsyncOpenAI


# ── 常量 ─────────────────────────────────────────────────────────

_SESSION_COLLECTION = "sessions"
_DEFAULT_ROUTE = "Default"
_ENV_PREFIX = "env://"

try:
    import winreg  # type: ignore
except ImportError:
    winreg = None


# ==================================================================
# 数据类
# ==================================================================


@dataclass
class BillingResult:
    """计费结果"""
    input_tokens: int
    output_tokens: int
    cost: float


@dataclass
class LLMResult:
    """LLM 调用返回结果"""
    output: str
    thinking: str = ""
    billing: BillingResult | None = None


@dataclass
class LLMParams:
    """调用参数覆盖。传入后与 route 配置 merge，显式传入的覆盖默认。"""
    model_name: str | None = None
    max_tokens: int | None = None
    temperature: float | None = None
    is_think: bool | None = None
    extra: dict | None = None


@dataclass
class StreamChunk:
    """流式事件。stream() 每次 yield 一个事件。

    - content 非空时为文本片段
    - thinking 非空时为推理/思考过程（reasoning_content）
    - billing 非空时为该次调用的最终计费信息（一般出现在最后一个事件）
    """
    content: str = ""
    thinking: str = ""
    billing: BillingResult | None = None


# ==================================================================
# 异常体系
# ==================================================================


class ErrorCode:
    """预定义错误码"""
    VISION_BLOCKED = "VISION_BLOCKED"          # vision=false 路由收到图片
    VISION_REQUIRED = "VISION_REQUIRED"        # 需要 vision 路由但未提供
    API_KEY_MISSING = "API_KEY_MISSING"        # 环境变量未设置
    CONFIG_ERROR = "CONFIG_ERROR"              # 配置错误（如缺少 Default 路由）
    API_ERROR = "API_ERROR"                    # LLM API 调用失败
    SESSION_NOT_FOUND = "SESSION_NOT_FOUND"    # Session 不存在
    CONCURRENCY_LIMIT = "CONCURRENCY_LIMIT"    # 并发上限（预留）


class LLMGatewayError(AppError):
    """LLMGateway 统一异常。继承 AppError。"""
    pass


def _safely(context: str, log: Log, fn, *args, **kwargs):
    """兜底执行器（同步）：任何未预期异常都会被 LLMGatewayError 包裹并记录。

    识别 AppError 并透传（不吞下层异常信息）。
    仅将未知异常包装为 LLMGatewayError。

    用法::

        value = _safely("create", self._log, self._store.insert, coll, uid, data)
    """
    try:
        return fn(*args, **kwargs)
    except AppError:
        raise
    except Exception as e:
        raise LLMGatewayError(
            ErrorCode.API_ERROR,
            f"[{context}] {e}",
            cause=e,
            extras={"context": context},
            log=log,
        ) from e


async def _safely_async(context: str, log: Log, fn, *args, **kwargs):
    """兜底执行器（异步）：任何未预期异常都会被 LLMGatewayError 包裹并记录。"""
    try:
        return await fn(*args, **kwargs)
    except AppError:
        raise
    except Exception as e:
        raise LLMGatewayError(
            ErrorCode.API_ERROR,
            f"[{context}] {e}",
            cause=e,
            extras={"context": context},
            log=log,
        ) from e


def _deep_merge_dicts(base: dict, overlay: dict) -> dict:
    merged = copy.deepcopy(base)
    for key, value in overlay.items():
        if key in merged and isinstance(merged[key], dict) and isinstance(value, dict):
            merged[key] = _deep_merge_dicts(merged[key], value)
        else:
            merged[key] = copy.deepcopy(value)
    return merged


def _read_env_value(env_name: str) -> str | None:
    """Read env from current process first, then Windows persistent env stores."""
    value = os.environ.get(env_name)
    if value:
        return value
    if winreg is None:
        return None

    paths = [
        (winreg.HKEY_CURRENT_USER, r"Environment"),
        (winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"),
    ]
    for root, path in paths:
        try:
            key = winreg.OpenKey(root, path, 0, getattr(winreg, "KEY_READ", 0) | getattr(winreg, "KEY_WOW64_64KEY", 0))
            try:
                reg_value, _ = winreg.QueryValueEx(key, env_name)
                if reg_value:
                    return str(reg_value)
            finally:
                winreg.CloseKey(key)
        except Exception:
            continue
    return None


# ==================================================================
# Biller 注册表
# ==================================================================

biller_registry: dict[str, Callable] = {}


def register_biller(name: str):
    """装饰器：注册计费函数。"""
    def wrapper(fn):
        biller_registry[name] = fn
        return fn
    return wrapper


def _resolve_billing(response, config: dict) -> BillingResult | None:
    """根据 response 和 route 配置计算费用。"""
    biller_name = config.get("biller", "openai")
    fn = biller_registry.get(biller_name)
    if fn is None:
        return None
    usage = getattr(response, "usage", None)
    if usage is None:
        return None
    response_dict = {
        "usage": {
            "prompt_tokens": usage.prompt_tokens or 0,
            "completion_tokens": usage.completion_tokens or 0,
        }
    }
    return fn(response_dict, config.get("billing", {}))



# ==================================================================
# Session — 一次对话
# ==================================================================


class Session:
    """一次 LLM 对话。

    从 Store 读出后在内存中活跃，destroy() 时写回。
    调用方可在一条 session 上多次调 stream()/send()（多轮对话），
    期间不读写 Store，destroy() 才一次写回。
    """

    def __init__(self, manager: "SessionManager", record: dict, route_config: dict):
        self._manager = manager
        self._route_config = route_config.copy()

        self._id = record["id"]
        self._user_id = record["user_id"]
        self._route = record.get("route", _DEFAULT_ROUTE)
        self._extern = record.get("extern", {}) or {}
        self._messages = record.get("messages", [])
        self._status = record.get("status", "idle")
        self._billing = record.get("billing", {}) or {}
        self._created_at = record.get("created_at")
        self._completed_at = record.get("completed_at")

        self._stop_flag = threading.Event()
        self._destroyed = False

    # ── 属性 ────────────────────────────────────────────

    @property
    def id(self) -> int:
        return self._id

    @property
    def user_id(self) -> int:
        return self._user_id

    @property
    def route(self) -> str:
        return self._route

    @property
    def messages(self) -> list[dict]:
        return list(self._messages)

    @property
    def extern(self) -> dict:
        return dict(self._extern)

    @property
    def status(self) -> str:
        return self._status

    @property
    def billing(self) -> dict:
        return dict(self._billing)

    @property
    def created_at(self) -> str | None:
        return self._created_at

    @property
    def completed_at(self) -> str | None:
        return self._completed_at

    # ── 状态操作（仅内存，不写盘） ──────────────────────

    def update_extern(self, extern: dict):
        """更新 extern（整体替换）。不写盘。"""
        self._extern = dict(extern)

    def persist_extern(self):
        """立即将当前 extern 刷回 Store，但不结束 session。"""
        latest = _safely("Session.persist_extern.get_latest", self._manager._log,
                         self._manager._store.get,
                         _SESSION_COLLECTION, self._user_id, self._id) or {}
        latest_extern = latest.get("extern", {}) or {}
        data = {
            "extern": _deep_merge_dicts(latest_extern, self._extern),
        }
        _safely("Session.persist_extern", self._manager._log,
                self._manager._store.update,
                _SESSION_COLLECTION, self._user_id, self._id, data)

    def append(self, role: str, content: str | list):
        """追加一条消息到 messages。不写盘。"""
        self._messages.append({"role": role, "content": content})


    def stop(self):
        """标记中断。正在进行的 stream() 检测到后停止 yield。"""
        self._stop_flag.set()
        self._status = "stopped"

    def destroy(self):
        """将当前 session 写回 Store。写完后释放，不再使用。

        写：messages、extern、status、billing、completed_at。
        """
        if self._destroyed:
            return
        self._destroyed = True

        now = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
        if self._completed_at is None:
            self._completed_at = now

        latest = _safely("Session.destroy.get_latest", self._manager._log,
                         self._manager._store.get,
                         _SESSION_COLLECTION, self._user_id, self._id) or {}
        latest_extern = latest.get("extern", {}) or {}
        latest_messages = latest.get("messages", []) or []

        # Another live Session instance may have already appended newer
        # assistant messages (for example, background summary writeback).
        # Keep the longer message list instead of overwriting it with a stale one.
        merged_messages = self._messages
        if isinstance(latest_messages, list) and len(latest_messages) > len(self._messages):
            merged_messages = latest_messages

        data = {
            "extern": _deep_merge_dicts(latest_extern, self._extern),
            "messages": merged_messages,
            "status": self._status,
            "billing": self._billing,
            "completed_at": self._completed_at,
        }
        self._manager._log.info("LLMGateway", f"Session {self._id} destroyed",
                                user_id=self._user_id, status=self._status)
        _safely("Session.destroy", self._manager._log,
                self._manager._store.update,
                _SESSION_COLLECTION, self._user_id, self._id, data)

    # ── LLM 调用：流式 ───────────────────────────────────

    async def stream(self, messages: list[dict],
                     params: LLMParams = None) -> AsyncIterator[StreamChunk]:
        """追加消息 → 调 LLM 流式 → yield StreamChunk。

        每次 yield 前检查 stop 标记。完成后标记 status（completed/stopped/error），
        不自动 destroy()。

        Yields:
            StreamChunk: content 为文本片段，billing 为最终计费信息。
        """
        self._stop_flag.clear()
        self._status = "streaming"

        # 追加用户消息
        for msg in messages:
            self._messages.append(msg)

        collected_text = ""
        collected_thinking = ""

        client, kwargs = self._build_request(params, stream=True)

        try:
            stream_resp = await client.chat.completions.create(**kwargs)

            async for chunk in stream_resp:
                # 检查中断标记
                if self._stop_flag.is_set():
                    break

                if chunk.usage:
                    billing = _resolve_billing(chunk, self._route_config)
                    if billing:
                        self._billing = {
                            "input_tokens": billing.input_tokens,
                            "output_tokens": billing.output_tokens,
                            "cost": billing.cost,
                        }
                        yield StreamChunk(billing=billing)

                if len(chunk.choices) == 0:
                    continue

                delta = chunk.choices[0].delta
                if delta is None:
                    continue

                if delta.content:
                    collected_text += delta.content
                    yield StreamChunk(content=delta.content)

                # reasoning_content（think / 思考过程）
                if hasattr(delta, 'reasoning_content') and delta.reasoning_content:
                    collected_thinking += delta.reasoning_content
                    yield StreamChunk(thinking=delta.reasoning_content)
            else:
                # 循环正常结束（未 break）
                self._status = "completed"

        except Exception as e:
            self._status = "error"
            if not isinstance(e, LLMGatewayError):
                raise LLMGatewayError(
                    ErrorCode.API_ERROR,
                    f"Session {self._id} stream error: {e}",
                    cause=e,
                    extras={"user_id": self._user_id, "route": self._route},
                    log=self._manager._log,
                ) from e
            raise
        finally:
            # 确保：中断 / break / 异常 / 正常 都追加回复并标记结束
            if self._status == "streaming":
                self._status = "stopped"
            self._messages.append({
                "role": "assistant",
                "content": collected_text,
                "thinking": collected_thinking,
            })
            self._completed_at = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")

    # ── LLM 调用：非流式 ─────────────────────────────────

    async def send(self, messages: list[dict],
                   params: LLMParams = None) -> LLMResult:
        """追加消息 → 调 LLM → 返回结果。完成后标记 status。不自动 destroy()。"""
        self._status = "streaming"

        # 追加用户消息
        for msg in messages:
            self._messages.append(msg)

        client, kwargs = self._build_request(params, stream=False)

        try:
            response = await client.chat.completions.create(**kwargs)

            result = self._parse_response(response)

            # 追加 assistant 回复
            assistant_msg = {"role": "assistant", "content": result.output, "thinking": result.thinking}
            self._messages.append(assistant_msg)

            # 计费
            billing = _resolve_billing(response, self._route_config)
            if billing:
                self._billing = {
                    "input_tokens": billing.input_tokens,
                    "output_tokens": billing.output_tokens,
                    "cost": billing.cost,
                }
                result.billing = billing

            self._status = "completed"
            self._completed_at = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")

            self._manager._log.info(
                "LLMGateway", f"Session {self._id} send completed",
                user_id=self._user_id, route=self._route,
                input_tokens=self._billing.get("input_tokens"),
                output_tokens=self._billing.get("output_tokens"),
            )
            return result

        except Exception as e:
            self._status = "error"
            if not isinstance(e, LLMGatewayError):
                raise LLMGatewayError(
                    ErrorCode.API_ERROR,
                    f"Session {self._id} send error: {e}",
                    cause=e,
                    extras={"user_id": self._user_id, "route": self._route},
                    log=self._manager._log,
                ) from e
            raise

    # ── 内部工具 ────────────────────────────────────────

    def _parse_response(self, response) -> LLMResult:
        """解析 OpenAI 非流式响应。"""
        choice = response.choices[0]
        output = choice.message.content or ""
        thinking = getattr(choice.message, "reasoning_content", None) or ""
        return LLMResult(output=output, thinking=thinking)

    def _build_request(self, params: LLMParams | None, *, stream: bool):
        """构建 OpenAI API 请求参数。"""
        config = self._resolve_config(params)

        # Vision 校验
        if not config.get("vision", False):
            self._check_vision()

        # 解析 API Key
        api_key = self._resolve_api_key(config)

        # 构建客户端
        AsyncOpenAI = _ensure_openai()
        client = AsyncOpenAI(
            api_key=api_key,
            base_url=config["base_url"],
        )

        # 剥离内部字段（如 display、_sys_instruction），确保不泄漏到 LLM API
        clean_messages = []
        for msg in self._messages:
            if msg.get("_omit_from_llm"):
                continue
            clean = dict(msg)
            clean.pop("display", None)
            clean.pop("_sys_instruction", None)
            clean.pop("_omit_from_llm", None)
            clean_messages.append(clean)

        kwargs = {
            "model": config["model_name"],
            "messages": clean_messages,
            "max_tokens": config.get("max_tokens", 4096),
            "temperature": config.get("temperature", 0.7),
            "stream": stream,
        }

        # Thinking / 推理模型
        if config.get("is_think"):
            kwargs["extra_body"] = {"thinking": {"type": "enabled"}}

        # 流式时附带 usage
        if stream:
            kwargs["stream_options"] = {"include_usage": True}

        # 调用方自定义 extra 参数透传
        if params and params.extra:
            for k, v in params.extra.items():
                kwargs[k] = v

        self._manager._log.info(
            "LLMGateway", f"Session {self._id} LLM call",
            user_id=self._user_id, route=self._route,
            model=config["model_name"], stream=stream,
        )

        return client, kwargs

    def _resolve_config(self, params: LLMParams | None) -> dict:
        """合并 route 默认参数与 LLMParams 覆盖。"""
        config = self._route_config.copy()
        if params is None:
            return config

        for key in ("model_name", "max_tokens", "temperature", "is_think"):
            val = getattr(params, key, None)
            if val is not None:
                config[key] = val

        return config

    def _resolve_api_key(self, config: dict) -> str:
        """解析 env:// 格式的 API Key。"""
        raw = config.get("api_key", "")
        if raw.startswith(_ENV_PREFIX):
            env_name = raw[len(_ENV_PREFIX):]
            key = _read_env_value(env_name)
            if not key:
                raise LLMGatewayError(
                    ErrorCode.API_KEY_MISSING,
                    f"Environment variable '{env_name}' not set "
                    f"(referenced by route '{self._route}')",
                    extras={"env_name": env_name, "route": self._route},
                    log=self._manager._log,
                )
            return key
        return raw

    def _check_vision(self):
        """检查 messages 中是否含图片，若 route 不支持则报错。"""
        for msg in self._messages:
            content = msg.get("content", "")
            if isinstance(content, list):
                for part in content:
                    if isinstance(part, dict) and part.get("type") == "image_url":
                        raise LLMGatewayError(
                            ErrorCode.VISION_BLOCKED,
                            f"Route '{self._route}' does not support vision, "
                            f"but received image message",
                            extras={"route": self._route},
                            log=self._manager._log,
                        )


# ==================================================================
# SessionManager — Session 生命周期管理
# ==================================================================


class SessionManager:
    """Session 管理器。只负责增删改查，不处理消息收发。"""

    def __init__(self, store: Store, log: Log, model_config: dict):
        """
        Args:
            store: Store 实例（JsonStore / MySQLStore）。
            log: Log 实例。
            model_config: 模型路由配置 dict。
                键为 route name（"Default" 必须有），值为参数字典。
        """
        self._store = store
        self._log = log
        self._model_config = copy.deepcopy(model_config)

        if _DEFAULT_ROUTE not in self._model_config:
            raise LLMGatewayError(
                ErrorCode.CONFIG_ERROR,
                f"model_config must contain a '{_DEFAULT_ROUTE}' route",
                log=self._log,
            )

    # ── CRUD ───────────────────────────────────────────────

    def create(self, user_id: int, route: str,
               extern: dict | None = None) -> Session:
        """创建新 Session。写入 Store 后返回 Session 对象。

        route 不存在时自动从 Default 克隆配置。
        """
        route_config = self._get_route_config(route)

        now = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
        record = {
            "user_id": user_id,
            "route": route,
            "extern": extern or {},
            "messages": [],
            "status": "idle",
            "billing": {},
            "created_at": now,
            "completed_at": None,
        }

        session_id = _safely("SessionManager.create", self._log,
                             self._store.insert, _SESSION_COLLECTION, user_id, record)

        record["id"] = session_id
        session = Session(self, record, route_config)

        self._log.info(
            "LLMGateway", f"Session {session_id} created",
            user_id=user_id, route=route,
        )
        return session

    def get(self, session_id: int, user_id: int) -> Session | None:
        """从 Store 读取 session 数据，构造 Session 对象后返回。

        Args:
            session_id: Session ID。
            user_id: 所属用户 ID。

        Returns:
            Session | None: 不存在返回 None。
        """
        record = _safely("SessionManager.get", self._log,
                         self._store.get, _SESSION_COLLECTION, user_id, session_id)
        if record is None:
            return None

        route_config = self._get_route_config(record.get("route", _DEFAULT_ROUTE))
        return Session(self, record, route_config)

    def delete(self, session_id: int, user_id: int) -> bool:
        """从 Store 删除 session。"""
        ok = _safely("SessionManager.delete", self._log,
                     self._store.delete, _SESSION_COLLECTION, user_id, session_id)
        if ok:
            self._log.info(
                "LLMGateway", f"Session {session_id} deleted",
                user_id=user_id,
            )
        return ok

    def list(self, user_id: int) -> list[dict]:
        """列出用户的所有 session。只返回元数据白名单字段，不进内存。"""
        records = _safely("SessionManager.list", self._log,
                          self._store.list, _SESSION_COLLECTION, user_id)
        _LIST_FIELDS = ("id", "user_id", "route", "status",
                        "created_at", "completed_at")
        return [
            {k: r[k] for k in _LIST_FIELDS if k in r}
            for r in records
        ]

    # ── 内部 ───────────────────────────────────────────────

    def _get_route_config(self, route: str) -> dict:
        """获取路由配置。不存在时从 Default 克隆。"""
        if route in self._model_config:
            return copy.deepcopy(self._model_config[route])
        # 自动从 Default 克隆
        config = copy.deepcopy(self._model_config[_DEFAULT_ROUTE])
        self._model_config[route] = config
        self._log.info(
            "LLMGateway", f"Route '{route}' auto-cloned from Default",
        )
        return config


# ==================================================================
# 工具函数
# ==================================================================


async def image_to_string(
    manager: SessionManager,
    user_id: int,
    image_b64: str,
    instruction: str = "",
    route: str | None = None,
    image_format: str = "png",
) -> str:
    """图片转文字。创建临时 session → send → destroy → 返回纯文本。

    Args:
        manager: SessionManager 实例。
        user_id: 用户 ID。
        image_b64: Base64 编码的图片数据（不含 data:image 前缀）。
        instruction: 对图片的指令，如 "识别这个公式"。
        route: 使用的路由名。必须 vision=true，不传则用 Default。
        image_format: 图片格式，如 "png"、"jpeg"、"webp"，默认 "png"。

    Returns:
        识别结果文本。
    """
    route_name = route or _DEFAULT_ROUTE

    # 确保路由支持 vision
    route_config = manager._get_route_config(route_name)
    if not route_config.get("vision", False):
        raise LLMGatewayError(
            ErrorCode.VISION_REQUIRED,
            f"image_to_string requires a vision-capable route, "
            f"but '{route_name}' has vision=false",
            extras={"route": route_name},
            log=manager._log,
        )

    session = manager.create(user_id=user_id, route=route_name)

    # 构建图文混合消息
    content_parts = []
    if instruction:
        content_parts.append({"type": "text", "text": instruction})
    content_parts.append({
        "type": "image_url",
        "image_url": {"url": f"data:image/{image_format};base64,{image_b64}"},
    })

    try:
        result = await session.send([{"role": "user", "content": content_parts}])
        return result.output
    finally:
        session.destroy()


# ── 启动时注册所有 biller ──────────────────────────────────────
from . import billers  # noqa: E402, F401
