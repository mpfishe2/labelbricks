/**
 * In-memory annotation data model. Tracks all annotations on the current image,
 * provides serialization to/from JSON, and renders the annotation list in the toolbar.
 */
export class AnnotationStore {
  constructor() {
    this.annotations = new Map(); // annotationId -> { annotationId, type, labelClass, createdBy, confidence, fabricObject }
    this.listEl = document.getElementById('annotation-list');
    this.onSelect = null; // callback when user clicks an annotation in the list
  }

  add(annotation) {
    this.annotations.set(annotation.id, {
      annotationId: annotation.id,
      type: annotation.type,
      labelClass: annotation.labelClass || 'unlabeled',
      createdBy: annotation.createdBy || 'human',
      confidence: annotation.confidence || null,
      fabricObject: annotation.fabricObject,
      color: annotation.color || '#FF3621',
    });
    this._renderList();
  }

  remove(annotationId) {
    this.annotations.delete(annotationId);
    this._renderList();
  }

  removeByObject(fabricObj) {
    for (const [id, ann] of this.annotations) {
      if (ann.fabricObject === fabricObj) {
        this.annotations.delete(id);
        this._renderList();
        return id;
      }
    }
    return null;
  }

  updateLabel(annotationId, newLabel, newColor) {
    const ann = this.annotations.get(annotationId);
    if (!ann) return;
    ann.labelClass = newLabel;
    ann.color = newColor;
    const obj = ann.fabricObject;
    if (obj) {
      obj.set({ stroke: newColor, fill: newColor + '33', labelClass: newLabel });
      obj.canvas?.renderAll();
    }
    this._renderList();
  }

  clear() {
    this.annotations.clear();
    this._renderList();
  }

  /** Serialize all annotations to the JSON save format. */
  toJSON() {
    return Array.from(this.annotations.values()).map(ann => {
      const obj = ann.fabricObject;
      let coordinates = {};

      switch (ann.type) {
        case 'rectangle':
          coordinates = {
            left: Math.round(obj.left),
            top: Math.round(obj.top),
            width: Math.round(obj.width * (obj.scaleX || 1)),
            height: Math.round(obj.height * (obj.scaleY || 1)),
          };
          break;
        case 'circle':
          coordinates = {
            cx: Math.round(obj.left + (obj.rx || 0) * (obj.scaleX || 1)),
            cy: Math.round(obj.top + (obj.ry || 0) * (obj.scaleY || 1)),
            rx: Math.round((obj.rx || 0) * (obj.scaleX || 1)),
            ry: Math.round((obj.ry || 0) * (obj.scaleY || 1)),
          };
          break;
        case 'polygon':
          coordinates = {
            points: (obj.points || []).map(p => ({
              x: Math.round(p.x),
              y: Math.round(p.y),
            })),
            left: Math.round(obj.left),
            top: Math.round(obj.top),
          };
          break;
        case 'freehand':
          coordinates = { path: obj.path };
          break;
        default:
          coordinates = {
            left: Math.round(obj.left),
            top: Math.round(obj.top),
          };
      }

      return {
        annotationId: ann.annotationId,
        type: ann.type,
        labelClass: ann.labelClass,
        coordinates,
        confidence: ann.confidence,
        createdBy: ann.createdBy,
        color: ann.color,
      };
    });
  }

  /** Reconstruct Fabric objects from saved JSON annotations. */
  fromJSON(annotations, canvas, labelManager) {
    this.clear();
    if (!annotations || !Array.isArray(annotations)) return;

    annotations.forEach(ann => {
      const color = ann.color || labelManager.getColorForClass(ann.labelClass);
      let fabricObj = null;

      switch (ann.type) {
        case 'rectangle':
          fabricObj = new fabric.Rect({
            left: ann.coordinates.left,
            top: ann.coordinates.top,
            width: ann.coordinates.width,
            height: ann.coordinates.height,
            fill: color + '33',
            stroke: color,
            strokeWidth: 2,
          });
          break;
        case 'circle':
          fabricObj = new fabric.Ellipse({
            left: ann.coordinates.cx - ann.coordinates.rx,
            top: ann.coordinates.cy - ann.coordinates.ry,
            rx: ann.coordinates.rx,
            ry: ann.coordinates.ry,
            fill: color + '33',
            stroke: color,
            strokeWidth: 2,
          });
          break;
        case 'polygon':
          fabricObj = new fabric.Polygon(ann.coordinates.points || [], {
            left: ann.coordinates.left || 0,
            top: ann.coordinates.top || 0,
            fill: color + '33',
            stroke: color,
            strokeWidth: 2,
          });
          break;
        case 'freehand':
          if (ann.coordinates.path) {
            fabricObj = new fabric.Path(ann.coordinates.path, {
              fill: null,
              stroke: color,
              strokeWidth: 3,
            });
          }
          break;
      }

      if (fabricObj) {
        fabricObj.annotationId = ann.annotationId;
        fabricObj.annotationType = ann.type;
        fabricObj.labelClass = ann.labelClass;
        fabricObj.createdBy = ann.createdBy;
        fabricObj.confidence = ann.confidence;
        canvas.add(fabricObj);
        this.add({
          id: ann.annotationId,
          type: ann.type,
          labelClass: ann.labelClass,
          fabricObject: fabricObj,
          createdBy: ann.createdBy,
          confidence: ann.confidence,
          color,
        });
      }
    });
    canvas.renderAll();
  }

  _renderList() {
    if (!this.listEl) return;
    this.listEl.innerHTML = '';
    if (this.annotations.size === 0) {
      this.listEl.innerHTML = '<div style="color: var(--color-text-muted); font-size: var(--font-size-xs); padding: 4px;">No annotations yet</div>';
      return;
    }
    this.annotations.forEach((ann) => {
      const item = document.createElement('div');
      item.className = 'annotation-item';
      item.innerHTML = `
        <span class="annotation-color-dot" style="background: ${ann.color}"></span>
        <span class="annotation-type">${ann.type}</span>
        <span class="annotation-label">${ann.labelClass}</span>
      `;
      item.addEventListener('click', () => {
        if (ann.fabricObject?.canvas) {
          ann.fabricObject.canvas.setActiveObject(ann.fabricObject);
          ann.fabricObject.canvas.renderAll();
        }
        if (this.onSelect) this.onSelect(ann);
      });
      this.listEl.appendChild(item);
    });
  }
}
