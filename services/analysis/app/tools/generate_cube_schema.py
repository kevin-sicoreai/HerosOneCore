"""Generate a Cube schema (data model) from the live ontology + governance.

Run from the analysis service root (so ``app`` is importable):

    cd services/analysis
    python -m app.tools.generate_cube_schema [--out ../../cube/model]

It reads — over HTTP, with an internal service token — the ontology graph,
object-type details and link types, the data-plane dataset registry, and the
governance classifications, plus the in-repo metric catalog (``app.domain.metrics``),
then emits, into ``<out>``:

  * ``cubes/<api_name>.yml`` — one cube per object type: a ``read_parquet`` sql
    source, joins from that type's outgoing links, dimensions for every property
    (sensitive columns excluded, so Cube can never surface them as a slice), and
    measures translated from the metric catalog.
  * ``metric_map.json`` — how each self-built metric key maps onto Cube members
    (measure / matched_measure / per-dimension member / base cube), consumed by
    the /metrics/query Cube path.

Idempotent: the output ``cubes/`` directory is cleared and rewritten each run.
Zero third-party YAML dependency — the small, fixed-shape YAML is emitted by
hand (mind the indentation and quote escaping).
"""

from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path
from typing import Any

import httpx

from app.core.auth import service_headers
from app.core.config import settings
from app.domain.metrics import Dimension, Metric

# DuckDB numeric type prefixes -> Cube "number"; DATE/TIMESTAMP -> "time";
# everything else -> "string". Mirrors the analysis provider's numeric set.
_NUMERIC_TYPES = {
    "TINYINT", "SMALLINT", "INTEGER", "BIGINT", "HUGEINT",
    "FLOAT", "DOUBLE", "DECIMAL", "NUMERIC", "REAL",
}

_TIMEOUT = 15.0
_GOVERNANCE_URL = os.environ.get("GOVERNANCE_API_URL", "http://127.0.0.1:8004")

# Service root = services/analysis (this file is app/tools/generate_cube_schema.py).
_SERVICE_ROOT = Path(__file__).resolve().parents[2]


# --------------------------------------------------------------------------- #
# Fetch                                                                        #
# --------------------------------------------------------------------------- #
def _get(url: str, params: dict | None = None) -> Any:
    resp = httpx.get(url, params=params, headers=service_headers(), timeout=_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def _fetch_object_types() -> list[dict]:
    """Object types with full property lists (graph node + detail per node)."""
    graph = _get(f"{settings.ontology_service_url.rstrip('/')}/graph")
    out = []
    for node in graph.get("nodes", []):
        detail = _get(
            f"{settings.ontology_service_url.rstrip('/')}/object-types/{node['id']}"
        )
        out.append(detail)
    return out


def _fetch_link_types() -> list[dict]:
    return _get(f"{settings.ontology_service_url.rstrip('/')}/link-types")


def _fetch_datasets() -> list[dict]:
    """All datasets, unrolling the paged envelope."""
    base = settings.data_service_url.rstrip("/")
    items: list[dict] = []
    page = 1
    while True:
        payload = _get(f"{base}/datasets", params={"page": page, "page_size": 100})
        items.extend(payload.get("items", []))
        if page >= payload.get("pages", 1):
            break
        page += 1
    return items


def _fetch_classifications() -> list[dict]:
    return _get(f"{_GOVERNANCE_URL.rstrip('/')}/classifications")


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #
def _cube_type(data_type: str) -> str:
    base = data_type.split("(")[0].strip().upper()
    if base.startswith("DATE") or base.startswith("TIMESTAMP"):
        return "time"
    if base in _NUMERIC_TYPES:
        return "number"
    return "string"


def _parquet_path(dataset: dict) -> str:
    """storage_uri -> parquet path DuckDB reads: S3 URI as-is, else legacy /data mount."""
    uri = dataset["storage_uri"]
    if uri.startswith("s3://"):
        return uri
    filename = re.split(r"[\\/]", uri)[-1]
    layer = dataset.get("layer", "raw")
    sub = "mart" if layer == "mart" else "raw"
    return f"/data/{sub}/{filename}"


def _sql_str(value: Any) -> str:
    """A single-quoted SQL string literal with quote-escaping."""
    return "'" + str(value).replace("'", "''") + "'"


def _base_filter_clauses(metric: Metric) -> list[str]:
    """Metric base_filters -> ``{CUBE}.<prop> = '<val>'`` SQL clauses."""
    return [f"{{CUBE}}.{prop} = {_sql_str(val)}" for prop, val in metric.base_filters]


# --------------------------------------------------------------------------- #
# YAML emission                                                                #
# --------------------------------------------------------------------------- #
def _measure_lines(metric: Metric) -> list[str]:
    """YAML lines (6-space indented, under ``measures:``) for one metric + its
    ``_matched`` companion (a plain count in the same 口径, backing matched_rows)."""
    lines: list[str] = []
    clauses = _base_filter_clauses(metric)

    def _filters_block(indent: str, sql_clauses: list[str]) -> list[str]:
        if not sql_clauses:
            return []
        block = [f"{indent}filters:"]
        for c in sql_clauses:
            block.append(f'{indent}  - sql: "{c}"')
        return block

    # Main measure.
    lines.append(f"      - name: {metric.key}")
    lines.append(f"        title: {metric.label}")
    if metric.agg == "count":
        lines.append("        type: count")
        lines.extend(_filters_block("        ", clauses))
    elif metric.agg == "rate":
        # rate = share of rows meeting the numerator, percent. base_filters (if
        # any) restrict both numerator and denominator, so fold them into WHERE.
        prop, val = metric.numerator or ("", "")
        where = f"{{CUBE}}.{prop} = {_sql_str(val)}"
        if clauses:
            where_all = " AND ".join(clauses)
            expr = (
                f"ROUND(100.0 * COUNT(*) FILTER (WHERE {where} AND {where_all}) "
                f"/ NULLIF(COUNT(*) FILTER (WHERE {where_all}), 0), 1)"
            )
        else:
            expr = f"ROUND(100.0 * COUNT(*) FILTER (WHERE {where}) / COUNT(*), 1)"
        lines.append("        type: number")
        lines.append(f'        sql: "{expr}"')
    else:  # sum | avg | min | max
        lines.append(f"        type: {metric.agg}")
        lines.append(f"        sql: {metric.measure}")
        lines.extend(_filters_block("        ", clauses))

    # Matched companion: count of base rows in the metric's 口径.
    lines.append(f"      - name: {metric.key}_matched")
    lines.append(f"        title: {metric.label}·命中行数")
    lines.append("        type: count")
    lines.extend(_filters_block("        ", clauses))
    return lines


def _cube_yaml(
    ot: dict,
    dataset: dict,
    outgoing_links: list[dict],
    id_to_api: dict[str, str],
    sensitive: set[str],
    metrics: list[Metric],
) -> str:
    api_name = ot["api_name"]
    lines: list[str] = [
        f"# Generated from ontology object type '{api_name}'. Do not edit by hand —",
        "# regenerate with `python -m app.tools.generate_cube_schema`.",
        "cubes:",
        f"  - name: {api_name}",
        f"    sql: SELECT * FROM read_parquet('{_parquet_path(dataset)}')",
    ]

    if outgoing_links:
        lines.append("")
        lines.append("    joins:")
        for lk in outgoing_links:
            far = id_to_api.get(lk["to_object_type_id"])
            if not far:
                continue
            lines.append(f"      - name: {far}")
            lines.append(
                f'        sql: "{{CUBE}}.{lk["from_property"]} = '
                f'{{{far}}}.{lk["to_property"]}"'
            )
            lines.append("        relationship: many_to_one")

    lines.append("")
    lines.append("    dimensions:")
    for p in ot.get("properties", []):
        name = p["name"]
        # Sensitive columns are excluded so Cube can never expose them as a
        # dimension (a slice/filter would leak the raw value). They remain
        # available to measures as aggregates (a derived number is permitted).
        if name in sensitive:
            continue
        lines.append(f"      - name: {name}")
        lines.append(f"        sql: {name}")
        lines.append(f"        type: {_cube_type(p['data_type'])}")
        if p.get("is_primary_key"):
            lines.append("        primary_key: true")

    if metrics:
        lines.append("")
        lines.append("    measures:")
        for m in metrics:
            lines.extend(_measure_lines(m))

    return "\n".join(lines) + "\n"


# --------------------------------------------------------------------------- #
# metric_map.json                                                              #
# --------------------------------------------------------------------------- #
def _resolve_link_far_api(
    links: list[dict], dim: Dimension, base_id: str, id_to_api: dict[str, str]
) -> str:
    """api_name of the far object type a linked dimension joins to, reached from
    `base_id`. Resolution is by link id when the dimension carries one (stable
    across renames); otherwise it falls back to the link display_name."""
    for lk in links:
        if dim.via_link_id is not None:
            if lk["id"] != dim.via_link_id:
                continue
        elif lk["display_name"] != dim.via_link:
            continue
        if base_id == lk["from_object_type_id"]:
            return id_to_api[lk["to_object_type_id"]]
        if base_id == lk["to_object_type_id"]:
            return id_to_api[lk["from_object_type_id"]]
    ref = dim.via_link_id or dim.via_link
    raise ValueError(f"link '{ref}' not connected to object type {base_id}")


def _metric_map(
    metrics_by_type: dict[str, list[Metric]],
    api_to_id: dict[str, str],
    links: list[dict],
    id_to_api: dict[str, str],
) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for api_name, metrics in metrics_by_type.items():
        base_id = api_to_id[api_name]
        for m in metrics:
            dims: dict[str, str] = {}
            for d in m.dimensions:
                if d.via_link_id or d.via_link:
                    far = _resolve_link_far_api(links, d, base_id, id_to_api)
                    dims[d.key] = f"{far}.{d.property}"
                else:
                    dims[d.key] = f"{api_name}.{d.property}"
            out[m.key] = {
                "base_cube": api_name,
                "measure": f"{api_name}.{m.key}",
                "matched_measure": f"{api_name}.{m.key}_matched",
                "dimensions": dims,
            }
    return out


# --------------------------------------------------------------------------- #
# Entry point                                                                  #
# --------------------------------------------------------------------------- #
def generate(out_dir: Path, metrics: dict[str, Metric] | None = None) -> None:
    # Metric definitions are declarative and live in the DB; load them through
    # the service (single source of truth). Imported lazily to avoid a circular
    # import (metric_defs -> this module for regeneration).
    if metrics is None:
        from app.services import metric_defs

        metrics = metric_defs.get_metrics(force=True)

    object_types = _fetch_object_types()
    links = _fetch_link_types()
    datasets = _fetch_datasets()
    classifications = _fetch_classifications()

    id_to_api = {ot["id"]: ot["api_name"] for ot in object_types}
    api_to_id = {ot["api_name"]: ot["id"] for ot in object_types}
    ds_by_id = {d["id"]: d for d in datasets}
    ds_by_name = {d["name"]: d for d in datasets}

    # dataset identifier (id or name) -> sensitive column names.
    sensitive_by_ds: dict[str, set[str]] = {}
    for c in classifications:
        sensitive_by_ds.setdefault(c["dataset_name"], set()).add(c["column_name"])

    metrics_by_type: dict[str, list[Metric]] = {}
    for m in metrics.values():
        metrics_by_type.setdefault(m.base_type, []).append(m)

    cubes_dir = out_dir / "cubes"
    cubes_dir.mkdir(parents=True, exist_ok=True)
    # Idempotent: drop previously generated cube files before rewriting.
    for stale in cubes_dir.glob("*.yml"):
        stale.unlink()

    written: list[str] = []
    for ot in object_types:
        api_name = ot["api_name"]
        dataset = ds_by_id.get(ot.get("dataset_id"))
        if dataset is None:
            print(f"! skip '{api_name}': dataset {ot.get('dataset_id')} not found")
            continue
        # Sensitive columns: match the dataset by id or by name.
        sensitive = sensitive_by_ds.get(dataset["id"], set()) | sensitive_by_ds.get(
            dataset["name"], set()
        )
        outgoing = [lk for lk in links if lk["from_object_type_id"] == ot["id"]]
        yaml_text = _cube_yaml(
            ot, dataset, outgoing, id_to_api, sensitive, metrics_by_type.get(api_name, [])
        )
        (cubes_dir / f"{api_name}.yml").write_text(yaml_text, encoding="utf-8")
        written.append(api_name)

    metric_map = _metric_map(metrics_by_type, api_to_id, links, id_to_api)
    (out_dir / "metric_map.json").write_text(
        json.dumps(metric_map, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(f"Wrote {len(written)} cube(s) to {cubes_dir}: {', '.join(sorted(written))}")
    print(f"Wrote metric_map.json ({len(metric_map)} metrics) to {out_dir}")


def _resolve_out(raw: str) -> Path:
    p = Path(raw)
    return p if p.is_absolute() else (_SERVICE_ROOT / p).resolve()


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate the Cube schema from the ontology.")
    parser.add_argument(
        "--out",
        default="../../cube/model",
        help="Output model directory (default: ../../cube/model, relative to the service root).",
    )
    args = parser.parse_args()
    generate(_resolve_out(args.out))


if __name__ == "__main__":
    main()
