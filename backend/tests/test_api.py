from app.extensions import db
from app.models import Message, User


def test_register_hashes_password_and_hides_it(make_user, app):
    a = make_user("alice")
    u = db.session.query(User).filter_by(username="alice").one()
    assert u.password_hash != "correct-horse-1" and u.password_hash.startswith(("scrypt:", "pbkdf2:"))
    assert "password" not in str(a.user)


def test_duplicates_rejected_generically(make_user):
    a = make_user("alice")
    r = a.http.post("/api/auth/register", json={"username": "ALICE", "email": "x@example.test", "password": "correct-horse-1"})
    assert r.status_code == 409 and "unavailable" in r.json["error"]["message"]


def test_register_validation(app):
    r = app.test_client().post("/api/auth/register", json={"username": "a", "email": "nope", "password": "short"})
    assert r.status_code == 422 and set(r.json["error"]["fields"]) == {"username", "email", "password"}


def test_login_logout_and_protection(make_user, app):
    a = make_user("alice")
    assert a.req("GET", "/api/auth/me").status_code == 200
    assert a.req("POST", "/api/auth/logout").status_code == 200
    assert a.req("GET", "/api/auth/me").status_code == 401
    anon = app.test_client()
    assert anon.get("/api/conversations").status_code == 401
    bad = anon.post("/api/auth/login", json={"identifier": "alice", "password": "wrong-password"})
    assert bad.status_code == 401
    good = anon.post("/api/auth/login", json={"identifier": "alice@example.test", "password": "correct-horse-1"})
    assert good.status_code == 200


def test_csrf_required_for_authenticated_writes(make_user):
    a = make_user("alice")
    r = a.http.post("/api/auth/logout")  # no X-CSRF-Token
    assert r.status_code == 403


def test_non_member_cannot_read_or_send(chat):
    a, b, c, cid = chat
    assert c.req("GET", f"/api/conversations/{cid}").status_code == 404
    assert c.req("GET", f"/api/conversations/{cid}/messages").status_code == 404
    assert c.req("POST", f"/api/conversations/{cid}/messages", {"body": "hi"}).status_code == 404


def test_sender_cannot_be_spoofed_and_message_persists(chat):
    a, b, c, cid = chat
    r = a.req("POST", f"/api/conversations/{cid}/messages", {"body": " hello ", "sender_id": b.user["id"]})
    assert r.status_code == 201 and r.json["message"]["sender_id"] == a.user["id"]
    assert db.session.get(Message, r.json["message"]["id"]).body == "hello"


def test_invalid_and_oversized_messages(chat):
    a, _, _, cid = chat
    url = f"/api/conversations/{cid}/messages"
    assert a.req("POST", url, {"body": "   "}).status_code == 422
    assert a.req("POST", url, {"body": "x" * 2001}).status_code == 422
    assert a.req("POST", url, {"body": 5}).status_code == 422


def test_direct_conversation_is_not_duplicated(chat):
    a, b, _, cid = chat
    again = b.req("POST", "/api/conversations/direct", {"user_id": a.user["id"]})
    assert again.status_code == 200 and again.json["conversation"]["id"] == cid
    assert a.req("POST", "/api/conversations/direct", {"user_id": a.user["id"]}).status_code == 422


def test_history_pagination_and_inbox(chat):
    a, b, _, cid = chat
    for i in range(7):
        a.req("POST", f"/api/conversations/{cid}/messages", {"body": f"m{i}"})
    p1 = b.req("GET", f"/api/conversations/{cid}/messages?limit=3").json
    assert [m["body"] for m in p1["messages"]] == ["m4", "m5", "m6"] and p1["has_more"]
    p2 = b.req("GET", f"/api/conversations/{cid}/messages?limit=3&before={p1['messages'][0]['id']}").json
    assert [m["body"] for m in p2["messages"]] == ["m1", "m2", "m3"]
    assert b.req("GET", f"/api/conversations/{cid}/messages?limit=abc").status_code == 422
    inbox = b.req("GET", "/api/conversations").json["conversations"][0]
    assert inbox["unread_count"] == 7 and inbox["last_message"]["body"] == "m6"
    b.req("POST", f"/api/conversations/{cid}/read")
    assert b.req("GET", "/api/conversations").json["conversations"][0]["unread_count"] == 0


def test_user_search_excludes_self(chat):
    a, b, _, _ = chat
    names = [u["username"] for u in a.req("GET", "/api/users/search?q=b").json["users"]]
    assert names == ["bob"]
    assert "alice" not in [u["username"] for u in a.req("GET", "/api/users/search?q=al").json["users"]]
