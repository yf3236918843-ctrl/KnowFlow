"""
server.py — PrivateTeacher Web 服务

鉴权方式：Cookie Session（HttpOnly / Secure / SameSite=Lax）
"""

import os
import sys

# ── 路径：使 core/ 下各模块可被 import ─────────────────────────
_CORE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "core")
if _CORE not in sys.path:
    sys.path.insert(0, _CORE)

import json
import time
import secrets
import hashlib
from datetime import timedelta
from pathlib import Path

from fastapi import FastAPI, Request, Response, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from store import JsonStore, FileStore
from log import Log
from llm_gateway import SessionManager
from prompt_manager import PromptManager
from preference_engine import PreferenceEngine
from user_auth import UserAuth
from pipeline import Pipeline


# ── 基础设施初始化 ────────────────────────────────────────────────

log = Log()
store = JsonStore(log=log)
filestore = FileStore(log=log)
pm = PromptManager(log=log)
auth = UserAuth(store=store, log=log, jwt_secret=os.environ.get("JWT_SECRET", "dev-secret"))

model_config = {
    "Default": {
        "api_key": "env://DEEPSEEK_API_KEY",
        "model_name": "deepseek-v4-flash",
        "is_think": False,
        "base_url": "https://api.deepseek.com",
        "max_tokens": 4096,
        "temperature": 0.7,
        "vision": False,
        "billing": {"1M_input": 1.0, "1M_output": 2.0},
        "biller": "openai",
    },
    "Chat": {
        "api_key": "env://DEEPSEEK_API_KEY",
        "model_name": "deepseek-v4-flash",
        "is_think": False,
        "base_url": "https://api.deepseek.com",
        "max_tokens": 4096,
        "temperature": 0.7,
        "vision": False,
        "billing": {"1M_input": 1.0, "1M_output": 2.0},
        "biller": "openai",
    },
    "Vision": {
        "api_key": "env://ARK_API_KEY",
        "model_name": "doubao-seed-2-0-pro-260215",
        "is_think": False,
        "base_url": "https://ark.cn-beijing.volces.com/api/v3",
        "max_tokens": 2048,
        "temperature": 0.3,
        "vision": True,
        "billing": {"1M_input": 3, "1M_output": 12},
        "biller": "openai",
    },
}

sm = SessionManager(store, log, model_config)
pe = PreferenceEngine(store, pm, log)

# 注册偏好处理器
pe.register_processor("tutoring", "## 辅导互动",
    "关注：学生说「不要…」「以后…」「我希望…」「每次…」")
pe.register_processor("summary", "## 总结",
    "关注：学生对总结长度、侧重点的偏好")
pe.register_processor("question", "## 出题",
    "关注：题目难度、题型偏好")
pe.register_processor("mistake", "## 错题收录",
    "关注：收录粒度、分类方式")
pe.register_processor("meta", "## 偏好生成规范",
    "关注：约束偏好分析系统自身的输出行为")

pipeline = Pipeline(store=store, log=log,
                    session_manager=sm,
                    prompt_manager=pm,
                    preference_engine=pe)


# ── Cookie Session ─────────────────────────────────────────────────

_SESSION_EXPIRE = timedelta(days=7)


def _new_session_token() -> str:
    return secrets.token_hex(32)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _set_cookie(response: Response, user_id: int):
    token = _new_session_token()
    now = time.time()
    store.insert("sessions", 0, {
        "token_hash": _hash_token(token),
        "user_id": user_id,
        "created_at": now,
        "expires_at": now + _SESSION_EXPIRE.total_seconds(),
    })
    response.set_cookie(
        key="session",
        value=token,
        max_age=int(_SESSION_EXPIRE.total_seconds()),
        httponly=True,
        secure=False,
        samesite="lax",
        path="/",
    )


def _get_user_id(request: Request) -> int | None:
    token = request.cookies.get("session")
    if not token:
        return None
    token_hash = _hash_token(token)
    sessions = store.list("sessions", 0, filter={"token_hash": token_hash})
    if not sessions:
        return None
    s = sessions[0]
    if time.time() > s.get("expires_at", 0):
        store.delete("sessions", 0, s["id"])
        return None
    return s.get("user_id")


# ── FastAPI ─────────────────────────────────────────────────────────

app = FastAPI(title="PrivateTeacher", docs_url=None, redoc_url=None)


# ════════════════════════════════════════════════════════════════════
# 鉴权
# ════════════════════════════════════════════════════════════════════

@app.post("/api/auth/register")
async def register(request: Request):
    body = await request.json()
    username = body.get("account", "").strip()
    password = body.get("password", "")
    if len(username) < 2 or len(password) < 4:
        return JSONResponse({"ok": False, "error": "账号至少 2 位，密码至少 4 位"}, status_code=400)

    result = auth.register(username, password)
    if result is None:
        return JSONResponse({"ok": False, "error": "账号已存在"}, status_code=409)

    resp = JSONResponse({"ok": True, "data": {"user_id": result["user_id"]}})
    _set_cookie(resp, result["user_id"])
    return resp


@app.post("/api/auth/login")
async def login(request: Request):
    body = await request.json()
    username = body.get("account", "").strip()
    password = body.get("password", "")
    result = auth.login(username, password)
    if result is None:
        return JSONResponse({"ok": False, "error": "账号或密码错误"}, status_code=401)

    resp = JSONResponse({"ok": True, "data": {"user_id": result["user_id"]}})
    _set_cookie(resp, result["user_id"])
    return resp


@app.post("/api/auth/logout")
async def logout(request: Request):
    token = request.cookies.get("session")
    if token:
        token_hash = _hash_token(token)
        sessions = store.list("sessions", 0, filter={"token_hash": token_hash})
        for s in sessions:
            store.delete("sessions", 0, s["id"])
    resp = JSONResponse({"ok": True})
    resp.delete_cookie("session", path="/")
    return resp


@app.get("/api/me")
async def me(request: Request):
    user_id = _get_user_id(request)
    if user_id is None:
        return JSONResponse({"ok": False, "error": "未登录"}, status_code=401)
    profile = auth.get_profile(user_id)
    return {"ok": True, "data": profile}


# ════════════════════════════════════════════════════════════════════
# Pipeline
# ════════════════════════════════════════════════════════════════════

def _parse_pipeline(name: str):
    """\"project.create\" → (\"project\", \"create\")"""
    parts = name.split(".", 1)
    return parts[0], parts[1] if len(parts) > 1 else None


@app.post("/api/pipeline/run")
async def pipeline_run(request: Request):
    user_id = _get_user_id(request)
    if user_id is None:
        return JSONResponse({"ok": False, "error": "未登录"}, status_code=401)

    body = await request.json()
    pipeline_name = body.get("pipeline", "")
    params = body.get("params", {})

    task_type, func = _parse_pipeline(pipeline_name)
    params.pop("user_id", None)
    params.pop("task_type", None)
    params.pop("func", None)
    ctx = {**params, "task_type": task_type, "user_id": user_id}
    if func:
        ctx["func"] = func

    log.info("Server", f"Pipeline: {pipeline_name}", user_id=user_id)
    result = pipeline.run(ctx)

    if hasattr(result, "__aiter__"):
        return StreamingResponse(
            _sse_wrap(result),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    return JSONResponse(content=result)


async def _sse_wrap(gen):
    try:
        async for chunk in gen:
            if isinstance(chunk, dict):
                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
            elif isinstance(chunk, str):
                yield f"data: {chunk}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"
    finally:
        yield "data: {\"type\": \"done\"}\n\n"


# ════════════════════════════════════════════════════════════════════
# 文件
# ════════════════════════════════════════════════════════════════════

@app.post("/api/upload")
async def upload(request: Request, files: list[UploadFile] = File(...)):
    user_id = _get_user_id(request)
    if user_id is None:
        raise HTTPException(status_code=401, detail="未登录")
    if not files or len(files) > 10:
        raise HTTPException(status_code=400, detail="文件数量 1-10")

    file_ids = []
    for f in files:
        data = await f.read()
        if len(data) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"{f.filename} 超过 10MB")

        ctype = f.content_type or ""
        filetype = "image" if ctype.startswith("image/") else "binary"
        filename = filestore.save(filetype, data)
        file_ids.append(filename)

    return {"ok": True, "file_ids": file_ids}


@app.get("/api/files/{file_id:path}")
async def get_file(request: Request, file_id: str):
    user_id = _get_user_id(request)
    if user_id is None:
        raise HTTPException(status_code=401, detail="未登录")
    try:
        data, ftype = filestore.load(file_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="文件不存在")
    mime = {"image": "image/png", "text": "text/plain"}.get(ftype, "application/octet-stream")
    return Response(content=data, media_type=mime)


# ════════════════════════════════════════════════════════════════════
# 静态文件
# ════════════════════════════════════════════════════════════════════

_static = os.path.join(os.path.dirname(os.path.abspath(__file__)))
app.mount("/", StaticFiles(directory=_static, html=True), name="web")


# ── 启动 ───────────────────────────────────────────────────────────

def _kill_old_process(port: int):
    """检查端口是否被占用，若占用则杀死对应进程。"""
    import subprocess
    import socket

    # 先快速检查端口是否可用
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", port))
        s.close()
        return  # 端口空闲
    except OSError:
        pass
    finally:
        s.close()

    # 端口被占用 → 找 PID 并杀死
    try:
        result = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True, text=True, timeout=5,
        )
        for line in result.stdout.splitlines():
            if f"127.0.0.1:{port}" in line and "LISTENING" in line:
                parts = line.strip().split()
                pid = parts[-1]
                subprocess.run(["taskkill", "/f", "/pid", pid],
                               capture_output=True, timeout=5)
                print(f"[Server] 已杀死旧进程 (PID: {pid})")
                return
        print(f"[Server] 端口 {port} 被占用，但未能找到占用进程")
    except Exception as e:
        print(f"[Server] 尝试释放端口 {port} 时出错: {e}")


if __name__ == "__main__":
    import uvicorn

    PORT = 5003
    _kill_old_process(PORT)

    log.info("Server", f"PrivateTeacher → http://localhost:5002")
    uvicorn.run("server:app", host="127.0.0.1", port=PORT, reload=False)
