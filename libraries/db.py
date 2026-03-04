"""
Lakebase connection pool with automatic OAuth token rotation.

Uses psycopg3 ConnectionPool with a custom connection class that
generates a fresh Databricks OAuth token for each new connection.
Returns None when Lakebase is not configured, allowing graceful
fallback to JSON storage.
"""

import logging
import os
from typing import Optional

import psycopg
from psycopg_pool import ConnectionPool

logger = logging.getLogger(__name__)

_pool: Optional[ConnectionPool] = None

REQUIRED_ENV_VARS = ["PGHOST", "PGDATABASE", "PGUSER", "LAKEBASE_ENDPOINT"]


def _is_lakebase_configured() -> bool:
    """Check if all required Lakebase env vars are set."""
    return all(os.getenv(var) for var in REQUIRED_ENV_VARS)


class OAuthConnection(psycopg.Connection):
    """Connection subclass that injects a fresh OAuth token as password."""

    @classmethod
    def connect(cls, conninfo: str = "", **kwargs):  # type: ignore[override]
        from databricks.sdk import WorkspaceClient

        endpoint_name = os.environ["LAKEBASE_ENDPOINT"]
        w = WorkspaceClient()
        credential = w.postgres.generate_database_credential(endpoint=endpoint_name)
        kwargs["password"] = credential.token
        return super().connect(conninfo, **kwargs)


def get_pool() -> Optional[ConnectionPool]:
    """Get or create the global connection pool. Returns None if not configured."""
    global _pool
    if _pool is not None:
        return _pool

    if not _is_lakebase_configured():
        logger.info("Lakebase not configured — using JSON storage fallback")
        return None

    host = os.environ["PGHOST"]
    port = os.environ.get("PGPORT", "5432")
    database = os.environ["PGDATABASE"]
    user = os.environ["PGUSER"]
    sslmode = os.environ.get("PGSSLMODE", "require")

    conninfo = f"dbname={database} user={user} host={host} port={port} sslmode={sslmode}"

    try:
        _pool = ConnectionPool(
            conninfo=conninfo,
            connection_class=OAuthConnection,
            min_size=1,
            max_size=5,
            open=True,
        )
        logger.info("Lakebase connection pool initialized (host=%s)", host)
        return _pool
    except Exception:
        logger.exception("Failed to initialize Lakebase connection pool")
        return None


def is_available() -> bool:
    """Check if Lakebase is configured and the pool is healthy."""
    pool = get_pool()
    if pool is None:
        return False
    try:
        with pool.connection() as conn:
            conn.execute("SELECT 1")
        return True
    except Exception:
        logger.warning("Lakebase health check failed")
        return False
