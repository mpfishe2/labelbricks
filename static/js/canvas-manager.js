/**
 * Manages the Fabric.js canvas lifecycle: init, image loading, resize, export.
 */
export class CanvasManager {
  constructor(canvasId, wrapperId) {
    this.canvasEl = document.getElementById(canvasId);
    this.wrapperEl = document.getElementById(wrapperId);
    this.canvas = null;
    this.backgroundImage = null;
    this.currentFilePath = null;
    this._imageScale = 1;
  }

  init() {
    this.canvas = new fabric.Canvas(this.canvasEl, {
      selection: true,
      preserveObjectStacking: true,
    });
    return this.canvas;
  }

  async loadImage(filePath, imageUrl) {
    this.currentFilePath = filePath;
    // Remove all annotation objects
    this.canvas.getObjects().slice().forEach(obj => this.canvas.remove(obj));
    this.canvas.discardActiveObject();

    return new Promise((resolve, reject) => {
      fabric.Image.fromURL(imageUrl, (img) => {
        if (!img || !img.width) {
          reject(new Error('Failed to load image'));
          return;
        }

        const maxW = this.wrapperEl.clientWidth - 32;
        const maxH = this.wrapperEl.clientHeight - 32;
        const scale = Math.min(1, maxW / img.width, maxH / img.height);
        this._imageScale = scale;

        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        this.canvas.setWidth(w);
        this.canvas.setHeight(h);

        img.set({
          scaleX: scale,
          scaleY: scale,
          selectable: false,
          evented: false,
          hoverCursor: 'default',
        });

        this.canvas.setBackgroundImage(img, () => {
          this.canvas.renderAll();
          this.backgroundImage = img;
          resolve({ width: img.width, height: img.height, scale });
        });
      });
    });
  }

  getCanvas() {
    return this.canvas;
  }

  getScale() {
    return this._imageScale;
  }

  toDataURL() {
    return this.canvas.toDataURL({ format: 'png' });
  }

  clearAnnotations() {
    this.canvas.getObjects().slice().forEach(obj => this.canvas.remove(obj));
    this.canvas.discardActiveObject();
    this.canvas.renderAll();
  }

  destroy() {
    if (this.canvas) this.canvas.dispose();
  }
}
