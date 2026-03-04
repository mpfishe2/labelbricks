"""
Lakebase schema management.

Creates the 4 Phase 4 tables on startup if they don't exist.
All DDL is idempotent (CREATE TABLE IF NOT EXISTS).
"""

import logging

from libraries.db import get_pool

logger = logging.getLogger(__name__)

SCHEMA_DDL = """
-- images: one row per image file in a volume
CREATE TABLE IF NOT EXISTS images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    volume_path TEXT NOT NULL,
    file_path TEXT NOT NULL,
    filename TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in-review', 'reviewed')),
    reviewer_email TEXT,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (volume_path, file_path)
);

CREATE INDEX IF NOT EXISTS idx_images_volume_path ON images (volume_path);
CREATE INDEX IF NOT EXISTS idx_images_status ON images (status);
CREATE INDEX IF NOT EXISTS idx_images_file_path ON images (file_path);

-- annotations: per-shape annotation linked to an image
CREATE TABLE IF NOT EXISTS annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    annotation_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('rectangle', 'circle', 'polygon', 'freehand')),
    label_class TEXT NOT NULL DEFAULT 'unlabeled',
    coordinates JSONB NOT NULL,
    confidence REAL,
    created_by TEXT NOT NULL DEFAULT 'human'
        CHECK (created_by IN ('human', 'ai-accepted')),
    color TEXT,
    reviewer_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_annotations_image_id ON annotations (image_id);
CREATE INDEX IF NOT EXISTS idx_annotations_label_class ON annotations (label_class);

-- label_classes: aggregated label usage for autocomplete
CREATE TABLE IF NOT EXISTS label_classes (
    id SERIAL PRIMARY KEY,
    class_name TEXT NOT NULL UNIQUE,
    volume_path TEXT,
    usage_count INTEGER NOT NULL DEFAULT 1,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_label_classes_name_prefix
    ON label_classes (class_name text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_label_classes_usage
    ON label_classes (usage_count DESC);

-- audit_log: action history for traceability
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    image_id UUID REFERENCES images(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    actor_email TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_image_id ON audit_log (image_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at);
"""

_schema_initialized = False


def ensure_schema() -> bool:
    """Create tables if they don't exist. Returns True if successful."""
    global _schema_initialized
    if _schema_initialized:
        return True

    pool = get_pool()
    if pool is None:
        return False

    try:
        with pool.connection() as conn:
            conn.execute(SCHEMA_DDL)
            conn.commit()
        _schema_initialized = True
        logger.info("Lakebase schema initialized successfully")
        return True
    except Exception:
        logger.exception("Failed to initialize Lakebase schema")
        return False
