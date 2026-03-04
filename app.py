import base64
import json
import logging
import os
from datetime import datetime, timezone
from io import BytesIO

from databricks.sdk import WorkspaceClient
from flask import Flask, Response, jsonify, render_template, request, session
from PIL import Image

from libraries.volumes import VolumeClient

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Environment detection
IS_DEPLOYED = os.getenv("DATABRICKS_APP_NAME") is not None

# Initialize the Databricks Workspace Client (auto-detects credentials)
w = WorkspaceClient()

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


# ---- Page Routes ----


@app.route("/")
def landing() -> str:
    return render_template("set_volume.html")


@app.route("/annotator")
def annotator() -> str:
    user_info = get_user_info()
    files = session.get("current_files", [])
    return render_template("index.html", user_email=user_info["user_email"], files=files)


# ---- Catalog / Schema / Volume Browser APIs ----


@app.route("/api/catalogs")
def api_catalogs():
    """List all catalogs the user has access to."""
    try:
        catalogs = [
            {"name": c.name, "comment": c.comment or ""}
            for c in w.catalogs.list()
            if c.name
        ]
        return jsonify(catalogs)
    except Exception:
        logger.exception("Failed to list catalogs")
        return jsonify({"error": "Failed to list catalogs"}), 500


@app.route("/api/schemas/<catalog>")
def api_schemas(catalog: str):
    """List schemas in a catalog."""
    try:
        schemas = [
            {"name": s.name, "comment": s.comment or ""}
            for s in w.schemas.list(catalog_name=catalog)
            if s.name
        ]
        return jsonify(schemas)
    except Exception:
        logger.exception("Failed to list schemas for catalog: %s", catalog)
        return jsonify({"error": "Failed to list schemas"}), 500


@app.route("/api/volumes/<catalog>/<schema>")
def api_volumes(catalog: str, schema: str):
    """List volumes in a schema."""
    try:
        volumes = [
            {
                "name": v.name,
                "full_name": v.full_name,
                "volume_type": v.volume_type.value if v.volume_type else None,
            }
            for v in w.volumes.list(catalog_name=catalog, schema_name=schema)
            if v.name
        ]
        return jsonify(volumes)
    except Exception:
        logger.exception("Failed to list volumes for %s.%s", catalog, schema)
        return jsonify({"error": "Failed to list volumes"}), 500


@app.route("/api/directories/<path:volume_path>")
def api_directories(volume_path: str):
    """List contents of a volume directory."""
    if not volume_path.startswith("/"):
        volume_path = f"/{volume_path}"
    if not volume_path.startswith("/Volumes/"):
        volume_path = f"/Volumes/{volume_path}"
    try:
        items = []
        for item in w.files.list_directory_contents(volume_path):
            items.append({
                "name": item.name,
                "path": item.path,
                "is_directory": item.is_directory if hasattr(item, "is_directory") else not bool(item.name and "." in item.name.split("/")[-1]),
            })
        return jsonify(items)
    except Exception:
        logger.exception("Failed to list directory: %s", volume_path)
        return jsonify({"error": "Failed to list directory"}), 500


# ---- Volume Selection ----


@app.route("/api/set-volume", methods=["POST"])
def api_set_volume():
    """Set the active volume in the session and return image list."""
    data = request.get_json()
    catalog = data.get("catalog")
    schema = data.get("schema")
    volume = data.get("volume")
    directory = data.get("directory", "")

    volume_path = f"/Volumes/{catalog}/{schema}/{volume}"
    session["volume_path"] = volume_path
    session["image_directory"] = directory

    try:
        scan_path = f"{volume_path}/{directory}" if directory else volume_path
        image_files: list[str] = []
        for item in w.files.list_directory_contents(scan_path):
            if item.path and item.path.lower().endswith((".png", ".jpg", ".jpeg")):
                image_files.append(item.path)

        session["current_files"] = image_files
        return jsonify({
            "volume_path": volume_path,
            "directory": directory,
            "files": image_files,
            "count": len(image_files),
        })
    except Exception:
        logger.exception("Failed to list files in %s/%s", volume_path, directory)
        return jsonify({"error": "Failed to list files"}), 500


# ---- Image Streaming ----


@app.route("/api/image")
def api_image():
    """Stream a full-size image from Volume (replaces temp file pattern)."""
    file_path = request.args.get("file_path")
    if not file_path:
        return jsonify({"error": "file_path required"}), 400

    try:
        img_bytes = w.files.download(file_path).contents.read()
        ext = file_path.rsplit(".", 1)[-1].lower()
        content_types = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png"}
        content_type = content_types.get(ext, "image/png")
        return Response(
            img_bytes,
            mimetype=content_type,
            headers={"Cache-Control": "public, max-age=300"},
        )
    except Exception:
        logger.exception("Failed to stream image: %s", file_path)
        return jsonify({"error": "Failed to load image"}), 500


@app.route("/api/thumbnail")
def api_thumbnail():
    """Generate and return a thumbnail for a Volume image."""
    file_path = request.args.get("file_path")
    size = int(request.args.get("size", 80))
    if not file_path:
        return jsonify({"error": "file_path required"}), 400

    try:
        img_bytes = w.files.download(file_path).contents.read()
        img = Image.open(BytesIO(img_bytes))
        img.thumbnail((size, size))
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=70)
        buf.seek(0)
        return Response(
            buf.getvalue(),
            mimetype="image/jpeg",
            headers={"Cache-Control": "public, max-age=3600"},
        )
    except Exception:
        logger.exception("Failed to generate thumbnail: %s", file_path)
        return jsonify({"error": "Failed to generate thumbnail"}), 500


# ---- Helpers ----

# Track which volume paths have had their .labelbricks dirs created
_dirs_created: set[str] = set()


def _ensure_volume_dirs(volume_path: str) -> None:
    """Create .labelbricks/annotations/ and .labelbricks/composites/ dirs if needed."""
    if volume_path in _dirs_created:
        return
    for subdir in [".labelbricks", ".labelbricks/annotations", ".labelbricks/composites"]:
        try:
            w.files.create_directory(f"{volume_path}/{subdir}")
        except Exception:
            pass  # Already exists or parent created it
    _dirs_created.add(volume_path)


# ---- Annotation Save / Load ----


@app.route("/api/save", methods=["POST"])
def api_save():
    """Save structured annotations + composite PNG to Volume."""
    user_info = get_user_info()
    data = request.get_json()

    file_path = data.get("filePath")
    annotations = data.get("annotations", [])
    status = data.get("status", "pending")
    notes = data.get("notes", "")
    composite_png_b64 = data.get("compositeImage")

    volume_path = data.get("volumePath") or session.get("volume_path")

    if not file_path:
        return jsonify({"error": "filePath required"}), 400
    if not volume_path:
        return jsonify({"error": "No volume selected"}), 400

    filename = file_path.rsplit("/", 1)[-1]

    # Build annotation JSON
    annotation_data = {
        "filename": filename,
        "volume_path": volume_path,
        "reviewer": user_info["user_email"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "notes": notes,
        "annotations": annotations,
    }

    # Ensure .labelbricks directories exist
    _ensure_volume_dirs(volume_path)

    # Save JSON to .labelbricks/annotations/{filename}.json
    json_path = f"{volume_path}/.labelbricks/annotations/{filename}.json"
    json_bytes = json.dumps(annotation_data, indent=2).encode("utf-8")

    try:
        w.files.upload(json_path, BytesIO(json_bytes), overwrite=True)
    except Exception:
        logger.exception("Failed to save annotation JSON: %s", json_path)
        return jsonify({"error": "Failed to save annotations"}), 500

    # Save composite PNG if provided
    if composite_png_b64:
        try:
            png_data = base64.b64decode(composite_png_b64.split(",")[1])
            png_path = f"{volume_path}/.labelbricks/composites/{filename}.png"
            w.files.upload(png_path, BytesIO(png_data), overwrite=True)
        except Exception:
            logger.exception("Failed to save composite PNG")
            # Non-fatal: JSON was saved successfully

    return jsonify({"status": "success", "annotation_path": json_path})


@app.route("/api/ai-suggest", methods=["POST"])
def api_ai_suggest():
    """Get AI-generated annotation suggestions for an image."""
    from libraries.ai_client import AIClientError, get_ai_suggestions

    data = request.get_json()
    file_path = data.get("filePath")
    custom_prompt = data.get("prompt")

    if not file_path:
        return jsonify({"error": "filePath required"}), 400

    try:
        img_bytes = w.files.download(file_path).contents.read()
    except Exception:
        logger.exception("Failed to download image for AI suggestion: %s", file_path)
        return jsonify({"error": "Failed to load image"}), 500

    ext = file_path.rsplit(".", 1)[-1].lower()
    content_types = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png"}
    content_type = content_types.get(ext, "image/jpeg")

    try:
        suggestions = get_ai_suggestions(
            image_bytes=img_bytes,
            content_type=content_type,
            custom_prompt=custom_prompt,
        )
        logger.info("AI returned %d suggestions for %s", len(suggestions), file_path)
        return jsonify({"suggestions": suggestions})
    except AIClientError as e:
        logger.warning("AI suggestion failed: %s", e)
        return jsonify({"error": str(e)}), 502
    except Exception:
        logger.exception("Unexpected error in AI suggestion")
        return jsonify({"error": "AI suggestion failed unexpectedly"}), 500


@app.route("/api/annotations")
def api_annotations():
    """Load existing annotations for a file."""
    file_path = request.args.get("file_path")
    if not file_path:
        return jsonify({"error": "file_path required"}), 400

    filename = file_path.rsplit("/", 1)[-1]
    volume_path = request.args.get("volume_path") or session.get("volume_path")
    if not volume_path:
        return jsonify(None)

    json_path = f"{volume_path}/.labelbricks/annotations/{filename}.json"

    try:
        data = w.files.download(json_path).contents.read()
        return Response(data, mimetype="application/json")
    except Exception:
        # No existing annotations — that's fine
        return jsonify(None)


if __name__ == "__main__":
    app.run(debug=True)
