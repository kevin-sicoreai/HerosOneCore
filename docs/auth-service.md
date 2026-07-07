# Auth Service — Design

Identity & access management: users, roles, JWT login, and authorization. Source
of truth for roles across the platform (governance's access matrix reads it).

## Model

```
users       (id, username, email, password_hash, salt, is_active, created_at)
roles       (id, name, can_read, can_write, can_admin, ordinal)
user_roles  (user_id, role_id)   -- many-to-many
```

## Flow

```
POST /login {username,password}
  -> verify PBKDF2 hash
  -> issue HS256 JWT { sub, username, roles[], perms{read,write,admin}, exp }

GET /me  (Authorization: Bearer <jwt>)
  -> validate signature + expiry
  -> return identity + effective permissions
```

Effective permissions are the OR of the user's roles' flags.

## Crypto (stdlib only)

- Passwords: `hashlib.pbkdf2_hmac('sha256', ...)` with a per-user salt.
- Tokens: hand-rolled HS256 (`hmac`/`hashlib` + base64url) — no PyJWT/bcrypt, so
  it installs cleanly anywhere.

## Status

**Implemented & verified:** users CRUD, roles (seeded), `/login` → JWT, `/me`
authorization (rejects missing/tampered/expired tokens), effective permissions,
role member counts. Governance's access matrix now sources roles from here
(real users/roles instead of placeholders).

**Next:** gateway integration (validate JWT centrally, propagate identity to
services); per-resource authorization checks in data/pipeline/ontology; a login
UI in the frontend; refresh tokens; password reset; org/tenant scoping.
