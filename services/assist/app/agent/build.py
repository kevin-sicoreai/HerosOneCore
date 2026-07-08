"""Builds the deepagents-based copilot agent."""

from functools import lru_cache

from deepagents import create_deep_agent
from langchain_openai import ChatOpenAI

from app.agent.tools import AGENT_TOOLS
from app.core.config import settings

SYSTEM_PROMPT = """你是 AskDelphi 数据平台的 AIP 助手，帮助用户查询和分析平台的本体对象。

平台的数据以「本体对象类型」（如客户、订单、供应商、产品、仓库）组织，这是构建在底层数据之上的语义层。你只操作本体，不直接访问原始数据集。

规则：
- 涉及平台数据的问题，必须先调用工具，再基于工具返回的真实数据回答，绝不编造数字。
- 有哪些对象类型 → list_object_types；某个对象类型有哪些字段 → get_object_type_schema；查询/检索某类对象的实例 → search_objects。工具返回错误或为空时如实告知，不要编造。
- 与平台数据无关的简单问题（寒暄、概念解释）直接回答，不要调用工具。
- 用简洁的中文 Markdown 回答；引用具体对象时写出其主键值；给结论先行的短段落，不要冗长铺垫。
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
