"""Domain enumerations (framework-agnostic)."""

from enum import StrEnum


class ConnectorStatus(StrEnum):
    IDLE = "idle"          # created, never synced
    SYNCING = "syncing"    # a sync run is in progress
    CONNECTED = "connected"  # last sync succeeded
    ERROR = "error"        # last sync failed


class SyncStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"


class DatasetLayer(StrEnum):
    RAW = "raw"            # landed as-is by ingestion (bronze)
    STAGING = "staging"    # cleaned by dbt (silver)
    MART = "mart"          # modeled for consumption (gold)
