"""Link type request/response models."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class LinkTypeCreate(BaseModel):
    api_name: str = Field(min_length=1, max_length=128)
    display_name: str = Field(min_length=1, max_length=255)
    from_object_type_id: str
    to_object_type_id: str
    from_property: str
    to_property: str
    cardinality: str = "many_to_one"


class LinkTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    api_name: str
    display_name: str
    from_object_type_id: str
    to_object_type_id: str
    from_property: str
    to_property: str
    cardinality: str
    created_at: datetime
