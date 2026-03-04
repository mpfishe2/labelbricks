/**
 * AISuggestManager — Handles AI-assisted annotation suggestions.
 * Manages the suggest button, API calls, rendering dashed suggestion
 * overlays on the canvas, confidence filtering, and accept/edit/reject workflow.
 */
import API from './api-client.js';

export class AISuggestManager {
  constructor(app) {
    this.app = app;
    this._suggestions = [];
    this._actionBar = null;
    this._activeSuggestion = null;
    this._threshold = 0.3;
    this._isLoading = false;

    this._btnSuggest = null;
    this._thresholdSlider = null;
    this._thresholdValue = null;
    this._promptTextarea = null;
    this._promptToggle = null;
    this._suggestCount = null;
  }

  init() {
    this._btnSuggest = document.getElementById('btn-ai-suggest');
    this._thresholdSlider = document.getElementById('ai-threshold');
    this._thresholdValue = document.getElementById('ai-threshold-value');
    this._promptTextarea = document.getElementById('ai-prompt');
    this._promptToggle = document.getElementById('ai-prompt-toggle');
    this._suggestCount = document.getElementById('ai-suggest-count');

    this._btnSuggest?.addEventListener('click', () => this.suggest());

    this._thresholdSlider?.addEventListener('input', (e) => {
      this._threshold = parseFloat(e.target.value);
      if (this._thresholdValue) {
        this._thresholdValue.textContent = this._threshold.toFixed(2);
      }
      this._applyThresholdFilter();
    });

    this._promptToggle?.addEventListener('click', () => {
      const section = document.getElementById('ai-prompt-section');
      section?.classList.toggle('collapsed');
      if (this._promptToggle) {
        this._promptToggle.textContent = section?.classList.contains('collapsed')
          ? 'Customize prompt...' : 'Hide prompt';
      }
    });

    this._buildActionBar();

    const canvas = this.app.canvasManager.getCanvas();
    canvas.on('mouse:down', (opt) => this._onCanvasClick(opt));
  }

  async suggest() {
    if (this._isLoading) return;

    const filePath = this.app.currentFiles[this.app.currentIndex];
    if (!filePath) return;

    this._isLoading = true;
    this._setButtonLoading(true);
    this.clearSuggestions();

    const prompt = this._promptTextarea?.value.trim() || null;

    try {
      const result = await API.getAISuggestions({ filePath, prompt });

      if (result.suggestions && result.suggestions.length > 0) {
        this._renderSuggestions(result.suggestions);
        this.app.showToast(`AI found ${result.suggestions.length} object(s)`);
      } else {
        this.app.showToast('AI found no objects in this image', 'error');
      }
    } catch (e) {
      console.error('AI suggest failed:', e);
      this.app.showToast(`AI suggestion failed: ${e.message}`, 'error');
    } finally {
      this._isLoading = false;
      this._setButtonLoading(false);
    }
  }

  _renderSuggestions(suggestions) {
    const canvas = this.app.canvasManager.getCanvas();
    const scale = this.app.canvasManager.getScale();
    const bgImg = this.app.canvasManager.backgroundImage;
    if (!bgImg) return;

    const naturalW = bgImg.width;
    const naturalH = bgImg.height;
    const AI_COLOR = '#3B82F6';

    suggestions.forEach((s) => {
      const id = `ai-${crypto.randomUUID()}`;

      const left = (s.bbox.x / 100) * naturalW * scale;
      const top = (s.bbox.y / 100) * naturalH * scale;
      const width = (s.bbox.width / 100) * naturalW * scale;
      const height = (s.bbox.height / 100) * naturalH * scale;

      const rect = new fabric.Rect({
        left,
        top,
        width,
        height,
        fill: AI_COLOR + '15',
        stroke: AI_COLOR,
        strokeWidth: 2,
        strokeDashArray: [6, 3],
        selectable: false,
        evented: true,
        hoverCursor: 'pointer',
        isSuggestion: true,
        suggestionId: id,
        labelClass: s.label,
        confidence: s.confidence,
      });
      rect.excludeFromExport = true;

      const labelText = new fabric.Text(
        `${s.label} (${Math.round(s.confidence * 100)}%)`,
        {
          left: left,
          top: Math.max(0, top - 18),
          fontSize: 11,
          fontFamily: 'Inter, sans-serif',
          fill: '#FFFFFF',
          backgroundColor: AI_COLOR + 'CC',
          padding: 2,
          selectable: false,
          evented: false,
          isSuggestionLabel: true,
          suggestionId: id,
        }
      );
      labelText.excludeFromExport = true;

      canvas.add(rect);
      canvas.add(labelText);

      this._suggestions.push({
        id,
        label: s.label,
        bbox: s.bbox,
        confidence: s.confidence,
        fabricRect: rect,
        fabricLabel: labelText,
        visible: s.confidence >= this._threshold,
      });
    });

    this._applyThresholdFilter();
    this._updateCount();
    canvas.renderAll();
  }

  _applyThresholdFilter() {
    const canvas = this.app.canvasManager.getCanvas();

    this._suggestions.forEach(s => {
      const visible = s.confidence >= this._threshold;
      s.visible = visible;
      s.fabricRect.set({ visible });
      s.fabricLabel.set({ visible });
    });

    this._updateCount();

    if (this._activeSuggestion && !this._activeSuggestion.visible) {
      this._hideActionBar();
    }

    canvas.renderAll();
  }

  _updateCount() {
    const visible = this._suggestions.filter(s => s.visible).length;
    const total = this._suggestions.length;
    if (this._suggestCount) {
      this._suggestCount.textContent = total > 0 ? `${visible}/${total} shown` : '';
    }
  }

  // ---- Canvas Click → Action Bar ----

  _onCanvasClick(opt) {
    if (this._suggestions.length === 0) return;
    const target = opt.target;

    if (target && target.isSuggestion && target.visible !== false) {
      const suggestion = this._suggestions.find(s => s.id === target.suggestionId);
      if (suggestion) {
        this._activeSuggestion = suggestion;
        this._showActionBar(suggestion);
        return;
      }
    }

    if (this._activeSuggestion) {
      this._hideActionBar();
    }
  }

  _buildActionBar() {
    this._actionBar = document.createElement('div');
    this._actionBar.className = 'ai-action-bar hidden';
    this._actionBar.innerHTML = `
      <button class="ai-action-btn ai-action-accept" title="Accept">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Accept
      </button>
      <button class="ai-action-btn ai-action-edit" title="Edit label">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Edit
      </button>
      <button class="ai-action-btn ai-action-reject" title="Reject">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        Reject
      </button>
    `;

    this._actionBar.addEventListener('mousedown', (e) => e.stopPropagation());

    this._actionBar.querySelector('.ai-action-accept').addEventListener('click', () => this._accept());
    this._actionBar.querySelector('.ai-action-edit').addEventListener('click', () => this._edit());
    this._actionBar.querySelector('.ai-action-reject').addEventListener('click', () => this._reject());

    const canvasArea = document.getElementById('canvas-area');
    canvasArea.appendChild(this._actionBar);
  }

  _showActionBar(suggestion) {
    const canvas = this.app.canvasManager.getCanvas();
    const canvasEl = canvas.getElement();
    const canvasRect = canvasEl.getBoundingClientRect();
    const areaRect = document.getElementById('canvas-area').getBoundingClientRect();

    const bound = suggestion.fabricRect.getBoundingRect();

    let left = (canvasRect.left - areaRect.left) + bound.left + bound.width / 2;
    let top = (canvasRect.top - areaRect.top) + bound.top + bound.height + 8;

    const barW = 240;
    const barH = 40;
    left = Math.max(8, Math.min(left - barW / 2, areaRect.width - barW - 8));
    top = Math.min(top, areaRect.height - barH - 8);

    this._actionBar.style.left = `${left}px`;
    this._actionBar.style.top = `${top}px`;
    this._actionBar.classList.remove('hidden');

    suggestion.fabricRect.set({ strokeWidth: 3 });
    canvas.renderAll();
  }

  _hideActionBar() {
    this._actionBar?.classList.add('hidden');

    if (this._activeSuggestion) {
      this._activeSuggestion.fabricRect.set({ strokeWidth: 2 });
      this.app.canvasManager.getCanvas().renderAll();
    }
    this._activeSuggestion = null;
  }

  // ---- Accept / Edit / Reject ----

  _accept() {
    const s = this._activeSuggestion;
    if (!s) return;

    const canvas = this.app.canvasManager.getCanvas();
    const color = this.app.labelManager.getColorForClass(s.label);
    const rect = s.fabricRect;

    const newId = crypto.randomUUID();

    rect.set({
      fill: color + '33',
      stroke: color,
      strokeWidth: 2,
      strokeDashArray: null,
      selectable: true,
      hoverCursor: 'move',
      isSuggestion: false,
      annotationId: newId,
      annotationType: 'rectangle',
      labelClass: s.label,
      createdBy: 'ai-accepted',
      confidence: s.confidence,
    });
    rect.excludeFromExport = false;
    rect.setCoords();

    canvas.remove(s.fabricLabel);

    this.app.annotationStore.add({
      id: newId,
      type: 'rectangle',
      labelClass: s.label,
      fabricObject: rect,
      createdBy: 'ai-accepted',
      confidence: s.confidence,
      color,
    });

    this.app.labelManager._addToRecent(s.label);
    this._removeSuggestion(s.id);
    this._hideActionBar();
    this.app.undoManager.snapshot();

    canvas.renderAll();
  }

  _edit() {
    const s = this._activeSuggestion;
    if (!s) return;

    const canvas = this.app.canvasManager.getCanvas();

    s.fabricRect.set({
      selectable: true,
      hasControls: true,
      hasBorders: true,
      lockRotation: true,
      hoverCursor: 'move',
    });
    s.fabricRect.setCoords();
    canvas.setActiveObject(s.fabricRect);
    canvas.renderAll();

    this._hideActionBar();

    this.app.labelPopup.show({
      fabricObject: s.fabricRect,
      annotationId: s.id,
      currentLabel: s.label,
      labelManager: this.app.labelManager,
      onConfirm: (id, label, color) => {
        s.label = label;
        this._acceptAfterEdit(s, color);
      },
    });
  }

  _acceptAfterEdit(s, color) {
    const canvas = this.app.canvasManager.getCanvas();
    const rect = s.fabricRect;
    const newId = crypto.randomUUID();

    rect.set({
      fill: color + '33',
      stroke: color,
      strokeWidth: 2,
      strokeDashArray: null,
      isSuggestion: false,
      annotationId: newId,
      annotationType: 'rectangle',
      labelClass: s.label,
      createdBy: 'ai-accepted',
      confidence: s.confidence,
    });
    rect.excludeFromExport = false;
    rect.setCoords();

    canvas.remove(s.fabricLabel);

    this.app.annotationStore.add({
      id: newId,
      type: 'rectangle',
      labelClass: s.label,
      fabricObject: rect,
      createdBy: 'ai-accepted',
      confidence: s.confidence,
      color,
    });

    this.app.labelManager._addToRecent(s.label);
    this._removeSuggestion(s.id);
    this.app.undoManager.snapshot();
    canvas.renderAll();
  }

  _reject() {
    const s = this._activeSuggestion;
    if (!s) return;

    const canvas = this.app.canvasManager.getCanvas();
    canvas.remove(s.fabricRect);
    canvas.remove(s.fabricLabel);

    this._removeSuggestion(s.id);
    this._hideActionBar();
    canvas.renderAll();
  }

  _removeSuggestion(id) {
    this._suggestions = this._suggestions.filter(s => s.id !== id);
    this._updateCount();
  }

  // ---- Utility ----

  clearSuggestions() {
    const canvas = this.app.canvasManager.getCanvas();
    this._suggestions.forEach(s => {
      canvas.remove(s.fabricRect);
      canvas.remove(s.fabricLabel);
    });
    this._suggestions = [];
    this._hideActionBar();
    this._updateCount();
    canvas.renderAll();
  }

  hasSuggestions() {
    return this._suggestions.length > 0;
  }

  _setButtonLoading(loading) {
    if (!this._btnSuggest) return;
    if (loading) {
      this._btnSuggest.disabled = true;
      this._btnSuggest.innerHTML = '<div class="spinner"></div> Analyzing...';
    } else {
      this._btnSuggest.disabled = false;
      this._btnSuggest.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
        </svg>
        AI Suggest
      `;
    }
  }
}
