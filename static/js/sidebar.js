import API from './api-client.js';

/**
 * Manages the left sidebar: image queue with thumbnails, status badges,
 * filtering, lazy loading, and progress counter.
 */
export class Sidebar {
  constructor(app) {
    this.app = app;
    this.queueEl = document.getElementById('image-queue');
    this.counterEl = document.getElementById('progress-counter');
    this.filterEl = document.getElementById('status-filter');
    this.files = [];
    this.statuses = {};  // filePath -> status
    this.observer = null;
  }

  init() {
    this.filterEl?.addEventListener('change', () => this.render());

    // IntersectionObserver for lazy thumbnail loading
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            delete img.dataset.src;
            this.observer.unobserve(img);
          }
        }
      });
    }, { root: this.queueEl, rootMargin: '100px' });
  }

  setFiles(files) {
    this.files = files;
    files.forEach(f => {
      if (!this.statuses[f]) this.statuses[f] = 'pending';
    });
    this.render();
  }

  setStatus(filePath, status) {
    this.statuses[filePath] = status;
    this.render();
  }

  render() {
    const filter = this.filterEl?.value || 'all';
    const filtered = filter === 'all'
      ? this.files
      : this.files.filter(f => this.statuses[f] === filter);

    this.queueEl.innerHTML = '';

    filtered.forEach((filePath) => {
      const filename = filePath.split('/').pop();
      const status = this.statuses[filePath] || 'pending';
      const isActive = filePath === this.app.currentFiles[this.app.currentIndex];

      const item = document.createElement('div');
      item.className = `queue-item${isActive ? ' active' : ''}`;
      item.innerHTML = `
        <img class="queue-thumbnail" data-src="${API.getThumbnailUrl(filePath)}"
             alt="${filename}" width="48" height="48">
        <div class="queue-info">
          <span class="queue-filename" title="${filename}">${filename}</span>
          <span class="queue-badge badge-${status}">${status}</span>
        </div>
      `;
      item.addEventListener('click', () => {
        const realIndex = this.app.currentFiles.indexOf(filePath);
        if (realIndex >= 0) this.app.loadImageByIndex(realIndex);
      });

      this.queueEl.appendChild(item);

      // Observe thumbnail for lazy loading
      const thumb = item.querySelector('.queue-thumbnail');
      if (thumb) this.observer.observe(thumb);
    });

    this._updateCounter();
  }

  _updateCounter() {
    const doneCount = this.files.filter(f => {
      const s = this.statuses[f];
      return s === 'reviewed' || s === 'done';
    }).length;
    if (this.counterEl) {
      this.counterEl.textContent = `${doneCount} / ${this.files.length}`;
    }
  }
}
