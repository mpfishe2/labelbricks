"""
Migrate existing .labelbricks/annotations/*.json files into Lakebase.

Idempotent — skips images that already have annotations in the database.
Does NOT delete JSON files (they remain as backup in the Volume).
"""

import json
import logging

from databricks.sdk import WorkspaceClient
from libraries.storage import LakebaseStorage

logger = logging.getLogger(__name__)


def migrate_volume_json(
    w: WorkspaceClient,
    storage: LakebaseStorage,
    volume_path: str,
    actor_email: str,
) -> int:
    """
    Scan .labelbricks/annotations/ for JSON files and import into Lakebase.
    Returns count of migrated files.
    """
    annotations_dir = f"{volume_path}/.labelbricks/annotations"
    migrated = 0

    try:
        items = list(w.files.list_directory_contents(annotations_dir))
    except Exception:
        logger.info("No .labelbricks/annotations/ directory found in %s", volume_path)
        return 0

    for item in items:
        if not item.path or not item.path.endswith(".json"):
            continue

        try:
            raw = w.files.download(item.path).contents.read()
            data = json.loads(raw)
        except Exception:
            logger.warning("Failed to read migration file: %s", item.path)
            continue

        filename = data.get("filename", "")
        if not filename:
            continue

        # Reconstruct the original file_path
        file_path = f"{volume_path}/{filename}"

        annotations = data.get("annotations", [])
        status = data.get("status", "pending")
        notes = data.get("notes", "")
        reviewer = data.get("reviewer", actor_email)

        # Skip if already migrated (has annotations in DB)
        existing = storage.load_annotations(volume_path, file_path)
        if existing and existing.get("annotations"):
            continue

        try:
            result = storage.save_annotations(
                volume_path=volume_path,
                file_path=file_path,
                filename=filename,
                annotations=annotations,
                status=status,
                notes=notes,
                reviewer_email=reviewer,
            )
            storage.log_action(
                image_id=result["image_id"],
                action="migrate_from_json",
                actor_email=actor_email,
                details={"source": item.path, "annotation_count": len(annotations)},
            )
            migrated += 1
        except Exception:
            logger.warning("Failed to migrate %s", item.path, exc_info=True)

    logger.info("Migrated %d JSON annotation files from %s", migrated, volume_path)
    return migrated
