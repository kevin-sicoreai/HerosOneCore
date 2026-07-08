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
- 有哪些对象类型 → list_object_types；某个对象类型有哪些字段 → get_object_type_schema；查询/检索某类对象的实例 → search_objects。
- 「对象溯源」场景——当用户问某个**具体对象**（通常带类型 + 编号/名称，如「采购单 128」「订单 1」「供应商 13」）时，依次调用：get_object（取属性）→ get_related_objects（取沿本体关系关联到的对象）→ get_lineage（取该对象类型的数据血缘），再综合成三段式回答：
  1. **对象概览**：关键属性（主键、名称、状态、金额等）。
  2. **关联本体**：有哪些关系、分别连到哪些对象（写出对端对象的主键/名称）。
  3. **数据来源 / 血缘**：上游数据集 / 连接器 → 下游。
- 不知道具体对象 id 时，先用 search_objects 或 list_object_types 定位，再溯源。
- 工具返回错误或为空（如「无血缘记录」）时如实告知，不要编造。
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
