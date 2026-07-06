# CLAUDE.md

For the overall project description, repository layout, and development conventions, see **[AGENTS.md](./AGENTS.md)** — read it first. This file only adds Claude Code–specific notes.

## Key reminders

- **Write all code comments and documentation in English** (project-wide convention).
- **The Python microservices are mostly empty skeletons** (`services/*` contains only directories + `.gitkeep`). Before implementing a service, fill in its entry point (`app/main.py`, etc.) per the service template in `AGENTS.md`.
- **No shared libraries**: do not create a root-level common package for reuse; keep common code in each service's `app/core/`.
- **The frontend Next.js is a version with breaking changes**: read `apps/web/AGENTS.md` before touching the frontend — do not rely on older APIs from training data.
- **The frontend only talks to `gateway`**: route new frontend/backend interactions through the gateway, not directly to a service.

## Common commands

```bash
# Frontend
cd apps/web && npm install && npm run dev

# Backend service (each is independent; example)
cd services/<name> && <install & start per that service's pyproject.toml>
```
