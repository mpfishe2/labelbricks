/**
 * Rectangle annotation tool. Mousedown -> drag -> mouseup creates a fabric.Rect.
 */
export class RectangleTool {
  constructor(canvas, manager) {
    this.canvas = canvas;
    this.manager = manager;
    this._isDrawing = false;
    this._startX = 0;
    this._startY = 0;
    this._rect = null;
    this._onMouseDown = null;
    this._onMouseMove = null;
    this._onMouseUp = null;
  }

  activate() {
    this.canvas.isDrawingMode = false;
    this.canvas.selection = false;
    this.canvas.defaultCursor = 'crosshair';
    this.canvas.forEachObject(o => { o.selectable = false; });

    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseUp = this._handleMouseUp.bind(this);

    this.canvas.on('mouse:down', this._onMouseDown);
    this.canvas.on('mouse:move', this._onMouseMove);
    this.canvas.on('mouse:up', this._onMouseUp);
  }

  deactivate() {
    this.canvas.off('mouse:down', this._onMouseDown);
    this.canvas.off('mouse:move', this._onMouseMove);
    this.canvas.off('mouse:up', this._onMouseUp);
    this.canvas.defaultCursor = 'default';
    this.canvas.selection = true;
    this.canvas.forEachObject(o => { o.selectable = true; });
    this._isDrawing = false;
    this._rect = null;
  }

  _handleMouseDown(opt) {
    const pointer = this.canvas.getPointer(opt.e);
    this._isDrawing = true;
    this._startX = pointer.x;
    this._startY = pointer.y;

    const color = this.manager.getLabelColor();
    this._rect = new fabric.Rect({
      left: pointer.x,
      top: pointer.y,
      width: 0,
      height: 0,
      fill: color + '33',
      stroke: color,
      strokeWidth: 2,
      selectable: false,
      annotationId: crypto.randomUUID(),
      annotationType: 'rectangle',
      labelClass: this.manager.getLabelClass(),
      createdBy: 'human',
      confidence: null,
    });
    this.canvas.add(this._rect);
  }

  _handleMouseMove(opt) {
    if (!this._isDrawing || !this._rect) return;
    const pointer = this.canvas.getPointer(opt.e);

    const left = Math.min(this._startX, pointer.x);
    const top = Math.min(this._startY, pointer.y);
    const width = Math.abs(pointer.x - this._startX);
    const height = Math.abs(pointer.y - this._startY);

    this._rect.set({ left, top, width, height });
    this.canvas.renderAll();
  }

  _handleMouseUp() {
    if (!this._isDrawing || !this._rect) return;
    this._isDrawing = false;

    // Discard tiny accidental clicks
    if (this._rect.width < 5 || this._rect.height < 5) {
      this.canvas.remove(this._rect);
      this._rect = null;
      return;
    }

    this._rect.setCoords();
    this._rect.selectable = true;
    this.canvas.renderAll();

    this.manager.onAnnotationCreated({
      id: this._rect.annotationId,
      type: 'rectangle',
      labelClass: this._rect.labelClass,
      fabricObject: this._rect,
      color: this._rect.stroke,
    });

    this._rect = null;
  }
}
