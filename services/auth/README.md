# Auth Service

Identity & access for HerosOneCore: users, roles (read/write/admin), password login
issuing a **JWT**, and authorization via `/me`. It is the source of truth for the
roles shown in the governance access matrix.

> P0 uses standard-library crypto only: **PBKDF2** password hashing and a
> hand-rolled **HS256 JWT** (no external auth/crypto dependencies).

## Concepts

- **User** — username, email, PBKDF2 password hash, role assignments.
- **Role** — `can_read` / `can_write` / `can_admin` flags (the access matrix).
- **Login** — verifies the password and returns a signed JWT carrying the user's
  roles + effective permissions.
- **Authorization** — `/me` decodes/validates the bearer token and returns the
  caller's identity + permissions (the pattern the gateway/services will use).

Seeded on first start: the 5 default roles and a bootstrap `admin` / `admin` user
(平台管理员). Change these before any real use.

## Layout

```
app/
├── api/           auth (login/me), users, roles, deps (bearer -> current user)
├── services/      user_service, auth_service
├── repositories/  ORM: users, roles, user_roles
├── core/          config, db (+ seeding), logging, security (PBKDF2 + JWT)
└── schemas/       Pydantic DTOs
```

## Configuration

| Var | Default | Meaning |
|-----|---------|---------|
| `DATABASE_URL` | `sqlite:///./auth.db` | User/role store |
| `JWT_SECRET` | `dev-secret-change-me` | HS256 signing secret |
| `JWT_EXPIRE_MINUTES` | `720` | Token lifetime |
| `BOOTSTRAP_ADMIN_USERNAME` / `_PASSWORD` | `admin` / `admin` | Seeded admin |

## Run locally

```bash
cd services/auth
python3.12 -m venv .venv && source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload --port 8005
```

## API

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/login` | Username/password → JWT |
| GET | `/me` | Current user + permissions (Bearer token) |
| POST/GET | `/users` | Create / list users |
| GET | `/users/{id}` | Get a user |
| GET | `/roles` | Roles + member counts (governance reads this) |
