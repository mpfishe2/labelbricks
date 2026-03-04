/**
 * Freehand drawing tool. Wraps Fabric.js built-in drawing mode.
 * Tags created paths with annotation metadata.
 */
export class FreehandTool {
  constructor(canvas, manager) {
    this.canvas = canvas;
    this.manager = manager;
    this._onPathCreated = null;
  }

  activate() {
    this.canvas.selection = false;
    this.canvas.forEachObject(o => { o.selectable = false; });

    const color = this.manager.getLabelColor();
    this.canvas.isDrawingMode = true;
    this.canvas.freeDrawingBrush.width = 3;
    this.canvas.freeDrawingBrush.color = color;
    this.canvas.defaultCursor = 'crosshair';

    this._onPathCreated = this._handlePathCreated.bind(this);
    this.canvas.on('path:created', this._onPathCreated);
  }

  deactivate() {
    this.canvas.isDrawingMode = false;
    this.canvas.off('path:created', this._onPathCreated);
    this.canvas.defaultCursor = 'default';
    this.canvas.selection = true;
    this.canvas.forEachObject(o => { o.selectable = true; });
  }

  _handlePathCreated(opt) {
    const path = opt.path;
    if (!path) return;

    const id = crypto.randomUUID();
    const color = this.manager.getLabelColor();

    path.set({
      annotationId: id,
      annotationType: 'freehand',
      labelClass: this.manager.getLabelClass(),
      createdBy: 'human',
      confidence: null,
      stroke: color,
      fill: null,
    });

    this.manager.onAnnotationCreated({
      id,
      type: 'freehand',
      labelClass: path.labelClass,
      fabricObject: path,
      color,
    });
  }
}
