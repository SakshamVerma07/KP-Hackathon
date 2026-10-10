import hmac
from functools import wraps

from flask import g, jsonify, request, session

from ..models import AuthSession

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
PUBLIC_UNSAFE = {"auth.register", "auth.login"}


def err(code, message, status, **extra):
    return jsonify({"error": {"code": code, "message": message, **extra}}), status


def current_auth():
    token = session.get("auth")
    if not token:
        return None
    return AuthSession.query.filter_by(token=token, revoked_at=None).first()


def login_required(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        auth = current_auth()
        if not auth:
            return err("unauthenticated", "Please sign in.", 401)
        g.auth, g.user = auth, auth.user
        return fn(*a, **kw)
    return wrapper


def init_security(app):
    @app.before_request
    def guard():
        if request.method in SAFE_METHODS or not request.path.startswith("/api/"):
            return None
        origin = request.headers.get("Origin")
        if origin and origin not in app.config["FRONTEND_ORIGINS"]:
            return err("bad_origin", "Origin not allowed.", 403)
        if request.endpoint in PUBLIC_UNSAFE or not session.get("auth"):
            return None  # unauthenticated requests fall through to 401 in login_required
        expected, sent = session.get("csrf"), request.headers.get("X-CSRF-Token", "")
        if not expected or not hmac.compare_digest(expected, sent):
            return err("csrf", "Missing or invalid CSRF token.", 403)
        return None

    @app.after_request
    def headers(resp):
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        if request.path.startswith("/api/"):
            resp.headers.setdefault("Cache-Control", "no-store")
        return resp
