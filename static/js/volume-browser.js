import API from './api-client.js';

/**
 * Manages the volume browser modal: cascading catalog -> schema -> volume -> directory selection.
 */
export class VolumeBrowser {
  constructor(app) {
    this.app = app;
    this.modal = document.getElementById('volume-browser-modal');
    this.selected = { catalog: null, schema: null, volume: null, directory: null };
  }

  init() {
    document.getElementById('btn-change-volume')?.addEventListener('click', () => this.open());
    document.getElementById('modal-close')?.addEventListener('click', () => this.close());
    document.getElementById('modal-cancel')?.addEventListener('click', () => this.close());
    document.getElementById('btn-open-volume')?.addEventListener('click', () => this.confirm());

    // Click overlay to close
    this.modal?.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    // Bind filter inputs
    this._bindFilter('catalog-filter', 'catalog-list');
    this._bindFilter('schema-filter', 'schema-list');
    this._bindFilter('volume-filter', 'volume-list');
    this._bindFilter('directory-filter', 'directory-list');
  }

  async open() {
    this.modal.classList.remove('hidden');
    this._resetSelections();
    await this._loadCatalogs();
  }

  close() {
    this.modal.classList.add('hidden');
  }

  async _loadCatalogs() {
    const list = document.getElementById('catalog-list');
    list.innerHTML = '<li class="loading">Loading...</li>';
    try {
      const catalogs = await API.getCatalogs();
      list.innerHTML = '';
      catalogs.forEach(c => {
        const li = document.createElement('li');
        li.textContent = c.name;
        li.addEventListener('click', () => this._selectCatalog(c.name, li));
        list.appendChild(li);
      });
      if (catalogs.length === 0) {
        list.innerHTML = '<li class="loading">No catalogs found</li>';
      }
    } catch (e) {
      list.innerHTML = '<li class="error">Failed to load</li>';
    }
  }

  async _selectCatalog(name, el) {
    this.selected = { catalog: name, schema: null, volume: null, directory: null };
    this._setActive('catalog-list', el);
    this._clearList('schema-list');
    this._clearList('volume-list');
    this._clearList('directory-list');
    this._updateOpenButton();

    const list = document.getElementById('schema-list');
    list.innerHTML = '<li class="loading">Loading...</li>';
    try {
      const schemas = await API.getSchemas(name);
      list.innerHTML = '';
      schemas.forEach(s => {
        const li = document.createElement('li');
        li.textContent = s.name;
        li.addEventListener('click', () => this._selectSchema(s.name, li));
        list.appendChild(li);
      });
      if (schemas.length === 0) {
        list.innerHTML = '<li class="loading">No schemas found</li>';
      }
    } catch (e) {
      list.innerHTML = '<li class="error">Failed to load</li>';
    }
  }

  async _selectSchema(name, el) {
    this.selected.schema = name;
    this.selected.volume = null;
    this.selected.directory = null;
    this._setActive('schema-list', el);
    this._clearList('volume-list');
    this._clearList('directory-list');
    this._updateOpenButton();

    const list = document.getElementById('volume-list');
    list.innerHTML = '<li class="loading">Loading...</li>';
    try {
      const volumes = await API.getVolumes(this.selected.catalog, name);
      list.innerHTML = '';
      volumes.forEach(v => {
        const li = document.createElement('li');
        li.textContent = v.name;
        li.addEventListener('click', () => this._selectVolume(v.name, li));
        list.appendChild(li);
      });
      if (volumes.length === 0) {
        list.innerHTML = '<li class="loading">No volumes found</li>';
      }
    } catch (e) {
      list.innerHTML = '<li class="error">Failed to load</li>';
    }
  }

  async _selectVolume(name, el) {
    this.selected.volume = name;
    this.selected.directory = null;
    this._setActive('volume-list', el);
    this._clearList('directory-list');
    this._updateOpenButton();

    // Load root directories of the volume
    const volumePath = `/Volumes/${this.selected.catalog}/${this.selected.schema}/${name}`;
    const list = document.getElementById('directory-list');
    list.innerHTML = '<li class="loading">Loading...</li>';
    try {
      const items = await API.getDirectories(volumePath);
      list.innerHTML = '';
      // Add "(root)" option for images at volume root
      const rootLi = document.createElement('li');
      rootLi.textContent = '(root)';
      rootLi.classList.add('selected');
      rootLi.addEventListener('click', () => {
        this.selected.directory = '';
        this._setActive('directory-list', rootLi);
      });
      list.appendChild(rootLi);

      items.filter(i => i.is_directory).forEach(d => {
        const li = document.createElement('li');
        li.textContent = d.name;
        li.addEventListener('click', () => {
          this.selected.directory = d.name;
          this._setActive('directory-list', li);
        });
        list.appendChild(li);
      });
    } catch (e) {
      list.innerHTML = '<li class="error">Failed to load</li>';
    }
  }

  async confirm() {
    const { catalog, schema, volume, directory } = this.selected;
    if (!catalog || !schema || !volume) return;

    const openBtn = document.getElementById('btn-open-volume');
    openBtn.disabled = true;
    openBtn.textContent = 'Loading...';

    try {
      const result = await API.setVolume(catalog, schema, volume, directory || '');
      this.app.onVolumeSelected(result.files, result.volume_path);
      this.close();
    } catch (e) {
      this.app.showToast('Failed to open volume', 'error');
    } finally {
      openBtn.disabled = false;
      openBtn.textContent = 'Open';
    }
  }

  _bindFilter(filterId, listId) {
    const filter = document.getElementById(filterId);
    filter?.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase();
      const items = document.getElementById(listId).querySelectorAll('li');
      items.forEach(li => {
        if (li.classList.contains('loading') || li.classList.contains('error')) return;
        li.style.display = li.textContent.toLowerCase().includes(term) ? '' : 'none';
      });
    });
  }

  _setActive(listId, activeEl) {
    document.getElementById(listId).querySelectorAll('li').forEach(li => li.classList.remove('selected'));
    activeEl.classList.add('selected');
  }

  _clearList(listId) {
    document.getElementById(listId).innerHTML = '';
  }

  _resetSelections() {
    this.selected = { catalog: null, schema: null, volume: null, directory: null };
    this._clearList('catalog-list');
    this._clearList('schema-list');
    this._clearList('volume-list');
    this._clearList('directory-list');
    // Clear filters
    ['catalog-filter', 'schema-filter', 'volume-filter', 'directory-filter'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    this._updateOpenButton();
  }

  _updateOpenButton() {
    const btn = document.getElementById('btn-open-volume');
    if (btn) btn.disabled = !(this.selected.catalog && this.selected.schema && this.selected.volume);
  }
}
