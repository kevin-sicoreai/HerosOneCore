"""Client for talking to a PostgreSQL source system (connection test + introspection)."""

from typing import Any

import psycopg


def _conninfo(config: dict[str, Any]) -> str:
    return (
        f"host={config['host']} "
        f"port={config.get('port', 5432)} "
        f"dbname={config['database']} "
        f"user={config['username']} "
        f"password={config.get('password', '')}"
    )


def test_connection(config: dict[str, Any]) -> tuple[bool, str]:
    try:
        with psycopg.connect(_conninfo(config), connect_timeout=5) as conn:
            conn.execute("SELECT 1")
        return True, "Connection successful"
    except KeyError as exc:
        return False, f"Missing required config field: {exc}"
    except Exception as exc:  # noqa: BLE001 - surface any driver error to the caller
        return False, str(exc)


def list_tables(config: dict[str, Any]) -> list[str]:
    schema = config.get("schema", "public")
    with psycopg.connect(_conninfo(config), connect_timeout=5) as conn:
        rows = conn.execute(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = %s AND table_type = 'BASE TABLE'
            ORDER BY table_name
            """,
            (schema,),
        ).fetchall()
    return [r[0] for r in rows]
