"""
UserAuth — 用户认证

第 2 层（依赖 Store、Log）。
管理用户身份全生命周期：注册、登录、鉴权、信息存储、扩展数据。
"""

import jwt as _jwt
import bcrypt as _bcrypt
from datetime import datetime, timedelta, timezone

from log import Log
from app_error import AppError
from store import Store


# ── 常量 ──────────────────────────────────────────────────────────

_COLL_USERS = "users"
_COLL_USER_DATA = "user_data"
_SYSTEM_USER_ID = 0          # 系统分区，存放全局 users / user_data
_DEFAULT_EXPIRE_DAYS = 7
_JWT_ALGORITHM = "HS256"


# ==================================================================
# 异常体系
# ==================================================================


class ErrorCode:
    """预定义错误码"""
    USERNAME_EXISTS = "USERNAME_EXISTS"
    USERNAME_NOT_FOUND = "USERNAME_NOT_FOUND"
    AUTH_FAILED = "AUTH_FAILED"
    TOKEN_EXPIRED = "TOKEN_EXPIRED"
    TOKEN_INVALID = "TOKEN_INVALID"
    USER_NOT_FOUND = "USER_NOT_FOUND"
    USER_DATA_EXISTS = "USER_DATA_EXISTS"


class AuthError(AppError):
    """认证统一异常。继承 AppError。"""
    pass


def _safely(context: str, log: Log | None, fn, *args, **kwargs):
    """兜底执行器：未预期异常被 AuthError 包裹并记录。"""
    try:
        return fn(*args, **kwargs)
    except AppError:
        raise
    except Exception as e:
        raise AuthError(
            "AUTH_ERROR",
            f"[{context}] {e}",
            cause=e,
            extras={"context": context},
            log=log,
        ) from e


# ==================================================================
# UserAuth
# ==================================================================


class UserAuth:
    """用户认证与信息管理。"""

    def __init__(
        self,
        store: Store,
        log: Log | None = None,
        jwt_secret: str = "",
        token_expire_days: int = _DEFAULT_EXPIRE_DAYS,
    ):
        """
        Args:
            store: Store 实例。
            log: Log 实例。
            jwt_secret: JWT 签名密钥。不得为空。
            token_expire_days: Token 有效期天数，默认 7 天。
        """
        self._store = store
        self._log = log or Log(mode="production")
        self._secret = jwt_secret
        self._expire_days = token_expire_days

    # ═════════════════════════════════════════════════════════════
    # 核心：注册 / 登录 / 鉴权 / 刷新
    # ═════════════════════════════════════════════════════════════

    def register(self, username: str, password: str) -> dict | None:
        """注册新用户。

        Args:
            username: 用户名（唯一）。
            password: 明文密码。

        Returns:
            {"user_id": int, "token": str} 或 None（注册失败）。

        Raises:
            AuthError: username 已存在。
        """
        return _safely("register", self._log, self._register, username, password)

    def _register(self, username: str, password: str) -> dict | None:
        # 1. 检查 username 唯一性
        existing = self._store.list(
            _COLL_USERS, _SYSTEM_USER_ID,
            filter={"username": username},
        )
        if existing:
            self._log.info("UserAuth", f"Username already exists: {username}")
            return None

        # 2. bcrypt 哈希
        pw_bytes = password.encode("utf-8")
        salt = _bcrypt.gensalt()
        hashed = _bcrypt.hashpw(pw_bytes, salt)
        password_hash = hashed.decode("utf-8")

        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")

        # 3. 写入 Store
        user_data = {
            "username": username,
            "password_hash": password_hash,
            "created_at": now,
            "updated_at": now,
        }
        user_id = self._store.insert(_COLL_USERS, _SYSTEM_USER_ID, user_data)

        # 4. 创建空的扩展数据
        self._store.insert(_COLL_USER_DATA, _SYSTEM_USER_ID, {
            "user_id": user_id,
            "data": {},
            "created_at": now,
            "updated_at": now,
        })

        # 5. 签发 JWT
        token = self._generate_token(user_id)

        self._log.info("UserAuth", f"Registered user {user_id}: {username}")
        return {"user_id": user_id, "token": token}

    def login(self, username: str, password: str) -> dict | None:
        """登录。

        Returns:
            {"user_id": int, "token": str} 或 None（用户名/密码错误）。
        """
        return _safely("login", self._log, self._login, username, password)

    def _login(self, username: str, password: str) -> dict | None:
        # 1. 查找用户
        users = self._store.list(
            _COLL_USERS, _SYSTEM_USER_ID,
            filter={"username": username},
        )
        if not users:
            self._log.info("UserAuth", f"Login failed: user not found - {username}")
            return None

        user = users[0]
        stored_hash = user["password_hash"].encode("utf-8")
        pw_bytes = password.encode("utf-8")

        # 2. 校验密码
        if not _bcrypt.checkpw(pw_bytes, stored_hash):
            self._log.info("UserAuth", f"Login failed: wrong password - {username}")
            return None

        # 3. 签发 JWT
        token = self._generate_token(user["id"])

        self._log.info("UserAuth", f"Login success: user {user['id']}")
        return {"user_id": user["id"], "token": token}

    def verify(self, token: str) -> int | None:
        """验签 JWT。

        Returns:
            user_id 或 None（无效/过期）。
        """
        try:
            payload = _jwt.decode(
                token,
                self._secret,
                algorithms=[_JWT_ALGORITHM],
            )
            return payload["user_id"]
        except _jwt.ExpiredSignatureError:
            self._log.info("UserAuth", "Token expired")
            return None
        except _jwt.InvalidTokenError as e:
            self._log.info("UserAuth", f"Token invalid: {e}")
            return None

    def refresh(self, token: str) -> str | None:
        """刷新 token。旧 token 未过期时签发新 token。

        Returns:
            新 token 字符串，或 None（旧 token 无效）。
        """
        try:
            payload = _jwt.decode(
                token,
                self._secret,
                algorithms=[_JWT_ALGORITHM],
                options={"verify_exp": False},  # 允许刷新过期 token
            )
        except _jwt.InvalidTokenError:
            return None

        # 检查过期时间 — 超过 7 天宽限期不再刷新
        exp = payload.get("exp", 0)
        now = datetime.now(timezone.utc).timestamp()
        grace_period = self._expire_days * 86400
        if exp + grace_period < now:
            return None

        return self._generate_token(payload["user_id"])

    # ═════════════════════════════════════════════════════════════
    # 用户信息
    # ═════════════════════════════════════════════════════════════

    def get_profile(self, user_id: int) -> dict | None:
        """获取用户基本信息（不含 password_hash）。"""
        return _safely("get_profile", self._log, self._get_profile, user_id)

    def _get_profile(self, user_id: int) -> dict | None:
        user = self._store.get(_COLL_USERS, _SYSTEM_USER_ID, user_id)
        if user is None:
            return None
        # 去除敏感字段
        profile = dict(user)
        profile.pop("password_hash", None)
        return profile

    def get_data(self, user_id: int) -> dict:
        """获取扩展数据 object。不存在时返回空 dict。"""
        return _safely("get_data", self._log, self._get_data, user_id)

    def _get_data(self, user_id: int) -> dict:
        entries = self._store.list(
            _COLL_USER_DATA, _SYSTEM_USER_ID,
            filter={"user_id": user_id},
        )
        if not entries:
            return {}
        return entries[0].get("data", {})

    def update_data(self, user_id: int, data: dict):
        """整体替换扩展数据 object。"""
        _safely("update_data", self._log, self._update_data, user_id, data)

    def _update_data(self, user_id: int, data: dict):
        entries = self._store.list(
            _COLL_USER_DATA, _SYSTEM_USER_ID,
            filter={"user_id": user_id},
        )
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")
        if entries:
            entry = entries[0]
            entry["data"] = data
            entry["updated_at"] = now
            self._store.update(
                _COLL_USER_DATA, _SYSTEM_USER_ID, entry["id"], entry,
            )
        else:
            self._store.insert(_COLL_USER_DATA, _SYSTEM_USER_ID, {
                "user_id": user_id,
                "data": data,
                "created_at": now,
                "updated_at": now,
            })
        self._log.info("UserAuth", f"Updated data for user {user_id}")

    # ═════════════════════════════════════════════════════════════
    # 内部帮助方法
    # ═════════════════════════════════════════════════════════════

    def _generate_token(self, user_id: int) -> str:
        """签发 JWT。"""
        now = datetime.now(timezone.utc)
        payload = {
            "user_id": user_id,
            "exp": now + timedelta(days=self._expire_days),
            "iat": now,
        }
        return _jwt.encode(payload, self._secret, algorithm=_JWT_ALGORITHM)
