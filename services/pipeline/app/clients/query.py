"""DuckDB helpers to read Parquet outputs (row count, schema, preview)."""

from typing import Any

import duckdb


def parquet_stats(path: str) -> dict[str, Any]:
    con = duckdb.connect()
    row_count = con.execute("SELECT count(*) FROM read_parquet(?)", [path]).fetchone()[0]
    con.close()
    return {"row_count": int(row_count)}


def columns(path: str) -> list[dict[str, Any]]:
    con = duckdb.connect()
    describe = con.execute("DESCRIBE SELECT * FROM read_parquet(?)", [path]).fetchall()
    con.close()
    return [{"name": r[0], "data_type": r[1], "nullable": r[2] == "YES"} for r in describe]


def preview_parquet(path: str, limit: int) -> dict[str, Any]:
    con = duckdb.connect()
    describe = con.execute("DESCRIBE SELECT * FROM read_parquet(?)", [path]).fetchall()
    columns = [row[0] for row in describe]
    rows = con.execute(
        f"SELECT * FROM read_parquet(?) LIMIT {int(limit)}", [path]
    ).fetchall()
    con.close()
    return {"columns": columns, "rows": [dict(zip(columns, r)) for r in rows]}
