"""Auth request/response models."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RoleOut(BaseModel):
    id: str
    name: str
    can_read: bool
    can_write: bool
    can_admin: bool
    member_count: int


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1)
    email: str | None = None
    role_ids: list[str] = Field(default_factory=list)


class UserRoleRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str


class UserOut(BaseModel):
    id: str
    username: str
    email: str | None
    is_active: bool
    created_at: datetime
    roles: list[UserRoleRef]


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class Permissions(BaseModel):
    can_read: bool
    can_write: bool
    can_admin: bool


class MeOut(BaseModel):
    id: str
    username: str
    roles: list[str]
    permissions: Permissions
