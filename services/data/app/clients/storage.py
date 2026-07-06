"""Data-plane storage helper.

P0 writes Parquet to a local directory. The functions here are the seam that
later points at MinIO/S3 (Iceberg tables) without changing callers.
"""

import os

from app.core.config import settings


def _raw_dir(connector_id: str) -> str:
    base = os.path.abspath(settings.data_plane_dir)
    path = os.path.join(base, "raw", connector_id)
    os.makedirs(path, exist_ok=True)
    return path


def dataset_uri(connector_id: str, table: str) -> str:
    """Absolute path of the Parquet file backing a raw dataset."""
    return os.path.join(_raw_dir(connector_id), f"{table}.parquet")
