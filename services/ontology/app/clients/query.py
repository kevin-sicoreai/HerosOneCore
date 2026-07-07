"""DuckDB helpers to read object instances from a dataset's Parquet file."""

from typing import Any

import duckdb


def _quote_ident(ident: str) -> str:
    return '"' + ident.replace('"', '""') + '"'


def count(uri: str) -> int:
    con = duckdb.connect()
    n = con.execute("SELECT count(*) FROM read_parquet(?)", [uri]).fetchone()[0]
    con.close()
    return int(n)


def preview(uri: str, limit: int) -> dict[str, Any]:
    con = duckdb.connect()
    describe = con.execute("DESCRIBE SELECT * FROM read_parquet(?)", [uri]).fetchall()
    columns = [row[0] for row in describe]
    rows = con.execute(f"SELECT * FROM read_parquet(?) LIMIT {int(limit)}", [uri]).fetchall()
    con.close()
    return {"columns": columns, "rows": [dict(zip(columns, r)) for r in rows]}


def filter_by(uri: str, column: str, value: str, limit: int) -> dict[str, Any]:
    """Rows where CAST(column AS VARCHAR) == value (string compare avoids type issues)."""
    con = duckdb.connect()
    describe = con.execute("DESCRIBE SELECT * FROM read_parquet(?)", [uri]).fetchall()
    columns = [row[0] for row in describe]
    col = _quote_ident(column)
    rows = con.execute(
        f"SELECT * FROM read_parquet(?) WHERE CAST({col} AS VARCHAR) = ? LIMIT {int(limit)}",
        [uri, value],
    ).fetchall()
    con.close()
    return {"columns": columns, "rows": [dict(zip(columns, r)) for r in rows]}
