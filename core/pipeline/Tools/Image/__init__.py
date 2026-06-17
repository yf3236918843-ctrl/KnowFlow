"""
Image — 图片处理工具

封装 FileStore 读取 + LLM 视觉识别，策略无需关心图片怎么存、怎么调视觉模型。
"""

import base64
from typing import AsyncIterator

from llm_gateway import SessionManager, StreamChunk, image_to_string
from store import FileStore
from pipeline.Tools.Models import _get_filestore


async def image_to_text(manager: SessionManager, user_id: int,
                        file_ref: str, instruction: str = "",
                        route: str | None = None) -> str:
    """从 FileStore 读图片 → image_to_string → 返回文字。

    封装的完整链路，策略只需要传 file_ref。

    Args:
        manager: SessionManager 实例（用于调 vision 模型）。
        user_id: 用户 ID。
        file_ref: FileStore 中的文件名。
        instruction: 对图片的指令，如"识别这个公式"。
        route: 使用的模型路由名。不传则用 Default。

    Returns:
        识别结果文本。
    """
    b64 = image_get_base64(file_ref)
    return await image_to_string(manager, user_id, b64,
                                 instruction=instruction, route=route)


async def image_base64_to_text(manager: SessionManager, user_id: int,
                               image_b64: str, instruction: str = "",
                               route: str | None = None,
                               image_format: str = "png") -> str:
    """直接使用 base64 图片内容做图转文。"""
    return await image_to_string(
        manager,
        user_id,
        image_b64,
        instruction=instruction,
        route=route,
        image_format=image_format,
    )


async def stream_image_base64_to_text(manager: SessionManager, user_id: int,
                                      image_b64: str, instruction: str = "",
                                      route: str | None = None,
                                      image_format: str = "png") -> AsyncIterator[StreamChunk]:
    """直接使用 base64 图片内容流式图转文。"""
    route_name = route or "Vision"
    session = manager.create(user_id=user_id, route=route_name)
    content_parts = []
    if instruction:
        content_parts.append({"type": "text", "text": instruction})
    content_parts.append({
        "type": "image_url",
        "image_url": {"url": f"data:image/{image_format};base64,{image_b64}"},
    })
    try:
        async for chunk in session.stream([{"role": "user", "content": content_parts}]):
            yield chunk
    finally:
        session.destroy()


def image_get_base64(file_ref: str,
                     file_store: FileStore | None = None) -> str:
    """从 FileStore 读图片，返回 base64 字符串。

    Args:
        file_ref: FileStore 中的文件名。
        file_store: FileStore 实例。不传则使用全局 FileStore。

    Returns:
        Base64 编码字符串（不含 data:image 前缀）。
    """
    fs = file_store or _get_filestore()
    data, _ = fs.load(file_ref)
    return base64.b64encode(data).decode("ascii")
