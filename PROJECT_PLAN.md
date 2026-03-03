# LabelBricks Modernization Plan

## Context

LabelBricks is a Databricks Apps image annotation tool (Flask + Fabric.js) built ~1.5 years ago with now-outdated patterns: PAT-based auth, manual `databricks sync` deployment, freehand-only drawing, no AI integration, and no structured annotation storage. The app works but needs modernization across backend infrastructure, UI/UX, AI-assisted labeling, and persistent storage.

**Current state**: 181-line Flask app, 85-line VolumeClient, 68-line script.js, basic dark theme, single freehand drawing tool, no structured metadata, no AI.

**Target state**: OAuth-authenticated, DAB-deployed, Databricks-themed annotation tool with rectangle/circle/polygon/freehand tools, catalog/volume browser, AI-assisted labeling via FMAPI, and Lakebase-backed annotation storage.

---

## Phase 1: Backend Modernization

**Goal**: Same user-facing functionality, modern internals. Working app with OAuth auth, proper env detection, logging, types, and Asset Bundles deployment.

### 1.1 Create `databricks.yml`
- Declare app resource with UC Volume as `uc_securable` (READ_WRITE permission)
- Variables for catalog/schema/volume/workspace_host
- Dev and prod targets (`labelbricks-dev` / `labelbricks`)

### 1.2 Modernize `app.yaml`
- Remove `DATABRICKS_TOKEN_VALUE` and `FULL_DATABRICKS_HOST` secrets entirely
- `WorkspaceClient()` auto-authenticates via service principal OAuth (deployed) or CLI profile (local)
- Keep only `VOLUME_PATH` env var referencing the declared resource

### 1.3 Refactor `app.py`
- Replace `.env` file existence check with `IS_DEPLOYED = os.getenv("DATABRICKS_APP_NAME") is not None`
- Remove `load_dotenv()` and `python-dotenv` dependency
- Single global `WorkspaceClient()` (auto-detects credentials in both environments)
- Single global `VolumeClient` instance (stop creating per-route)
- Replace all `print()` with `logging` module
- Add type hints to all functions
- Add `get_user_info() -> dict[str, str]` using X-Forwarded headers (deployed) / env fallback (local)

### 1.4 Refactor `libraries/volumes.py`
- Rename methods to snake_case: `listFiles` -> `list_files`, `makeDir` -> `make_dir`, etc.
- Add type hints to all methods
- Replace `print()` with `logging`
- Use specific exception types (`databricks.sdk.errors.NotFound`, etc.)
- Add `upload_bytes()` and `download_bytes()` methods (in-memory I/O, no temp files)
- Stop deleting local files inside `upload_file()` (caller's responsibility)

### 1.5 Update `requirements.txt`
- Remove transitive deps and `python-dotenv`
- Keep: `databricks-sdk>=0.36.0`, `Flask>=3.0.3`, `Pillow>=11.0.0`, `gunicorn>=23.0.0`

### 1.6 Simplify `template.env.txt`
- Remove `FULL_DATABRICKS_HOST`, `DATABRICKS_TOKEN_VALUE`, `VOLUME_URI_REVIEWED`, `RUN_MODE`
- Keep: `VOLUME_PATH`, `TEST_REVIEWER`

### Files
| File | Action |
|------|--------|
| `databricks.yml` | CREATE |
| `app.yaml` | MODIFY |
| `app.py` | MODIFY |
| `libraries/volumes.py` | MODIFY |
| `requirements.txt` | MODIFY |
| `template.env.txt` | MODIFY |

### Verification
- `databricks bundle validate` passes
- `python app.py` starts locally with CLI-based auth
- Volume picker -> image list -> canvas -> draw -> save all still work
- No `print()` statements remain; all functions have type hints

---

## Phase 2: UI Overhaul + Annotation Tools

**Goal**: Complete visual redesign with Databricks-aligned theme, three-panel annotation layout, catalog/schema/volume browser, four annotation tools, label classes, and status tracking.

### 2.1 Databricks-Aligned Theme (`static/style.css`)
- CSS custom properties for theme:
  - Sidebar: `#1B1F30` (dark navy)
  - Content: `#FFFFFF` (light)
  - Primary accent: `#FF3621` (Databricks red-orange)
  - Success: `#00A972` (green, for "done" states)
  - Status colors: pending `#F59E0B`, in-review `#3B82F6`, done `#00A972`
- Inter font, clean spacing, modern component styles

### 2.2 Catalog/Schema/Volume Browser (replaces `set_volume.html`)
- New cascading API endpoints in `app.py`:
  - `GET /api/catalogs` -> `w.catalogs.list()`
  - `GET /api/schemas/<catalog>` -> `w.schemas.list()`
  - `GET /api/volumes/<catalog>/<schema>` -> `w.volumes.list()`
  - `GET /api/directories/<path:volume_path>` -> `vc.list_files()`
- Lazy loading (schemas load only when catalog selected, etc.)
- Server-side caching with TTL (~5 min) for catalog/schema lists
- Search/filter input above each level to handle large catalogs

### 2.3 Three-Panel Annotation Layout (`templates/index.html`)
```
+------------------------------------------------------------------+
| Header: Logo + "LabelBricks"     | User Info       | Settings    |
+------------------------------------------------------------------+
| Left Sidebar   | Center Canvas                  | Right Toolbar  |
| (220px)        | (flexible)                     | (220px)        |
|                |                                |                |
| [Status filter]| [Fabric.js Canvas]             | Tools:         |
| Image queue    |                                |  Select        |
|  - thumbnail   |                                |  Rectangle     |
|  - thumbnail * |                                |  Circle        |
|  - thumbnail   |                                |  Polygon       |
|  - thumbnail   |                                |  Freehand      |
|                |                                |                |
| Progress: 3/50 |                                | Label Class:   |
|                |                                | [input + sugg] |
+------------------------------------------------------------------+
| Bottom: [Notes textarea]  [Status: Pending v]  [Save]  [Next]   |
+------------------------------------------------------------------+
```

### 2.4 Image Thumbnails
- New endpoint: `GET /api/thumbnail?file_path=...&size=80` — downloads from Volume, resizes with Pillow to 80x80, returns JPEG bytes directly (no temp file)
- `IntersectionObserver` for lazy-loading thumbnails as they scroll into view
- Browser `Cache-Control: max-age=3600` headers

### 2.5 Image Streaming (replaces temp file pattern)
- New endpoint: `GET /api/image?file_path=...` — streams image bytes from Volume directly to HTTP response
- Frontend loads via `fabric.Image.fromURL('/api/image?file_path=...')`
- Eliminates local temp file usage entirely

### 2.6 Annotation Tools (Fabric.js)
- **Select/Move**: Default mode. `canvas.selection = true`
- **Rectangle**: mousedown -> drag -> mouseup creates `fabric.Rect`
- **Circle/Ellipse**: Same pattern with `fabric.Ellipse`
- **Polygon**: Click adds vertices, double-click or close-to-start finalizes `fabric.Polygon`
- **Freehand**: Existing `canvas.isDrawingMode = true`
- `ToolManager` class manages tool state, event handler lifecycle

### 2.7 Label Classes
- Free-form text input in right toolbar
- Recently-used classes stored in `localStorage`, shown as clickable chips
- Each annotation object gets custom Fabric.js properties: `labelClass`, `confidence`, `createdBy`, `annotationId`

### 2.8 Structured Annotation Save
- Save sends both composite PNG AND structured JSON with all annotation metadata (type, class, coordinates, reviewer, timestamp)
- Phase 2 interim: Store annotation JSON as `.labelbricks/annotations/{filename}.json` in Volume alongside a `status.json` manifest
- Phase 4 migrates this to Lakebase

### 2.9 Modular JavaScript Architecture
Replace single `script.js` with ES6 modules (`<script type="module">`):
```
static/js/
  app.js              # Entry point
  canvas-manager.js   # Canvas setup, image loading
  tool-manager.js     # Tool state machine
  tools/
    select.js, rectangle.js, circle.js, polygon.js, freehand.js
  annotation-store.js # In-memory annotation data model
  label-manager.js    # Label class input + suggestions
  sidebar.js          # Image list, thumbnails, status
  api-client.js       # Backend API wrappers
  volume-browser.js   # Catalog browser logic
```

### Files
| File | Action |
|------|--------|
| `templates/index.html` | REWRITE |
| `templates/set_volume.html` | REWRITE |
| `static/style.css` | REWRITE |
| `static/js/script.js` | DELETE |
| `static/js/*.js` (12 new files) | CREATE |
| `app.py` | MODIFY (new API endpoints) |

### Verification
- Volume browser cascades correctly: catalogs -> schemas -> volumes -> directories
- Three-panel layout renders correctly (responsive to ~1024px)
- All five tools work: select, rectangle, circle, polygon, freehand
- Label class input works with localStorage suggestions
- Thumbnails lazy-load in sidebar; status badges display
- Save produces composite PNG + structured JSON
- Bottom bar notes, status, next-image all functional

---

## Phase 3: AI-Assisted Labeling

**Goal**: On-demand AI button sends image to FMAPI vision model, renders suggestions as dashed overlays, user accepts/rejects/edits each.

### 3.1 FMAPI Setup
- Add `databricks-openai>=0.3.0` to requirements
- Declare serving endpoint resource in `databricks.yml` (e.g., `databricks-claude-sonnet-4-5`)
- Add `VISION_MODEL_ENDPOINT` env var in `app.yaml`

### 3.2 Backend Endpoint: `POST /api/ai-suggest`
- Receives `image_path` and optional `prompt`
- Downloads image bytes from Volume, base64-encodes
- Builds vision prompt asking model to return JSON array of `{label, bounding_box: {x, y, width, height}, confidence}` where bbox is in percentages (0-100)
- Calls FMAPI via OpenAI-compatible SDK (`databricks-openai`)
- Parses response (handles markdown wrapping), returns suggestions as JSON
- Create `libraries/ai_client.py` for prompt construction + response parsing

### 3.3 Frontend: AI Suggestion Rendering
- "AI Suggest" button in right toolbar with optional collapsible prompt input
- Loading spinner during API call
- Each suggestion rendered as dashed-border rectangle with label + confidence badge
- Blue color (`#3B82F6`) with dashed stroke to distinguish from human annotations
- Confidence threshold slider (default 0.5) filters visible suggestions

### 3.4 Accept/Reject/Edit Workflow
- Hover/click on suggestion shows floating action bar: Accept / Reject / Edit
- **Accept**: Convert to regular annotation (solid stroke, standard color, selectable, added to annotation store with `created_by: "ai-accepted"`)
- **Reject**: Remove from canvas
- **Edit**: Make selectable for resize/reposition, then accept

### Files
| File | Action |
|------|--------|
| `libraries/ai_client.py` | CREATE |
| `static/js/ai-suggest.js` | CREATE |
| `app.py` | MODIFY (add endpoint) |
| `databricks.yml` | MODIFY (add serving endpoint resource) |
| `app.yaml` | MODIFY (add VISION_MODEL_ENDPOINT) |
| `requirements.txt` | MODIFY (add databricks-openai) |
| `templates/index.html` | MODIFY (AI button + prompt UI) |
| `static/style.css` | MODIFY (dashed suggestion styles) |

### Verification
- AI Suggest button appears, shows loading state during call
- Suggestions render as dashed overlays with labels and confidence percentages
- Accept/reject/edit each work correctly
- Optional prompt modifies AI behavior
- Confidence threshold slider filters suggestions
- Graceful error if model unavailable
- Accepted AI annotations carry `created_by: "ai-accepted"` metadata

---

## Phase 4: Structured Storage + Lakebase

**Goal**: Persist annotations, statuses, and label classes in Lakebase (PostgreSQL), replacing interim JSON files. Annotation history, cross-session persistence, label suggestions from database.

### 4.1 Storage Backend: Lakebase (recommended)
Lakebase is the better fit vs Delta tables because:
- Low-latency OLTP writes (~10ms vs ~1-5s for SQL warehouse)
- Native PostgreSQL ACID for status tracking
- Standard psycopg2/SQLAlchemy drivers
- UC-governed

Fallback to Delta tables via `databricks-sql-connector` if Lakebase unavailable.

### 4.2 Database Schema (4 tables)
- `images`: id, volume_path, filename, status, reviewer_email, notes, timestamps
- `annotations`: id, image_id (FK), type, label_class, coordinates (JSONB), confidence, created_by, reviewer_email
- `label_classes`: class_name (unique), usage_count, last_used_at
- `audit_log`: image_id (FK), action, actor_email, details (JSONB)

### 4.3 Storage Abstraction Layer (`libraries/storage.py`)
- `StorageBackend` ABC with `LakebaseBackend` and `DeltaTableBackend` implementations
- Dataclasses for `ImageRecord`, `AnnotationRecord` in `libraries/models.py`
- App auto-selects backend based on `LAKEBASE_CONNECTION` env var presence

### 4.4 Resource Declaration
- Add Lakebase database resource in `databricks.yml`
- Add `LAKEBASE_CONNECTION` env var in `app.yaml`
- Add `psycopg2-binary>=2.9.0` to requirements
- Bump `databricks-sdk>=0.61.0` for Lakebase API support

### 4.5 Migration from Phase 2 JSON
- On volume open: check if images exist in DB; if not, scan Volume and insert as `pending`
- Detect and migrate any `.labelbricks/*.json` files from Phase 2 into database
- Label suggestions from `/api/label-classes?q=<prefix>` (debounced autocomplete)
- Annotation reload when revisiting previously-annotated images

### Files
| File | Action |
|------|--------|
| `libraries/storage.py` | CREATE |
| `libraries/models.py` | CREATE |
| `libraries/migration.py` | CREATE |
| `app.py` | MODIFY (database-backed endpoints) |
| `databricks.yml` | MODIFY (Lakebase resource) |
| `app.yaml` | MODIFY (LAKEBASE_CONNECTION) |
| `requirements.txt` | MODIFY (psycopg2, bump SDK) |
| `static/js/label-manager.js` | MODIFY (API-backed suggestions) |
| `static/js/sidebar.js` | MODIFY (DB-backed status) |

### Verification
- Lakebase database created with all 4 tables
- Status persists across sessions and users
- Saved annotations reload when revisiting an image
- Label autocomplete returns suggestions from historical usage
- Audit log records all actions
- Migration from Phase 2 JSON completes without data loss
- Fallback to Delta tables works when Lakebase unavailable

---

## Phase Sequencing

```
Phase 1 (Backend Modernization)
  |
  v
Phase 2 (UI Overhaul + Annotation Tools)
  |
  +---> Phase 3 (AI Labeling) -- can start once canvas + annotation model stable (after 2.6/2.7)
  |
  v
Phase 4 (Lakebase Storage) -- depends on Phase 2 status tracking design
```

## Testing Strategy

- **Phase 1**: `databricks bundle validate`, manual local+deployed testing
- **Phase 2**: Local browser testing for UI; `pytest` with mocked VolumeClient for endpoints
- **Phase 3**: Mock FMAPI responses for unit tests; integration test with actual endpoint
- **Phase 4**: Local PostgreSQL via Docker for dev; Lakebase for integration tests
- **All phases**: Test locally with `python app.py`, then deploy with FE VM tools and test in Databricks

## Critical Files

- `app.py` — modified in every phase (routes, auth, endpoints)
- `libraries/volumes.py` — foundational data access layer
- `templates/index.html` — main UI template, rewritten in Phase 2
- `static/js/script.js` -> `static/js/*.js` — frontend logic, fully restructured in Phase 2
- `static/style.css` — theme, rewritten in Phase 2
- `databricks.yml` — deployment manifest, evolves each phase
- `app.yaml` — runtime config, evolves each phase
