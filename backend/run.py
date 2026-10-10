import os
from app import create_app
from app.extensions import socketio

app = create_app()  # `gunicorn run:app` uses this object

if __name__ == "__main__":
    # Dev server. Must use socketio.run, not `flask run`.
    socketio.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)),
                 debug=app.config["ENV_NAME"] == "development", allow_unsafe_werkzeug=True)
