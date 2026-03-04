const STORAGE_KEY = 'labelbricks-label-classes';
const COLOR_PALETTE = [
  '#FF3621', '#3B82F6', '#00A972', '#F59E0B', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16',
];

/**
 * Manages label class input, recently-used chips, and per-class color assignment.
 */
export class LabelManager {
  constructor() {
    this.inputEl = document.getElementById('label-input');
    this.chipsEl = document.getElementById('label-chips');
    this.currentClass = '';
    this.classColorMap = new Map();
    this.recentClasses = this._loadRecent();
    this._colorIndex = 0;
    this.onClassChange = null;
  }

  init() {
    this.inputEl?.addEventListener('input', (e) => {
      this.currentClass = e.target.value.trim();
    });

    this.inputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.currentClass) {
        e.preventDefault();
        this._addToRecent(this.currentClass);
      }
    });

    // Restore colors for recent classes
    this.recentClasses.forEach(cls => this.getColorForClass(cls));
    this._renderChips();
  }

  getCurrentClass() {
    return this.currentClass || 'unlabeled';
  }

  getColorForClass(className) {
    if (!this.classColorMap.has(className)) {
      const color = COLOR_PALETTE[this._colorIndex % COLOR_PALETTE.length];
      this.classColorMap.set(className, color);
      this._colorIndex++;
    }
    return this.classColorMap.get(className);
  }

  getCurrentColor() {
    return this.getColorForClass(this.getCurrentClass());
  }

  setClass(className) {
    this.currentClass = className;
    if (this.inputEl) this.inputEl.value = className;
    this._addToRecent(className);
    if (this.onClassChange) this.onClassChange(className);
  }

  _addToRecent(className) {
    // Move to front if already exists, or add
    this.recentClasses = this.recentClasses.filter(c => c !== className);
    this.recentClasses.unshift(className);
    if (this.recentClasses.length > 20) this.recentClasses.pop();
    this._saveRecent();
    this._renderChips();
  }

  _renderChips() {
    if (!this.chipsEl) return;
    this.chipsEl.innerHTML = '';
    this.recentClasses.forEach(cls => {
      const chip = document.createElement('button');
      chip.className = `label-chip${cls === this.currentClass ? ' active' : ''}`;
      chip.textContent = cls;
      const color = this.getColorForClass(cls);
      chip.style.borderColor = color;
      if (cls === this.currentClass) {
        chip.style.background = color + '1A'; // ~10% opacity
      }
      chip.addEventListener('click', () => this.setClass(cls));
      this.chipsEl.appendChild(chip);
    });
  }

  _loadRecent() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch { return []; }
  }

  _saveRecent() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.recentClasses));
  }
}
