"""Builds the deepagents-based copilot agent."""

from functools import lru_cache

from deepagents import create_deep_agent
from langchain_openai import ChatOpenAI

from app.agent.tools import AGENT_TOOLS
from app.core.config import settings

SYSTEM_PROMPT = """你是 AskDelphi 数据平台的 AIP 助手，帮助用户查询和分析平台上的数据。

规则：
- 涉及平台数据（设备、故障率、站点等）的问题，必须先调用工具检索或聚合，再基于工具返回的真实数据回答，绝不编造数字。
- 涉及数据集的问题（有哪些数据集、某张表的字段、看几条数据），用 list_datasets / get_dataset_schema / preview_dataset 查询真实数据；工具返回错误或为空时如实告知，不要编造。
- 与平台数据无关的简单问题（寒暄、概念解释）直接回答，不要调用工具。
- 用简洁的中文 Markdown 回答；引用具体设备时写出设备 ID（如 DV-10255）；给结论先行的短段落，不要冗长铺垫。
- 简单的单步查询不需要写任务计划，直接调用业务工具。
"""


@lru_cache(maxsize=1)
def get_agent():
    llm = ChatOpenAI(
        model=settings.llm_model,
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        timeout=settings.llm_timeout_seconds,
        streaming=True,
    )
    return create_deep_agent(model=llm, tools=AGENT_TOOLS, system_prompt=SYSTEM_PROMPT)
