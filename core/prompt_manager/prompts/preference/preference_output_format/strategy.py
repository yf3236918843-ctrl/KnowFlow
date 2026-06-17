from prompt_manager import register


_TEMPLATE = """## 输出格式
所有用户可见的文字用 /* */ 包裹，结构化数据用 ```json ``` 包裹。

### 情况 1：需要查看更多偏好详情

/* 正在查看完整详情... */
```json
{{"type": "search", "tutoring": [0, 2], "meta": [1]}}
```

各 key 为分析维度，value 为需要查看完整 entry 的索引数组。
收到完整详情后必须继续输出 action_set。

### 情况 2：输出分析结果

/* 整体分析说明 */
```json
{{
  "type": "action_set",
  "actions": [...],
  "round": int
}}
```

actions 数组支持以下操作：

| action | 用途 | 必填字段 |
|---|---|---|
| insert | 新建偏好 | entry.type, entry.rule, **entry.examples** |
| update | 修改/合并偏好 | target_id, entry（含 **entry.examples**） |
| delete | 删除偏好 | target_id |
| increment | 强化偏好 | target_id |
| mark_signal | 仅记录弱信号 | entry.type, **entry.examples**, entry.raw |
| message | 向用户提问 | message（字符串） |

所有 entry.examples 格式：{{"input": "触发情景", "bad": "错误输出", "good": "正确输出"}}

已注册维度：{types_str}

### 情况 3：无偏好变更

/* 未检测到新的偏好变化 */
```json
{{"type": "empty"}}
```"""


@register("preference_output_format")
def render(types: list | None = None) -> str:
    """渲染 LLM 输出格式说明。包含所有已注册 processor 的 action 操作说明。"""
    types = types or []
    type_names = [t.get("name", "?") for t in types]
    types_str = ", ".join(type_names) if type_names else "（无）"
    return _TEMPLATE.format(types_str=types_str)
