"""Backfill Chinese display names onto the HR datasets (name stays English).

Dataset `name` is the English identifier (source table / mart name);
`display_name` is the Chinese label shown in the UI. Raw datasets are created
by connector sync without a display name, so this script PATCHes them once.
Idempotent: re-running just re-applies the same labels.

    python scripts/seed/seed_dataset_labels.py

Override endpoints / credentials via env: DATA_URL, AUTH_URL, ADMIN_USER, ADMIN_PASS.
"""

import json
import os
import sys
import urllib.request

DATA_URL = os.environ.get("DATA_URL", "http://127.0.0.1:8000")
AUTH_URL = os.environ.get("AUTH_URL", "http://127.0.0.1:8005")
ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "admin")

# English dataset name -> Chinese display name.
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
    # Pipeline marts (registered with a display name by the pipeline itself;
    # kept here so a re-run also repairs them if needed).
    "dept_hr_summary": "部门人力概览",
    "recruiting_funnel": "招聘漏斗",
}


def req(method: str, url: str, body: dict | None = None, token: str | None = None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, method=method, headers=headers)
    resp = urllib.request.urlopen(r, timeout=30)
    text = resp.read().decode()
    return json.loads(text) if text else {}


def main() -> int:
    tok = req("POST", f"{AUTH_URL}/login", {"username": ADMIN_USER, "password": ADMIN_PASS})
    token = tok.get("access_token") or tok.get("token")
    if not token:
        print("!! failed to obtain admin token", file=sys.stderr)
        return 1

    ds = req("GET", f"{DATA_URL}/datasets?limit=100")
    rows = ds if isinstance(ds, list) else ds.get("items", [])
    patched = skipped = 0
    for d in rows:
        label = LABELS.get(d["name"])
        if label is None:
            skipped += 1
            continue
        req("PATCH", f"{DATA_URL}/datasets/{d['id']}", {"display_name": label}, token)
        print(f"-- {d['name']} -> {label}")
        patched += 1
    print(f"Done: {patched} labelled, {skipped} skipped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
