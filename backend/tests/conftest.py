import pytest

from app import create_app
from app.extensions import db, socketio


class Api:
    """Cookie-holding client that sends the CSRF header like the React app does."""

    def __init__(self, app):
        self.app, self.http, self.csrf, self.user = app, app.test_client(), None, None

    def req(self, method, url, json=None):
        headers = {"X-CSRF-Token": self.csrf} if self.csrf else {}
        return self.http.open(url, method=method, json=json, headers=headers)

    def register(self, name):
        r = self.req("POST", "/api/auth/register",
                     {"username": name, "email": f"{name}@example.test", "password": "correct-horse-1"})
        assert r.status_code == 201, r.json
        self.csrf, self.user = r.json["csrf_token"], r.json["user"]
        return self

    def socket(self):
        return socketio.test_client(self.app, flask_test_client=self.http)


@pytest.fixture
def app():
    app = create_app("testing")
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def make_user(app):
    return lambda name: Api(app).register(name)


@pytest.fixture
def chat(make_user):
    """alice <-> bob direct conversation plus an unrelated carol."""
    a, b, c = make_user("alice"), make_user("bob"), make_user("carol")
    conv = a.req("POST", "/api/conversations/direct", {"user_id": b.user["id"]}).json["conversation"]
    return a, b, c, conv["id"]
