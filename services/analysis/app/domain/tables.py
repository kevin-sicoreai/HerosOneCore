"""Built-in mock tables.

Self-made data (deterministic, seeded) standing in for real datasets until the
data service is ready; aligned with the platform's demo universe (devices,
orders). Column kinds drive the workbench UI: dimensions group, measures
aggregate.
"""

import random
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Column:
    name: str
    label: str
    kind: str  # dimension | measure
    data_type: str | None = None  # source SQL type (e.g. DATE, VARCHAR); None for built-in mock


@dataclass(frozen=True)
class Table:
    name: str
    label: str
    desc: str
    columns: list[Column]
    rows: list[dict] = field(default_factory=list, repr=False)


def _build_devices() -> list[dict]:
    rng = random.Random(42)
    models = ["TX-500", "GX-220", "MX-900"]
    sites = ["华东-01", "华东-02", "华南-03", "华北-02", "西南-01"]
    statuses = ["运行", "运行", "运行", "告警", "停机"]  # weighted
    rows = []
    for i in range(48):
        model = models[i % len(models)]
        site = sites[(i * 7) % len(sites)]
        status = rng.choice(statuses)
        base = {"TX-500": 4.0, "GX-220": 2.5, "MX-900": 3.2}[model]
        failure = round(max(0.2, rng.gauss(base, 2.2)), 1)
        if status == "停机":
            failure = round(failure + 4, 1)
        rows.append(
            {
                "id": f"DV-{10200 + i}",
                "model": model,
                "site": site,
                "status": status,
                "failure_rate": failure,
                "uptime_days": rng.randint(3, 320),
            }
        )
    return rows


def _build_orders() -> list[dict]:
    rng = random.Random(7)
    regions = ["华东", "华南", "华北", "西南"]
    statuses = ["已完成", "已完成", "履约中", "延迟", "取消"]  # weighted
    priorities = ["高", "中", "低"]
    rows = []
    for i in range(72):
        region = regions[(i * 5) % len(regions)]
        status = rng.choice(statuses)
        rows.append(
            {
                "id": f"OD-{52000 + i}",
                "region": region,
                "status": status,
                "priority": priorities[(i * 3) % len(priorities)],
                "amount": rng.randint(8, 420) * 100,
                "items": rng.randint(1, 24),
            }
        )
    return rows


TABLES: dict[str, Table] = {
    "devices": Table(
        name="devices",
        label="设备",
        desc="设备台账与运行指标（mock，待接 data 服务）",
        columns=[
            Column("id", "设备 ID", "dimension"),
            Column("model", "型号", "dimension"),
            Column("site", "站点", "dimension"),
            Column("status", "状态", "dimension"),
            Column("failure_rate", "故障率 %", "measure"),
            Column("uptime_days", "运行天数", "measure"),
        ],
        rows=_build_devices(),
    ),
    "orders": Table(
        name="orders",
        label="订单",
        desc="订单履约明细（mock，待接 data 服务）",
        columns=[
            Column("id", "订单 ID", "dimension"),
            Column("region", "区域", "dimension"),
            Column("status", "状态", "dimension"),
            Column("priority", "优先级", "dimension"),
            Column("amount", "金额", "measure"),
            Column("items", "件数", "measure"),
        ],
        rows=_build_orders(),
    ),
}
