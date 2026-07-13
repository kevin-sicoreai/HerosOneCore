"""DuckDB-based extract/load for PostgreSQL sources.

This is the P0 built-in loader that stands in for Airbyte: it attaches the
source database, copies a table to Parquet in the data plane, and reports the
resulting schema. It shares the same shape a future Airbyte loader would expose.
"""

from typing import Any
from urllib.parse import urlparse

import duckdb

from app.core.config import settings


def _configure_s3(con: duckdb.DuckDBPyConnection) -> None:
    """Load httpfs and point DuckDB at the MinIO/S3 endpoint from settings."""
    endpoint = urlparse(settings.s3_endpoint)
    con.execute("INSTALL httpfs; LOAD httpfs;")
    con.execute(f"SET s3_endpoint='{endpoint.netloc}'")
    con.execute(f"SET s3_use_ssl={'true' if endpoint.scheme == 'https' else 'false'}")
    con.execute("SET s3_url_style='path'")  # MinIO uses path-style addressing
    con.execute(f"SET s3_access_key_id='{settings.s3_access_key}'")
    con.execute(f"SET s3_secret_access_key='{settings.s3_secret_key}'")
    con.execute(f"SET s3_region='{settings.s3_region}'")


def _pg_attach_str(config: dict[str, Any]) -> str:
    return (
        f"host={config['host']} "
        f"port={config.get('port', 5432)} "
        f"dbname={config['database']} "
        f"user={config['username']} "
        f"password={config.get('password', '')}"
    )


def _quote_ident(ident: str) -> str:
    # Double-quote and escape embedded quotes for use in SQL identifiers.
    return '"' + ident.replace('"', '""') + '"'


def _connect(*, postgres: bool = False) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    if postgres:
        # Downloaded and cached on first use; requires network the first time.
        con.execute("INSTALL postgres; LOAD postgres;")
    if settings.storage_backend == "s3":
        _configure_s3(con)
    return con


def copy_table_to_parquet(
    config: dict[str, Any], table: str, dest_path: str
) -> dict[str, Any]:
    """Copy one source table to a Parquet file and return its row count + schema."""
    schema = config.get("schema", "public")
    con = _connect(postgres=True)
    con.execute(f"ATTACH '{_pg_attach_str(config)}' AS src (TYPE postgres, READ_ONLY)")

    src_ref = f"src.{_quote_ident(schema)}.{_quote_ident(table)}"
    safe_path = dest_path.replace("'", "''")
    con.execute(f"COPY (SELECT * FROM {src_ref}) TO '{safe_path}' (FORMAT PARQUET)")

    row_count = con.execute(
        "SELECT count(*) FROM read_parquet(?)", [dest_path]
    ).fetchone()[0]
    describe = con.execute(
        "DESCRIBE SELECT * FROM read_parquet(?)", [dest_path]
    ).fetchall()
    con.close()

    columns = [
        {"name": row[0], "data_type": row[1], "nullable": row[2] == "YES"}
        for row in describe
    ]
    return {"row_count": int(row_count), "columns": columns}


def preview_parquet(path: str, limit: int) -> dict[str, Any]:
    """Return the first ``limit`` rows of a Parquet file as column names + row dicts."""
    con = _connect()
    describe = con.execute("DESCRIBE SELECT * FROM read_parquet(?)", [path]).fetchall()
    columns = [row[0] for row in describe]
    rows = con.execute(
        f"SELECT * FROM read_parquet(?) LIMIT {int(limit)}", [path]
    ).fetchall()
    con.close()
    return {"columns": columns, "rows": [dict(zip(columns, r)) for r in rows]}
