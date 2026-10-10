import os
from datetime import timedelta

from sqlalchemy.pool import StaticPool


def _db_url():
    url = os.environ.get("DATABASE_URL") or "sqlite:///commonroom-dev.db"
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg2://" + url[len("postgresql://"):]
    return url


class Config:
    ENV_NAME = "development"
    SECRET_KEY = os.environ.get("SECRET_KEY")
    SQLALCHEMY_DATABASE_URI = _db_url()
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    FRONTEND_ORIGINS = [o.strip() for o in os.environ.get("FRONTEND_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
    MAX_CONTENT_LENGTH = 64 * 1024
    MESSAGE_MAX_LENGTH = 2000
    SESSION_COOKIE_NAME = "commonroom_session"
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SECURE = False
    SESSION_COOKIE_SAMESITE = "Lax"
    PERMANENT_SESSION_LIFETIME = timedelta(days=14)
    RATELIMIT_ENABLED = True
    TRUST_PROXY = os.environ.get("TRUST_PROXY") == "1"


class Development(Config):
    pass


class Production(Config):
    ENV_NAME = "production"
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_SAMESITE = os.environ.get("SESSION_COOKIE_SAMESITE", "Lax")


class Testing(Config):
    ENV_NAME = "testing"
    SECRET_KEY = "test-only-secret"
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    RATELIMIT_ENABLED = False
    SQLALCHEMY_ENGINE_OPTIONS = {"poolclass": StaticPool, "connect_args": {"check_same_thread": False}}


CONFIGS = {"development": Development, "production": Production, "testing": Testing}
