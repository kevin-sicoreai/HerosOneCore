"""One-shot bootstrap of the HR scenario's platform metadata.

Once the HR source database has been seeded (scripts/seed/seed_hr.sh) and the
five services are up, this script wires the whole scenario end to end:

    connector -> sync -> pipeline (marts) -> ontology -> governance -> labels

so the demo is ready without any manual clicking in the UI.

Idempotent: every step first checks whether its resource already exists and
skips (printing "已存在,跳过") instead of duplicating it. Re-running is safe.

Zero third-party dependencies (standard library urllib/json only).

    python scripts/seed/bootstrap_hr.py

Endpoints / credentials are overridable via env:
    AUTH_URL DATA_URL PIPELINE_URL ONTOLOGY_URL GOV_URL ADMIN_USER ADMIN_PASS
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

AUTH_URL = os.environ.get("AUTH_URL", "http://127.0.0.1:8005")
DATA_URL = os.environ.get("DATA_URL", "http://127.0.0.1:8000")
PIPELINE_URL = os.environ.get("PIPELINE_URL", "http://127.0.0.1:8001")
ONTOLOGY_URL = os.environ.get("ONTOLOGY_URL", "http://127.0.0.1:8003")
GOV_URL = os.environ.get("GOV_URL", "http://127.0.0.1:8004")
ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "admin")

# The 14 raw HR tables the connector sync is expected to land.
HR_TABLES = [
    "employees", "departments", "positions", "attendance", "payroll",
    "applications", "performance_reviews", "trainings", "training_records",
    "promotions", "transfers", "leaves", "interviews", "contracts",
]

# English dataset name -> Chinese display name (raw tables + pipeline marts).
# Kept in sync with scripts/seed/seed_dataset_labels.py.
LABELS = {
    "employees": "员工",
    "departments": "部门",
    "positions": "职位",
    "attendance": "考勤记录",
    "payroll": "薪酬发放",
    "applications": "招聘投递",
    "performance_reviews": "绩效考核",
    "trainings": "培训课程",
    "training_records": "培训记录",
    "promotions": "晋升记录",
    "transfers": "调动记录",
    "leaves": "请假记录",
    "interviews": "面试记录",
    "contracts": "劳动合同",
    "dept_hr_summary": "部门人力概览",
    "recruiting_funnel": "招聘漏斗",
}

# (dataset_name, column_name, level) sensitive-column classifications.
CLASSIFICATIONS = [
    ("employees", "monthly_salary", "PII-薪酬"),
    ("payroll", "base_salary", "PII-薪酬"),
    ("payroll", "bonus", "PII-薪酬"),
    ("payroll", "total", "PII-薪酬"),
    ("performance_reviews", "score", "敏感-绩效"),
    ("performance_reviews", "rating", "敏感-绩效"),
]

# Ontology object types. dataset_id is resolved by dataset name at runtime.
OBJECT_TYPES = [
    {"api_name": "employee", "display_name": "员工", "dataset": "employees",
     "primary_key": "id", "color": "sky", "x": 220, "y": 420},
    {"api_name": "department", "display_name": "部门", "dataset": "departments",
     "primary_key": "id", "color": "violet", "x": 560, "y": 420},
    {"api_name": "position", "display_name": "职位", "dataset": "positions",
     "primary_key": "id", "color": "amber", "x": 390, "y": 560},
    {"api_name": "performance_review", "display_name": "绩效考核",
     "dataset": "performance_reviews", "primary_key": "id", "color": "emerald",
     "x": 220, "y": 560},
    {"api_name": "application", "display_name": "招聘投递", "dataset": "applications",
     "primary_key": "id", "color": "rose", "x": 560, "y": 560},
    {"api_name": "training_record", "display_name": "培训记录",
     "dataset": "training_records", "primary_key": "id", "color": "sky",
     "x": 60, "y": 490},
]

# Ontology link types. from_/to_ reference object types by api_name.
LINK_TYPES = [
    {"api_name": "employee_department", "display_name": "所属部门",
     "from_": "employee", "to": "department",
     "from_property": "department_id", "to_property": "id"},
    {"api_name": "employee_position", "display_name": "担任职位",
     "from_": "employee", "to": "position",
     "from_property": "position_id", "to_property": "id"},
    {"api_name": "position_department", "display_name": "职位归属",
     "from_": "position", "to": "department",
     "from_property": "department_id", "to_property": "id"},
    {"api_name": "review_employee", "display_name": "被考核人",
     "from_": "performance_review", "to": "employee",
     "from_property": "employee_id", "to_property": "id"},
    {"api_name": "application_position", "display_name": "应聘职位",
     "from_": "application", "to": "position",
     "from_property": "position_id", "to_property": "id"},
    {"api_name": "training_record_employee", "display_name": "参训员工",
     "from_": "training_record", "to": "employee",
     "from_property": "employee_id", "to_property": "id"},
]

# Join SQL for the dept_hr_summary mart. `left_input` is the employees source,
# `right_input` is the departments source (fixed by edge order below).
JOIN_DEPT_SQL = (
    "select r.id as department_id, r.name as department_name, r.city as city, "
    "r.headcount_plan as headcount_plan,\n"
    "  count(*) filter (where l.status = '在职') as headcount_active,\n"
    "  r.headcount_plan - count(*) filter (where l.status = '在职') as headcount_gap,\n"
    "  round(100.0 * count(*) filter (where l.status = '离职') / count(*), 2) as attrition_rate_pct,\n"
    "  round(avg(l.monthly_salary) filter (where l.status = '在职'), 2) as avg_salary\n"
    "from left_input l join right_input r on l.department_id = r.id\n"
    "group by r.id, r.name, r.city, r.headcount_plan"
)

# Aggregation SQL for the recruiting_funnel mart (single input named `input`).
FUNNEL_SQL = (
    "select stage, source, count(*) as candidates from input group by stage, source"
)

CONNECTOR_NAME = "hr source db"
PIPELINE_NAME = "人力数据加工"

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
    """Fetch every row of a list endpoint, paging through the Page shell if present.

    Bare-array endpoints ignore the extra query params and return in one shot.
    """
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
    """Poll a run resource until its status is terminal. Returns success/failed.

    success/failed are the terminal SyncStatus/RunStatus values; pending/running
    keep polling until the timeout elapses.
    """
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
    log("\n== 0. 健康检查 ==")
    services = {
        "auth": AUTH_URL, "data": DATA_URL, "pipeline": PIPELINE_URL,
        "ontology": ONTOLOGY_URL, "governance": GOV_URL,
    }
    down: list[str] = []
    for name, base in services.items():
        try:
            r = urllib.request.urlopen(f"{base}/health", timeout=10)
            if r.status == 200:
                log(f"-- {name} 就绪 ({base})")
            else:
                down.append(f"{name} (HTTP {r.status})")
        except Exception as exc:  # noqa: BLE001 - report any connectivity failure
            down.append(f"{name} ({base}: {exc})")
    if down:
        log("!! 以下服务未就绪:")
        for d in down:
            log(f"   - {d}")
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
        "config": {
            "host": "127.0.0.1", "port": 5432, "database": "hr",
            "username": "shop", "password": "shop", "schema": "public",
        },
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
    missing = [t for t in HR_TABLES if t not in present]
    if not missing:
        log(f"-- 全部 {len(HR_TABLES)} 张 HR 表已入库,跳过同步")
        record("2 同步", "14 张 HR 表", "跳过")
        return

    log(f"-- 缺少 {len(missing)} 张表: {', '.join(missing)},触发同步")
    run = api("POST", f"{DATA_URL}/connectors/{connector_id}/sync")
    run_id = run["id"]
    log(f"-- 同步已启动 (run_id={run_id}),轮询中……")
    status = poll_status(f"{DATA_URL}/syncs/{run_id}", interval=3, timeout=300, label="同步")
    if status != "success":
        log(f"!! 同步未成功 (status={status})")
        record("2 同步", "14 张 HR 表", "失败")
        sys.exit(1)
    log("-- 同步成功")
    record("2 同步", "14 张 HR 表", "创建")


# --- Step 3: pipeline -----------------------------------------------------

def build_graph(ds: dict[str, dict]) -> dict:
    """Assemble the two-mart pipeline graph from resolved dataset ids.

    Edge order for join_dept fixes left/right inputs: employees=left, departments=right.
    """
    steps = [
        {"id": "src_emp", "kind": "source", "label": "员工数据集",
         "config": {"dataset_id": ds["employees"]["id"]}, "x": 60, "y": 80},
        {"id": "src_dept", "kind": "source", "label": "部门",
         "config": {"dataset_id": ds["departments"]["id"]}, "x": 60, "y": 220},
        {"id": "join_dept", "kind": "join", "label": "部门关联",
         "config": {"sql": JOIN_DEPT_SQL}, "x": 320, "y": 150},
        {"id": "out_dept", "kind": "output", "label": "部门人力概览",
         "config": {"name": "dept_hr_summary", "display_name": "部门人力概览"},
         "x": 580, "y": 150},
        {"id": "src_app", "kind": "source", "label": "招聘投递",
         "config": {"dataset_id": ds["applications"]["id"]}, "x": 60, "y": 400},
        {"id": "agg_funnel", "kind": "transform", "label": "招聘漏斗聚合",
         "config": {"sql": FUNNEL_SQL}, "x": 320, "y": 400},
        {"id": "out_funnel", "kind": "output", "label": "招聘漏斗",
         "config": {"name": "recruiting_funnel", "display_name": "招聘漏斗"},
         "x": 580, "y": 400},
    ]
    edges = [
        {"from": "src_emp", "to": "join_dept"},
        {"from": "src_dept", "to": "join_dept"},
        {"from": "join_dept", "to": "out_dept"},
        {"from": "src_app", "to": "agg_funnel"},
        {"from": "agg_funnel", "to": "out_funnel"},
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
        "name": PIPELINE_NAME, "description": "HR 场景:部门人力概览 + 招聘漏斗",
    })
    pid = created["id"]
    log(f"-- 已创建管道「{PIPELINE_NAME}」 (id={pid})")
    api("PUT", f"{PIPELINE_URL}/pipelines/{pid}/graph", build_graph(ds))
    log("-- 已写入管道图(2 个物料:部门人力概览 / 招聘漏斗)")
    ok = run_pipeline(pid)
    record("3 管道", PIPELINE_NAME, "创建" if ok else "失败")
    if not ok:
        sys.exit(1)


# --- Step 4: ontology -----------------------------------------------------

def step_ontology(ds: dict[str, dict]) -> None:
    log("\n== 4. 本体 ==")
    # Object types (dedupe by api_name).
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

    # Link types (dedupe by api_name, fall back to (from,to,display_name)).
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
    # The /classifications endpoint is an idempotent upsert keyed on
    # (dataset_name, column_name), so we always POST and report as applied.
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
