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

## Phase 2: UI Overhaul + Annotation Tools - COMPLETE

**Date completed:** March 3, 2026
**Branch:** `feature/ui-and-annotation-tool-overhaul`
**Status:** Locally verified, not yet deployed

### What Changed

| File | Action | Summary |
|------|--------|---------|
| `static/style.css` | REWRITTEN | Databricks-aligned design system with CSS custom properties. Mixed theme: dark navy sidebar (#1B1F30), white content (#FFFFFF), Databricks red accent (#FF3621). Three-panel CSS Grid layout, 10-color annotation palette, modal styles, toast notifications, status badges |
| `templates/index.html` | REWRITTEN | Three-panel annotator layout: left sidebar (image queue + thumbnails + status filter), center canvas (Fabric.js), right toolbar (5 tool buttons + label class input + annotation list), bottom bar (notes + status + save/prev/next). Volume browser modal. Loads Fabric.js v4.6.0 + ES6 module entry point |
| `templates/set_volume.html` | REWRITTEN | Styled landing page with "Get Started" button linking to `/annotator` |
| `app.py` | REWRITTEN | Added 9 new API endpoints: `/api/catalogs`, `/api/schemas/<catalog>`, `/api/volumes/<catalog>/<schema>`, `/api/directories/<path>`, `/api/set-volume`, `/api/image` (streaming), `/api/thumbnail` (Pillow resize), `/api/save` (structured JSON + composite PNG), `/api/annotations` (load). New `/annotator` route. Removed old temp file pattern and legacy routes |
| `static/js/script.js` | DELETED | Replaced by modular ES6 architecture |
| `static/js/app.js` | CREATED | Main entry point — `LabelBricksApp` class orchestrating all modules, save/load flow, auto-advance navigation, Ctrl+S shortcut |
| `static/js/api-client.js` | CREATED | Centralized fetch wrapper for all backend API calls |
| `static/js/canvas-manager.js` | CREATED | `CanvasManager` — Fabric.js canvas lifecycle, image loading via `setBackgroundImage`, responsive sizing, composite PNG export |
| `static/js/tool-manager.js` | CREATED | Tool state machine with keyboard shortcuts (1-5 for tools, Delete to remove), toolbar button binding |
| `static/js/tools/select.js` | CREATED | Select/move tool — default mode |
| `static/js/tools/rectangle.js` | CREATED | Rectangle tool — mousedown→drag→mouseup creates `fabric.Rect` with label-class color |
| `static/js/tools/circle.js` | CREATED | Circle/ellipse tool — creates `fabric.Ellipse` |
| `static/js/tools/polygon.js` | CREATED | Polygon tool — click adds vertices, double-click/close-to-start finalizes, Escape cancels |
| `static/js/tools/freehand.js` | CREATED | Freehand tool — wraps Fabric.js drawing mode, tags paths with annotation metadata |
| `static/js/annotation-store.js` | CREATED | In-memory annotation model with `toJSON()`/`fromJSON()` serialization, renders annotation list in toolbar |
| `static/js/label-manager.js` | CREATED | Label class input with localStorage-backed recent chips, auto-assigned color per class from 10-color palette |
| `static/js/sidebar.js` | CREATED | Image queue with lazy-loaded thumbnails (IntersectionObserver), status badges, click-to-navigate, progress counter |
| `static/js/volume-browser.js` | CREATED | Modal with cascading catalog→schema→volume→directory browser, client-side filter inputs |
| `static/js/undo-manager.js` | CREATED | Snapshot-based undo/redo (Ctrl+Z/Ctrl+Y), max 50 history entries |

### Key Architectural Decisions Made

1. **Mixed theme**: Dark navy sidebar + white content area + Databricks red-orange accent. Professional split-tone look.
2. **Volume browser as modal dialog**: Cascading 4-column browser (catalog→schema→volume→directory) auto-opens when no volume selected.
3. **ES6 modules (no build step)**: 15 JS files loaded via `<script type="module">`. No webpack/bundler needed.
4. **Background image via `setBackgroundImage`**: Keeps the source image non-selectable and separate from annotation objects for clean serialization.
5. **Color per label class**: 10-color palette auto-assigned. All annotations with the same label share a color.
6. **Structured annotation JSON**: Saved to `.labelbricks/annotations/{filename}.json` in the Volume alongside composite PNGs in `.labelbricks/composites/`.
7. **Snapshot-based undo**: Full canvas state captured on each change. Simpler than operation-based undo and reliable for Phase 2 scope.
8. **Streaming image endpoints**: `/api/image` and `/api/thumbnail` stream bytes directly from Volume — eliminated temp file pattern entirely.

### Verification

- `uv run python app.py` starts on :5000 — all routes return 200
- Landing page displays with styled "Get Started" button
- Annotator opens with three-panel layout and volume browser modal
- All 14 JS modules load without console errors
- Volume browser cascades through catalogs → schemas → volumes → directories
- All 5 tools render in toolbar with keyboard shortcuts
- Label class input and chips functional
- Save/Next/Prev buttons present in bottom bar
- Toast notification system operational

### What's NOT Done Yet

- ~~End-to-end testing with real Volume images~~ DONE (see Post-Deploy Fixes below)
- ~~Drawing tool interaction testing on canvas~~ DONE
- ~~Deployment test via `databricks bundle deploy`~~ DONE

---

## Phase 2.5: Post-Deploy Fixes + UX Polish - COMPLETE

**Date completed:** March 3, 2026
**Branch:** `feature/ui-and-annotation-tool-overhaul`
**Status:** Deployed to FEVM workspace and verified

After deploying Phase 2, live user testing on the FEVM Databricks App revealed three issues that were fixed iteratively:

### Fix 1: Label Popup (Draw-then-Label UX)

**Problem:** After drawing a shape, annotations were created with "unlabeled" and there was no way to edit the label afterward. The natural workflow is draw-then-label, not label-then-draw.

**Solution:** Created `static/js/label-popup.js` — a floating popup that appears near the annotation immediately after drawing. Contains a text input + recent label chips. Also appears when selecting an existing annotation in select mode (enables label editing).

| File | Action | Summary |
|------|--------|---------|
| `static/js/label-popup.js` | CREATED | `LabelPopup` class — floating div positioned near Fabric.js objects, text input + label chips, Enter to confirm, Escape to dismiss, click-outside to close |
| `static/js/app.js` | MODIFIED | `_onAnnotationCreated()` triggers popup after draw; `_onSelectionChanged()` triggers popup when selecting existing annotations in select mode |
| `static/style.css` | MODIFIED | Added `.label-popup`, `.label-popup-input`, `.label-popup-chips` styles |

### Fix 2: Volume Directory Pre-Creation

**Problem:** First save always failed because `.labelbricks/annotations/` directory didn't exist in the Volume yet.

**Solution:** Added `_ensure_volume_dirs()` helper in `app.py` that pre-creates `.labelbricks/`, `.labelbricks/annotations/`, and `.labelbricks/composites/` directories before the first upload. Uses an in-memory `_dirs_created` set to avoid redundant calls.

| File | Action | Summary |
|------|--------|---------|
| `app.py` | MODIFIED | Added `_ensure_volume_dirs()` helper, called before annotation JSON upload |

### Fix 3: Save Reliability (Session Bypass + Retry + Overlay)

**Problem:** Save still failed intermittently on first click. Root cause: Flask session not persisting `volume_path` reliably in deployed Databricks Apps — `os.urandom()` secret key changes on restart, and Gunicorn workers may not share session state. The `/api/save` endpoint returned 400 because `session.get("volume_path")` was None.

**Solution:** Three-part fix:
1. **Frontend passes `volumePath`** in all API calls — no longer depends on Flask session for volume context
2. **Retry logic** — save attempts up to 3 times with 1s delay between retries
3. **Saving overlay** — spinner modal prevents multi-clicks and gives visual feedback

| File | Action | Summary |
|------|--------|---------|
| `app.py` | MODIFIED | `/api/save` accepts `volumePath` from request body (session fallback). `/api/annotations` accepts `volume_path` as query param (session fallback) |
| `static/js/app.js` | MODIFIED | Tracks `this.volumePath`, passes to all API calls, 3-attempt retry logic, saving overlay modal with spinner |
| `static/js/api-client.js` | MODIFIED | `saveAnnotations()` sends `volumePath` in body. `loadAnnotations()` sends `volume_path` as query param |
| `static/js/volume-browser.js` | MODIFIED | `confirm()` passes `result.volume_path` to `app.onVolumeSelected()` |
| `static/style.css` | MODIFIED | Added `.saving-overlay` and `.saving-dialog` styles |

### Deployment Details

- **Workspace:** FEVM (`fevm-labelbricks-test` CLI profile)
- **App name:** `labelbricks-fevm`
- **Deploy commands:**
  ```bash
  databricks bundle deploy --target fevm --profile fevm-labelbricks-test
  databricks apps deploy labelbricks-fevm --source-code-path /Workspace/Users/max.fisher@databricks.com/.bundle/labelbricks/fevm/files --profile fevm-labelbricks-test
  ```
- **Test volume:** `labelbricks_test_catalog.default.images`
- **Test image:** `static/images/dog_and_cats_four.jpg` (uploaded to volume via `databricks fs cp`)

---

## Phase 3: AI-Assisted Labeling - COMPLETE

**Date completed:** March 4, 2026
**Branch:** `feature/ai-assisted-labeling`
**Status:** Deployed to FEVM workspace and verified

### What Changed

| File | Action | Summary |
|------|--------|---------|
| `libraries/ai_client.py` | CREATED | FMAPI vision client using `DatabricksOpenAI`. Sends base64-encoded images to Claude Sonnet, parses JSON bounding box responses with percentage-based coordinates. Validates/normalizes suggestions. Auto-compresses large images (>2.5MB) via Pillow resize to stay under FMAPI 4MB request limit. |
| `static/js/ai-suggest.js` | CREATED | `AISuggestManager` class (~320 lines). Manages full AI suggestion lifecycle: button click → loading state → API call → dashed blue overlay rendering → click-to-select → floating Accept/Edit/Reject action bar → confidence threshold slider filtering. Suggestions tracked separately from AnnotationStore (excluded from undo via `excludeFromExport`). |
| `app.py` | MODIFIED | Added `POST /api/ai-suggest` endpoint. Downloads image bytes from Volume, calls `ai_client.get_ai_suggestions()`, returns structured JSON suggestions. |
| `static/js/api-client.js` | MODIFIED | Added `getAISuggestions({ filePath, prompt })` method. |
| `static/js/app.js` | MODIFIED | Imported and instantiated `AISuggestManager`. Clears suggestions on image navigation. |
| `templates/index.html` | MODIFIED | Added AI Assist section to right toolbar: AI Suggest button, confidence threshold slider (default 0.3), collapsible custom prompt textarea. |
| `static/style.css` | MODIFIED | Added ~130 lines: AI section styles, button states, threshold slider, prompt toggle, floating action bar with Accept/Edit/Reject button variants. |
| `requirements.txt` | MODIFIED | Added `databricks-openai>=0.12.0` |
| `pyproject.toml` | MODIFIED | Added `databricks-openai>=0.12.0` to dependencies |
| `app.yaml` | MODIFIED | Added `VISION_MODEL_ENDPOINT: databricks-claude-sonnet-4-5` env var |
| `databricks.yml` | MODIFIED | Added `vision_model_endpoint` variable with default |

### Key Architectural Decisions Made

1. **Manual trigger only**: "AI Suggest" button click — no auto-suggest on image load. Predictable, no surprise API costs.
2. **Percentage-based coordinates**: AI model returns bboxes as 0-100% of image dimensions. Frontend translates to canvas pixels using `canvasManager.getScale()` and natural image dimensions.
3. **Suggestions excluded from undo**: `excludeFromExport = true` on Fabric objects keeps undo stack clean. Suggestions tracked in `AISuggestManager._suggestions` array, not in `AnnotationStore`.
4. **Accept converts to regular annotation**: Changes `strokeDashArray: null`, `selectable: true`, `createdBy: 'ai-accepted'`, adds to `AnnotationStore`. Saved JSON preserves AI origin metadata.
5. **Server-side image compression**: Images >2.5MB auto-compressed via Pillow resize before base64 encoding. Prevents FMAPI 4MB request limit errors.
6. **FMAPI pay-per-token endpoints don't need resource declaration**: `databricks-claude-sonnet-4-5` is a workspace-level shared endpoint. No `serving_endpoint` resource needed in `databricks.yml`.

### Verification

- Deployed to FEVM workspace, all routes return 200
- AI Suggest on small image (logo.png): 3 suggestions returned with correct bboxes
- AI Suggest on large image (dog_and_cats_four.jpg): 4 suggestions after server-side compression
- Accept: dashed → solid, appears in annotation list with label chip
- Edit: opens LabelPopup for label change, then accepts
- Reject: removes suggestion from canvas
- Confidence slider: dynamically shows/hides suggestions
- Custom prompt: collapsible textarea overrides default detection prompt
- Save: accepted annotations serialized with `createdBy: "ai-accepted"` and `confidence`
- Image navigation: clears all suggestions
- No JavaScript console errors

## Phase 4: Structured Storage + Lakebase Autoscaling - COMPLETE

**Date completed:** March 4, 2026
**Branch:** `feature/ai-assisted-labeling`
**Status:** Deployed to FEVM workspace and verified with Lakebase Autoscaling

### What Changed

| File | Action | Summary |
|------|--------|---------|
| `libraries/db.py` | CREATED | Lakebase connection pool with OAuth token rotation via psycopg3. `OAuthConnection` subclass calls `w.postgres.generate_database_credential()`. Global `ConnectionPool` singleton (min=1, max=5). Returns None gracefully when Lakebase not configured. |
| `libraries/schema.py` | CREATED | Idempotent DDL for 4 tables: `images`, `annotations`, `label_classes`, `audit_log`. `ensure_schema()` runs `CREATE TABLE IF NOT EXISTS` on first use. |
| `libraries/storage.py` | CREATED | `LakebaseStorage` class with direct psycopg3 queries. Methods: `save_annotations()` (upsert image + delete-insert annotations), `load_annotations()` (returns same JSON shape as Volume format), `get_image_statuses()` (bulk), `search_labels()` (prefix autocomplete), `log_action()` (fire-and-forget audit). |
| `libraries/migration.py` | CREATED | `migrate_volume_json()` scans `.labelbricks/annotations/*.json`, imports into Lakebase. Idempotent — skips existing. Does not delete JSON files. |
| `scripts/bootstrap_lakebase.py` | CREATED | One-time DABs job script for Postgres role setup. Creates `databricks_auth` extension, app SP role, and grants. Idempotent. |
| `app.py` | MODIFIED | Dual-write save (Lakebase + JSON backup). Lakebase-first annotation loading with JSON fallback. Three new endpoints: `GET /api/label-classes`, `POST /api/image-statuses`, `POST /api/migrate-json`. Lazy `get_storage()` singleton. |
| `databricks.yml` | MODIFIED | Added `app_sp_client_id` variable. Note: Lakebase resources not yet supported by DABs — provisioned via SDK instead. |
| `app.yaml` | MODIFIED | Added `PGHOST`, `PGDATABASE`, `PGUSER`, `PGPORT`, `PGSSLMODE`, `LAKEBASE_ENDPOINT` env vars for Lakebase connection. |
| `pyproject.toml` | MODIFIED | Added `psycopg[binary,pool]>=3.1.0`, bumped `databricks-sdk>=0.81.0` |
| `requirements.txt` | MODIFIED | Same dependency additions |
| `static/js/api-client.js` | MODIFIED | Added `getLabelClasses()`, `getImageStatuses()`, `migrateJson()` API methods |
| `static/js/label-manager.js` | MODIFIED | Added debounced autocomplete dropdown from database. Queries `/api/label-classes` on input, renders dropdown with usage counts. Keeps localStorage recent chips as fast path. |
| `static/js/sidebar.js` | MODIFIED | `setFiles()` now async — fetches persisted statuses from `/api/image-statuses` on volume open |
| `static/js/app.js` | MODIFIED | `onVolumeSelected()` triggers background JSON migration and passes `volumePath` to sidebar for DB status loading |
| `static/style.css` | MODIFIED | Added `.label-autocomplete` dropdown styles |

### Key Architectural Decisions Made

1. **Lakebase Autoscaling** (not Provisioned or Delta tables). Scale-to-zero, branching, copy-on-write storage. PostgreSQL 17.
2. **Dual-write pattern**: Save to Lakebase first, then JSON to Volume as backup. Load from Lakebase first, fall back to JSON.
3. **No Delta table fallback**: Lakebase or JSON. Simpler codebase, no `StorageBackend` ABC.
4. **psycopg3 (not psycopg2)**: Required for `ConnectionPool` with custom `connection_class` for OAuth token rotation.
5. **Same JSON shape**: `load_annotations()` returns identical structure to Volume JSON, so frontend deserialization is unchanged.
6. **Fire-and-forget migration**: JSON-to-DB migration runs in background on volume open. Toast notification on success.
7. **Audit log is non-blocking**: Wrapped in try/except, never breaks the main save flow.
8. **Lakebase provisioned via SDK**: DABs does not yet support `postgres_projects`/`postgres_branches`/`postgres_endpoints`. Use `w.postgres.create_project()` or the MCP `create_or_update_lakebase_database` tool instead.
9. **Bootstrap script for role setup**: `scripts/bootstrap_lakebase.py` is run standalone (not as a DABs job) to create the app SP role and grants. Idempotent.

### Deployment Details

- **Lakebase project**: `labelbricks-fevm` (PostgreSQL 17, Autoscaling)
- **Endpoint**: `ep-floral-scene-d2ku4pne.database.us-east-1.cloud.databricks.com`
- **Branch**: `production` (READY, no-expiry)
- **App SP client ID**: `ac4aa0d7-1246-4e9e-8878-db1cdda73cc0`

### Deployment Workflow

```bash
# 1. Provision Lakebase (one-time, via SDK — see scripts/bootstrap_lakebase.py)
# Project labelbricks-fevm already created with production branch + primary endpoint

# 2. Run bootstrap script (one-time role setup)
DATABRICKS_CONFIG_PROFILE=fevm-labelbricks-test \
PGHOST=ep-floral-scene-d2ku4pne.database.us-east-1.cloud.databricks.com \
PGDATABASE=databricks_postgres PGUSER=max.fisher@databricks.com PGPORT=5432 PGSSLMODE=require \
LAKEBASE_ENDPOINT=projects/labelbricks-fevm/branches/production/endpoints/primary \
uv run python scripts/bootstrap_lakebase.py \
  --app-sp-client-id ac4aa0d7-1246-4e9e-8878-db1cdda73cc0 \
  --endpoint projects/labelbricks-fevm/branches/production/endpoints/primary

# 3. Deploy bundle + app
databricks bundle deploy --target fevm
databricks apps deploy labelbricks-fevm \
  --source-code-path /Workspace/Users/max.fisher@databricks.com/.bundle/labelbricks/fevm/files \
  --profile fevm-labelbricks-test
```

### Verification

- App deployed and started successfully with Lakebase configured
- All 15 Flask routes registered (including 3 new: `/api/label-classes`, `/api/image-statuses`, `/api/migrate-json`)
- **JSON fallback mode**: Confirmed working — when `PGHOST` unset, all DB endpoints return empty gracefully, save reports `"storage": "json"`
- **Lakebase mode**: Confirmed working — save reports `"storage": "lakebase"`, annotations persist across page reloads
- **JSON-to-DB migration**: 2 existing annotation files automatically imported on first volume open
- **Label autocomplete**: Typing "dog" returns `[{"class_name":"dog","usage_count":2}]` from database
- **Status persistence**: Sidebar shows "reviewed" badge loaded from DB after page reload (1/3 progress)
- **Dual-write**: Both Lakebase and Volume JSON updated on save
- No JavaScript console errors related to Phase 4 endpoints
