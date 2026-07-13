"""DuckDB helpers to read Parquet outputs (row count, schema, preview).

Outputs may live on local disk or on MinIO/S3 (``s3://`` URIs); connections
are configured for S3 access from settings whenever needed.
"""

from typing import Any
from urllib.parse import urlparse

import duckdb

from app.core.config import settings


def _connect(uri: str) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    if uri.startswith("s3://"):
        endpoint = urlparse(settings.s3_endpoint)
        con.execute("INSTALL httpfs; LOAD httpfs;")
        con.execute(f"SET s3_endpoint='{endpoint.netloc}'")
        con.execute(f"SET s3_use_ssl={'true' if endpoint.scheme == 'https' else 'false'}")
        con.execute("SET s3_url_style='path'")  # MinIO uses path-style addressing
        con.execute(f"SET s3_access_key_id='{settings.s3_access_key}'")
        con.execute(f"SET s3_secret_access_key='{settings.s3_secret_key}'")
        con.execute(f"SET s3_region='{settings.s3_region}'")
    return con


def parquet_stats(path: str) -> dict[str, Any]:
    con = _connect(path)
    row_count = con.execute("SELECT count(*) FROM read_parquet(?)", [path]).fetchone()[0]
    con.close()
    return {"row_count": int(row_count)}


def columns(path: str) -> list[dict[str, Any]]:
    con = _connect(path)
    describe = con.execute("DESCRIBE SELECT * FROM read_parquet(?)", [path]).fetchall()
    con.close()
    return [{"name": r[0], "data_type": r[1], "nullable": r[2] == "YES"} for r in describe]


def preview_parquet(path: str, limit: int) -> dict[str, Any]:
    con = _connect(path)
    describe = con.execute("DESCRIBE SELECT * FROM read_parquet(?)", [path]).fetchall()
    columns = [row[0] for row in describe]
    rows = con.execute(
        f"SELECT * FROM read_parquet(?) LIMIT {int(limit)}", [path]
    ).fetchall()
    con.close()
    return {"columns": columns, "rows": [dict(zip(columns, r)) for r in rows]}
