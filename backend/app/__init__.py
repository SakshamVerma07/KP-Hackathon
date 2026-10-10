import logging
import os
import secrets

import click
from flask import Flask, jsonify
from sqlalchemy import text
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

from .config import CONFIGS
from .extensions import cors, db, migrate, socketio
from .utils.security import err, init_security


def create_app(env=None):
    env = env or os.environ.get("APP_ENV", "development")
    app = Flask(__name__)
    app.config.from_object(CONFIGS[env])
    if not app.config["SECRET_KEY"]:
        if env == "production":
            raise RuntimeError("SECRET_KEY must be set in production.")
        app.config["SECRET_KEY"] = secrets.token_hex(32)  # dev only: sessions reset on restart
    if app.config["TRUST_PROXY"]:
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("werkzeug").setLevel(logging.WARNING)  # request lines include no bodies/cookies; keep noise down

    from . import models  # noqa: F401  (register tables for Flask-Migrate)
    db.init_app(app)
    migrate.init_app(app, db)
    origins = app.config["FRONTEND_ORIGINS"]
    cors.init_app(app, resources={r"/api/*": {"origins": origins}}, supports_credentials=True,
                  allow_headers=["Content-Type", "X-CSRF-Token"], methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"])
    socketio.init_app(app, cors_allowed_origins=origins, async_mode="threading", ping_interval=25, ping_timeout=20)
    init_security(app)

    from .routes import auth, conversations, users
    for m in (auth, users, conversations):
        app.register_blueprint(m.bp)
    from . import sockets  # noqa: F401  (registers handlers)

    @app.get("/healthz")
    def healthz():
        return jsonify(status="ok")

    @app.get("/readyz")
    def readyz():
        try:
            db.session.execute(text("SELECT 1"))
            return jsonify(status="ready")
        except Exception:
            return jsonify(status="database_unavailable"), 503

    @app.errorhandler(HTTPException)
    def http_error(e):
        return err((e.name or "error").lower().replace(" ", "_"), e.description, e.code)

    @app.errorhandler(Exception)
    def unhandled(e):
        app.logger.exception("Unhandled error")
        return err("server_error", "Something went wrong.", 500)

    @app.cli.command("seed-dev")
    def seed_dev():
        """Create two demo users (development only). Passwords are random and printed once."""
        from werkzeug.security import generate_password_hash
        if app.config["ENV_NAME"] != "development":
            raise click.ClickException("seed-dev only runs in development.")
        for name in ("alice", "bob"):
            if not models.User.query.filter_by(username=name).first():
                pw = secrets.token_urlsafe(9)
                db.session.add(models.User(username=name, display_name=name.title(), email=f"{name}@example.test",
                                           password_hash=generate_password_hash(pw)))
                click.echo(f"{name}: {pw}")
        db.session.commit()

    return app
