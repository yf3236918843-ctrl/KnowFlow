"""
PromptManager — 提示词管理

第 3 层（依赖 Log）。
管理 prompt 模板。按名注册，接收数据，返回渲染后的文本。
"""

import importlib.util
import re
from pathlib import Path

from log import Log
from app_error import AppError


# ── 常量 ─────────────────────────────────────────────────────────

_PROMPTS_DIR_NAME = "prompts"


# ==================================================================
# 异常体系
# ==================================================================


class ErrorCode:
    """预定义错误码"""
    PROMPT_NOT_FOUND = "PROMPT_NOT_FOUND"
    RENDER_FAILED = "RENDER_FAILED"


class PromptNotFoundError(AppError):
    """name 不存在时抛出。list() 可查看所有可用名称。"""
    pass


class PromptRenderError(AppError):
    """策略函数执行出错时抛出（如模板缺失、替换异常）。"""
    pass


def _safely_render(context: str, log: Log, fn, *args, **kwargs):
    """兜底执行器：任何未预期异常都会被 PromptRenderError 包裹并记录。

    识别 AppError 并透传（不吞下层异常信息）。
    """
    try:
        return fn(*args, **kwargs)
    except AppError:
        raise
    except Exception as e:
        raise PromptRenderError(
            ErrorCode.RENDER_FAILED,
            f"[{context}] {e}",
            cause=e,
            extras={"context": context},
            log=log,
        ) from e


# ==================================================================
# 注册表
# ==================================================================

_registry: dict[str, callable] = {}


def register(name: str):
    """装饰器：将策略函数注册到全局注册表。

    Usage::

        from prompt_manager import register

        @register("calculus_tutor")
        def render(problem: str = "", profile: str = "") -> str:
            template = Path(__file__).with_name("prompt.txt").read_text(encoding="utf-8")
            return template.replace("{problem}", problem).replace("{profile}", profile)
    """
    def wrapper(fn):
        _registry[name] = fn
        return fn
    return wrapper


# ==================================================================
# PromptManager
# ==================================================================


class PromptManager:
    """提示词管理器。管理 prompt 模板，按名渲染。"""

    def __init__(self, log: Log | None = None):
        """
        Args:
            log: Log 实例，不传则创建一个静默 Log（仅 production WARNING）。
        """
        self._log = log or Log(mode="production")
        self._discover()

    def render(self, name: str, data: dict | None = None) -> str:
        """渲染指定 prompt。

        Args:
            name: 注册名，如 "calculus_tutor"。
            data: 模板变量字典（作为关键字参数传给策略函数）。

        Returns:
            渲染后的文本字符串。

        Raises:
            PromptNotFoundError: name 不存在。
            PromptRenderError: 渲染过程出错。
        """
        fn = _registry.get(name)
        if fn is None:
            raise PromptNotFoundError(
                ErrorCode.PROMPT_NOT_FOUND,
                f"Prompt '{name}' not found. Available: {', '.join(self.list())}",
                log=self._log,
            )

        data = data or {}
        result = _safely_render(f"render:{name}", self._log, fn, **data)
        result = str(result)
        # 移除注释 --{-/* ... */-}--
        result = re.sub(r'--\{-/\*.*?\*/-}--', '', result, flags=re.DOTALL)
        return result

    def list(self) -> list[str]:
        """返回所有已注册的 prompt 名称列表。"""
        return list(_registry.keys())

    # ── 内部：自动发现 ─────────────────────────────────

    def _discover(self):
        """扫描 prompts/ 目录，加载所有 strategy.py 文件。"""
        prompts_dir = self._resolve_prompts_dir()
        if not prompts_dir or not prompts_dir.is_dir():
            self._log.warning("PromptManager",
                              f"Prompts directory not found: {prompts_dir}")
            return

        count = 0
        for strategy_path in sorted(prompts_dir.rglob("strategy.py")):
            try:
                self._load_strategy(strategy_path)
                count += 1
            except Exception as e:
                self._log.warning("PromptManager",
                                  f"Failed to load {strategy_path}: {e}")

        self._log.info("PromptManager",
                       f"Discovered {count} prompt strategies from {prompts_dir}")

    @staticmethod
    def _resolve_prompts_dir() -> Path:
        """解析 prompts/ 目录路径。"""
        # prompt_manager/__init__.py 所在目录 / prompts/
        current = Path(__file__).resolve().parent
        return current / _PROMPTS_DIR_NAME

    @staticmethod
    def _load_strategy(path: Path):
        """动态导入一个 strategy.py 文件。

        使用路径中的目录名构建唯一模块名，避免多个 strategy.py 冲突。
        """
        parent = path.parent
        parts = []
        for p in reversed(parent.parts[-3:]):
            parts.append(p)
        module_name = "_".join(parts) if parts else "strategy"
        # 确保模块名合法
        module_name = re.sub(r"[^a-zA-Z0-9_]", "_", module_name)

        spec = importlib.util.spec_from_file_location(module_name, str(path))
        if spec and spec.loader:
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
