/**
 * Select/move tool. Default mode — allows selecting, moving, and resizing annotations.
 */
export class SelectTool {
  constructor(canvas) {
    this.canvas = canvas;
  }

  activate() {
    this.canvas.isDrawingMode = false;
    this.canvas.selection = true;
    this.canvas.defaultCursor = 'default';
    this.canvas.forEachObject(o => { o.selectable = true; });
  }

  deactivate() {
    // No-op — other tools handle their own cleanup
  }
}
