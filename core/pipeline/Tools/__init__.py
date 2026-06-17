"""
Pipeline Tools — 策略工具箱

为 Pipeline 策略提供可复用的工具函数。
各策略内部调这些工具完成通用操作，避免重复代码。

工具不持有 Pipeline 引用。通过 _init_tools 注入基础设施依赖。
"""

from store import Store
from llm_gateway import SessionManager

_INFRA: dict[str, object] = {
    "store": None,
    "filestore": None,
    "session_manager": None,
}


def _init_tools(store: Store | None = None,
                filestore=None,
                session_manager: SessionManager | None = None):
    """初始化工具全局基础设施。Pipeline 启动时调用。"""
    _INFRA["store"] = store
    _INFRA["filestore"] = filestore
    _INFRA["session_manager"] = session_manager


def _get_store() -> Store:
    return _INFRA["store"]


def _get_filestore():
    return _INFRA["filestore"]


def _get_session_manager() -> SessionManager | None:
    return _INFRA["session_manager"]
