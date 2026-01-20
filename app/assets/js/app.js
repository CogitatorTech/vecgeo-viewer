/**
 * VecGeo Viewer
 *
 * A single-page application for viewing vector datasets with color mapping,
 * SQL filtering via DuckDB-WASM, and interactive map controls.
 *
 * Main entry point - orchestrates all modules.
 */

// ============================================
// Module Imports
// ============================================

import {initMap, renderData, resetView, setBasemap, toggleBasemap} from './modules/map.js';
import {exportData, initDuckDB, resetFilter, runSQL} from './modules/duckdb.js';
import {handleFile} from './modules/parsers.js';
import {cycleColormap, cycleColumn, setColormap, setColumn} from './modules/visualization.js';
import {
  dataTableNextPage,
  dataTablePrevPage,
  filterDataTable,
  hideDataViewer,
  setDataTablePageSize,
  showDataViewer,
  sortDataTable
} from './modules/data-viewer.js';
import {
  bindToWindow,
  handleModalClick,
  hideError,
  initDragAndDrop,
  initFileInput,
  initKeyboardShortcuts,
  restoreTheme,
  toggleHelp,
  toggleTheme
} from './modules/ui.js';

// ============================================
// Application State
// ============================================

export const App = {
  // Leaflet map instance
  map: null,

  // Current GeoJSON layer
  geoJsonLayer: null,

  // Basemap tile layer
  basemapLayer: null,

  // DuckDB instance
  db: null,
  conn: null,

  // Loaded data
  originalData: null,      // Original GeoJSON data
  currentData: null,       // Filtered/transformed data

  // Column info
  columns: [],             // All column names
  numericColumns: [],      // Numeric column names
  categoricalColumns: [],  // Categorical column names
  currentColumn: null,     // Currently selected column
  columnIndex: 0,          // Index for cycling columns

  // Color settings
  colormaps: ['viridis', 'plasma', 'turbo', 'cividis', 'spectral', 'blues', 'reds'],
  currentColormap: 'viridis',
  colormapIndex: 0,
  colorScale: null,

  // Feature bounds
  dataBounds: null,

  // State flags
  basemapVisible: true,
  currentBasemap: 'dark',
  isLoading: false,
};

// ============================================
// Bind Methods to App Object
// ============================================

// Create wrapped functions that pass renderData
App.setColumn = (column) => setColumn(column, renderData);
App.cycleColumn = (direction) => cycleColumn(direction, renderData);
App.setColormap = (colormap) => setColormap(colormap, renderData);
App.cycleColormap = () => cycleColormap(renderData);

// Direct bindings
App.setBasemap = setBasemap;
App.toggleBasemap = toggleBasemap;
App.resetView = resetView;
App.runSQL = runSQL;
App.resetFilter = resetFilter;
App.exportData = exportData;
App.showDataViewer = showDataViewer;
App.hideDataViewer = hideDataViewer;
App.filterDataTable = filterDataTable;
App.sortDataTable = sortDataTable;
App.dataTablePrevPage = dataTablePrevPage;
App.dataTableNextPage = dataTableNextPage;
App.setDataTablePageSize = setDataTablePageSize;

// ============================================
// Initialization
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize map
  initMap();

  // Initialize UI event handlers
  initDragAndDrop(handleFile);
  initFileInput(handleFile);
  initKeyboardShortcuts();
  restoreTheme();

  // Wire error banner close button
  const closeBtn = document.getElementById('errorCloseBtn');
  if (closeBtn) closeBtn.addEventListener('click', hideError);

  // Initialize DuckDB
  await initDuckDB();

  // Bind UI functions to window for inline handlers
  bindToWindow();

  console.log('[VecGeo Viewer] Initialized');
});

// ============================================
// Window Exports
// ============================================

// Export App for inline event handlers in HTML
window.App = App;
window.toggleHelp = toggleHelp;
window.handleModalClick = handleModalClick;
window.toggleTheme = toggleTheme;
