/**
 * Floating label popup that appears near an annotation after drawing or on selection.
 * Shows a text input + recent label chips for quick labeling.
 */
export class LabelPopup {
  constructor(canvasWrapperId) {
    this.wrapperEl = document.getElementById(canvasWrapperId);
    this.popup = null;
    this.inputEl = null;
    this.chipsEl = null;
    this._currentAnnotationId = null;
    this._onConfirm = null;
    this._onClickOutside = null;
    this._onKeyDown = null;
    this._visible = false;
    this._build();
  }

  _build() {
    this.popup = document.createElement('div');
    this.popup.className = 'label-popup hidden';
    this.popup.innerHTML = `
      <input type="text" class="label-popup-input" placeholder="Label..." autofocus>
      <div class="label-popup-chips"></div>
    `;
    // Append to canvas-area (positioned relative) so it overlays the canvas
    const canvasArea = this.wrapperEl.closest('.canvas-area') || this.wrapperEl.parentElement;
    canvasArea.style.position = 'relative';
    canvasArea.appendChild(this.popup);

    this.inputEl = this.popup.querySelector('.label-popup-input');
    this.chipsEl = this.popup.querySelector('.label-popup-chips');

    // Prevent popup clicks from bubbling to canvas
    this.popup.addEventListener('mousedown', (e) => e.stopPropagation());
  }

  /**
   * Show the popup near a Fabric.js object.
   * @param {object} options
   * @param {fabric.Object} options.fabricObject - The annotation object
   * @param {string} options.annotationId - The annotation ID
   * @param {string} options.currentLabel - Current label value
   * @param {LabelManager} options.labelManager - For recent labels + colors
   * @param {function} options.onConfirm - Called with (annotationId, newLabel, newColor)
   */
  show({ fabricObject, annotationId, currentLabel, labelManager, onConfirm }) {
    this._currentAnnotationId = annotationId;
    this._onConfirm = onConfirm;

    // Position near the object
    const canvas = fabricObject.canvas;
    const bound = fabricObject.getBoundingRect();
    const canvasEl = canvas.getElement();
    const canvasRect = canvasEl.getBoundingClientRect();
    const areaRect = this.popup.parentElement.getBoundingClientRect();

    // Place below the object, offset from the canvas-area container
    let left = (canvasRect.left - areaRect.left) + bound.left + bound.width / 2;
    let top = (canvasRect.top - areaRect.top) + bound.top + bound.height + 8;

    // Clamp to stay within the area
    const popupW = 200;
    const popupH = 120;
    left = Math.max(8, Math.min(left - popupW / 2, areaRect.width - popupW - 8));
    top = Math.min(top, areaRect.height - popupH - 8);

    this.popup.style.left = `${left}px`;
    this.popup.style.top = `${top}px`;

    // Set input value
    this.inputEl.value = currentLabel === 'unlabeled' ? '' : currentLabel;

    // Render recent chips
    this._renderChips(labelManager);

    // Show
    this.popup.classList.remove('hidden');
    this._visible = true;

    // Focus input after a tick (so the click that triggered this doesn't steal focus)
    requestAnimationFrame(() => {
      this.inputEl.focus();
      this.inputEl.select();
    });

    // Bind events
    this._onKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._confirm(labelManager);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.hide();
      }
    };
    this.inputEl.addEventListener('keydown', this._onKeyDown);

    this._onClickOutside = (e) => {
      if (this._visible && !this.popup.contains(e.target)) {
        this.hide();
      }
    };
    // Delay binding to avoid the current click closing it immediately
    setTimeout(() => {
      document.addEventListener('mousedown', this._onClickOutside);
    }, 100);
  }

  hide() {
    this.popup.classList.add('hidden');
    this._visible = false;
    this._currentAnnotationId = null;

    if (this._onKeyDown) {
      this.inputEl.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
    if (this._onClickOutside) {
      document.removeEventListener('mousedown', this._onClickOutside);
      this._onClickOutside = null;
    }
  }

  isVisible() {
    return this._visible;
  }

  _confirm(labelManager) {
    const label = this.inputEl.value.trim() || 'unlabeled';
    const color = labelManager.getColorForClass(label);

    if (this._onConfirm && this._currentAnnotationId) {
      this._onConfirm(this._currentAnnotationId, label, color);
    }

    // Add to recent labels
    if (label !== 'unlabeled') {
      labelManager._addToRecent(label);
    }

    this.hide();
  }

  _renderChips(labelManager) {
    this.chipsEl.innerHTML = '';
    const recent = labelManager.recentClasses.slice(0, 6);
    recent.forEach(cls => {
      const chip = document.createElement('button');
      chip.className = 'label-popup-chip';
      chip.textContent = cls;
      const color = labelManager.getColorForClass(cls);
      chip.style.borderColor = color;
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        this.inputEl.value = cls;
        this._confirm(labelManager);
      });
      this.chipsEl.appendChild(chip);
    });
  }
}
