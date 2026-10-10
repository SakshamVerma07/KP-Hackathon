import re
import secrets

from flask import Blueprint, g, jsonify, request, session
from sqlalchemy.exc import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash

from ..extensions import db
from ..models import AuthSession, User, utcnow
from ..services import serialize_user
from ..utils.ratelimit import rate_limit
from ..utils.security import err, login_required

bp = Blueprint("auth", __name__, url_prefix="/api/auth")
USERNAME_RE = re.compile(r"^[a-z0-9_]{3,24}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_DUMMY_HASH = generate_password_hash("not-a-real-password")  # flattens login timing for unknown users


def _start_session(user, status=200):
    session.clear()  # new session on login: prevents fixation
    token = secrets.token_urlsafe(32)
    db.session.add(AuthSession(token=token, user_id=user.id))
    user.last_seen_at = utcnow()
    db.session.commit()
    session["auth"], session["csrf"], session.permanent = token, secrets.token_urlsafe(32), True
    return jsonify(user=serialize_user(user, private=True), csrf_token=session["csrf"]), status


@bp.post("/register")
@rate_limit("register", 10, 3600)
def register():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return err("validation", "Invalid request body.", 400)
    username = str(data.get("username", "")).strip().lower()
    email = str(data.get("email", "")).strip().lower()
    password = data.get("password", "")
    display = str(data.get("display_name", "")).strip() or username
    fields = {}
    if not USERNAME_RE.match(username):
        fields["username"] = "3–24 characters: letters, numbers, underscores."
    if not EMAIL_RE.match(email) or len(email) > 254:
        fields["email"] = "Enter a valid email address."
    if not isinstance(password, str) or not 8 <= len(password) <= 128:
        fields["password"] = "Use 8–128 characters."
    if len(display) > 50:
        fields["display_name"] = "Keep it under 50 characters."
    if fields:
        return err("validation", "Please fix the highlighted fields.", 422, fields=fields)
    if User.query.filter((User.username == username) | (User.email == email)).first():
        return err("unavailable", "That username or email is unavailable.", 409)
    user = User(username=username, email=email, display_name=display, password_hash=generate_password_hash(password))
    db.session.add(user)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return err("unavailable", "That username or email is unavailable.", 409)
    return _start_session(user, 201)


@bp.post("/login")
@rate_limit("login", 10, 60)
def login():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return err("validation", "Invalid request body.", 400)
    ident = str(data.get("identifier", "")).strip().lower()
    password = data.get("password", "")
    user = User.query.filter_by(email=ident).first() if "@" in ident else User.query.filter_by(username=ident).first()
    ok = check_password_hash(user.password_hash if user else _DUMMY_HASH, password if isinstance(password, str) else "")
    if not user or not ok:
        return err("invalid_credentials", "Incorrect username/email or password.", 401)
    return _start_session(user)


@bp.post("/logout")
@login_required
def logout():
    from ..sockets import disconnect_token
    token = g.auth.token
    g.auth.revoked_at = utcnow()
    db.session.commit()
    session.clear()
    disconnect_token(token)  # established sockets don't outlive the session
    return jsonify(ok=True)


@bp.get("/me")
@login_required
def me():
    if not session.get("csrf"):
        session["csrf"] = secrets.token_urlsafe(32)
    return jsonify(user=serialize_user(g.user, private=True), csrf_token=session["csrf"])
