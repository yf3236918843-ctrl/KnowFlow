import os
import sys
import json
import threading
from datetime import datetime, date, timedelta


# 日志文件固定存放在模块目录下的 log/ 文件夹
_LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "log")


class Log:
    """统一日志系统，第 0 层基础设施。"""

    DEBUG = 0
    INFO = 1
    WARNING = 2
    ERROR = 3

    _LEVEL_NAMES = {0: "DEBUG", 1: "INFO", 2: "WARNING", 3: "ERROR"}

    _RETENTION = {
        "ERROR": 90,
        "WARNING": 30,
        "INFO": 7,
        "DEBUG": 1,
    }

    def __init__(self, level: int | None = None, mode: str | None = None, log_root: str | None = None):
        """
        Args:
            level: 日志级别，默认 None 表示由 mode 决定。
            mode: "development" | "production"。默认从环境变量 PT_ENV 读取，未设置则为 development。
            log_root: 日志根目录，默认 Project/log/log/。
        """
        self._lock = threading.Lock()
        self._log_root = log_root if log_root is not None else _LOG_DIR
        self._mode = mode or os.environ.get("PT_ENV", "development")

        if level is None:
            level = self.DEBUG if self._mode == "development" else self.WARNING
        self._level = level

        self._writable = self._check_writable()
        if self._writable:
            self._cleanup()

    # ── 公开接口 ──────────────────────────────────

    def set_level(self, level: int) -> None:
        """运行时切换日志级别。"""
        with self._lock:
            self._level = level

    def debug(self, module: str, message: str, **extras) -> None:
        if self._level <= self.DEBUG:
            self._log(self.DEBUG, module, message, extras)

    def info(self, module: str, message: str, **extras) -> None:
        if self._level <= self.INFO:
            self._log(self.INFO, module, message, extras)

    def warning(self, module: str, message: str, **extras) -> None:
        if self._level <= self.WARNING:
            self._log(self.WARNING, module, message, extras)

    def error(self, module: str, message: str, **extras) -> None:
        if self._level <= self.ERROR:
            self._log(self.ERROR, module, message, extras)

    # ── 内部 ──────────────────────────────────────

    def _check_writable(self) -> bool:
        try:
            os.makedirs(self._log_root, exist_ok=True)
            probe = os.path.join(self._log_root, ".write_test")
            with open(probe, "w") as f:
                f.write("")
            os.remove(probe)
            return True
        except (OSError, PermissionError):
            return False

    def _cleanup(self) -> None:
        today = date.today()
        for level_name, days in self._RETENTION.items():
            level_dir = os.path.join(self._log_root, level_name)
            if not os.path.isdir(level_dir):
                continue
            cutoff = today - timedelta(days=days)
            for fname in os.listdir(level_dir):
                if not fname.endswith(".jsonl"):
                    continue
                date_str = fname[:-6]  # 去掉 .jsonl
                try:
                    file_date = datetime.strptime(date_str, "%Y-%m-%d").date()
                    if file_date < cutoff:
                        os.remove(os.path.join(level_dir, fname))
                except ValueError:
                    continue

    def _log(self, level_num: int, module: str, message: str, extras: dict) -> None:
        now = datetime.now()
        level_name = self._LEVEL_NAMES[level_num]

        entry = {
            "time": now.strftime("%Y-%m-%dT%H:%M:%S"),
            "level": level_name,
            "module": module,
            "message": message,
            "extras": extras,
        }

        # 控制台输出（仅 development 模式）
        if self._mode == "development":
            extra_str = ""
            if extras:
                pairs = [f"{k}={v}" for k, v in extras.items()]
                extra_str = " {" + ", ".join(pairs) + "}"
            print(
                f"[{now.strftime('%Y-%m-%d %H:%M:%S')}] "
                f"[{level_name}] {module}: {message}{extra_str}"
            )

        # 文件输出
        if self._writable:
            self._write_file(level_name, now, entry)

    def _write_file(self, level_name: str, now: datetime, entry: dict) -> None:
        date_str = now.strftime("%Y-%m-%d")
        level_dir = os.path.join(self._log_root, level_name)
        file_path = os.path.join(level_dir, f"{date_str}.jsonl")

        with self._lock:
            try:
                os.makedirs(level_dir, exist_ok=True)
                line = json.dumps(entry, ensure_ascii=False, default=str)
                with open(file_path, "a", encoding="utf-8") as f:
                    f.write(line + "\n")
            except (OSError, PermissionError):
                pass  # 静默降级
