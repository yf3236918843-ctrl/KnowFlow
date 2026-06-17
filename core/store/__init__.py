import os
import json
import time
import threading

from abc import ABC, abstractmethod

from log import Log
from app_error import AppError


# 数据文件固定存放在模块目录下的 data/ 文件夹
_DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
_FILES_DIR = os.path.join(_DATA_DIR, "files")

# ── 异常体系 ─────────────────────────────────────────────


class StoreErrorCode:
    """Store 错误码"""
    INSERT_FAILED = "INSERT_FAILED"
    READ_FAILED = "READ_FAILED"
    UPDATE_FAILED = "UPDATE_FAILED"
    DELETE_FAILED = "DELETE_FAILED"
    FILE_IO_ERROR = "FILE_IO_ERROR"
    META_CORRUPTED = "META_CORRUPTED"


class StoreError(AppError):
    """Store 统一异常。继承 AppError。"""
    pass


def _safely(context: str, log: Log | None, fn, *args, **kwargs):
    """兜底执行器：任何未预期异常都会被 StoreError 包裹并记录。"""
    try:
        return fn(*args, **kwargs)
    except AppError:
        raise
    except Exception as e:
        raise StoreError(
            StoreErrorCode.FILE_IO_ERROR,
            f"[{context}] {e}",
            cause=e,
            extras={"context": context},
            log=log,
        ) from e

# filetype → 扩展名映射，可扩展
_EXT_MAP = {
    "image":  ".img",
    "audio":  ".audio",
    "pdf":    ".pdf",
    "text":   ".txt",
    "binary": ".bin",
}


class Store(ABC):
    """统一存储层接口。

    所有持久化操作唯一入口。不感知数据模型，只做存和取。
    存储实现可切换（JsonStore / MySQLStore），业务代码零改动。

    实现类必须实现以下方法。
    """

    @abstractmethod
    def insert(self, collection, user_id, data): ...
    @abstractmethod
    def insert_many(self, collection, user_id, datas): ...
    @abstractmethod
    def get(self, collection, user_id, id): ...
    @abstractmethod
    def list(self, collection, user_id, filter=None, order_by=None, order="asc", limit=None, offset=None): ...
    @abstractmethod
    def update(self, collection, user_id, id, data): ...
    @abstractmethod
    def delete(self, collection, user_id, id): ...


class JsonStore(Store):
    """JSON 文件实现。

    文件结构::

        data/{user_id}/{collection}/{id}.json

    按 user_id 分目录，按 collection 分子目录。
    主键自增，由 Store 自动分配。
    线程安全：按 collection 分段加锁。
    """

    def __init__(self, data_root: str | None = None, log: Log | None = None):
        """
        Args:
            data_root: 数据根目录，默认 Project/store/data/。
            log: Log 实例，不传则创建一个静默 Log（仅 production WARNING）。
        """
        self._root = data_root if data_root is not None else _DATA_DIR
        self._log = log or Log(mode="production")
        self._coll_locks: dict[str, threading.Lock] = {}
        self._lock_factory = threading.Lock()
        self._seq: dict[str, int] = {}
        self._seq_lock = threading.Lock()

    # ── 公开接口 ──────────────────────────────────

    def insert(self, collection: str, user_id: int, data: dict) -> int:
        """插入一条记录，返回自动分配的 id。"""
        record_id = self._next_id(collection)
        data = self._clean_data(data, record_id)

        user_coll_dir = self._user_coll_dir(user_id, collection)
        with self._coll_lock(collection):
            _safely("JsonStore.insert", self._log,
                    os.makedirs, user_coll_dir, exist_ok=True)
            self._write_file(user_coll_dir, record_id, data)

        self._log.info("Store", f"Inserted {collection}/{record_id}", user_id=user_id)
        return record_id

    def insert_many(self, collection: str, user_id: int, datas: list[dict]) -> list[int]:
        """批量插入，返回自动分配的 id 列表。"""
        user_coll_dir = self._user_coll_dir(user_id, collection)
        with self._coll_lock(collection):
            ids = []
            for data in datas:
                rid = self._next_id(collection, locked=True)
                ids.append(rid)
                cleaned = self._clean_data(data, rid)
                _safely("JsonStore.insert_many", self._log,
                        os.makedirs, user_coll_dir, exist_ok=True)
                self._write_file(user_coll_dir, rid, cleaned)

        self._log.info("Store", f"Inserted {len(ids)} records into {collection}", user_id=user_id)
        return ids

    def get(self, collection: str, user_id: int, id: int) -> dict | None:
        """按 id 获取单条记录，不存在返回 None。"""
        path = self._file_path(collection, user_id, id)
        if not os.path.isfile(path):
            return None
        with self._coll_lock(collection):
            return self._read_file(path)

    def list(
        self,
        collection: str,
        user_id: int,
        filter: dict | None = None,
        order_by: str | None = None,
        order: str = "asc",
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[dict]:
        """按条件查询，支持过滤 / 排序 / 分页。"""
        user_coll_dir = self._user_coll_dir(user_id, collection)
        if not os.path.isdir(user_coll_dir):
            return []

        with self._coll_lock(collection):
            records = []
            try:
                for fname in os.listdir(user_coll_dir):
                    if not fname.endswith(".json"):
                        continue
                    path = os.path.join(user_coll_dir, fname)
                    try:
                        record = self._read_file(path)
                    except StoreError:
                        continue

                    if filter and not self._match_filter(record, filter):
                        continue
                    records.append(record)
            except FileNotFoundError:
                return []

        if order_by:
            records.sort(
                key=lambda r: r.get(order_by) if r.get(order_by) is not None else "",
                reverse=(order == "desc"),
            )

        if offset:
            records = records[offset:]
        if limit is not None:
            records = records[:limit]

        return records

    def update(self, collection: str, user_id: int, id: int, data: dict) -> bool:
        """更新记录，不存在返回 False。"""
        path = self._file_path(collection, user_id, id)
        with self._coll_lock(collection):
            if not os.path.isfile(path):
                self._log.warning("Store", f"Update failed: not found {collection}/{id}",
                                  user_id=user_id)
                return False
            record = self._read_file(path)

            data = dict(data)
            data.pop("id", None)
            record.update(data)
            _safely("JsonStore.update", self._log,
                    self._write_file_raw, path, record)

        self._log.info("Store", f"Updated {collection}/{id}", user_id=user_id)
        return True

    def delete(self, collection: str, user_id: int, id: int) -> bool:
        """删除记录，不存在返回 False。"""
        path = self._file_path(collection, user_id, id)
        with self._coll_lock(collection):
            if not os.path.isfile(path):
                return False
            _safely("JsonStore.delete", self._log,
                    os.remove, path)

        self._log.info("Store", f"Deleted {collection}/{id}", user_id=user_id)
        return True

    # ── 内部：ID 生成 ─────────────────────────────

    def _next_id(self, collection: str, locked: bool = False) -> int:
        if not locked:
            self._seq_lock.acquire()
        try:
            if collection not in self._seq:
                self._seq[collection] = self._scan_max_id(collection) + 1
            rid = self._seq[collection]
            self._seq[collection] += 1
            return rid
        finally:
            if not locked:
                self._seq_lock.release()

    def _scan_max_id(self, collection: str) -> int:
        """扫描所有用户目录，找到该 collection 下的最大 ID。"""
        if not os.path.isdir(self._root):
            return 0
        max_id = 0
        for uid_str in os.listdir(self._root):
            coll_dir = os.path.join(self._root, uid_str, collection)
            if not os.path.isdir(coll_dir):
                continue
            for fname in os.listdir(coll_dir):
                if not fname.endswith(".json"):
                    continue
                try:
                    file_id = int(fname.replace(".json", ""))
                    if file_id > max_id:
                        max_id = file_id
                except ValueError:
                    continue
        return max_id

    # ── 内部：文件读写 ─────────────────────────────

    def _user_coll_dir(self, user_id: int, collection: str) -> str:
        return os.path.join(self._root, str(user_id), collection)

    def _file_path(self, collection: str, user_id: int, id: int) -> str:
        return os.path.join(self._root, str(user_id), collection, f"{id}.json")

    def _write_file(self, user_coll_dir: str, rid: int, data: dict) -> None:
        path = os.path.join(user_coll_dir, f"{rid}.json")
        _safely("_write_file", self._log,
                self._write_file_raw, path, data)

    @staticmethod
    def _write_file_raw(path: str, data: dict) -> None:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def _read_file(self, path: str) -> dict:
        return _safely("_read_file", self._log,
                       self._read_file_raw, path)

    @staticmethod
    def _read_file_raw(path: str) -> dict:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    @staticmethod
    def _clean_data(data: dict, record_id: int) -> dict:
        """写入前清洗：复制 dict、强制设置 id。"""
        d = dict(data)
        d["id"] = record_id
        return d

    @staticmethod
    def _match_filter(record: dict, filter: dict) -> bool:
        return all(record.get(k) == v for k, v in filter.items())

    # ── 内部：锁管理 ───────────────────────────────

    def _coll_lock(self, collection: str) -> threading.Lock:
        if collection not in self._coll_locks:
            with self._lock_factory:
                if collection not in self._coll_locks:
                    self._coll_locks[collection] = threading.Lock()
        return self._coll_locks[collection]


class FileStore:
    """二进制文件存储。与 JsonStore 共享 store/data/ 根目录。

    文件路径::

        data/files/{filename}

    - 内容寻址（SHA256），相同内容只存一份
    - 侧写 _meta.json 记录 type/size/created 元信息

    调用方获取 filename 后，可存入 Store 的结构化数据中作为引用。
    """

    def __init__(self, root: str | None = None, log: Log | None = None):
        """
        Args:
            root: 文件根目录，默认 store/data/files/。
            log: Log 实例，传则自动写错误日志。
        """
        self._root = root if root is not None else _FILES_DIR
        self._log = log
        self._lock = threading.Lock()
        self._seq: int = 1
        _safely("FileStore.__init__", self._log,
                os.makedirs, self._root, exist_ok=True)
        self._init_seq()

    # ── 公开接口 ──────────────────────────────────

    def save(self, filetype: str, data: bytes) -> str:
        """保存二进制文件。

        Args:
            filetype: 类型标识，如 "image"、"audio"、"pdf"。
            data: 文件二进制内容。

        Returns:
            filename: 自增文件名，如 "1.img"、"2.txt"，可存入 Store。
        """
        with self._lock:
            rid = self._seq
            self._seq += 1

            ext = _EXT_MAP.get(filetype, f".{filetype}")
            filename = f"{rid}{ext}"

            file_path = os.path.join(self._root, filename)
            _safely("FileStore.save", self._log,
                    self._write_raw, file_path, data)

            self._write_meta_entry(filename, filetype, len(data))
            self._save_seq()

        return filename

    def load(self, filename: str) -> tuple[bytes, str]:
        """读取文件。

        Returns:
            (data: bytes, filetype: str)

        Raises:
            StoreError: filename 不存在或读取失败。
        """
        meta = self._read_meta()
        info = meta.get(filename)
        if info is None:
            raise FileNotFoundError(f"FileStore: {filename} not found")

        file_path = os.path.join(self._root, filename)
        data = _safely("FileStore.load", self._log,
                       self._read_raw, file_path)

        return data, info["type"]

    def exists(self, filename: str) -> bool:
        """文件是否存在。"""
        meta = self._read_meta()
        return filename in meta

    def info(self, filename: str) -> dict | None:
        """查询文件元信息。"""
        meta = self._read_meta()
        return meta.get(filename)

    def delete(self, filename: str) -> bool:
        """删除文件。"""
        meta = self._read_meta()
        info = meta.get(filename)
        if info is None:
            return False

        with self._lock:
            file_path = os.path.join(self._root, filename)
            if os.path.isfile(file_path):
                _safely("FileStore.delete", self._log,
                        os.remove, file_path)
            meta.pop(filename, None)
            meta["_next_id"] = self._seq
            self._write_meta_raw(meta)

        return True

    # ── 内部 ──────────────────────────────────────

    def _meta_path(self) -> str:
        return os.path.join(self._root, "_meta.json")

    def _init_seq(self) -> None:
        """从已有文件或 meta 恢复计数器。"""
        meta = self._read_meta_raw()
        nid = meta.get("_next_id")
        if nid is not None:
            self._seq = nid
            return
        # 没有 meta 则扫描已有文件，找最大 ID
        max_id = 0
        if os.path.isdir(self._root):
            for fname in os.listdir(self._root):
                if fname == "_meta.json":
                    continue
                parts = fname.split(".")
                try:
                    fid = int(parts[0])
                    if fid > max_id:
                        max_id = fid
                except (ValueError, IndexError):
                    continue
        # 同时也算上 meta 里的记录
        for key in meta:
            if key == "_next_id":
                continue
            try:
                fid = int(key.split(".")[0])
                if fid > max_id:
                    max_id = fid
            except (ValueError, IndexError):
                continue
        self._seq = max_id + 1

    @staticmethod
    def _write_raw(path: str, data: bytes) -> None:
        with open(path, "wb") as f:
            f.write(data)

    @staticmethod
    def _read_raw(path: str) -> bytes:
        with open(path, "rb") as f:
            return f.read()

    def _read_meta_raw(self) -> dict:
        path = self._meta_path()
        if not os.path.isfile(path):
            return {}
        return _safely("FileStore._read_meta_raw", self._log,
                       self._read_meta_raw_file, path)

    @staticmethod
    def _read_meta_raw_file(path: str) -> dict:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _write_meta_raw(self, meta: dict) -> None:
        path = self._meta_path()
        _safely("FileStore._write_meta_raw", self._log,
                self._write_meta_raw_file, path, meta)

    @staticmethod
    def _write_meta_raw_file(path: str, meta: dict) -> None:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)

    def _read_meta(self) -> dict:
        """返回元信息中除 _next_id 外的条目。"""
        meta = self._read_meta_raw()
        meta.pop("_next_id", None)
        return meta

    def _save_seq(self) -> None:
        """持久化当前计数器到 meta。"""
        meta = self._read_meta_raw()
        meta["_next_id"] = self._seq
        self._write_meta_raw(meta)

    def _write_meta_entry(self, filename: str, filetype: str, size: int) -> None:
        meta = self._read_meta_raw()
        meta[filename] = {
            "type": filetype,
            "size": size,
            "created": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        # 保持计数器同步
        meta["_next_id"] = self._seq
        self._write_meta_raw(meta)
