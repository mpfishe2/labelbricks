/**
 * Polygon annotation tool. Click to add vertices, double-click or click near
 * the starting point to close the polygon. Escape cancels.
 */
export class PolygonTool {
  constructor(canvas, manager) {
    this.canvas = canvas;
    this.manager = manager;
    this._points = [];
    this._lines = [];
    this._dots = [];
    this._activeLine = null;
    this._onMouseDown = null;
    this._onMouseMove = null;
    this._onDblClick = null;
    this._onKeyDown = null;
  }

  activate() {
    this.canvas.isDrawingMode = false;
    this.canvas.selection = false;
    this.canvas.defaultCursor = 'crosshair';
    this.canvas.forEachObject(o => { o.selectable = false; });

    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onDblClick = this._handleDblClick.bind(this);
    this._onKeyDown = this._handleKeyDown.bind(this);

    this.canvas.on('mouse:down', this._onMouseDown);
    this.canvas.on('mouse:move', this._onMouseMove);
    this.canvas.on('mouse:dblclick', this._onDblClick);
    document.addEventListener('keydown', this._onKeyDown);
  }

  deactivate() {
    this._cancelDrawing();
    this.canvas.off('mouse:down', this._onMouseDown);
    this.canvas.off('mouse:move', this._onMouseMove);
    this.canvas.off('mouse:dblclick', this._onDblClick);
    document.removeEventListener('keydown', this._onKeyDown);
    this.canvas.defaultCursor = 'default';
    this.canvas.selection = true;
    this.canvas.forEachObject(o => { o.selectable = true; });
  }

  _handleMouseDown(opt) {
    // Skip if this is part of a double-click
    if (opt.e && opt.e.detail >= 2) return;

    const pointer = this.canvas.getPointer(opt.e);

    // Check if close to starting point (< 15px) to close the polygon
    if (this._points.length >= 3) {
      const first = this._points[0];
      const dist = Math.hypot(pointer.x - first.x, pointer.y - first.y);
      if (dist < 15) {
        this._closePolygon();
        return;
      }
    }

    this._points.push({ x: pointer.x, y: pointer.y });

    // Draw vertex dot
    const color = this.manager.getLabelColor();
    const dot = new fabric.Circle({
      left: pointer.x - 4,
      top: pointer.y - 4,
      radius: 4,
      fill: color,
      stroke: '#fff',
      strokeWidth: 1,
      selectable: false,
      evented: false,
      _isPolygonHelper: true,
    });
    this.canvas.add(dot);
    this._dots.push(dot);

    // Draw connecting line from previous point
    if (this._points.length > 1) {
      const prev = this._points[this._points.length - 2];
      const line = new fabric.Line(
        [prev.x, prev.y, pointer.x, pointer.y],
        {
          stroke: color,
          strokeWidth: 2,
          strokeDashArray: [5, 3],
          selectable: false,
          evented: false,
          _isPolygonHelper: true,
        }
      );
      this.canvas.add(line);
      this._lines.push(line);
    }

    // Active guide line from current point to cursor
    if (this._activeLine) {
      this.canvas.remove(this._activeLine);
    }
    this._activeLine = new fabric.Line(
      [pointer.x, pointer.y, pointer.x, pointer.y],
      {
        stroke: color + '88',
        strokeWidth: 1,
        strokeDashArray: [3, 3],
        selectable: false,
        evented: false,
        _isPolygonHelper: true,
      }
    );
    this.canvas.add(this._activeLine);
    this.canvas.renderAll();
  }

  _handleMouseMove(opt) {
    if (!this._activeLine || this._points.length === 0) return;
    const pointer = this.canvas.getPointer(opt.e);
    this._activeLine.set({ x2: pointer.x, y2: pointer.y });
    this.canvas.renderAll();
  }

  _handleDblClick() {
    if (this._points.length >= 3) {
      this._closePolygon();
    }
  }

  _handleKeyDown(e) {
    if (e.key === 'Escape') {
      this._cancelDrawing();
    }
  }

  _closePolygon() {
    if (this._points.length < 3) {
      this._cancelDrawing();
      return;
    }

    const color = this.manager.getLabelColor();
    const points = this._points.map(p => ({ x: p.x, y: p.y }));

    // Remove helper objects
    this._removeHelpers();

    const polygon = new fabric.Polygon(points, {
      fill: color + '33',
      stroke: color,
      strokeWidth: 2,
      selectable: true,
      objectCaching: false,
      annotationId: crypto.randomUUID(),
      annotationType: 'polygon',
      labelClass: this.manager.getLabelClass(),
      createdBy: 'human',
      confidence: null,
    });

    this.canvas.add(polygon);
    this.canvas.renderAll();

    this.manager.onAnnotationCreated({
      id: polygon.annotationId,
      type: 'polygon',
      labelClass: polygon.labelClass,
      fabricObject: polygon,
      color: polygon.stroke,
    });

    this._points = [];
  }

  _cancelDrawing() {
    this._removeHelpers();
    this._points = [];
    this.canvas.renderAll();
  }

  _removeHelpers() {
    this._dots.forEach(d => this.canvas.remove(d));
    this._lines.forEach(l => this.canvas.remove(l));
    if (this._activeLine) {
      this.canvas.remove(this._activeLine);
      this._activeLine = null;
    }
    this._dots = [];
    this._lines = [];
  }
}
