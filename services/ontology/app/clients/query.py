"""DuckDB helpers to read object instances from a dataset's Parquet file.

Datasets may live on local disk or on MinIO/S3 (``s3://`` URIs); connections
are configured for S3 access from settings whenever needed.
"""

from typing import Any
from urllib.parse import urlparse

import duckdb

from app.core.config import settings


def _quote_ident(ident: str) -> str:
    return '"' + ident.replace('"', '""') + '"'


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


def count(uri: str) -> int:
    con = _connect(uri)
    n = con.execute("SELECT count(*) FROM read_parquet(?)", [uri]).fetchone()[0]
    con.close()
    return int(n)


def preview(uri: str, limit: int) -> dict[str, Any]:
    con = _connect(uri)
    describe = con.execute("DESCRIBE SELECT * FROM read_parquet(?)", [uri]).fetchall()
    columns = [row[0] for row in describe]
    rows = con.execute(f"SELECT * FROM read_parquet(?) LIMIT {int(limit)}", [uri]).fetchall()
    con.close()
    return {"columns": columns, "rows": [dict(zip(columns, r)) for r in rows]}


def filter_by(uri: str, column: str, value: str, limit: int) -> dict[str, Any]:
    """Rows where CAST(column AS VARCHAR) == value (string compare avoids type issues)."""
    con = _connect(uri)
    describe = con.execute("DESCRIBE SELECT * FROM read_parquet(?)", [uri]).fetchall()
    columns = [row[0] for row in describe]
    col = _quote_ident(column)
    rows = con.execute(
        f"SELECT * FROM read_parquet(?) WHERE CAST({col} AS VARCHAR) = ? LIMIT {int(limit)}",
        [uri, value],
    ).fetchall()
    con.close()
    return {"columns": columns, "rows": [dict(zip(columns, r)) for r in rows]}
