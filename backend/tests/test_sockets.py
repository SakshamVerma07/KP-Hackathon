from app.extensions import db
from app.models import Message


def _events(client, name):
    return [e["args"][0] for e in client.get_received() if e["name"] == name]


def test_unauthenticated_socket_is_refused(app):
    from app.extensions import socketio
    assert not socketio.test_client(app).is_connected()


def test_both_members_receive_and_stranger_does_not(chat):
    a, b, c, cid = chat
    sa, sb, sc = a.socket(), b.socket(), c.socket()
    ack = sa.emit("message:send", {"conversation_id": cid, "body": "hello", "client_id": "t1"}, callback=True)
    assert ack["ok"] and ack["client_id"] == "t1" and ack["message"]["sender_id"] == a.user["id"]
    assert db.session.get(Message, ack["message"]["id"]).body == "hello"  # persisted
    assert _events(sb, "message:new")[0]["message"]["body"] == "hello"
    assert _events(sa, "message:new")[0]["message"]["id"] == ack["message"]["id"]
    assert _events(sc, "message:new") == []


def test_non_member_cannot_join_or_send(chat):
    a, b, c, cid = chat
    sc = c.socket()
    assert sc.emit("join", {"conversation_id": cid}, callback=True)["ok"] is False
    r = sc.emit("message:send", {"conversation_id": cid, "body": "intruder"}, callback=True)
    assert r["ok"] is False and Message.query.count() == 0


def test_payload_sender_id_is_ignored(chat):
    a, b, _, cid = chat
    r = a.socket().emit("message:send", {"conversation_id": cid, "body": "x", "sender_id": b.user["id"]}, callback=True)
    assert r["message"]["sender_id"] == a.user["id"]


def test_logout_invalidates_open_socket(chat):
    a, b, _, cid = chat
    sa = a.socket()
    a.req("POST", "/api/auth/logout")
    r = sa.emit("message:send", {"conversation_id": cid, "body": "after logout"}, callback=True)
    assert (r or {}).get("ok") is not True and Message.query.count() == 0


def test_typing_only_reaches_members(chat):
    a, b, c, cid = chat
    sa, sb, sc = a.socket(), b.socket(), c.socket()
    sa.emit("typing", {"conversation_id": cid, "typing": True})
    assert _events(sb, "typing")[0]["user_id"] == a.user["id"]
    assert _events(sc, "typing") == []


def test_reconnecting_client_catches_up_from_database(chat):
    a, b, _, cid = chat
    sb = b.socket()
    sb.disconnect()
    a.socket().emit("message:send", {"conversation_id": cid, "body": "while you were away"}, callback=True)
    msgs = b.req("GET", f"/api/conversations/{cid}/messages").json["messages"]
    assert msgs[-1]["body"] == "while you were away"


def test_presence_counts_connections(chat):
    a, b, _, cid = chat
    from app import presence
    s1, s2 = a.socket(), a.socket()
    assert presence.is_online(a.user["id"])
    s1.disconnect()
    assert presence.is_online(a.user["id"])
    s2.disconnect()
    assert not presence.is_online(a.user["id"])
