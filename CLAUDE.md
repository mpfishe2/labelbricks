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
- **AI**: Databricks Foundation Model APIs (vision models for AI-assisted labeling) — Phase 3
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
│   └── volumes.py                # VolumeClient - UC Volume file operations
├── templates/
│   ├── index.html                # Main annotation UI (Fabric.js canvas)
│   └── set_volume.html           # Volume picker form
├── static/
│   ├── style.css                 # Dark-themed UI styles
│   ├── js/script.js              # Canvas logic, fetch/save annotations
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

**Phase 2 (NEXT):** UI overhaul — Databricks-aligned theme, three-panel layout, catalog/schema/volume browser, rectangle/circle/polygon/freehand annotation tools, label classes, modular ES6 JavaScript.

**Phase 3:** AI-assisted labeling — FMAPI vision model integration, on-demand suggestions, accept/reject/edit workflow.

**Phase 4:** Structured storage — Lakebase (PostgreSQL) for annotation metadata, cross-session persistence, label autocomplete.

## Code Style

- Python: Follow PEP 8. Use type hints on all function signatures. Prefer `logging` over `print()`.
- JavaScript: ES6+. No build step - vanilla JS loaded via script tags.
- HTML/CSS: Minimal templating with Jinja2. Dark theme. Mobile-responsive where practical.
- Error handling: Always wrap Databricks SDK calls in try/except. Log the error and return a user-friendly message. Never expose stack traces to the frontend.
- Environment detection: Use `IS_DEPLOYED = os.getenv("DATABRICKS_APP_NAME") is not None`. Do not check for .env file existence.

## Current Patterns (Post Phase 1)

- `WorkspaceClient()` is initialized once globally — auto-detects CLI profile (local) or SP OAuth (deployed).
- `get_user_info()` returns user identity from `X-Forwarded-*` headers (deployed) or `w.current_user.me()` (local, cached after first call).
- `get_volume_client()` returns a `VolumeClient` from the Flask session's `volume_path`. Set when the user submits the volume picker form.
- VolumeClient methods use snake_case: `list_files()`, `make_dir()`, `upload_file()`, `download_file()`, `upload_bytes()`, `download_bytes()`.
- The VolumeClient is the sole interface for UC Volume file operations. Do not call `w.files.*` directly from app.py.
- Fabric.js canvas is initialized in `static/js/script.js` via `initCanvas()` called on body onload. All drawing tools, image loading, and save logic live there.

## Lessons Learned

- **`databricks bundle schema` is the source of truth** for DABs YAML fields. The `uc_securable` permission values are `READ_VOLUME` / `WRITE_VOLUME` (not `READ_WRITE`).
- **`WorkspaceClient()` credential resolution**: Direct params > env vars (`DATABRICKS_HOST`, `DATABRICKS_TOKEN`) > CLI profile. If DEFAULT profile is broken, set `DATABRICKS_CONFIG_PROFILE` in the shell.
- **Don't add `.env` loading for local dev** — it creates a false dependency. CLI profile + SDK `current_user.me()` + UI-selected volume covers all needs.
- **`uv run --env-file .env`** is available if env vars are ever needed, but the app itself should not depend on `.env`.
