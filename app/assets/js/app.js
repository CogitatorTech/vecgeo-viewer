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
import { cycleColormap, cycleColumn, setColormap, setColumn } from './modules/visualization.js';
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

    // Rendering settings
    featureLimit: 100000,     // Max features to load (0 = no limit)
    simplifyTolerance: 0.001, // Geometry simplification tolerance (0 = off)
    pointRadius: 6,           // Point marker radius in pixels

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

// Rendering settings methods
App.setFeatureLimit = (value) => {
    App.featureLimit = parseInt(value, 10) || 0;
    document.getElementById('featureLimitInput').value = App.featureLimit;
    console.log(`[Settings] Feature limit: ${App.featureLimit || 'no limit'}`);
};

App.setSimplifyTolerance = (value) => {
    App.simplifyTolerance = parseFloat(value) || 0;
    document.getElementById('simplifyValue').textContent = App.simplifyTolerance.toFixed(3);
    // Re-render if we have data
    if (App.currentData) {
        renderData(App.currentData, true);
    }
    console.log(`[Settings] Simplify tolerance: ${App.simplifyTolerance}`);
};

App.setPointRadius = (value) => {
    App.pointRadius = parseInt(value, 10) || 6;
    document.getElementById('pointSizeValue').textContent = `${App.pointRadius}px`;
    // Re-render if we have data
    if (App.currentData) {
        renderData(App.currentData, true);
    }
    console.log(`[Settings] Point radius: ${App.pointRadius}px`);
};

// Quick filter - simple expression parsing
App.runQuickFilter = () => {
    const input = document.getElementById('quickFilterInput').value.trim();
    if (!input || !App.originalData) {
        return;
    }

    try {
        // Parse simple expressions like: column > value, column == "string", column != value
        const match = input.match(/^(\w+)\s*(==|!=|>|<|>=|<=)\s*(.+)$/);
        if (!match) {
            throw new Error('Invalid expression. Use format: column > value or column == "text"');
        }

        const [, column, operator, rawValue] = match;

        // Parse value (string or number)
        let value = rawValue.trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1); // String value
        } else if (!isNaN(parseFloat(value))) {
            value = parseFloat(value); // Number value
        }

        // Filter features
        const filtered = App.originalData.features.filter(f => {
            const propVal = f.properties?.[column];
            if (propVal === null || propVal === undefined) return false;

            switch (operator) {
                case '==': return propVal == value;
                case '!=': return propVal != value;
                case '>': return parseFloat(propVal) > value;
                case '<': return parseFloat(propVal) < value;
                case '>=': return parseFloat(propVal) >= value;
                case '<=': return parseFloat(propVal) <= value;
                default: return true;
            }
        });

        App.currentData = { type: 'FeatureCollection', features: filtered };
        renderData(App.currentData);
        console.log(`[QuickFilter] "${input}" → ${filtered.length} features`);

    } catch (error) {
        console.error('[QuickFilter]', error);
        // Show error to user
        const banner = document.getElementById('errorBanner');
        const msgEl = document.getElementById('errorMessage');
        if (banner && msgEl) {
            msgEl.textContent = error.message;
            banner.classList.remove('hidden');
            setTimeout(() => banner.classList.add('hidden'), 5000);
        }
    }
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
