# LabelBricks

Lightweight image labeling web app built on Databricks Apps with Unity Catalog Volumes for data storage. Human-in-the-loop image annotation with AI-assisted labeling capabilities.

## Key Directives
1. DO NOT READ .env
2. No `.env` file is required — do not add `load_dotenv()` or `python-dotenv`

## Execution and Decisions
- When making architectural or design decisions consult with me
- Use subagents when tackling complex tasks
- Reference `PROJECT_PLAN.md` for the 4-phase modernization roadmap
- Reference `PROGRESS.md` for what has been completed

## Available Skills
The following project skills are available in `.claude/skills/`:

## Available Agents
The following subagents are available in `.claude/agents/`:

## Available Plugins
Check for plugins here: `.claude/settings.json`

## Tech Stack

- **Backend**: Python / Flask (served via Gunicorn)
- **Frontend**: Vanilla JS with Fabric.js (canvas-based annotation)
- **Platform**: Databricks Apps (serverless containerized deployment)
- **Storage**: Unity Catalog Volumes (image I/O)
- **AI**: Databricks Foundation Model APIs via `databricks-openai` (Claude Sonnet vision model for AI-assisted labeling)
- **Auth**: Databricks OAuth 2.0 / SSO (via app service principal + user authorization)
- **Config**: `databricks.yml` manifest (Databricks Asset Bundles) + `app.yaml` runtime config
- **Dev tooling**: `uv` for dependency management and virtual environment

## Project Structure

```
labelbricks/
├── CLAUDE.md                     # You are here
├── PROJECT_PLAN.md               # 4-phase modernization plan
├── PROGRESS.md                   # Phase completion tracking
├── app.py                        # Flask application - main entry point
├── app.yaml                      # Databricks App runtime config (command, env vars)
├── databricks.yml                # DAB manifest (resources, targets, permissions)
├── pyproject.toml                # uv/pip project config with dependencies
├── requirements.txt              # Python dependencies (kept for DABs compatibility)
├── template.env.txt              # Reference doc — no .env file needed
├── libraries/
│   ├── volumes.py                # VolumeClient - UC Volume file operations
│   └── ai_client.py              # FMAPI vision client — image → bounding box suggestions
├── templates/
│   ├── index.html                # Main annotation UI (three-panel Fabric.js canvas)
│   └── set_volume.html           # Styled landing page
├── static/
│   ├── style.css                 # Databricks-aligned design system (CSS custom properties)
│   ├── js/
│   │   ├── app.js                # Main entry point — LabelBricksApp orchestrator
│   │   ├── api-client.js         # Centralized fetch wrapper for backend APIs
│   │   ├── canvas-manager.js     # Fabric.js canvas lifecycle + image loading
│   │   ├── tool-manager.js       # Tool state machine + keyboard shortcuts
│   │   ├── annotation-store.js   # In-memory annotation model + JSON serialization
│   │   ├── label-manager.js      # Label class input + color palette + recent chips
│   │   ├── label-popup.js        # Floating popup for post-draw labeling
│   │   ├── sidebar.js            # Image queue + lazy thumbnails + status badges
│   │   ├── volume-browser.js     # Cascading catalog→schema→volume→directory modal
│   │   ├── undo-manager.js       # Snapshot-based undo/redo (Ctrl+Z/Y)
│   │   ├── ai-suggest.js         # AI suggestion lifecycle — render, accept/edit/reject, threshold
│   │   └── tools/
│   │       ├── select.js         # Select/move tool
│   │       ├── rectangle.js      # Rectangle draw tool
│   │       ├── circle.js         # Ellipse draw tool
│   │       ├── polygon.js        # Click-to-add-vertices polygon tool
│   │       └── freehand.js       # Freehand drawing tool
│   ├── images/                   # App logos and assets
│   └── test/images/              # Sample images for testing
└── .claude/
    ├── skills/                   # Claude Code skills for this project
    └── agents/                   # Claude Code subagents for this project
```

## Key Commands

```bash
# Local development (uv)
uv sync                                    # Install dependencies
uv run python app.py                       # Flask dev server on :5000

# If DEFAULT CLI profile is not the target workspace:
DATABRICKS_CONFIG_PROFILE=e2-demo-field-eng uv run python app.py

# Databricks CLI
databricks auth login --host https://e2-demo-field-eng.cloud.databricks.com
databricks bundle validate
databricks bundle deploy --target dev
databricks bundle run labelbricks --target dev

# Testing
python -m pytest tests/ -v                 # Unit tests
python -m pytest tests/ -k "test_volumes"  # Volume integration tests
```

## Architecture Decisions

- **Refer to documentation and Cookbook for modern patterns**: Look at the current documentation [link](https://docs.databricks.com/aws/en/dev-tools/databricks-apps/app-development) and our Cookbook [link](https://apps-cookbook.dev/docs/intro) to understand modern patterns for Databricks Apps development
- **Flask over Streamlit/Gradio**: We need precise canvas control (Fabric.js) for bounding boxes, polygons, and freehand drawing that Streamlit widgets cannot provide. Flask gives full HTML/JS control.
- **UC Volumes for images**: Images are governed assets in Unity Catalog Volumes. Volumes provide Unity Catalog lineage, access control, and auditability. Never use DBFS or local-only storage.
- **AI suggestions are non-authoritative**: The AI model proposes labels/bounding boxes, but the human reviewer always has final say. AI predictions are rendered as dashed overlays that the user accepts, modifies, or dismisses.
- **No .env file dependency**: Auth uses Databricks CLI profile (local) or SP OAuth (deployed). User identity from `w.current_user.me()` (local) or `X-Forwarded-*` headers (deployed). Volume path selected from UI. No `python-dotenv` needed.
- **Session-scoped VolumeClient**: User picks catalog/schema/volume from the UI. The selected path is stored in Flask `session` and accessed via `get_volume_client()`. Not a single global — different users can work on different volumes.
- **DABs for deployment**: `databricks.yml` declares the app resource with UC Volume `uc_securable`. Use `databricks bundle deploy` instead of `databricks sync --watch`.

## Testing Deployments

1. Make sure to test UI/UX changes locally when possible so that feedback can be given to guide the overall experience
2. When testing the deployment in Databricks, use the FE VM tools (i.e. `/databricks-fe-vm-workspace-deployment`) to provision this app to a workspace for testing

## Modernization Context (Active Migration)

See `PROJECT_PLAN.md` for the full 4-phase plan. See `PROGRESS.md` for current status.

**Phase 1 (COMPLETE):** Backend modernization — OAuth auth, DABs deployment manifest, logging, type hints, snake_case methods, zero .env dependency.

**Phase 2 (COMPLETE):** UI overhaul — Databricks-aligned theme, three-panel layout, catalog/schema/volume browser, rectangle/circle/polygon/freehand annotation tools, label classes, modular ES6 JavaScript. Post-deploy fixes: label popup, save reliability, directory pre-creation.

**Phase 3 (COMPLETE):** AI-assisted labeling — FMAPI vision model integration via `databricks-openai`, on-demand AI Suggest button, dashed blue overlays with confidence scores, accept/edit/reject workflow, confidence threshold slider, custom prompt support, server-side image compression for large files.

**Phase 4:** Structured storage — Lakebase (PostgreSQL) for annotation metadata, cross-session persistence, label autocomplete.

## Code Style

- Python: Follow PEP 8. Use type hints on all function signatures. Prefer `logging` over `print()`.
- JavaScript: ES6+ modules. No build step — loaded via `<script type="module">`. 16 files in `static/js/`.
- HTML/CSS: Minimal templating with Jinja2. Dark theme. Mobile-responsive where practical.
- Error handling: Always wrap Databricks SDK calls in try/except. Log the error and return a user-friendly message. Never expose stack traces to the frontend.
- Environment detection: Use `IS_DEPLOYED = os.getenv("DATABRICKS_APP_NAME") is not None`. Do not check for .env file existence.

## Current Patterns (Post Phase 3)

- `WorkspaceClient()` is initialized once globally — auto-detects CLI profile (local) or SP OAuth (deployed).
- `get_user_info()` returns user identity from `X-Forwarded-*` headers (deployed) or `w.current_user.me()` (local, cached after first call).
- **Volume path is tracked on the frontend** (`LabelBricksApp.volumePath`) and passed in every API call. Flask session is a fallback only — do not rely on it for deployed apps.
- `_ensure_volume_dirs(volume_path)` pre-creates `.labelbricks/annotations/` and `.labelbricks/composites/` directories before first upload. Uses in-memory `_dirs_created` set.
- `app.py` calls `w.files.*` directly (Phase 2 simplified away VolumeClient for streaming endpoints).
- Frontend is 16 ES6 modules loaded via `<script type="module">` from `static/js/app.js` entry point. No build step.
- Fabric.js v4.6.0 canvas managed by `CanvasManager`. Background image set via `setBackgroundImage` (non-selectable).
- Tool state machine in `ToolManager` — 5 tools (select, rectangle, circle, polygon, freehand) with keyboard shortcuts 1-5.
- `LabelPopup` shows after drawing or selecting annotations for post-draw labeling.
- Save has retry logic (3 attempts, 1s delay) and a saving overlay modal to prevent multi-clicks.
- **AI suggestions are NOT in `AnnotationStore` until accepted.** They live as Fabric objects with `excludeFromExport = true` (invisible to undo snapshots) and are tracked in `AISuggestManager._suggestions`. On accept, they convert to regular annotations with `createdBy: 'ai-accepted'`.
- **`DatabricksOpenAI()` for FMAPI calls** — auto-detects credentials the same way `WorkspaceClient()` does. Used in `libraries/ai_client.py` for vision model calls.
- **AI bounding boxes use percentage coordinates (0-100).** Frontend translates to canvas pixels: `canvas_x = (pct / 100) * naturalWidth * canvasManager.getScale()`.
- **Large images auto-compressed** before FMAPI calls. `_compress_image()` in `ai_client.py` uses Pillow to progressively resize/compress images >2.5MB to stay under the 4MB FMAPI request limit.

## Lessons Learned

- **`databricks bundle schema` is the source of truth** for DABs YAML fields. The `uc_securable` permission values are `READ_VOLUME` / `WRITE_VOLUME` (not `READ_WRITE`).
- **`WorkspaceClient()` credential resolution**: Direct params > env vars (`DATABRICKS_HOST`, `DATABRICKS_TOKEN`) > CLI profile. If DEFAULT profile is broken, set `DATABRICKS_CONFIG_PROFILE` in the shell.
- **Don't add `.env` loading for local dev** — it creates a false dependency. CLI profile + SDK `current_user.me()` + UI-selected volume covers all needs.
- **`uv run --env-file .env`** is available if env vars are ever needed, but the app itself should not depend on `.env`.
- **Flask session is unreliable in deployed Databricks Apps.** The `app.secret_key = os.urandom()` changes on restart, and Gunicorn workers may not share session state. Always pass critical context (like `volumePath`) from the frontend in request bodies/query params, with session as fallback only.
- **Pre-create Volume directories before upload.** `w.files.upload()` does not auto-create parent directories. Use `w.files.create_directory()` wrapped in try/except (idempotent — succeeds if already exists).
- **Draw-then-label is the natural annotation UX.** Users draw a shape first, then want to label it. A floating label popup near the annotation (with recent label chips) is the right pattern. Do not require label selection before drawing.
- **Deployment two-step:** `databricks bundle deploy --target fevm` uploads source code, then `databricks apps deploy labelbricks-fevm --source-code-path ...` triggers the app restart. Both steps are needed.
- **FMAPI has a ~4MB request body limit.** Base64-encoding inflates image size by ~33%, so a 3MB image becomes ~4MB in the request. Always compress images >2.5MB raw bytes before sending.
- **FMAPI pay-per-token endpoints are workspace-shared.** `databricks-claude-sonnet-4-5` does not need a `serving_endpoint` resource in `databricks.yml`. The app SP has access by default. Only add a resource declaration if you hit permission errors.
- **`DatabricksOpenAI()` credential resolution** follows the same chain as `WorkspaceClient()`: direct params > env vars > CLI profile > SP OAuth. No extra auth setup needed.
- **Use `excludeFromExport = true` on temporary Fabric.js objects** (like AI suggestion overlays) to keep them out of `canvas.toJSON()` and the undo snapshot stack. This is cleaner than filtering them out in the undo manager.
- **Vision models return bboxes reliably with explicit format instructions.** Include a concrete JSON example in the prompt and request "no markdown, no explanation." Temperature 0.1 improves consistency. Still handle markdown code fences in parsing as a fallback.
- **Percentage-based coordinates are resolution-independent.** When the AI returns bboxes as 0-100% of image dimensions, the frontend handles all display scaling via `canvasManager.getScale()` and natural image dimensions. This decouples model output from canvas/display size.
