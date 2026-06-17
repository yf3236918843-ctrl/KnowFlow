"""
AppError — 统一异常基类

第 0 层基础设施（仅依赖 Python 标准库 + Log）。
所有模块的异常（StoreError、LLMGatewayError 等）继承此类。

使用方式::

    class StoreError(AppError): ...
    class LLMGatewayError(AppError): ...

    raise StoreError("FILE_IO_ERROR", "写入失败",
                     cause=OSError(...),
                     extras={"path": "/data/1.json"},
                     log=log)
"""

from log import Log


class AppError(Exception):
    """所有模块异常的基类。

    携带结构化信息：错误码、人类可读描述、原始异常、扩展上下文。
    创建时可自动写入 Log。

    Attributes:
        code:    错误码，如 "FILE_IO_ERROR"、"API_ERROR"。
        cause:   原始异常对象（如有），用于异常链。
        extras:  扩展上下文 dict。
    """

    def __init__(
        self,
        code: str,
        message: str,
        *,
        cause: Exception | None = None,
        extras: dict | None = None,
        log: Log | None = None,
    ):
        self.code = code
        self.cause = cause
        self.extras = extras or {}
        super().__init__(message)

        if log is not None:
            log.error(
                self.__class__.__name__,
                f"[{code}] {message}",
                error_code=code,
                cause=str(cause) if cause else None,
                **(self.extras),
            )
