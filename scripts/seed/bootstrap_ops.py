"""One-shot bootstrap of the enterprise-operations scenario's platform metadata.

Once the operations source database has been seeded (scripts/seed/seed_ops.sh)
and the services are up, this wires the whole scenario end to end:

    connector -> sync -> pipeline (marts) -> ontology -> governance -> labels

so the demo is ready without any manual clicking in the UI.

Idempotent: every step first checks whether its resource already exists and
skips (printing "已存在,跳过") instead of duplicating it. Re-running is safe.

Zero third-party dependencies (standard library urllib/json only).

All endpoints / credentials come from the unified profile (scripts/env.sh):
    AUTH_API_URL DATA_API_URL PIPELINE_API_URL ONTOLOGY_API_URL GOV_API_URL
    ADMIN_USER ADMIN_PASS SOURCE_DB_HOST/PORT/USER/PASSWORD/NAME
Run it through the loader:  source scripts/env.sh dev && python scripts/seed/bootstrap_ops.py
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request


def _env(key: str) -> str:
    """Required env — bootstrap must run under scripts/env.sh, never bare."""
    val = os.environ.get(key, "")
    if not val:
        sys.exit(f"missing env {key} — run via: source scripts/env.sh [dev|prod] first")
    return val


AUTH_URL = _env("AUTH_API_URL")
DATA_URL = _env("DATA_API_URL")
PIPELINE_URL = _env("PIPELINE_API_URL")
ONTOLOGY_URL = _env("ONTOLOGY_API_URL")
GOV_URL = _env("GOV_API_URL")
ADMIN_USER = _env("ADMIN_USER")
ADMIN_PASS = _env("ADMIN_PASS")

# Source DB the platform ingests from (the connector's target).
SOURCE_DB = {
    "host": _env("SOURCE_DB_HOST"),
    "port": int(_env("SOURCE_DB_PORT")),
    "database": _env("SOURCE_DB_NAME"),
    "username": _env("SOURCE_DB_USER"),
    "password": _env("SOURCE_DB_PASSWORD"),
    "schema": "public",
}

# dataset name -> (Chinese display name, ontology object api_name).
# One row per source table (60): every table becomes a dataset AND an object type.
# Ordered by business domain; the ontology canvas lays them out in this order.
TABLE_SPECS: list[tuple[str, str, str]] = [
    # 交易核心
    ("customers", "客户", "customer"),
    ("orders", "销售订单", "order"),
    ("order_items", "订单明细", "order_item"),
    ("products", "产品", "product"),
    ("suppliers", "供应商", "supplier"),
    ("sales_reps", "销售代表", "sales_rep"),
    ("support_tickets", "客服工单", "support_ticket"),
    ("departments", "部门", "department"),
    # CRM
    ("leads", "销售线索", "lead"),
    ("opportunities", "商机", "opportunity"),
    ("quotes", "报价单", "quote"),
    ("quote_items", "报价明细", "quote_item"),
    ("sales_contracts", "销售合同", "sales_contract"),
    ("campaigns", "营销活动", "campaign"),
    ("channels", "销售渠道", "channel"),
    ("visits", "客户拜访", "visit"),
    # 零售
    ("stores", "门店", "store"),
    ("promotions", "促销活动", "promotion"),
    ("coupons", "优惠券", "coupon"),
    ("product_reviews", "商品评价", "product_review"),
    ("price_lists", "价目表", "price_list"),
    # 产品与质量
    ("product_categories", "产品品类", "product_category"),
    ("boms", "物料清单", "bom"),
    ("batches", "生产批次", "batch"),
    ("quality_checks", "质检记录", "quality_check"),
    # 供应链
    ("purchases", "采购单", "purchase"),
    ("purchase_items", "采购明细", "purchase_item"),
    ("inventory", "库存", "inventory_item"),
    ("warehouses", "仓库", "warehouse"),
    ("shipments", "发货单", "shipment"),
    ("carriers", "承运商", "carrier"),
    ("returns", "退货单", "return_order"),
    ("stock_transfers", "调拨单", "stock_transfer"),
    ("stocktakes", "盘点记录", "stocktake"),
    ("purchase_contracts", "采购合同", "purchase_contract"),
    ("supplier_evaluations", "供应商评估", "supplier_evaluation"),
    ("delivery_routes", "配送线路", "delivery_route"),
    # 财务
    ("invoices", "销售发票", "invoice"),
    ("payments", "回款记录", "payment"),
    ("expenses", "费用报销", "expense"),
    ("budgets", "部门预算", "budget"),
    ("cost_centers", "成本中心", "cost_center"),
    ("fixed_assets", "固定资产", "fixed_asset"),
    ("payables", "应付账款", "payable"),
    ("credit_notes", "折让红票", "credit_note"),
    ("bank_accounts", "银行账户", "bank_account"),
    # 组织与项目
    ("employees", "员工", "employee"),
    ("projects", "项目", "project"),
    ("project_tasks", "项目任务", "project_task"),
    ("approvals", "审批单", "approval"),
    # 客服
    ("ticket_replies", "工单回复", "ticket_reply"),
    ("satisfaction_surveys", "满意度调查", "satisfaction_survey"),
    ("knowledge_articles", "知识库文章", "knowledge_article"),
    ("after_sales", "售后服务单", "after_sale"),
    ("sla_policies", "SLA 政策", "sla_policy"),
    # IT 与资产
    ("devices", "IT 设备", "device"),
    ("software_licenses", "软件许可", "software_license"),
    ("maintenance_orders", "维保工单", "maintenance_order"),
    ("vehicles", "车辆", "vehicle"),
    ("energy_consumption", "能耗记录", "energy_record"),
]

OPS_TABLES = [t for t, _, _ in TABLE_SPECS]

# English dataset name -> Chinese display name (raw tables + pipeline marts).
LABELS = {t: zh for t, zh, _ in TABLE_SPECS} | {
    "sales_region_summary": "区域销售概览",
    "ticket_summary": "工单概览",
}

# (dataset_name, column_name, level) sensitive-column classifications.
CLASSIFICATIONS = [
    ("customers", "contact_phone", "PII-联系方式"),
    ("suppliers", "contact_phone", "PII-联系方式"),
    ("customers", "credit_limit", "敏感-授信"),
    ("orders", "total_amount", "敏感-交易"),
    ("invoices", "amount", "敏感-财务"),
    ("payments", "amount", "敏感-财务"),
]

# Ontology object types — one per table, laid out on an 8-column grid in
# TABLE_SPECS (domain) order. dataset_id is resolved by dataset name at runtime.
_COLORS = ["sky", "emerald", "violet", "amber", "rose"]
OBJECT_TYPES = [
    {
        "api_name": api,
        "display_name": zh,
        "dataset": table,
        "primary_key": "id",
        "color": _COLORS[i % len(_COLORS)],
        "x": 60 + (i % 8) * 230,
        "y": 60 + (i // 8) * 130,
    }
    for i, (table, zh, api) in enumerate(TABLE_SPECS)
]

# Ontology link types. from_/to_ reference object types by api_name; each maps
# a real FK column so instance-level joins work.
_LINK_SPECS: list[tuple[str, str, str, str]] = [
    # (from_api, fk_column, to_api, display_name); to_property is always "id".
    ("order", "customer_id", "customer", "下单客户"),
    ("order", "sales_rep_id", "sales_rep", "负责销售"),
    ("order_item", "order_id", "order", "所属订单"),
    ("order_item", "product_id", "product", "订购产品"),
    ("product", "supplier_id", "supplier", "供货商"),
    ("sales_rep", "department_id", "department", "所属部门"),
    ("support_ticket", "customer_id", "customer", "报障客户"),
    ("support_ticket", "order_id", "order", "关联订单"),
    ("lead", "owner_rep_id", "sales_rep", "负责人"),
    ("opportunity", "customer_id", "customer", "商机客户"),
    ("opportunity", "owner_rep_id", "sales_rep", "商机负责人"),
    ("quote", "customer_id", "customer", "报价客户"),
    ("quote_item", "quote_id", "quote", "所属报价单"),
    ("quote_item", "product_id", "product", "报价产品"),
    ("sales_contract", "customer_id", "customer", "签约客户"),
    ("visit", "customer_id", "customer", "拜访客户"),
    ("visit", "sales_rep_id", "sales_rep", "拜访人"),
    ("coupon", "customer_id", "customer", "持券客户"),
    ("product_review", "product_id", "product", "评价产品"),
    ("product_review", "customer_id", "customer", "评价客户"),
    ("price_list", "product_id", "product", "定价产品"),
    ("bom", "product_id", "product", "父产品"),
    ("batch", "product_id", "product", "批次产品"),
    ("quality_check", "batch_id", "batch", "受检批次"),
    ("purchase", "supplier_id", "supplier", "采购供应商"),
    ("purchase", "warehouse_id", "warehouse", "入库仓库"),
    ("purchase_item", "purchase_id", "purchase", "所属采购单"),
    ("purchase_item", "product_id", "product", "采购产品"),
    ("inventory_item", "warehouse_id", "warehouse", "所在仓库"),
    ("inventory_item", "product_id", "product", "库存产品"),
    ("shipment", "order_id", "order", "发货订单"),
    ("shipment", "warehouse_id", "warehouse", "发货仓库"),
    ("return_order", "order_id", "order", "退货订单"),
    ("stock_transfer", "from_warehouse_id", "warehouse", "调出仓库"),
    ("stocktake", "warehouse_id", "warehouse", "盘点仓库"),
    ("purchase_contract", "supplier_id", "supplier", "合同供应商"),
    ("supplier_evaluation", "supplier_id", "supplier", "被评估供应商"),
    ("delivery_route", "carrier_id", "carrier", "承运商"),
    ("invoice", "order_id", "order", "开票订单"),
    ("payment", "invoice_id", "invoice", "回款发票"),
    ("expense", "employee_id", "employee", "报销人"),
    ("expense", "department_id", "department", "费用部门"),
    ("budget", "department_id", "department", "预算部门"),
    ("cost_center", "department_id", "department", "归属部门"),
    ("fixed_asset", "department_id", "department", "资产部门"),
    ("payable", "supplier_id", "supplier", "应付供应商"),
    ("credit_note", "invoice_id", "invoice", "冲抵发票"),
    ("employee", "department_id", "department", "任职部门"),
    ("project", "department_id", "department", "立项部门"),
    ("project_task", "project_id", "project", "所属项目"),
    ("project_task", "assignee_id", "employee", "任务负责人"),
    ("approval", "applicant_id", "employee", "申请人"),
    ("ticket_reply", "ticket_id", "support_ticket", "回复工单"),
    ("satisfaction_survey", "ticket_id", "support_ticket", "调查工单"),
    ("after_sale", "order_id", "order", "售后订单"),
    ("device", "user_employee_id", "employee", "使用人"),
    ("maintenance_order", "device_id", "device", "维保设备"),
    ("vehicle", "department_id", "department", "车辆部门"),
    ("energy_record", "warehouse_id", "warehouse", "能耗仓库"),
]

LINK_TYPES = [
    {
        "api_name": f"{frm}__{col}",
        "display_name": zh,
        "from_": frm,
        "to": to,
        "from_property": col,
        "to_property": "id",
    }
    for frm, col, to, zh in _LINK_SPECS
]

# Join SQL for the sales_region_summary mart. `left_input` is the orders source,
# `right_input` is the customers source (fixed by edge order below).
JOIN_REGION_SQL = (
    "select r.region as region,\n"
    "  count(*) as order_count,\n"
    "  count(distinct l.customer_id) as customer_count,\n"
    "  round(sum(l.total_amount), 2) as total_sales,\n"
    "  round(avg(l.total_amount), 2) as avg_order_amount\n"
    "from left_input l join right_input r on l.customer_id = r.id\n"
    "where l.status in ('已完成', '已发货')\n"
    "group by r.region"
)

# Aggregation SQL for the ticket_summary mart (single input named `input`).
TICKET_SQL = (
    "select category, status, count(*) as tickets,\n"
    "  round(avg(satisfaction), 2) as avg_satisfaction\n"
    "from input group by category, status"
)

CONNECTOR_NAME = "ops source db"
PIPELINE_NAME = "运营数据加工"

# Collected (step, resource, result) rows for the closing summary table.
# result is one of: "创建" / "跳过" / "失败".
SUMMARY: list[tuple[str, str, str]] = []

TOKEN: str | None = None


def log(msg: str) -> None:
    print(msg, flush=True)


def record(step: str, resource: str, result: str) -> None:
    SUMMARY.append((step, resource, result))


def req(method: str, url: str, body: dict | None = None, token: str | None = None) -> dict:
    """Issue a JSON request. Raises RuntimeError with the server detail on error."""
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        resp = urllib.request.urlopen(r, timeout=60)
        text = resp.read().decode()
        return json.loads(text) if text else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        raise RuntimeError(f"{method} {url} -> HTTP {exc.code}: {detail}") from exc


def api(method: str, url: str, body: dict | None = None) -> dict:
    """req() bound to the global admin token (data/pipeline/ontology require it)."""
    return req(method, url, body, TOKEN)


def rows_of(payload) -> list:
    """Unwrap a list endpoint: bare array or {items:[...]} pagination shell."""
    return payload if isinstance(payload, list) else payload.get("items", [])


def get_all(base_url: str, page_size: int = 100) -> list:
    """Fetch every row of a list endpoint, paging through the Page shell if present."""
    out: list = []
    page = 1
    while True:
        sep = "&" if "?" in base_url else "?"
        payload = api("GET", f"{base_url}{sep}page={page}&page_size={page_size}")
        if isinstance(payload, list):
            return payload
        items = payload.get("items", [])
        out.extend(items)
        pages = payload.get("pages", 1) or 1
        if page >= pages or not items:
            break
        page += 1
    return out


def datasets_by_name() -> dict[str, dict]:
    """Current data catalog keyed by dataset name."""
    return {d["name"]: d for d in get_all(f"{DATA_URL}/datasets")}


def poll_status(url: str, interval: int, timeout: int, label: str) -> str:
    """Poll a run resource until its status is terminal. Returns success/failed."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        status = api("GET", url).get("status")
        if status in ("success", "failed"):
            return status
        log(f"   {label} 进行中(status={status})……")
        time.sleep(interval)
    return "timeout"


# --- Step 0: health -------------------------------------------------------

def step_health() -> None:
    log("== 0. 服务健康检查 ==")
    services = [
        ("auth", AUTH_URL), ("data", DATA_URL), ("pipeline", PIPELINE_URL),
        ("ontology", ONTOLOGY_URL), ("governance", GOV_URL),
    ]
    bad = []
    for name, base in services:
        # Reachability only: /docs serves HTML, so don't parse the body.
        try:
            with urllib.request.urlopen(f"{base}/docs", timeout=10) as resp:
                ok = resp.status < 500
        except Exception:
            ok = False
        if not ok:
            bad.append(f"{name} ({base})")
    if bad:
        log("!! 以下服务不可达: " + ", ".join(bad))
        sys.exit(1)
    log("-- 全部 5 个服务健康")


def login() -> None:
    global TOKEN
    tok = req("POST", f"{AUTH_URL}/login", {"username": ADMIN_USER, "password": ADMIN_PASS})
    TOKEN = tok.get("access_token") or tok.get("token")
    if not TOKEN:
        log("!! 获取管理员令牌失败")
        sys.exit(1)
    log(f"-- 已以 {ADMIN_USER} 登录")


# --- Step 1: connector ----------------------------------------------------

def step_connector() -> str:
    log("\n== 1. 连接器 ==")
    existing = next(
        (c for c in get_all(f"{DATA_URL}/connectors") if c["name"] == CONNECTOR_NAME),
        None,
    )
    if existing:
        log(f"-- 连接器「{CONNECTOR_NAME}」已存在,跳过")
        record("1 连接器", CONNECTOR_NAME, "跳过")
        return existing["id"]

    payload = {
        "name": CONNECTOR_NAME,
        "source_type": "postgres",
        "config": dict(SOURCE_DB),
    }
    created = api("POST", f"{DATA_URL}/connectors", payload)
    cid = created["id"]
    log(f"-- 已创建连接器「{CONNECTOR_NAME}」 (id={cid})")
    test = api("POST", f"{DATA_URL}/connectors/{cid}/test")
    log(f"-- 连接测试: ok={test.get('ok')} {test.get('message')}")
    record("1 连接器", CONNECTOR_NAME, "创建")
    return cid


# --- Step 2: sync ---------------------------------------------------------

def step_sync(connector_id: str) -> None:
    log("\n== 2. 同步 ==")
    present = set(datasets_by_name())
    missing = [t for t in OPS_TABLES if t not in present]
    if not missing:
        log(f"-- 全部 {len(OPS_TABLES)} 张运营表已入库,跳过同步")
        record("2 同步", f"{len(OPS_TABLES)} 张运营表", "跳过")
        return

    log(f"-- 缺少 {len(missing)} 张表: {', '.join(missing)},触发同步")
    run = api("POST", f"{DATA_URL}/connectors/{connector_id}/sync")
    run_id = run["id"]
    log(f"-- 同步已启动 (run_id={run_id}),轮询中……")
    status = poll_status(f"{DATA_URL}/syncs/{run_id}", interval=3, timeout=300, label="同步")
    if status != "success":
        log(f"!! 同步未成功 (status={status})")
        record("2 同步", f"{len(OPS_TABLES)} 张运营表", "失败")
        sys.exit(1)
    log("-- 同步成功")
    record("2 同步", f"{len(OPS_TABLES)} 张运营表", "创建")


# --- Step 3: pipeline -----------------------------------------------------

def build_graph(ds: dict[str, dict]) -> dict:
    """Assemble the two-mart pipeline graph from resolved dataset ids.

    Edge order for join_region fixes left/right inputs: orders=left, customers=right.
    """
    steps = [
        {"id": "src_orders", "kind": "source", "label": "销售订单",
         "config": {"dataset_id": ds["orders"]["id"]}, "x": 60, "y": 80},
        {"id": "src_cust", "kind": "source", "label": "客户",
         "config": {"dataset_id": ds["customers"]["id"]}, "x": 60, "y": 220},
        {"id": "join_region", "kind": "join", "label": "区域销售关联",
         "config": {"sql": JOIN_REGION_SQL}, "x": 320, "y": 150},
        {"id": "out_region", "kind": "output", "label": "区域销售概览",
         "config": {"name": "sales_region_summary", "display_name": "区域销售概览"},
         "x": 580, "y": 150},
        {"id": "src_ticket", "kind": "source", "label": "客服工单",
         "config": {"dataset_id": ds["support_tickets"]["id"]}, "x": 60, "y": 400},
        {"id": "agg_ticket", "kind": "transform", "label": "工单聚合",
         "config": {"sql": TICKET_SQL}, "x": 320, "y": 400},
        {"id": "out_ticket", "kind": "output", "label": "工单概览",
         "config": {"name": "ticket_summary", "display_name": "工单概览"},
         "x": 580, "y": 400},
    ]
    edges = [
        {"from": "src_orders", "to": "join_region"},
        {"from": "src_cust", "to": "join_region"},
        {"from": "join_region", "to": "out_region"},
        {"from": "src_ticket", "to": "agg_ticket"},
        {"from": "agg_ticket", "to": "out_ticket"},
    ]
    return {"steps": steps, "edges": edges}


def run_pipeline(pipeline_id: str) -> bool:
    """Validate then run the pipeline, polling to a terminal state. True on success."""
    validation = api("POST", f"{PIPELINE_URL}/pipelines/{pipeline_id}/validate")
    if not validation.get("ok"):
        log(f"!! 管道校验失败: {validation.get('message')}")
        return False
    log("-- 管道校验通过")
    run = api("POST", f"{PIPELINE_URL}/pipelines/{pipeline_id}/run")
    run_id = run["id"]
    log(f"-- 管道运行已启动 (run_id={run_id}),轮询中……")
    status = poll_status(f"{PIPELINE_URL}/runs/{run_id}", interval=4, timeout=480, label="管道")
    if status != "success":
        log(f"!! 管道运行未成功 (status={status})")
        return False
    log("-- 管道运行成功")
    return True


def step_pipeline(ds: dict[str, dict]) -> None:
    log("\n== 3. 管道 ==")
    existing = next(
        (p for p in rows_of(api("GET", f"{PIPELINE_URL}/pipelines")) if p["name"] == PIPELINE_NAME),
        None,
    )
    if existing:
        pid = existing["id"]
        outputs = rows_of(api("GET", f"{PIPELINE_URL}/pipelines/{pid}/outputs"))
        if outputs:
            log(f"-- 管道「{PIPELINE_NAME}」已存在且已产出 {len(outputs)} 个物料,跳过")
            record("3 管道", PIPELINE_NAME, "跳过")
            return
        log(f"-- 管道「{PIPELINE_NAME}」已存在但从未成功产出,触发一次运行")
        ok = run_pipeline(pid)
        record("3 管道", PIPELINE_NAME, "创建" if ok else "失败")
        if not ok:
            sys.exit(1)
        return

    created = api("POST", f"{PIPELINE_URL}/pipelines", {
        "name": PIPELINE_NAME, "description": "企业运营场景:区域销售概览 + 工单概览",
    })
    pid = created["id"]
    log(f"-- 已创建管道「{PIPELINE_NAME}」 (id={pid})")
    api("PUT", f"{PIPELINE_URL}/pipelines/{pid}/graph", build_graph(ds))
    log("-- 已写入管道图(2 个物料:区域销售概览 / 工单概览)")
    ok = run_pipeline(pid)
    record("3 管道", PIPELINE_NAME, "创建" if ok else "失败")
    if not ok:
        sys.exit(1)


# --- Step 4: ontology -----------------------------------------------------

def step_ontology(ds: dict[str, dict]) -> None:
    log("\n== 4. 本体 ==")
    existing_ot = {o["api_name"]: o for o in rows_of(api("GET", f"{ONTOLOGY_URL}/object-types"))}
    api_to_id: dict[str, str] = {a: o["id"] for a, o in existing_ot.items()}
    for spec in OBJECT_TYPES:
        if spec["api_name"] in existing_ot:
            log(f"-- 对象类型「{spec['display_name']}」已存在,跳过")
            record("4 本体/对象", spec["display_name"], "跳过")
            continue
        dataset = ds.get(spec["dataset"])
        if not dataset:
            log(f"!! 找不到数据集 {spec['dataset']},无法创建对象类型 {spec['api_name']}")
            record("4 本体/对象", spec["display_name"], "失败")
            sys.exit(1)
        created = api("POST", f"{ONTOLOGY_URL}/object-types", {
            "api_name": spec["api_name"],
            "display_name": spec["display_name"],
            "dataset_id": dataset["id"],
            "primary_key": spec["primary_key"],
            "color": spec["color"],
            "x": spec["x"], "y": spec["y"],
        })
        api_to_id[spec["api_name"]] = created["id"]
        log(f"-- 已创建对象类型「{spec['display_name']}」 ({spec['api_name']})")
        record("4 本体/对象", spec["display_name"], "创建")

    existing_lt = rows_of(api("GET", f"{ONTOLOGY_URL}/link-types"))
    lt_api = {lt["api_name"] for lt in existing_lt}
    lt_triples = {
        (lt["from_object_type_id"], lt["to_object_type_id"], lt["display_name"])
        for lt in existing_lt
    }
    for spec in LINK_TYPES:
        from_id = api_to_id.get(spec["from_"])
        to_id = api_to_id.get(spec["to"])
        triple = (from_id, to_id, spec["display_name"])
        if spec["api_name"] in lt_api or triple in lt_triples:
            log(f"-- 链接类型「{spec['display_name']}」已存在,跳过")
            record("4 本体/链接", spec["display_name"], "跳过")
            continue
        api("POST", f"{ONTOLOGY_URL}/link-types", {
            "api_name": spec["api_name"],
            "display_name": spec["display_name"],
            "from_object_type_id": from_id,
            "to_object_type_id": to_id,
            "from_property": spec["from_property"],
            "to_property": spec["to_property"],
            "cardinality": "many_to_one",
        })
        log(f"-- 已创建链接类型「{spec['display_name']}」 ({spec['api_name']})")
        record("4 本体/链接", spec["display_name"], "创建")


# --- Step 5: governance ---------------------------------------------------

def step_governance() -> None:
    log("\n== 5. 治理分级 ==")
    for dataset, column, level in CLASSIFICATIONS:
        api("POST", f"{GOV_URL}/classifications", {
            "dataset_name": dataset, "column_name": column, "level": level,
        })
        log(f"-- {dataset}.{column} -> {level}")
        record("5 治理", f"{dataset}.{column}", "创建")


# --- Step 6: dataset display names ----------------------------------------

def step_labels(ds: dict[str, dict]) -> None:
    log("\n== 6. 数据集中文显示名 ==")
    for name, d in ds.items():
        label = LABELS.get(name)
        if label is None:
            continue
        if d.get("display_name") == label:
            log(f"-- {name} 显示名已是「{label}」,跳过")
            record("6 显示名", name, "跳过")
            continue
        api("PATCH", f"{DATA_URL}/datasets/{d['id']}", {"display_name": label})
        log(f"-- {name} -> {label}")
        record("6 显示名", name, "创建")


# --- Step 7: summary ------------------------------------------------------

def step_summary() -> int:
    log("\n== 7. 汇总 ==")
    w_step = max((len(s) for s, _, _ in SUMMARY), default=8)
    w_res = max((len(r) for _, r, _ in SUMMARY), default=8)
    log(f"{'步骤'.ljust(w_step)}  {'对象'.ljust(w_res)}  结果")
    log(f"{'-' * w_step}  {'-' * w_res}  ----")
    counts = {"创建": 0, "跳过": 0, "失败": 0}
    for step, resource, result in SUMMARY:
        counts[result] = counts.get(result, 0) + 1
        log(f"{step.ljust(w_step)}  {resource.ljust(w_res)}  {result}")
    log(f"\n合计: 创建 {counts.get('创建', 0)} / 跳过 {counts.get('跳过', 0)} / 失败 {counts.get('失败', 0)}")
    if counts.get("失败", 0):
        log("!! 存在失败项")
        return 1
    log("全部完成。")
    return 0


def main() -> int:
    step_health()
    login()
    connector_id = step_connector()
    step_sync(connector_id)
    ds = datasets_by_name()  # refreshed after sync; reused by later steps
    step_pipeline(ds)
    step_ontology(ds)
    step_governance()
    step_labels(datasets_by_name())  # re-fetch so marts created by the pipeline get labelled
    return step_summary()


if __name__ == "__main__":
    sys.exit(main())
