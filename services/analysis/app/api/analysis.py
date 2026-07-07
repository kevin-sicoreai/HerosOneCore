"""Analysis endpoints: table catalog and aggregation queries."""

from fastapi import APIRouter

from app.repositories.provider import provider
from app.schemas.analysis import AnalyzeRequest, AnalyzeResult, ColumnOut, TableOut
from app.services import analyze

router = APIRouter(tags=["analysis"])


def _table_out(t) -> TableOut:
    return TableOut(
        name=t.name,
        label=t.label,
        desc=t.desc,
        row_count=len(t.rows),
        columns=[ColumnOut(name=c.name, label=c.label, kind=c.kind) for c in t.columns],
    )


@router.get("/tables", response_model=list[TableOut])
def list_tables() -> list[TableOut]:
    return [_table_out(t) for t in provider.list_tables()]


@router.get("/tables/{name}", response_model=TableOut)
def get_table(name: str) -> TableOut:
    return _table_out(provider.get_table(name))


@router.post("/analyze", response_model=AnalyzeResult)
def run_analysis(req: AnalyzeRequest) -> AnalyzeResult:
    table = provider.get_table(req.table)
    return analyze.run(table, req)
