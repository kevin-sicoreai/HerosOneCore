"""Compile a visual pipeline graph into a runnable dbt (duckdb) project.

Mapping:
  source node     -> a dbt source (sources.yml, external Parquet)
  transform node  -> a dbt model (single input CTE named `input`)
  join node       -> a dbt model (two CTEs: `left_input`, `right_input`)
  output node     -> a dbt model materialized as an external Parquet file (mart)

Edges become dbt ref()/source() dependencies, so dbt derives the DAG and lineage.
"""

import os
import re
import shutil
from typing import Any
from urllib.parse import urlparse

from app.core.config import settings
from app.domain.dag import inputs_of
from app.domain.enums import StepKind

_PROFILE = "pipeline"
_PROJECT_NAME = "herosonecore_pipeline"


def _san(name: str) -> str:
    out = re.sub(r"\W", "_", name)
    if out and out[0].isdigit():
        out = "m_" + out
    return out or "m"


def _project_dir(pipeline_id: str) -> str:
    return os.path.abspath(os.path.join(settings.work_dir, pipeline_id))


def _mart_uri(pipeline_id: str, output_name: str) -> str:
    if settings.storage_backend == "s3":
        return f"s3://{settings.s3_bucket}/mart/{pipeline_id}/{_san(output_name)}.parquet"
    base = os.path.abspath(os.path.join(settings.mart_dir, pipeline_id))
    os.makedirs(base, exist_ok=True)
    return os.path.join(base, f"{_san(output_name)}.parquet")


def _profile_yaml(project_dir: str) -> str:
    """dbt-duckdb profile; loads httpfs + S3 credentials when the data plane is S3."""
    lines = [
        f"{_PROFILE}:",
        "  target: dev",
        "  outputs:",
        "    dev:",
        "      type: duckdb",
        f"      path: '{os.path.join(project_dir, 'warehouse.duckdb')}'",
        "      threads: 1",
    ]
    if settings.storage_backend == "s3":
        endpoint = urlparse(settings.s3_endpoint)
        lines += [
            "      extensions:",
            "        - httpfs",
            "      settings:",
            f"        s3_endpoint: '{endpoint.netloc}'",
            f"        s3_use_ssl: {'true' if endpoint.scheme == 'https' else 'false'}",
            "        s3_url_style: 'path'",
            f"        s3_access_key_id: '{settings.s3_access_key}'",
            f"        s3_secret_access_key: '{settings.s3_secret_key}'",
            f"        s3_region: '{settings.s3_region}'",
        ]
    return "\n".join(lines) + "\n"


def _ref_for(input_id: str, steps_by_id: dict, source_table: dict[str, str]) -> str:
    step = steps_by_id[input_id]
    if step.kind == StepKind.SOURCE:
        return "{{ source('raw', '" + source_table[input_id] + "') }}"
    return "{{ ref('" + _san(input_id) + "') }}"


def _transform_body(config: dict[str, Any]) -> str:
    """SQL body for a transform; raw SQL wins, else a structured operation."""
    if config.get("sql"):
        return config["sql"].strip()
    op = config.get("op")
    if op == "dedup":
        return "select distinct * from input"
    if op == "filter":
        return f"select * from input where {config['where']}"
    if op == "aggregate":
        group = ", ".join(config["group_by"])
        aggs = ", ".join(config["aggregations"])
        return f"select {group}, {aggs} from input group by {group}"
    return "select * from input"


def compile_project(pipeline, steps, edges, source_meta: dict[str, dict]) -> dict[str, Any]:
    """Write a dbt project for the pipeline. Returns project dir + output specs.

    source_meta: {source_step_id: {"name": <dataset name>, "storage_uri": <parquet>}}
    """
    edge_tuples = [(e.from_step, e.to_step) for e in edges]
    steps_by_id = {s.id: s for s in steps}

    # dbt source table name for each source step (its dataset name, sanitized-unique).
    source_table: dict[str, str] = {}
    used: set[str] = set()
    for s in steps:
        if s.kind == StepKind.SOURCE:
            base = _san(source_meta[s.id]["name"])
            name = base
            i = 1
            while name in used:
                name = f"{base}_{i}"
                i += 1
            used.add(name)
            source_table[s.id] = name

    project_dir = _project_dir(pipeline.id)
    models_dir = os.path.join(project_dir, "models")
    if os.path.isdir(project_dir):
        shutil.rmtree(project_dir)
    os.makedirs(models_dir, exist_ok=True)

    # dbt_project.yml + profiles.yml
    _write(project_dir, "dbt_project.yml",
           f"name: '{_PROJECT_NAME}'\n"
           "version: '1.0.0'\n"
           "config-version: 2\n"
           f"profile: '{_PROFILE}'\n"
           'model-paths: ["models"]\n')
    _write(project_dir, "profiles.yml", _profile_yaml(project_dir))

    # sources.yml
    src_lines = ["version: 2", "sources:", "  - name: raw", "    tables:"]
    for sid, table in source_table.items():
        uri = source_meta[sid]["storage_uri"]
        src_lines += [f"      - name: {table}",
                      "        meta:",
                      f"          external_location: '{uri}'"]
    _write(models_dir, "sources.yml", "\n".join(src_lines) + "\n")

    # one .sql per non-source step
    outputs: list[dict[str, Any]] = []
    for s in steps:
        if s.kind == StepKind.SOURCE:
            continue
        ins = inputs_of(s.id, edge_tuples)
        model = _san(s.id)

        if s.kind == StepKind.OUTPUT:
            out_name = s.config.get("name") or s.label or s.id
            uri = _mart_uri(pipeline.id, out_name)
            ref = _ref_for(ins[0], steps_by_id, source_table)
            sql = (
                "{{ config(materialized='external', location='"
                + uri.replace("'", "''")
                + "', format='parquet') }}\n"
                f"select * from {ref}\n"
            )
            # Mart file/model name stays English (out_name); display_name is an
            # optional Chinese label carried through to the data-service catalog.
            outputs.append({
                "step_id": s.id,
                "name": out_name,
                "display_name": s.config.get("display_name"),
                "storage_uri": uri,
                "model": model,
            })
        elif s.kind == StepKind.JOIN:
            r0 = _ref_for(ins[0], steps_by_id, source_table)
            r1 = _ref_for(ins[1], steps_by_id, source_table)
            body = s.config.get("sql")
            if not body:
                jt = s.config.get("type", "inner")
                lk, rk = s.config["left_key"], s.config["right_key"]
                body = f"select l.*, r.* from left_input l {jt} join right_input r on l.{lk} = r.{rk}"
            sql = (
                "{{ config(materialized='view') }}\n"
                f"with left_input as ( select * from {r0} ),\n"
                f"right_input as ( select * from {r1} )\n"
                f"{body.strip()}\n"
            )
        else:  # transform
            ref = _ref_for(ins[0], steps_by_id, source_table)
            sql = (
                "{{ config(materialized='view') }}\n"
                f"with input as ( select * from {ref} )\n"
                f"{_transform_body(s.config)}\n"
            )
        _write(models_dir, f"{model}.sql", sql)

    return {"project_dir": project_dir, "outputs": outputs}


def _write(directory: str, filename: str, content: str) -> None:
    os.makedirs(directory, exist_ok=True)
    with open(os.path.join(directory, filename), "w") as fh:
        fh.write(content)
