"""
Lakebase storage layer for annotation persistence.

Provides LakebaseStorage with CRUD operations for images, annotations,
label classes, and audit logging. Uses direct psycopg3 queries (no ORM).
Returns the same JSON shapes as the existing Volume JSON format so the
frontend needs zero deserialization changes.
"""

import json
import logging
from typing import Optional
from uuid import uuid4

from libraries.db import get_pool

logger = logging.getLogger(__name__)


class LakebaseStorage:
    """Database-backed storage for images, annotations, labels, and audit."""

    # ---- Image Operations ----

    def get_or_create_image(
        self, volume_path: str, file_path: str, filename: str
    ) -> Optional[dict]:
        """Get existing image record or insert a new one."""
        pool = get_pool()
        if not pool:
            return None
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, status, reviewer_email, notes, updated_at "
                    "FROM images WHERE volume_path = %s AND file_path = %s",
                    (volume_path, file_path),
                )
                row = cur.fetchone()
                if row:
                    return {
                        "id": str(row[0]),
                        "status": row[1],
                        "reviewer_email": row[2],
                        "notes": row[3],
                        "updated_at": row[4].isoformat() if row[4] else None,
                    }

                image_id = uuid4()
                cur.execute(
                    "INSERT INTO images (id, volume_path, file_path, filename) "
                    "VALUES (%s, %s, %s, %s) "
                    "ON CONFLICT (volume_path, file_path) DO NOTHING "
                    "RETURNING id",
                    (str(image_id), volume_path, file_path, filename),
                )
                conn.commit()
                return {
                    "id": str(image_id),
                    "status": "pending",
                    "reviewer_email": None,
                    "notes": "",
                }

    def get_image_statuses(
        self, volume_path: str, file_paths: list[str]
    ) -> dict[str, str]:
        """Bulk fetch statuses for a list of file paths."""
        pool = get_pool()
        if not pool or not file_paths:
            return {}
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT file_path, status FROM images "
                    "WHERE volume_path = %s AND file_path = ANY(%s)",
                    (volume_path, file_paths),
                )
                return {row[0]: row[1] for row in cur.fetchall()}

    # ---- Annotation Operations ----

    def save_annotations(
        self,
        volume_path: str,
        file_path: str,
        filename: str,
        annotations: list[dict],
        status: str,
        notes: str,
        reviewer_email: str,
    ) -> dict:
        """Save image record + annotations. Replaces all annotations for the image."""
        pool = get_pool()
        if not pool:
            raise RuntimeError("Lakebase not available")

        with pool.connection() as conn:
            with conn.cursor() as cur:
                # Upsert image record
                cur.execute(
                    """INSERT INTO images
                       (id, volume_path, file_path, filename, status,
                        reviewer_email, notes, updated_at)
                       VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s, NOW())
                       ON CONFLICT (volume_path, file_path) DO UPDATE SET
                           status = EXCLUDED.status,
                           reviewer_email = EXCLUDED.reviewer_email,
                           notes = EXCLUDED.notes,
                           updated_at = NOW()
                       RETURNING id""",
                    (volume_path, file_path, filename, status, reviewer_email, notes),
                )
                image_id = str(cur.fetchone()[0])

                # Replace annotations: delete existing, then insert new
                cur.execute(
                    "DELETE FROM annotations WHERE image_id = %s", (image_id,)
                )

                for ann in annotations:
                    cur.execute(
                        """INSERT INTO annotations
                           (image_id, annotation_id, type, label_class,
                            coordinates, confidence, created_by, color,
                            reviewer_email)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                        (
                            image_id,
                            ann.get("annotationId", str(uuid4())),
                            ann["type"],
                            ann.get("labelClass", "unlabeled"),
                            json.dumps(ann.get("coordinates", {})),
                            ann.get("confidence"),
                            ann.get("createdBy", "human"),
                            ann.get("color"),
                            reviewer_email,
                        ),
                    )

                # Update label_classes usage counts
                label_names = {
                    ann.get("labelClass")
                    for ann in annotations
                    if ann.get("labelClass") and ann["labelClass"] != "unlabeled"
                }
                for label in label_names:
                    cur.execute(
                        """INSERT INTO label_classes
                           (class_name, volume_path, usage_count, last_used_at)
                           VALUES (%s, %s, 1, NOW())
                           ON CONFLICT (class_name) DO UPDATE SET
                               usage_count = label_classes.usage_count + 1,
                               last_used_at = NOW()""",
                        (label, volume_path),
                    )

                conn.commit()

        return {"image_id": image_id, "status": status}

    def load_annotations(
        self, volume_path: str, file_path: str
    ) -> Optional[dict]:
        """Load annotations for an image. Returns same JSON shape as Volume format."""
        pool = get_pool()
        if not pool:
            return None

        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, filename, status, reviewer_email, notes, updated_at "
                    "FROM images WHERE volume_path = %s AND file_path = %s",
                    (volume_path, file_path),
                )
                img = cur.fetchone()
                if not img:
                    return None

                image_id, filename, status, reviewer, notes, updated_at = img

                cur.execute(
                    """SELECT annotation_id, type, label_class, coordinates,
                              confidence, created_by, color
                       FROM annotations WHERE image_id = %s""",
                    (str(image_id),),
                )
                annotations = [
                    {
                        "annotationId": row[0],
                        "type": row[1],
                        "labelClass": row[2],
                        "coordinates": row[3],  # JSONB auto-parsed by psycopg3
                        "confidence": row[4],
                        "createdBy": row[5],
                        "color": row[6],
                    }
                    for row in cur.fetchall()
                ]

                return {
                    "filename": filename,
                    "volume_path": volume_path,
                    "reviewer": reviewer,
                    "timestamp": updated_at.isoformat() if updated_at else None,
                    "status": status,
                    "notes": notes or "",
                    "annotations": annotations,
                }

    # ---- Label Autocomplete ----

    def search_labels(self, prefix: str, limit: int = 20) -> list[dict]:
        """Search label classes by prefix for autocomplete."""
        pool = get_pool()
        if not pool:
            return []
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT class_name, usage_count FROM label_classes
                       WHERE class_name LIKE %s
                       ORDER BY usage_count DESC
                       LIMIT %s""",
                    (prefix + "%", limit),
                )
                return [
                    {"class_name": row[0], "usage_count": row[1]}
                    for row in cur.fetchall()
                ]

    # ---- Audit Log ----

    def log_action(
        self,
        image_id: Optional[str],
        action: str,
        actor_email: str,
        details: Optional[dict] = None,
    ) -> None:
        """Record an audit event. Fire-and-forget — never breaks the main flow."""
        pool = get_pool()
        if not pool:
            return
        try:
            with pool.connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """INSERT INTO audit_log
                           (image_id, action, actor_email, details)
                           VALUES (%s, %s, %s, %s)""",
                        (image_id, action, actor_email, json.dumps(details or {})),
                    )
                    conn.commit()
        except Exception:
            logger.warning("Failed to write audit log", exc_info=True)
