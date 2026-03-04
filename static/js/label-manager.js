import API from './api-client.js';

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
    this._suggestionsEl = null;
    this._searchTimeout = null;
  }

  init() {
    this.inputEl?.addEventListener('input', (e) => {
      this.currentClass = e.target.value.trim();
      this._debouncedSearch(this.currentClass);
    });

    this.inputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.currentClass) {
        e.preventDefault();
        this._addToRecent(this.currentClass);
        this._hideAutocomplete();
      }
    });

    this.inputEl?.addEventListener('blur', () => {
      // Delay hide so click events on suggestions register
      setTimeout(() => this._hideAutocomplete(), 150);
    });

    // Add autocomplete dropdown
    if (this.inputEl?.parentNode) {
      this._suggestionsEl = document.createElement('div');
      this._suggestionsEl.className = 'label-autocomplete hidden';
      this.inputEl.parentNode.style.position = 'relative';
      this.inputEl.parentNode.appendChild(this._suggestionsEl);
    }

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

  _debouncedSearch(prefix) {
    clearTimeout(this._searchTimeout);
    if (!prefix || prefix.length < 1) {
      this._hideAutocomplete();
      return;
    }
    this._searchTimeout = setTimeout(async () => {
      try {
        const results = await API.getLabelClasses(prefix);
        this._renderAutocomplete(results);
      } catch {
        this._hideAutocomplete();
      }
    }, 200);
  }

  _renderAutocomplete(results) {
    if (!this._suggestionsEl) return;
    // Filter out labels already in recent chips
    const filtered = results.filter(r => !this.recentClasses.includes(r.class_name));
    if (filtered.length === 0) {
      this._hideAutocomplete();
      return;
    }
    this._suggestionsEl.innerHTML = '';
    filtered.forEach(r => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.textContent = `${r.class_name} (${r.usage_count})`;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.setClass(r.class_name);
        this._hideAutocomplete();
      });
      this._suggestionsEl.appendChild(item);
    });
    this._suggestionsEl.classList.remove('hidden');
  }

  _hideAutocomplete() {
    this._suggestionsEl?.classList.add('hidden');
  }
}
