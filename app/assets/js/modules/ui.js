/**
 * VecGeo Viewer - UI Utilities Module
 *
 * Handles UI helpers, theme, modals, and event handlers.
 */

import {App} from '../app.js';

// ============================================
// Loading & Error UI
// ============================================

let errorBannerTimeout = null;

export function showLoading(message = 'Loading...') {
  App.isLoading = true;
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingText = document.getElementById('loadingText');
  if (loadingOverlay) {
    loadingOverlay.classList.remove('hidden');
  }
  if (loadingText) {
    loadingText.textContent = message;
  }
}

export function hideLoading() {
  App.isLoading = false;
  const loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay) {
    loadingOverlay.classList.add('hidden');
  }
}

export function showError(message) {
  const banner = document.getElementById('errorBanner');
  const msgEl = document.getElementById('errorMessage');
  if (banner && msgEl) {
    msgEl.textContent = message;
    banner.classList.remove('hidden');
    banner.classList.remove('warning');
    // Clear any previous timeout
    if (errorBannerTimeout) {
      clearTimeout(errorBannerTimeout);
    }
    // Auto-hide after 10 seconds
    errorBannerTimeout = setTimeout(() => {
      banner.classList.add('hidden');
    }, 10000);
  }
  console.error('[Error]', message);
}

/**
 * Show a warning/info message (not an error)
 */
export function showWarning(message) {
  const banner = document.getElementById('errorBanner');
  const msgEl = document.getElementById('errorMessage');
  if (banner && msgEl) {
    msgEl.textContent = message;
    banner.classList.remove('hidden');
    banner.classList.add('warning');
    // Clear any previous timeout
    if (errorBannerTimeout) {
      clearTimeout(errorBannerTimeout);
    }
    // Auto-hide after 8 seconds
    errorBannerTimeout = setTimeout(() => {
      banner.classList.add('hidden');
    }, 8000);
  }
  console.log('[Info]', message);
}

export function hideError() {
  const banner = document.getElementById('errorBanner');
  if (banner) banner.classList.add('hidden');
}

// ============================================
// Modal Helpers
// ============================================

export function toggleHelp() {
  const modal = document.getElementById('helpModal');
  if (modal) {
    modal.classList.toggle('active');
  }
}

export function handleModalClick(event) {
  if (event.target.classList.contains('modal-overlay')) {
    event.target.classList.remove('active');
  }
}

// ============================================
// Theme
// ============================================

export function toggleTheme() {
  const body = document.body;
  const current = body.getAttribute('data-theme');
  const newTheme = current === 'light' ? '' : 'light';
  body.setAttribute('data-theme', newTheme);
  localStorage.setItem('vecgeo-viewer-theme', newTheme);

  // Update basemap
  updateBasemapTheme(newTheme);
}

export function restoreTheme() {
  const saved = localStorage.getItem('vecgeo-viewer-theme');
  if (saved) {
    document.body.setAttribute('data-theme', saved);
    updateBasemapTheme(saved);
  }
}

export function updateBasemapTheme(theme) {
  // Only auto-switch if using CARTO basemaps
  if (App.currentBasemap === 'dark' || App.currentBasemap === 'light') {
    const newBasemap = theme === 'light' ? 'light' : 'dark';
    if (App.currentBasemap !== newBasemap && App.setBasemap) {
      App.setBasemap(newBasemap);
    }
  }
}

// ============================================
// Drag and Drop
// ============================================

export function initDragAndDrop(handleFile) {
  const dropOverlay = document.getElementById('dropOverlay');
  if (!dropOverlay) return;

  // Prevent default drag behaviors
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });

  // Show overlay on drag enter
  let dragCounter = 0;

  document.body.addEventListener('dragenter', () => {
    dragCounter++;
    dropOverlay.classList.add('active');
  });

  document.body.addEventListener('dragleave', () => {
    dragCounter--;
    if (dragCounter === 0) {
      dropOverlay.classList.remove('active');
    }
  });

  document.body.addEventListener('drop', (e) => {
    dragCounter = 0;
    dropOverlay.classList.remove('active');

    const files = e.dataTransfer?.files;
    if (files?.length > 0) {
      handleFile(files[0]);
    }
  });
}

// ============================================
// File Input
// ============================================

export function initFileInput(handleFile) {
  const fileInput = document.getElementById('fileInput');
  if (!fileInput) return;

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  });
}

// ============================================
// Keyboard Shortcuts
// ============================================

export function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ignore if typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    switch (e.key.toLowerCase()) {
      // Zoom
      case '+':
      case '=':
        App.map?.zoomIn();
        break;
      case '-':
      case '_':
        App.map?.zoomOut();
        break;

      // Pan
      case 'arrowup':
        App.map?.panBy([0, -100]);
        e.preventDefault();
        break;
      case 'arrowdown':
        App.map?.panBy([0, 100]);
        e.preventDefault();
        break;
      case 'arrowleft':
        App.map?.panBy([-100, 0]);
        e.preventDefault();
        break;
      case 'arrowright':
        App.map?.panBy([100, 0]);
        e.preventDefault();
        break;

      // Column cycling
      case '[':
        App.cycleColumn?.(-1);
        break;
      case ']':
        App.cycleColumn?.(1);
        break;

      // Colormap cycling
      case 'm':
        App.cycleColormap?.();
        break;

      // Basemap toggle
      case 'b':
        App.toggleBasemap?.();
        break;

      // Reset view
      case 'r':
        App.resetView?.();
        break;

      // Help
      case '?':
      case 'h':
        toggleHelp();
        break;

      // Escape to close modals
      case 'escape':
        document.querySelectorAll('.modal-overlay.active').forEach(m => {
          m.classList.remove('active');
        });
        break;
    }
  });
}

// Export for window binding
export function bindToWindow() {
  window.toggleHelp = toggleHelp;
  window.handleModalClick = handleModalClick;
  window.toggleTheme = toggleTheme;
}

// ============================================
// Panel Resizing
// ============================================

export function initResizeHandler() {
  const handle = document.getElementById('resizeHandle');
  const panel = document.getElementById('controlPanel');
  if (!handle || !panel) return;

  let isResizing = false;

  handle.addEventListener('mousedown', (e) => {
    isResizing = true;
    handle.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none'; // Prevent text selection
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    // Calculate new width
    const newWidth = e.clientX;

    // Constraints (min 200px, max 600px)
    if (newWidth >= 200 && newWidth <= 600) {
      document.documentElement.style.setProperty('--panel-width', `${newWidth}px`);
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      handle.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      // Trigger map resize to fill new space
      if (App.map) {
        App.map.invalidateSize();
      }
    }
  });
}
