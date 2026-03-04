/**
 * LabelBricks — Main application entry point.
 * Orchestrates all modules: canvas, tools, annotations, sidebar, volume browser, undo.
 */
import API from './api-client.js';
import { CanvasManager } from './canvas-manager.js';
import { ToolManager } from './tool-manager.js';
import { AnnotationStore } from './annotation-store.js';
import { LabelManager } from './label-manager.js';
import { Sidebar } from './sidebar.js';
import { VolumeBrowser } from './volume-browser.js';
import { UndoManager } from './undo-manager.js';
import { LabelPopup } from './label-popup.js';

class LabelBricksApp {
  constructor() {
    this.canvasManager = new CanvasManager('canvas', 'canvas-wrapper');
    this.annotationStore = new AnnotationStore();
    this.labelManager = new LabelManager();
    this.sidebar = new Sidebar(this);
    this.volumeBrowser = new VolumeBrowser(this);
    this.undoManager = null; // Initialized after canvas
    this.toolManager = null; // Initialized after canvas
    this.labelPopup = new LabelPopup('canvas-wrapper');

    this.currentFiles = [];
    this.currentIndex = -1;
    this.volumePath = null;
    this._saving = false;
  }

  init() {
    const canvas = this.canvasManager.init();

    // Initialize undo manager
    this.undoManager = new UndoManager(canvas, this.annotationStore);
    this.undoManager.init();

    // Initialize tool manager with callbacks
    this.toolManager = new ToolManager(canvas, {
      onAnnotationCreated: (ann) => this._onAnnotationCreated(ann),
      onAnnotationDeleted: (obj) => this._onAnnotationDeleted(obj),
      getLabelClass: () => this.labelManager.getCurrentClass(),
      getLabelColor: () => this.labelManager.getCurrentColor(),
    });
    this.toolManager.init();

    // Initialize other modules
    this.labelManager.init();
    this.sidebar.init();
    this.volumeBrowser.init();

    // Show label popup when user selects an existing annotation
    canvas.on('selection:created', (e) => this._onSelectionChanged(e));
    canvas.on('selection:updated', (e) => this._onSelectionChanged(e));

    // Bind bottom bar buttons
    document.getElementById('btn-save')?.addEventListener('click', () => this.save());
    document.getElementById('btn-next')?.addEventListener('click', () => this.next());
    document.getElementById('btn-prev')?.addEventListener('click', () => this.prev());

    // Ctrl+S to save
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.save();
      }
    });

    // Load files from server-rendered data
    const filesDataEl = document.getElementById('files-data');
    if (filesDataEl) {
      try {
        const files = JSON.parse(filesDataEl.textContent);
        if (files && files.length > 0) {
          this.onVolumeSelected(files);
        }
      } catch { /* no files */ }
    }

    // If no files loaded, auto-open volume browser
    if (this.currentFiles.length === 0) {
      this.volumeBrowser.open();
    }
  }

  /** Called by VolumeBrowser when user selects a volume. */
  onVolumeSelected(files, volumePath) {
    this.currentFiles = files;
    this.currentIndex = -1;
    if (volumePath) this.volumePath = volumePath;
    this.sidebar.setFiles(files);
    if (files.length > 0) {
      this.loadImageByIndex(0);
    }
  }

  async loadImageByIndex(index) {
    if (index < 0 || index >= this.currentFiles.length) return;
    this.currentIndex = index;
    const filePath = this.currentFiles[index];

    // Clear current state
    this.annotationStore.clear();
    this.undoManager.reset();
    this.canvasManager.clearAnnotations();

    // Load image
    const imageUrl = API.getImageUrl(filePath);
    try {
      await this.canvasManager.loadImage(filePath, imageUrl);
    } catch (e) {
      this.showToast('Failed to load image', 'error');
      return;
    }

    // Load existing annotations if any
    try {
      const existing = await API.loadAnnotations(filePath, this.volumePath);
      if (existing && existing.annotations && existing.annotations.length > 0) {
        this.annotationStore.fromJSON(
          existing.annotations,
          this.canvasManager.getCanvas(),
          this.labelManager
        );
        // Restore status and notes
        const statusEl = document.getElementById('status-select');
        const notesEl = document.getElementById('notes');
        if (statusEl) statusEl.value = existing.status || 'pending';
        if (notesEl) notesEl.value = existing.notes || '';

        // Update sidebar status
        this.sidebar.setStatus(filePath, existing.status || 'pending');
      } else {
        document.getElementById('status-select').value = 'pending';
        document.getElementById('notes').value = '';
      }
    } catch {
      // No existing annotations — that's fine
      document.getElementById('status-select').value = 'pending';
      document.getElementById('notes').value = '';
    }

    // Take initial undo snapshot
    this.undoManager.snapshot();

    // Re-render sidebar to update active item
    this.sidebar.render();

    // Switch to select tool
    this.toolManager.activate('select');
  }

  async save() {
    if (this._saving || this.currentIndex < 0) return;
    this._saving = true;

    // Show saving overlay
    this._showSavingOverlay();

    const filePath = this.currentFiles[this.currentIndex];
    const status = document.getElementById('status-select')?.value || 'pending';
    const notes = document.getElementById('notes')?.value || '';
    const annotations = this.annotationStore.toJSON();
    const compositeImage = this.canvasManager.toDataURL();

    const MAX_RETRIES = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await API.saveAnnotations({
          filePath, annotations, status, notes, compositeImage,
          volumePath: this.volumePath,
        });
        this.sidebar.setStatus(filePath, status);
        this._hideSavingOverlay();
        this.showToast('Saved successfully');

        // Auto-advance to next pending image if marked as reviewed
        if (status === 'reviewed') {
          setTimeout(() => this.next(), 400);
        }
        this._saving = false;
        return;
      } catch (e) {
        lastError = e;
        if (attempt < MAX_RETRIES) {
          // Wait briefly before retry
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    // All retries failed
    this._hideSavingOverlay();
    this._saving = false;
    this.showToast(`Save failed after ${MAX_RETRIES} attempts`, 'error');
    console.error('Save failed:', lastError);
  }

  _showSavingOverlay() {
    let overlay = document.getElementById('saving-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'saving-overlay';
      overlay.className = 'saving-overlay';
      overlay.innerHTML = `
        <div class="saving-dialog">
          <div class="spinner"></div>
          <span>Saving annotations...</span>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    overlay.classList.remove('hidden');
  }

  _hideSavingOverlay() {
    const overlay = document.getElementById('saving-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  next() {
    if (this.currentIndex < this.currentFiles.length - 1) {
      // Try to find next non-reviewed image
      let nextIdx = this.currentFiles.findIndex(
        (f, i) => i > this.currentIndex && this.sidebar.statuses[f] !== 'reviewed'
      );
      // Fallback to next sequential
      if (nextIdx === -1) nextIdx = this.currentIndex + 1;
      if (nextIdx < this.currentFiles.length) {
        this.loadImageByIndex(nextIdx);
      }
    }
  }

  prev() {
    if (this.currentIndex > 0) {
      this.loadImageByIndex(this.currentIndex - 1);
    }
  }

  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  _onAnnotationCreated(ann) {
    this.annotationStore.add(ann);
    this.undoManager.snapshot();

    // Show label popup at the new annotation
    this.labelPopup.show({
      fabricObject: ann.fabricObject,
      annotationId: ann.id,
      currentLabel: ann.labelClass || '',
      labelManager: this.labelManager,
      onConfirm: (id, label, color) => {
        this.annotationStore.updateLabel(id, label, color);
        this.labelManager.setClass(label);
        this.undoManager.snapshot();
      },
    });
  }

  _onAnnotationDeleted(fabricObj) {
    this.labelPopup.hide();
    this.annotationStore.removeByObject(fabricObj);
    this.undoManager.snapshot();
  }

  _onSelectionChanged(e) {
    // Only show popup in select mode for existing annotations
    if (this.toolManager?.activeToolName !== 'select') return;
    const obj = e.selected?.[0];
    if (!obj || !obj.annotationId) return;

    this.labelPopup.show({
      fabricObject: obj,
      annotationId: obj.annotationId,
      currentLabel: obj.labelClass || 'unlabeled',
      labelManager: this.labelManager,
      onConfirm: (id, label, color) => {
        this.annotationStore.updateLabel(id, label, color);
        this.labelManager.setClass(label);
        this.undoManager.snapshot();
      },
    });
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new LabelBricksApp();
  app.init();
  window.__app = app; // debug access
});
