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

import { initMap, renderData, resetView, setBasemap, toggleBasemap } from './modules/map.js';
import { exportData, initDuckDB, resetFilter, runSQL } from './modules/duckdb.js';
import { handleFile } from './modules/parsers.js';
import { analyzeColumns, cycleColormap, cycleColumn, setColormap, setColumn } from './modules/visualization.js';
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
    initResizeHandler, // Import resize handler
    restoreTheme,
    showError,
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

    // Rendering settings
    featureLimit: 100000,     // Max features to load (0 = no limit)
    simplifyTolerance: 0.001, // Geometry simplification tolerance (0 = off)
    pointRadius: 6,           // Point marker radius in pixels

    // State flags
    basemapVisible: true,
    currentBasemap: 'dark',
    isLoading: false,

    // Stats
    fileSize: null,
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

// Rendering settings methods
App.setFeatureLimit = (value) => {
    const oldLimit = App.featureLimit;
    App.featureLimit = parseInt(value, 10) || 0;
    const featureLimitInput = document.getElementById('featureLimitInput');
    const featureLimitStatus = document.getElementById('featureLimitStatus');

    if (featureLimitInput) {
        featureLimitInput.value = App.featureLimit;
    }

    console.log(`[Settings] Feature limit: ${App.featureLimit || 'no limit'}`);

    // If data is loaded and limit changed, re-apply the limit
    if (App.originalData && oldLimit !== App.featureLimit) {
        const originalCount = App.originalData.features.length;

        // Apply the new limit
        let limitedData;
        if (App.featureLimit > 0 && originalCount > App.featureLimit) {
            limitedData = {
                type: 'FeatureCollection',
                features: App.originalData.features.slice(0, App.featureLimit)
            };
            console.log(`[Settings] Re-limited from ${originalCount} to ${App.featureLimit} objects`);
            showError(`Showing ${App.featureLimit.toLocaleString()} of ${originalCount.toLocaleString()} objects. Adjust limit in Performance Settings.`);

            if (featureLimitStatus) {
                featureLimitStatus.textContent = `Showing ${App.featureLimit.toLocaleString()} of ${originalCount.toLocaleString()}`;
                featureLimitStatus.style.color = 'var(--accent-warning, orange)';
            }
        } else {
            limitedData = App.originalData;
            if (originalCount > 0) {
                console.log(`[Settings] Showing all ${originalCount} objects`);
                if (featureLimitStatus) {
                    featureLimitStatus.textContent = `Showing all ${originalCount.toLocaleString()} objects`;
                    featureLimitStatus.style.color = 'var(--text-muted)';
                }
            }
        }

        // Update current data and re-render
        App.currentData = limitedData;
        analyzeColumns(App.currentData);
        renderData(App.currentData);
    } else if (!App.originalData && featureLimitStatus) {
        // No data loaded yet, show default message
        featureLimitStatus.textContent = '0 = no limit';
        featureLimitStatus.style.color = 'var(--text-muted)';
    }
};

App.setSimplifyTolerance = (value) => {
    App.simplifyTolerance = parseFloat(value) || 0;
    const simplifyValue = document.getElementById('simplifyValue');
    if (simplifyValue) {
        simplifyValue.textContent = App.simplifyTolerance.toFixed(3);
    }
    // Re-render if we have data
    if (App.currentData) {
        renderData(App.currentData, true);
    }
    console.log(`[Settings] Simplify tolerance: ${App.simplifyTolerance}`);
};

App.setPointRadius = (value) => {
    App.pointRadius = parseInt(value, 10) || 6;
    const pointSizeValue = document.getElementById('pointSizeValue');
    if (pointSizeValue) {
        pointSizeValue.textContent = `${App.pointRadius}px`;
    }
    // Re-render if we have data
    if (App.currentData) {
        renderData(App.currentData, true);
    }
    console.log(`[Settings] Point radius: ${App.pointRadius}px`);
};

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
    initResizeHandler(); // Initialize resize handler
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
