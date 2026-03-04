/**
 * Circle/ellipse annotation tool. Mousedown -> drag -> mouseup creates a fabric.Ellipse.
 */
export class CircleTool {
  constructor(canvas, manager) {
    this.canvas = canvas;
    this.manager = manager;
    this._isDrawing = false;
    this._startX = 0;
    this._startY = 0;
    this._ellipse = null;
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
    this._ellipse = null;
  }

  _handleMouseDown(opt) {
    const pointer = this.canvas.getPointer(opt.e);
    this._isDrawing = true;
    this._startX = pointer.x;
    this._startY = pointer.y;

    const color = this.manager.getLabelColor();
    this._ellipse = new fabric.Ellipse({
      left: pointer.x,
      top: pointer.y,
      rx: 0,
      ry: 0,
      fill: color + '33',
      stroke: color,
      strokeWidth: 2,
      selectable: false,
      annotationId: crypto.randomUUID(),
      annotationType: 'circle',
      labelClass: this.manager.getLabelClass(),
      createdBy: 'human',
      confidence: null,
    });
    this.canvas.add(this._ellipse);
  }

  _handleMouseMove(opt) {
    if (!this._isDrawing || !this._ellipse) return;
    const pointer = this.canvas.getPointer(opt.e);

    const left = Math.min(this._startX, pointer.x);
    const top = Math.min(this._startY, pointer.y);
    const rx = Math.abs(pointer.x - this._startX) / 2;
    const ry = Math.abs(pointer.y - this._startY) / 2;

    this._ellipse.set({ left, top, rx, ry });
    this.canvas.renderAll();
  }

  _handleMouseUp() {
    if (!this._isDrawing || !this._ellipse) return;
    this._isDrawing = false;

    // Discard tiny accidental clicks
    if (this._ellipse.rx < 3 || this._ellipse.ry < 3) {
      this.canvas.remove(this._ellipse);
      this._ellipse = null;
      return;
    }

    this._ellipse.setCoords();
    this._ellipse.selectable = true;
    this.canvas.renderAll();

    this.manager.onAnnotationCreated({
      id: this._ellipse.annotationId,
      type: 'circle',
      labelClass: this._ellipse.labelClass,
      fabricObject: this._ellipse,
      color: this._ellipse.stroke,
    });

    this._ellipse = null;
  }
}
