from .. import register_biller, BillingResult


@register_biller("openai")
def biller_openai(response_data: dict, billing_config: dict) -> BillingResult:
    """OpenAI / 兼容接口标准计费。

    Args:
        response_data: LLM 响应中的 usage 信息。
            {"usage": {"prompt_tokens": int, "completion_tokens": int}}
        billing_config: 计费配置。
            {"1M_input": float, "1M_output": float}

    Returns:
        BillingResult: 计费结果。
    """
    usage = response_data["usage"]
    input_tokens = usage["prompt_tokens"]
    output_tokens = usage["completion_tokens"]
    cost = round(
        input_tokens / 1_000_000 * billing_config.get("1M_input", 0) +
        output_tokens / 1_000_000 * billing_config.get("1M_output", 0),
        6,
    )
    return BillingResult(input_tokens, output_tokens, cost)
