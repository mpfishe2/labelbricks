import { SelectTool } from './tools/select.js';
import { RectangleTool } from './tools/rectangle.js';
import { CircleTool } from './tools/circle.js';
import { PolygonTool } from './tools/polygon.js';
import { FreehandTool } from './tools/freehand.js';

/**
 * Tool state machine. Manages tool switching, keyboard shortcuts,
 * and bridges tool events to the annotation store.
 */
export class ToolManager {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.onAnnotationCreated = options.onAnnotationCreated || (() => {});
    this.onAnnotationDeleted = options.onAnnotationDeleted || (() => {});
    this.getLabelClass = options.getLabelClass || (() => 'unlabeled');
    this.getLabelColor = options.getLabelColor || (() => '#FF3621');

    this.tools = {
      select: new SelectTool(canvas),
      rectangle: new RectangleTool(canvas, this),
      circle: new CircleTool(canvas, this),
      polygon: new PolygonTool(canvas, this),
      freehand: new FreehandTool(canvas, this),
    };

    this.activeTool = null;
    this.activeToolName = null;
  }

  init() {
    // Bind toolbar buttons
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => this.activate(btn.dataset.tool));
    });

    // Keyboard shortcuts: 1-5 for tools, Delete to remove
    this._onKeyDown = this._handleKeyDown.bind(this);
    document.addEventListener('keydown', this._onKeyDown);

    // Default to select
    this.activate('select');
  }

  activate(toolName) {
    if (!this.tools[toolName]) return;
    if (this.activeTool) {
      this.activeTool.deactivate();
    }
    this.activeTool = this.tools[toolName];
    this.activeToolName = toolName;
    this.activeTool.activate();

    // Update button states
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === toolName);
    });
  }

  _handleKeyDown(e) {
    // Don't intercept when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    const toolMap = { '1': 'select', '2': 'rectangle', '3': 'circle', '4': 'polygon', '5': 'freehand' };
    if (toolMap[e.key]) {
      this.activate(toolMap[e.key]);
      e.preventDefault();
      return;
    }

    // Delete selected object
    if (e.key === 'Delete' || (e.key === 'Backspace' && !e.metaKey)) {
      this._deleteSelected();
      e.preventDefault();
    }
  }

  _deleteSelected() {
    const active = this.canvas.getActiveObject();
    if (active) {
      this.canvas.remove(active);
      this.canvas.discardActiveObject();
      this.canvas.renderAll();
      this.onAnnotationDeleted(active);
    }
  }

  destroy() {
    document.removeEventListener('keydown', this._onKeyDown);
    if (this.activeTool) this.activeTool.deactivate();
  }
}
