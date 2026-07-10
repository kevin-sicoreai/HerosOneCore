# PoC Superset config: allow the platform shell (localhost:3000) to embed
# Superset in an iframe. Talisman injects frame-ancestors 'self' by default,
# which blocks cross-origin framing — off for the PoC. Production embedding
# uses EMBEDDED_SUPERSET + guest tokens instead of an open frame policy.
TALISMAN_ENABLED = False

FEATURE_FLAGS = {
    # Groundwork for P2 guest-token embedding of dashboards.
    "EMBEDDED_SUPERSET": True,
}

# Dev-only CORS towards the platform shell.
ENABLE_CORS = True
CORS_OPTIONS = {
    "supports_credentials": True,
    "allow_headers": ["*"],
    "resources": ["*"],
    "origins": ["http://localhost:3000", "http://127.0.0.1:3000"],
}
