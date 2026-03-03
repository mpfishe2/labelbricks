import base64
import logging
import os
from io import BytesIO

from databricks.sdk import WorkspaceClient
from flask import Flask, jsonify, render_template, request, session
from PIL import Image

from libraries.volumes import VolumeClient

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Environment detection
IS_DEPLOYED = os.getenv("DATABRICKS_APP_NAME") is not None

# Initialize the Databricks Workspace Client (auto-detects credentials)
w = WorkspaceClient()

# Local temp directories (Phase 2 will eliminate temp file usage)
SAVE_IMG_FOLDER = "static/saved_images"
TEMP_IMAGE_DIR = "static/temp_images"
os.makedirs(SAVE_IMG_FOLDER, exist_ok=True)
os.makedirs(TEMP_IMAGE_DIR, exist_ok=True)

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", os.urandom(24).hex())


_local_user_info: dict[str, str] | None = None


def get_user_info() -> dict[str, str]:
    """Get user identity from proxy headers (deployed) or SDK current_user (local)."""
    global _local_user_info
    if IS_DEPLOYED:
        return {
            "user_name": request.headers.get("X-Forwarded-Preferred-Username", "Unknown"),
            "user_id": request.headers.get("X-Forwarded-User", "Unknown"),
            "user_email": request.headers.get("X-Forwarded-Email", "Unknown"),
        }
    # Local dev: fetch from SDK and cache
    if _local_user_info is None:
        try:
            me = w.current_user.me()
            _local_user_info = {
                "user_name": me.display_name or me.user_name or "local-user",
                "user_id": str(me.id) if me.id else "local",
                "user_email": me.emails[0].value if me.emails else "local-user@localhost",
            }
        except Exception:
            logger.warning("Could not fetch current user from SDK, using defaults")
            _local_user_info = {
                "user_name": "local-user",
                "user_id": "local",
                "user_email": "local-user@localhost",
            }
    return _local_user_info


def get_volume_client() -> VolumeClient:
    """Get a VolumeClient for the current session's selected volume."""
    volume_path = session.get("volume_path")
    if not volume_path:
        raise ValueError("No volume selected")
    return VolumeClient(w, volume_path)


@app.route("/")
def index() -> str:
    return render_template("set_volume.html")


@app.route("/render_image_annotator", methods=["POST"])
def render_image_annotator() -> str:
    catalog_name = request.form.get("catalog_name")
    schema_name = request.form.get("schema_name")
    volume_name = request.form.get("volume_name")
    img_dir_path = request.form.get("img_dir_path")
    volume_path = f"/Volumes/{catalog_name}/{schema_name}/{volume_name}"

    # Store in session for subsequent requests
    session["volume_path"] = volume_path

    vc = VolumeClient(w, volume_path)
    files = vc.list_files(img_dir_path, return_paths=True)
    files = [f for f in files if f.lower().endswith((".png", ".jpg", ".jpeg"))]
    return render_template("index.html", files=files, volumePath=volume_path)


@app.route("/fetch_image")
def fetch_image():
    user_info = get_user_info()
    user_email = user_info["user_email"]
    temp_image_dir_user = os.path.join(TEMP_IMAGE_DIR, user_email)
    os.makedirs(temp_image_dir_user, exist_ok=True)

    file_path = request.args.get("file_path")
    if not file_path:
        return jsonify({"error": "File path is required"}), 400

    logger.info("Fetching image: %s", file_path)
    local_image_path = os.path.join(temp_image_dir_user, os.path.basename(file_path))

    if os.path.exists(local_image_path):
        return jsonify({"image_path": f"/{local_image_path}"})

    # Clean up previous temp image (one at a time per user)
    existing = os.listdir(temp_image_dir_user)
    if existing:
        os.remove(os.path.join(temp_image_dir_user, existing[0]))

    try:
        vc = get_volume_client()
    except ValueError:
        # Fallback: derive volume path from file path
        volume_path = "/".join(file_path.split("/")[:-1])
        vc = VolumeClient(w, volume_path)

    local_image_path = vc.download_file(file_path, temp_image_dir_user)
    return jsonify({"image_path": f"/{local_image_path}"})


@app.route("/save_annotations", methods=["POST"])
def save_annotations():
    user_info = get_user_info()
    user_email = user_info["user_email"]

    data = request.get_json()
    logger.info("Saving annotations for user: %s", user_email)

    image_data = data.get("image")
    volume_path = data.get("volumePath")

    # Decode base64 image
    image_data = image_data.split(",")[1]
    image_bytes = base64.b64decode(image_data)

    # Save annotated image locally
    image = Image.open(BytesIO(image_bytes))
    temp_image_dir_user = os.path.join(TEMP_IMAGE_DIR, user_email)
    file_name = os.listdir(temp_image_dir_user)[0].split(".")[0] + ".png"
    image_path_dir = os.path.join(SAVE_IMG_FOLDER, user_email)
    image_path_file = os.path.join(SAVE_IMG_FOLDER, user_email, file_name)
    os.makedirs(image_path_dir, exist_ok=True)
    image.save(image_path_file)

    # Upload to UC Volume reviewed folder
    vc = VolumeClient(w, volume_path)
    review_path = f"{volume_path}/reviewed/{user_email}/{file_name}"
    logger.info("Uploading reviewed image to: %s", review_path)

    try:
        vc.upload_file(image_path_file, review_path)
        os.remove(image_path_file)
    except Exception:
        logger.exception("Failed to upload annotated image")

    try:
        os.remove(os.path.join(TEMP_IMAGE_DIR, user_email, file_name))
    except Exception:
        logger.exception("Failed to clean up temp image")

    return jsonify({"status": "success"})


if __name__ == "__main__":
    app.run(debug=True)
