"""Data-plane storage helper.

Where raw Parquet lands is decided by ``settings.storage_backend``:
  s3    -> s3://{bucket}/raw/{connector_id}/{table}.parquet on MinIO/S3
  local -> {data_plane_dir}/raw/{connector_id}/{table}.parquet (fallback)
Callers only ever see a URI, so switching backends never touches them.
"""

import os

from app.core.config import settings


def _raw_dir(connector_id: str) -> str:
    base = os.path.abspath(settings.data_plane_dir)
    path = os.path.join(base, "raw", connector_id)
    os.makedirs(path, exist_ok=True)
    return path


def dataset_uri(connector_id: str, table: str) -> str:
    """URI of the Parquet object/file backing a raw dataset."""
    if settings.storage_backend == "s3":
        return f"s3://{settings.s3_bucket}/raw/{connector_id}/{table}.parquet"
    return os.path.join(_raw_dir(connector_id), f"{table}.parquet")
