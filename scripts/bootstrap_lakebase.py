"""
Bootstrap Lakebase role setup for the LabelBricks app service principal.

This script is run as a one-time DABs job after the Lakebase project is
provisioned. It creates a Postgres role for the app SP and grants the
necessary permissions. Idempotent — safe to re-run.

Usage (via DABs):
    databricks bundle run lakebase_bootstrap --target fevm

Usage (standalone):
    python scripts/bootstrap_lakebase.py \
        --app-sp-client-id <UUID> \
        --endpoint projects/<id>/branches/<id>/endpoints/<id>
"""

import argparse
import logging
import os
import sys

import psycopg
from databricks.sdk import WorkspaceClient

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


class BootstrapOAuthConnection(psycopg.Connection):
    """Connection that authenticates as the current user (deployer/project owner)."""

    _endpoint: str = ""

    @classmethod
    def connect(cls, conninfo: str = "", **kwargs):  # type: ignore[override]
        w = WorkspaceClient()
        credential = w.postgres.generate_database_credential(endpoint=cls._endpoint)
        kwargs["password"] = credential.token
        return super().connect(conninfo, **kwargs)


def bootstrap(app_sp_client_id: str, endpoint: str) -> None:
    """Create Postgres role for app SP and grant permissions."""
    BootstrapOAuthConnection._endpoint = endpoint

    host = os.environ.get("PGHOST")
    if not host:
        # Try to derive host from endpoint info
        logger.error("PGHOST environment variable is required")
        sys.exit(1)

    database = os.environ.get("PGDATABASE", "databricks_postgres")
    port = os.environ.get("PGPORT", "5432")
    user = os.environ.get("PGUSER")
    if not user:
        # Use current user's identity (the deployer)
        w = WorkspaceClient()
        me = w.current_user.me()
        user = me.user_name
        logger.info("Using deployer identity: %s", user)

    sslmode = os.environ.get("PGSSLMODE", "require")

    logger.info("Connecting to Lakebase at %s:%s/%s as %s", host, port, database, user)

    conn = BootstrapOAuthConnection.connect(
        host=host,
        dbname=database,
        user=user,
        port=int(port),
        sslmode=sslmode,
    )

    try:
        with conn.cursor() as cur:
            # 1. Enable databricks_auth extension
            logger.info("Creating databricks_auth extension...")
            cur.execute("CREATE EXTENSION IF NOT EXISTS databricks_auth;")

            # 2. Create role for app SP (idempotent via exception handling)
            logger.info("Creating role for app SP: %s", app_sp_client_id)
            try:
                cur.execute(
                    "SELECT databricks_create_role(%s, 'SERVICE_PRINCIPAL');",
                    (app_sp_client_id,),
                )
                logger.info("Role created successfully")
            except psycopg.errors.DuplicateObject:
                logger.info("Role already exists — skipping creation")
                conn.rollback()

            # 3. Grant permissions
            # Quote the client ID as a Postgres identifier (it's a UUID)
            role_id = f'"{app_sp_client_id}"'

            grants = [
                f"GRANT CONNECT ON DATABASE {database} TO {role_id}",
                f"GRANT USAGE ON SCHEMA public TO {role_id}",
                f"GRANT CREATE ON SCHEMA public TO {role_id}",
                f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {role_id}",
                f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {role_id}",
                f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {role_id}",
                f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO {role_id}",
            ]

            for grant_sql in grants:
                logger.info("Running: %s", grant_sql)
                cur.execute(grant_sql)

            conn.commit()
            logger.info("All grants applied successfully")

    finally:
        conn.close()

    logger.info("Bootstrap complete for app SP: %s", app_sp_client_id)


def main() -> None:
    parser = argparse.ArgumentParser(description="Bootstrap Lakebase roles for LabelBricks")
    parser.add_argument(
        "--app-sp-client-id",
        required=True,
        help="Client ID (UUID) of the app service principal",
    )
    parser.add_argument(
        "--endpoint",
        required=True,
        help="Lakebase endpoint path (projects/.../branches/.../endpoints/...)",
    )
    args = parser.parse_args()

    bootstrap(args.app_sp_client_id, args.endpoint)


if __name__ == "__main__":
    main()
