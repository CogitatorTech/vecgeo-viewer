/**
 * VecGeo Viewer - DuckDB Module
 *
 * Handles DuckDB WASM initialization, data registration, and SQL queries.
 */

import {App} from '../app.js';
import {hideLoading, showError, showLoading} from './ui.js';
import {analyzeColumns} from './visualization.js';
import {renderData} from './map.js';

// ============================================
// WASM Bundle Configuration
// ============================================

const DUCKDB_BUNDLES = {
  mvp: {
    mainModule: '/assets/vendor/duckdb/duckdb-mvp.wasm',
    mainWorker: '/assets/vendor/duckdb/duckdb-browser-mvp.worker.js'
  },
  eh: {
    mainModule: '/assets/vendor/duckdb/duckdb-eh.wasm',
    mainWorker: '/assets/vendor/duckdb/duckdb-browser-eh.worker.js'
  }
};

// ============================================
// Initialization
// ============================================

/**
 * Initialize DuckDB WASM
 */
export async function initDuckDB() {
  // Wait for duckdb module to be available
  let attempts = 0;
  while (!window.duckdb && attempts < 50) {
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }

  if (!window.duckdb) {
    console.warn('[DuckDB] Module not available, SQL features disabled');
    return;
  }

  try {
    const {selectBundle, ConsoleLogger, AsyncDuckDB} = window.duckdb;

    // Select the best bundle for this browser
    const bundle = await selectBundle(DUCKDB_BUNDLES);

    // Instantiate the worker
    const worker = new Worker(bundle.mainWorker);
    const logger = new ConsoleLogger();
    App.db = new AsyncDuckDB(logger, worker);
    await App.db.instantiate(bundle.mainModule);

    // Open a connection
    App.conn = await App.db.connect();

    console.log('[DuckDB] Initialized successfully');

  } catch (error) {
    console.error('[DuckDB] Failed to initialize:', error);
    // Try CDN fallback
    try {
      console.log('[DuckDB] Trying CDN fallback...');
      const {selectBundle, ConsoleLogger, AsyncDuckDB} = window.duckdb;

      const cdnBundle = {
        mvp: {
          mainModule: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-mvp.wasm',
          mainWorker: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-browser-mvp.worker.js'
        },
        eh: {
          mainModule: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-eh.wasm',
          mainWorker: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-browser-eh.worker.js'
        }
      };

      const bundle = await selectBundle(cdnBundle);
      const worker = new Worker(bundle.mainWorker);
      const logger = new ConsoleLogger();
      App.db = new AsyncDuckDB(logger, worker);
      await App.db.instantiate(bundle.mainModule);
      App.conn = await App.db.connect();

      console.log('[DuckDB] Initialized from CDN');

    } catch (cdnError) {
      console.error('[DuckDB] CDN fallback also failed:', cdnError);
    }
  }
}

// ============================================
// Data Registration
// ============================================

/**
 * Register GeoJSON data in DuckDB
 * @param {Object} geojson - GeoJSON FeatureCollection
 */
export async function registerInDuckDB(geojson) {
  if (!App.conn) return;

  try {
    // Drop existing table
    await App.conn.query('DROP TABLE IF EXISTS data');

    // Prepare data for insertion
    const features = geojson.features;
    if (features.length === 0) return;

    // Get all columns (filter out columns with problematic names)
    const allCols = new Set();
    features.forEach(f => {
      Object.keys(f.properties || {}).forEach(k => {
        // Skip columns with empty names or only whitespace
        if (k && k.trim()) {
          allCols.add(k);
        }
      });
    });
    const cols = Array.from(allCols);

    if (cols.length === 0) {
      console.log('[DuckDB] No columns to register');
      return;
    }

    // Helper function to safely escape SQL values
    const escapeValue = (val) => {
      if (val === null || val === undefined) {
        return 'NULL';
      }

      // Handle arrays and objects - convert to JSON string
      if (typeof val === 'object') {
        try {
          const jsonStr = JSON.stringify(val);
          return `'${jsonStr.replace(/'/g, "''")}'`;
        } catch {
          return 'NULL';
        }
      }

      // Handle booleans
      if (typeof val === 'boolean') {
        return val ? 'TRUE' : 'FALSE';
      }

      // Handle numbers
      if (typeof val === 'number') {
        // Handle special float values
        if (!Number.isFinite(val)) {
          return 'NULL'; // NaN, Infinity, -Infinity
        }
        return String(val);
      }

      // Handle strings
      if (typeof val === 'string') {
        // Escape single quotes and handle special characters
        const escaped = val
          .replace(/'/g, "''")
          .replace(/\\/g, '\\\\')
          .replace(/\x00/g, ''); // Remove null bytes
        return `'${escaped}'`;
      }

      // Fallback: convert to string
      try {
        const strVal = String(val);
        return `'${strVal.replace(/'/g, "''")}'`;
      } catch {
        return 'NULL';
      }
    };

    // Add _rowid for geometry matching
    const colDefs = ['_rowid INTEGER'];
    cols.forEach(col => {
      // Infer type from first non-null, valid value
      let type = 'VARCHAR';
      for (const f of features) {
        const val = f.properties?.[col];
        if (val !== null && val !== undefined) {
          if (typeof val === 'number' && Number.isFinite(val)) {
            type = Number.isInteger(val) ? 'BIGINT' : 'DOUBLE';
          } else if (typeof val === 'boolean') {
            type = 'BOOLEAN';
          }
          // Objects, arrays, and strings remain VARCHAR
          break;
        }
      }
      // Escape column name (handle special characters)
      const escapedCol = col.replace(/"/g, '""');
      colDefs.push(`"${escapedCol}" ${type}`);
    });

    // Create table
    await App.conn.query(`CREATE TABLE data
                          (
                            ${colDefs.join(', ')}
                          )`);

    // Insert data in batches (smaller batch size for stability)
    const batchSize = 500;
    for (let i = 0; i < features.length; i += batchSize) {
      const batch = features.slice(i, i + batchSize);
      const values = batch.map((f, idx) => {
        const rowVals = [i + idx]; // _rowid
        cols.forEach(col => {
          const val = f.properties?.[col];
          rowVals.push(escapeValue(val));
        });
        return `(${rowVals.join(', ')})`;
      }).join(',\n');

      const insertCols = ['_rowid', ...cols.map(c => `"${c.replace(/"/g, '""')}"`)];
      await App.conn.query(`INSERT INTO data (${insertCols.join(', ')})
                            VALUES ${values}`);
    }

    console.log(`[DuckDB] Registered ${features.length} features`);

  } catch (error) {
    console.error('[DuckDB] Failed to register data:', error);
  }
}

// ============================================
// SQL Queries
// ============================================

/**
 * Run SQL query
 */
export async function runSQL() {
  if (!App.conn) {
    showError('DuckDB is not initialized. SQL filtering is unavailable.');
    return;
  }

  const sqlInput = document.getElementById('sqlInput');
  let sql = sqlInput.value.trim();

  if (!sql) {
    showError('Please enter a SQL query.');
    return;
  }

  showLoading('Running query...');

  try {
    // Check if it's a basic expression or full SQL
    if (!sql.toLowerCase().startsWith('select')) {
      sql = `SELECT *
             FROM data
             WHERE ${sql}`;
    }

    // Ensure _rowid is included
    let finalSQL = sql;
    const sqlLower = sql.toLowerCase();
    if (!sqlLower.includes('_rowid') && sqlLower.includes('from data')) {
      // Replace "SELECT *" with "SELECT *, _rowid"
      finalSQL = sql.replace(/select\s+\*/i, 'SELECT *, _rowid');
    }

    const result = await App.conn.query(finalSQL);
    const rows = result.toArray();

    if (rows.length === 0) {
      hideLoading();
      showError('Query returned no results.');
      return;
    }

    const rowIds = rows.map(r => r._rowid).filter(id => id !== undefined);

    if (rowIds.length === 0) {
      hideLoading();
      showError('Query must include _rowid or use SELECT *');
      return;
    }

    // Filter original features by rowId
    const filteredFeatures = rowIds.map(id => App.originalData.features[id]).filter(f => f);

    // Update properties from SQL result
    rows.forEach((row, i) => {
      if (filteredFeatures[i]) {
        const newProps = {};
        for (const key of Object.keys(row)) {
          if (key !== '_rowid') {
            newProps[key] = row[key];
          }
        }
        filteredFeatures[i] = {
          ...filteredFeatures[i],
          properties: newProps
        };
      }
    });

    App.currentData = {
      type: 'FeatureCollection',
      features: filteredFeatures
    };

    // Re-analyze columns (SQL might have created new ones)
    analyzeColumns(App.currentData);

    // Re-render
    renderData(App.currentData);

    console.log(`[SQL] Query returned ${rows.length} rows`);
    hideLoading();

  } catch (error) {
    console.error('[SQL] Query failed:', error);
    hideLoading();
    showError(`SQL Error: ${error.message}`);
  }
}

/**
 * Reset filter and show all data
 */
export function resetFilter() {
  if (App.originalData) {
    App.currentData = App.originalData;
    analyzeColumns(App.currentData);
    renderData(App.currentData);
    document.getElementById('sqlInput').value = '';
    console.log('[Filter] Reset');
  }
}

/**
 * Export current data to GeoJSON
 */
export function exportData() {
  if (!App.currentData) return;

  // Create filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `vecgeo-viewer-export-${timestamp}.geojson`;

  // Convert to JSON string
  const dataStr = JSON.stringify(App.currentData, null, 2);

  // Create blob and download link
  const blob = new Blob([dataStr], {type: 'application/geo+json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  // Cleanup after download starts - use longer timeout for reliability
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);

  console.log(`[Export] Saved to ${filename}`);
}
