# LabelBricks Modernization Progress

## Phase 1: Backend Modernization - COMPLETE

**Date completed:** March 3, 2026
**Branch:** `feature/modernize-deployment`
**Status:** Locally verified, not yet deployed

### What Changed

| File | Action | Summary |
|------|--------|---------|
| `databricks.yml` | CREATED | DAB manifest with app resource, UC Volume `uc_securable` (WRITE_VOLUME), variables for catalog/schema/volume, dev + prod targets using `e2-demo-field-eng` profile |
| `app.yaml` | MODIFIED | Removed PAT secrets (`DATABRICKS_TOKEN_VALUE`, `FULL_DATABRICKS_HOST`). Added `VOLUME_PATH` via `valueFrom: labelbricks-volume` |
| `app.py` | MODIFIED | Replaced `.env` file check with `IS_DEPLOYED = os.getenv("DATABRICKS_APP_NAME")`. Removed `load_dotenv()`. Global `WorkspaceClient()` with auto-detected auth. Session-scoped `get_volume_client()`. `get_user_info()` uses SDK `w.current_user.me()` for local dev. All `print()` replaced with `logging`. Type hints on all functions |
| `libraries/volumes.py` | MODIFIED | Renamed methods to snake_case (`listFiles` -> `list_files`, etc.). Added type hints. Replaced `print()` with `logging`. Removed `os.remove()` from `upload_file()`. Added `upload_bytes()` and `download_bytes()` methods. Removed dead code |
| `requirements.txt` | MODIFIED | Removed 18 transitive deps + `python-dotenv`. Kept 4 direct deps with relaxed pinning |
| `template.env.txt` | MODIFIED | Converted to reference doc. No `.env` file is required — auth comes from CLI profile, user identity from SDK, volume from UI |
| `pyproject.toml` | CREATED | `uv` project config with dependencies for modern dev workflow |

### Key Architectural Decisions Made

1. **No `.env` file required.** Auth uses Databricks CLI profile (`DATABRICKS_CONFIG_PROFILE` or DEFAULT). User identity from `w.current_user.me()` (local) or `X-Forwarded-*` headers (deployed). Volume selected from UI.
2. **Session-scoped VolumeClient** instead of a single global instance. User picks catalog/schema/volume from the picker, stored in Flask session, accessed via `get_volume_client()` helper.
3. **UC Volume permission is `WRITE_VOLUME`** (not `READ_WRITE` as originally planned). The DABs schema uses `READ_VOLUME` / `WRITE_VOLUME` enum values; `WRITE_VOLUME` implies read access.
4. **Workspace profile**: `e2-demo-field-eng` for both dev and prod targets.

### Verification

- `uv run python app.py` starts locally with CLI-based auth
- Volume picker -> image list -> canvas all work
- No `print()` statements remain; all functions have type hints
- Zero `.env` file dependency

### What's NOT Done Yet

- `databricks bundle validate` (requires workspace connectivity — test when deploying)
- `databricks bundle deploy --target dev` (Phase 1 deployment test)
- Draw + save flow not re-tested after refactor (functionally unchanged but should verify)

---

## Phase 2: UI Overhaul + Annotation Tools - NOT STARTED

See `PROJECT_PLAN.md` section "Phase 2" for full details.

## Phase 3: AI-Assisted Labeling - NOT STARTED

See `PROJECT_PLAN.md` section "Phase 3" for full details.

## Phase 4: Structured Storage + Lakebase - NOT STARTED

See `PROJECT_PLAN.md` section "Phase 4" for full details.
