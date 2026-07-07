"""Static catalog of connector (source) types.

P0 implements PostgreSQL end-to-end. The rest are listed as catalog entries so
the frontend "connector catalog" can render them, but are not yet wired for
ingestion (``supported = False``). When Airbyte is introduced, this catalog is
populated from Airbyte's source definitions instead.
"""

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ConnectorType:
    type: str
    display_name: str
    category: str  # database | warehouse | object-storage | stream | saas | file
    supported: bool
    # JSON-schema-like description of the config fields the connector needs.
    config_fields: list[dict[str, Any]] = field(default_factory=list)


_POSTGRES_FIELDS: list[dict[str, Any]] = [
    {"name": "host", "type": "string", "required": True},
    {"name": "port", "type": "integer", "required": True, "default": 5432},
    {"name": "database", "type": "string", "required": True},
    {"name": "username", "type": "string", "required": True},
    {"name": "password", "type": "string", "required": True, "secret": True},
    {"name": "schema", "type": "string", "required": False, "default": "public"},
    {
        "name": "tables",
        "type": "array",
        "required": False,
        "description": "Specific tables to ingest; empty means all tables in the schema.",
    },
]


CONNECTOR_TYPES: list[ConnectorType] = [
    ConnectorType("postgres", "PostgreSQL", "database", True, _POSTGRES_FIELDS),
    ConnectorType("mysql", "MySQL", "database", False),
    ConnectorType("oracle", "Oracle", "database", False),
    ConnectorType("kafka", "Kafka", "stream", False),
    ConnectorType("sap", "SAP", "saas", False),
    ConnectorType("salesforce", "Salesforce", "saas", False),
    ConnectorType("snowflake", "Snowflake", "warehouse", False),
    ConnectorType("s3", "S3", "object-storage", False),
    ConnectorType("rest", "REST API", "saas", False),
    ConnectorType("mongodb", "MongoDB", "database", False),
    ConnectorType("bigquery", "BigQuery", "warehouse", False),
    ConnectorType("excel", "Excel", "file", False),
    # Internal container for datasets produced inside the platform (e.g. pipeline marts).
    ConnectorType("internal", "内部/管道产出", "internal", False),
]

_BY_TYPE = {ct.type: ct for ct in CONNECTOR_TYPES}


def get_connector_type(type_: str) -> ConnectorType | None:
    return _BY_TYPE.get(type_)


def is_supported(type_: str) -> bool:
    ct = _BY_TYPE.get(type_)
    return bool(ct and ct.supported)
