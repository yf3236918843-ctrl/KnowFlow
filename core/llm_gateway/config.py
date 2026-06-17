"""
LLMGateway — 默认模型路由配置

使用方式:
    from llm_gateway.config import DEFAULT_CONFIG
    manager = SessionManager(store, log, DEFAULT_CONFIG)
"""

DEFAULT_CONFIG = {
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
    "Reason": {
        "api_key": "env://DEEPSEEK_API_KEY",
        "model_name": "deepseek-reasoner",
        "is_think": True,
        "base_url": "https://api.deepseek.com",
        "max_tokens": 4096,
        "temperature": 1.0,
        "vision": False,
        "billing": {"1M_input": 0.55, "1M_output": 2.19},
        "biller": "openai",
    },
    "Vision": {
        "api_key": "env://ARK_API_KEY",
        "model_name": "doubao-seed-2-0-pro-260215",
        "is_think": False,
        "base_url": "https://ark.cn-beijing.volces.com/api/v3",
        "max_tokens": 4096,
        "temperature": 0.3,
        "vision": True,
        "billing": {"1M_input": 3, "1M_output": 12},
        "biller": "openai",
    },
}
