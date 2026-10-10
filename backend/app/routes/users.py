from flask import Blueprint, g, jsonify, request

from ..extensions import db
from ..models import User
from ..services import serialize_user
from ..utils.security import err, login_required

bp = Blueprint("users", __name__, url_prefix="/api/users")


@bp.get("/search")
@login_required
def search():
    q = request.args.get("q", "").strip().lower()
    if not 1 <= len(q) <= 50:
        return jsonify(users=[])
    esc = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    rows = (User.query.filter(User.id != g.user.id,
                              db.or_(User.username.like(f"{esc}%", escape="\\"),
                                     db.func.lower(User.display_name).like(f"%{esc}%", escape="\\")))
            .order_by(User.username).limit(20).all())
    return jsonify(users=[serialize_user(u) for u in rows])


@bp.get("/<int:user_id>")
@login_required
def get_user(user_id):
    u = db.session.get(User, user_id)
    return jsonify(user=serialize_user(u)) if u else err("not_found", "User not found.", 404)


@bp.patch("/me")
@login_required
def update_me():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return err("validation", "Invalid request body.", 400)
    if "display_name" in data:
        name = str(data["display_name"]).strip()
        if not 1 <= len(name) <= 50:
            return err("validation", "Display name must be 1–50 characters.", 422, fields={"display_name": "1–50 characters."})
        g.user.display_name = name
    if "avatar_url" in data:
        avatar = str(data["avatar_url"] or "").strip()
        if avatar and (len(avatar) > 500 or not avatar.startswith(("https://", "http://"))):
            return err("validation", "Profile picture must be a valid HTTP(S) image URL.", 422)
        g.user.avatar_url = avatar or None
    if "bio" in data:
        bio = str(data["bio"] or "").strip()
        if len(bio) > 280:
            return err("validation", "Bio must be 280 characters or fewer.", 422, fields={"bio": "Max 280 characters."})
        g.user.bio = bio or None
    db.session.commit()
    return jsonify(user=serialize_user(g.user, private=True))
