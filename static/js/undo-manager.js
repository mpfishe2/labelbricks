/**
 * Snapshot-based undo/redo manager. Captures canvas state as JSON on each action
 * and restores the full state on undo/redo.
 */

const CUSTOM_PROPS = ['annotationId', 'annotationType', 'labelClass', 'createdBy', 'confidence'];

export class UndoManager {
  constructor(canvas, annotationStore) {
    this.canvas = canvas;
    this.store = annotationStore;
    this.undoStack = [];
    this.redoStack = [];
    this.MAX_HISTORY = 50;
    this._isRestoring = false;
    this._onKeyDown = null;
  }

  init() {
    this._onKeyDown = this._handleKeyDown.bind(this);
    document.addEventListener('keydown', this._onKeyDown);
  }

  /** Take a snapshot of the current canvas state. Call after each annotation change. */
  snapshot() {
    if (this._isRestoring) return;
    const state = this.canvas.toJSON(CUSTOM_PROPS);
    this.undoStack.push(JSON.stringify(state));
    if (this.undoStack.length > this.MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    if (this.undoStack.length <= 1) return; // Keep at least the initial state
    const current = this.undoStack.pop();
    this.redoStack.push(current);
    const previous = this.undoStack[this.undoStack.length - 1];
    this._restore(previous);
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const state = this.redoStack.pop();
    this.undoStack.push(state);
    this._restore(state);
  }

  reset() {
    this.undoStack = [];
    this.redoStack = [];
  }

  _restore(stateStr) {
    this._isRestoring = true;
    const state = JSON.parse(stateStr);

    // Preserve background image
    const bgImg = this.canvas.backgroundImage;

    this.canvas.loadFromJSON(state, () => {
      // Restore background image (loadFromJSON may clear it)
      if (bgImg && !this.canvas.backgroundImage) {
        this.canvas.setBackgroundImage(bgImg, this.canvas.renderAll.bind(this.canvas));
      }

      // Rebuild annotation store from canvas objects
      this.store.clear();
      this.canvas.getObjects().forEach(obj => {
        if (obj.annotationId) {
          this.store.add({
            id: obj.annotationId,
            type: obj.annotationType || 'unknown',
            labelClass: obj.labelClass || 'unlabeled',
            fabricObject: obj,
            createdBy: obj.createdBy || 'human',
            confidence: obj.confidence || null,
            color: obj.stroke || '#FF3621',
          });
        }
      });

      this.canvas.renderAll();
      this._isRestoring = false;
    });
  }

  _handleKeyDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    const isCtrlCmd = e.ctrlKey || e.metaKey;

    if (isCtrlCmd && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.undo();
    } else if (isCtrlCmd && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      this.redo();
    }
  }

  destroy() {
    document.removeEventListener('keydown', this._onKeyDown);
  }
}
