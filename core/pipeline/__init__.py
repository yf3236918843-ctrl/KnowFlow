"""
Pipeline — 教学编排

第 5 层（依赖所有下层模块）。
编排教学场景。外部通过 run(ctx) 交互，内部复杂度对外部不可见。

策略自动发现：strategies/ 目录下的 .py 文件使用 @register_pipeline 注册后自动生效。
"""

import os
import importlib

from log import Log
from app_error import AppError
from store import Store, FileStore
from llm_gateway import SessionManager
from prompt_manager import PromptManager
from preference_engine import PreferenceEngine


# ==================================================================
# 策略注册表
# ==================================================================

_registry: dict[str, type] = {}


def register_pipeline(name: str):
    """装饰器：注册策略类。

    Usage::

        @register_pipeline("Calculus_Exercise")
        class CalculusExercise:
            async def run_stream(self, ctx, sm, pm, pe, store, log): ...
            def run(self, ctx, sm, pm, pe, store, log) -> dict: ...
    """
    def decorator(cls):
        _registry[name] = cls
        return cls
    return decorator


# ==================================================================
# 异常体系
# ==================================================================


class ErrorCode:
    """预定义错误码"""
    STRATEGY_NOT_FOUND = "STRATEGY_NOT_FOUND"
    STRATEGY_LOAD_FAILED = "STRATEGY_LOAD_FAILED"


class PipelineError(AppError):
    """Pipeline 统一异常。继承 AppError。"""
    pass


def _safely(context: str, log: Log | None, fn, *args, **kwargs):
    """兜底执行器：未预期异常被 PipelineError 包裹并记录。"""
    try:
        return fn(*args, **kwargs)
    except AppError:
        raise
    except Exception as e:
        raise PipelineError(
            "PIPELINE_ERROR",
            f"[{context}] {e}",
            cause=e,
            extras={"context": context},
            log=log,
        ) from e


# ==================================================================
# Pipeline
# ==================================================================


class Pipeline:
    """教学编排主入口。"""

    def __init__(
        self,
        store: Store,
        log: Log | None = None,
        session_manager: SessionManager | None = None,
        prompt_manager: PromptManager | None = None,
        preference_engine: PreferenceEngine | None = None,
    ):
        """
        Args:
            store: Store 实例。
            log: Log 实例。
            session_manager: SessionManager 实例。
            prompt_manager: PromptManager 实例。
            preference_engine: PreferenceEngine 实例。
        """
        self._store = store
        self._log = log or Log(mode="production")
        self._sm = session_manager
        self._pm = prompt_manager
        self._pe = preference_engine
        self._filestore = FileStore(log=self._log)

        # 初始化工具全局基础设施
        from pipeline.Tools import _init_tools
        _init_tools(store=store, filestore=self._filestore,
                    session_manager=session_manager)

        # 启动时自动发现策略
        self._discover_strategies()

    # ═════════════════════════════════════════════════════════════
    # 主入口
    # ═════════════════════════════════════════════════════════════

    def run(self, ctx: dict):
        """执行策略。

        Args:
            ctx: 请求上下文，必须含 ``task_type``。
                 其余字段透传给策略。

        Returns:
            策略的执行结果：
            - 策略实现了 ``run_stream`` → async generator
            - 策略只实现了 ``run`` → dict

        Raises:
            PipelineError: task_type 不存在、策略加载失败等。
        """
        result = _safely("run", self._log, self._dispatch, ctx)
        # async generator 的迭代代码不在 _safely 保护范围内，
        # 需套一层包装将迭代中的异常转为 PipelineError
        if hasattr(result, "__aiter__"):
            return self._wrap_async_gen(result)
        return result

    async def _wrap_async_gen(self, gen):
        """包装 async generator，迭代中的异常转为 PipelineError。"""
        try:
            async for chunk in gen:
                yield chunk
        except AppError:
            raise
        except Exception as e:
            raise PipelineError(
                "PIPELINE_ERROR",
                f"[strategy] {e}",
                cause=e,
                log=self._log,
            ) from e

    def _dispatch(self, ctx: dict):
        task_type = ctx.get("task_type", "")
        if not task_type:
            raise PipelineError(
                ErrorCode.STRATEGY_NOT_FOUND,
                "ctx must contain 'task_type'",
                log=self._log,
            )

        cls = _registry.get(task_type)
        if cls is None:
            raise PipelineError(
                ErrorCode.STRATEGY_NOT_FOUND,
                f"Unknown task_type: {task_type}",
                extras={"task_type": task_type},
                log=self._log,
            )

        deps = {
            "sm": self._sm,
            "pm": self._pm,
            "pe": self._pe,
            "store": self._store,
            "log": self._log,
        }

        instance = cls()

        if hasattr(instance, "run_stream"):
            return instance.run_stream(ctx, **deps)
        else:
            return instance.run(ctx, **deps)

    # ═════════════════════════════════════════════════════════════
    # 策略发现
    # ═════════════════════════════════════════════════════════════

    def _discover_strategies(self):
        """扫描 ``strategies/`` 目录，导入所有 .py 文件触发注册。"""
        strategies_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "strategies")
        if not os.path.isdir(strategies_dir):
            self._log.warning("Pipeline", "strategies/ directory not found")
            return

        loaded = 0
        for root, _dirs, files in os.walk(strategies_dir):
            for fname in files:
                if not fname.endswith(".py") or fname == "__init__.py":
                    continue

                rel_path = os.path.relpath(os.path.join(root, fname), strategies_dir)
                module_path = rel_path.replace(os.sep, ".").replace(".py", "")
                full_module = f"pipeline.strategies.{module_path}"

                try:
                    importlib.import_module(full_module)
                    loaded += 1
                except Exception as e:
                    self._log.warning(
                        "Pipeline",
                        f"Failed to load strategy {full_module}: {e}",
                    )

        self._log.info("Pipeline", f"Discovered {loaded} strategy files, "
                       f"{len(_registry)} registered")
