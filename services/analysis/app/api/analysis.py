"""Analysis endpoints: table catalog and aggregation queries."""

from fastapi import APIRouter, Header

from app.core import classifications
from app.core.audit import emit_sensitive_read
from app.core.auth import actor_from_authorization, perms_from_authorization
from app.repositories.provider import provider
from app.schemas.analysis import AnalyzeRequest, AnalyzeResult, ColumnOut, TableOut
from app.services import analyze

router = APIRouter(tags=["analysis"])


def _table_out(t) -> TableOut:
    return TableOut(
        name=t.name,
        label=t.label,
        desc=t.desc,
        row_count=t.row_count if t.row_count is not None else len(t.rows),
        columns=[
            ColumnOut(name=c.name, label=c.label, kind=c.kind, data_type=c.data_type)
            for c in t.columns
        ],
    )


@router.get("/tables", response_model=list[TableOut])
def list_tables() -> list[TableOut]:
    return [_table_out(t) for t in provider.list_tables()]


@router.get("/tables/{name}", response_model=TableOut)
def get_table(name: str) -> TableOut:
    return _table_out(provider.get_table(name))


@router.post("/analyze", response_model=AnalyzeResult)
def run_analysis(req: AnalyzeRequest, authorization: str | None = Header(default=None)) -> AnalyzeResult:
    table = provider.get_table(req.table)
    result = analyze.run(table, req)

    # Governance masking + audit — detail mode only. Analysis reads raw rows with
    # a service token (so aggregates over sensitive columns stay correct), which
    # means detail mode would otherwise hand plaintext to every caller. Aggregate
    # mode is not masked: aggregate values are derived numbers the platform policy
    # permits (e.g. 平均满意度 / 订单销售额合计), and the sensitive raw values never leave here.
    if result.mode == "detail":
        sensitive = classifications.sensitive_columns_for_table(table.name)
        # rows are keyed by field name; only columns present in this table matter.
        hit = sensitive & {c.name for c in table.columns}
        if hit:
            perms = perms_from_authorization(authorization)
            masked = not perms.get("can_admin")
            if masked:
                for row in result.rows:
                    for col in hit:
                        if col in row:
                            row[col] = "***"
            # Audit every sensitive read, masked or plaintext (target = table's
            # Chinese label so the trail reads in business terms).
            emit_sensitive_read(actor_from_authorization(authorization), table.label, masked)

    return result
