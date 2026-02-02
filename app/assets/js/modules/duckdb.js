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

const DUCKDB_VERSION = '1.31.0';

// CDN bundles (more reliable)
const CDN_BUNDLES = {
  mvp: {
    mainModule: `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${DUCKDB_VERSION}/dist/duckdb-mvp.wasm`,
    mainWorker: `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${DUCKDB_VERSION}/dist/duckdb-browser-mvp.worker.js`
  },
  eh: {
    mainModule: `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${DUCKDB_VERSION}/dist/duckdb-eh.wasm`,
    mainWorker: `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${DUCKDB_VERSION}/dist/duckdb-browser-eh.worker.js`
  }
};

// Local bundles (fallback) - use relative paths for subdirectory hosting
const getLocalBundles = () => {
  // Get base URL from current page location to support subdirectory hosting
  let basePath = window.location.pathname.replace(/\/[^/]*$/, '');
  // Ensure root path works correctly (empty string becomes empty, which is fine with leading slash)
  if (basePath === '') basePath = '';
  return {
    mvp: {
      mainModule: `${basePath}/assets/vendor/duckdb/duckdb-mvp.wasm`,
      mainWorker: `${basePath}/assets/vendor/duckdb/duckdb-browser-mvp.worker.js`
    },
    eh: {
      mainModule: `${basePath}/assets/vendor/duckdb/duckdb-eh.wasm`,
      mainWorker: `${basePath}/assets/vendor/duckdb/duckdb-browser-eh.worker.js`
    }
  };
};

// ============================================
// Initialization
// ============================================

/**
 * Initialize DuckDB WASM
 */
export async function initDuckDB() {
  // Wait for the duckdb module loading promise from index.html
  if (window.duckdbReady) {
    try {
      const loaded = await window.duckdbReady;
      if (!loaded) {
        console.warn('[DuckDB] Module loading promise returned false');
      }
    } catch (e) {
      console.error('[DuckDB] Module loading promise failed:', e);
    }
  }

  // Also do a polling check as fallback
  let attempts = 0;
  while (!window.duckdb && attempts < 30) {
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }

  if (!window.duckdb) {
    console.warn('[DuckDB] Module not available after waiting, SQL features disabled');
    return;
  }

  console.log('[DuckDB] Module loaded, starting initialization...');

  const {selectBundle, VoidLogger, AsyncDuckDB} = window.duckdb;

  // Try local first (workers have same-origin restrictions), then CDN
  const bundleSources = [
    {name: 'local', bundles: getLocalBundles()},
    {name: 'CDN', bundles: CDN_BUNDLES}
  ];

  for (const source of bundleSources) {
    try {
      console.log(`[DuckDB] Trying ${source.name} bundles...`);
      const bundle = await selectBundle(source.bundles);
      console.log(`[DuckDB] Selected bundle:`, bundle.mainModule);

      const worker = new Worker(bundle.mainWorker);
      console.log(`[DuckDB] Worker created`);

      // Use VoidLogger to prevent DuckDB from logging all SQL queries/data to console
      const logger = new VoidLogger();
      const db = new AsyncDuckDB(logger, worker);
      console.log(`[DuckDB] AsyncDuckDB instance created, instantiating WASM...`);

      await db.instantiate(bundle.mainModule);
      console.log(`[DuckDB] WASM instantiated`);

      const conn = await db.connect();
      console.log(`[DuckDB] Connection established`);

      // Only assign to App after full success
      App.db = db;
      App.conn = conn;

      console.log(`[DuckDB] Initialized successfully from ${source.name}`);
      return; // Success - exit

    } catch (error) {
      console.error(`[DuckDB] Failed to initialize from ${source.name}:`, error);
      // Clean up partial state
      App.db = null;
      App.conn = null;
    }
  }

  console.error('[DuckDB] All initialization attempts failed. SQL features disabled.');
}

// ============================================
// Remote Parquet Loading
// ============================================

/**
 * Parse a remote Parquet file using DuckDB's httpfs extension
 * @param {string} url - URL to the remote Parquet file
 * @returns {Object} GeoJSON FeatureCollection
 */
export async function parseRemoteParquet(url) {
  if (!App.db || !App.conn) {
    throw new Error('DuckDB is not initialized. Cannot read remote Parquet files.');
  }

  console.log(`[DuckDB] Loading remote Parquet from: ${url}`);

  // Install and load httpfs extension for HTTP/HTTPS support
  try {
    await App.conn.query("INSTALL httpfs");
    await App.conn.query("LOAD httpfs");
    console.log('[DuckDB] httpfs extension loaded');
  } catch (extError) {
    // httpfs might already be loaded or included in the WASM build
    console.log('[DuckDB] httpfs extension status:', extError.message);
  }

  // Query schema to find geometry column
  const schemaResult = await App.conn.query(`DESCRIBE SELECT * FROM parquet_scan('${url}')`);
  const schema = schemaResult.toArray();

  // Find geometry column
  let geometryCol = null;
  const geometryNames = ['geometry', 'geom', 'wkb_geometry', 'the_geom', 'shape'];
  for (const row of schema) {
    const colName = row.column_name || row.name;
    if (geometryNames.includes(colName?.toLowerCase())) {
      geometryCol = colName;
      break;
    }
  }

  console.log(`[DuckDB] Found geometry column: ${geometryCol || 'none'}`);

  // Query data
  const sql = `SELECT *
               FROM parquet_scan('${url}')`;
  const result = await App.conn.query(sql);
  const rows = result.toArray();

  console.log(`[DuckDB] Loaded ${rows.length} rows from remote Parquet`);

  // Convert to GeoJSON
  const features = rows.map((row, idx) => {
    let geometry = null;

    // Try to parse geometry
    if (geometryCol && row[geometryCol]) {
      const geomData = row[geometryCol];
      if (typeof geomData === 'object' && geomData.type) {
        geometry = geomData;
      } else if (typeof geomData === 'string') {
        try {
          geometry = JSON.parse(geomData);
        } catch {
          // Try WKT or other formats
          console.warn(`[DuckDB] Could not parse geometry for row ${idx}`);
        }
      }
    }

    // Build properties (exclude geometry column)
    const properties = {};
    for (const [key, value] of Object.entries(row)) {
      if (key !== geometryCol) {
        properties[key] = value;
      }
    }

    return {
      type: 'Feature',
      properties,
      geometry
    };
  }).filter(f => f.geometry);

  return {
    type: 'FeatureCollection',
    features
  };
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
    await App.conn.query('DROP TABLE IF EXISTS data');

    const features = geojson.features;
    if (!features || features.length === 0) return;

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

    // Determine column types robustly (scan a sample of rows)
    const colTypes = {};
    const sampleSize = Math.min(features.length, 1000);
    cols.forEach(col => {
      let seenNumber = false;
      let seenBoolean = false;
      let seenStringOrObject = false;
      for (let i = 0; i < sampleSize; i++) {
        const v = features[i]?.properties?.[col];
        if (v === null || v === undefined) continue;
        const t = typeof v;
        if (t === 'number' && Number.isFinite(v)) {
          seenNumber = true;
        } else if (t === 'boolean') {
          seenBoolean = true;
        } else {
          // strings, objects, arrays -> treat as string storage
          seenStringOrObject = true;
        }
        // Early exit if mixed
        if ((seenNumber && seenStringOrObject) || (seenBoolean && (seenNumber || seenStringOrObject))) {
          break;
        }
      }
      // Prefer VARCHAR if mixed types; otherwise map number->DOUBLE, boolean->BOOLEAN, else VARCHAR
      if (seenNumber && !seenStringOrObject && !seenBoolean) {
        colTypes[col] = 'DOUBLE';
      } else if (seenBoolean && !seenNumber && !seenStringOrObject) {
        colTypes[col] = 'BOOLEAN';
      } else {
        colTypes[col] = 'VARCHAR';
      }
    });

    // Add _rowid for geometry matching
    const colDefs = ['_rowid INTEGER'];
    cols.forEach(col => {
      const escapedCol = col.replace(/"/g, '""');
      colDefs.push(`"${escapedCol}" ${colTypes[col]}`);
    });

    // Create table
    await App.conn.query(`CREATE TABLE data
                          (
                            ${colDefs.join(', ')}
                          )`);

    // Insert data in adaptive batches to avoid oversized SQL statements
    const insertCols = ['_rowid', ...cols.map(c => `"${c.replace(/"/g, '""')}"`)];

    const encodeValueForType = (val, type) => {
      if (val === null || val === undefined) return 'NULL';
      switch (type) {
        case 'DOUBLE':
          if (typeof val === 'number' && Number.isFinite(val)) return String(val);
          return 'NULL';
        case 'BOOLEAN':
          if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
          return 'NULL';
        default: {
          // VARCHAR: stringify objects/arrays; escape strings
          let strVal;
          if (typeof val === 'object') {
            try {
              strVal = JSON.stringify(val);
            } catch {
              return 'NULL';
            }
          } else if (typeof val === 'string') {
            strVal = val;
          } else if (typeof val === 'number' || typeof val === 'boolean') {
            strVal = String(val);
          } else {
            try {
              strVal = String(val);
            } catch {
              return 'NULL';
            }
          }

          // Robust escaping for SQL strings
          // Remove null bytes, escape single quotes and backslashes
          // Limit string length to avoid oversized SQL
          const maxLen = 10000;
          if (strVal.length > maxLen) {
            strVal = strVal.substring(0, maxLen);
          }
          const escaped = strVal
            .replace(/\x00/g, '')           // Remove null bytes
            .replace(/'/g, "''")            // Escape single quotes
            .replace(/\\/g, '\\\\');        // Escape backslashes
          return `'${escaped}'`;
        }
      }
    };

    const buildValuesSQL = (batch, offset) => {
      return batch.map((f, idx) => {
        const rowVals = [offset + idx]; // _rowid
        cols.forEach(col => {
          const val = f.properties?.[col];
          rowVals.push(encodeValueForType(val, colTypes[col]));
        });
        return `(${rowVals.join(', ')})`;
      }).join(',\n');
    };

    let batchSize = 100; // start more conservative
    let i = 0;
    while (i < features.length) {
      const end = Math.min(i + batchSize, features.length);
      const batch = features.slice(i, end);
      const valuesSQL = buildValuesSQL(batch, i);
      const insertSQL = `INSERT INTO data (${insertCols.join(', ')})
                         VALUES ${valuesSQL}`;

      try {
        await App.conn.query(insertSQL);
        i = end; // advance on success
      } catch (batchErr) {
        if (batchSize > 1) {
          const nextSize = Math.max(1, Math.floor(batchSize / 2));
          console.warn(`[DuckDB] Insert batch failed at rows ${i}-${end - 1}. Reducing batch size ${batchSize} -> ${nextSize}`);
          batchSize = nextSize;
        } else {
          // Single row failed - skip this row (only log if under threshold to avoid console flood)
          if (i < 5) {
            console.warn(`[DuckDB] Insert failed for row ${i}, skipping:`, batchErr.message);
          } else if (i === 5) {
            console.warn(`[DuckDB] Additional insert errors suppressed to avoid console flood`);
          }
          i++; // Skip the problematic row and continue
        }
      }
    }

    console.log(`[DuckDB] Registered ${features.length} features`);

    // Sanity check that row count matches feature count
    try {
      const stats = await App.conn.query('SELECT COUNT(*) AS cnt, MAX(_rowid) AS max_id FROM data');
      const row = stats.toArray()[0];
      const expectedMaxId = features.length - 1;
      if (row) {
        const actualCount = Number(row.cnt);
        const actualMaxId = Number(row.max_id);
        if (actualCount !== features.length || actualMaxId !== expectedMaxId) {
          console.warn(`[DuckDB] Data mismatch: expected ${features.length} rows (max_id=${expectedMaxId}), got ${actualCount} rows (max_id=${actualMaxId})`);
        }
      }
    } catch (statsErr) {
      console.warn('[DuckDB] Could not run sanity check:', statsErr);
    }

  } catch (error) {
    console.error('[DuckDB] Failed to register data:', error);
    showError(`DuckDB load failed: ${error.message}`);
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
  if (!sqlInput) {
    showError('SQL input element not found.');
    return;
  }

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
    // Note: _rowid is a physical column in our table, so "SELECT *" already includes it.
    // We don't need to force inject it for SELECT *, as that causes duplicate keys and Proxy errors.

    // Future improvement: Parse SQL to inject _rowid for non-star queries if needed.

    const result = await App.conn.query(finalSQL);
    const rows = result.toArray();

    if (rows.length === 0) {
      hideLoading();
      showError('Query returned no results.');
      return;
    }

    // Map rows back to features by _rowid safely
    const sourceFeatures = App.originalData?.features || [];
    const rowMap = new Map();
    rows.forEach(r => {
      if (r._rowid !== undefined && r._rowid !== null) {
        rowMap.set(Number(r._rowid), r);
      }
    });

    const validRowIds = Array.from(rowMap.keys()).filter(id => Number.isInteger(id) && id >= 0 && id < sourceFeatures.length);

    if (validRowIds.length === 0) {
      hideLoading();
      showError('Query must return _rowid within the loaded data range.');
      return;
    }

    const filteredFeatures = validRowIds.map(id => {
      const feature = sourceFeatures[id];
      const row = rowMap.get(id);
      if (!feature || !row) return null;
      const newProps = {};
      for (const key of Object.keys(row)) {
        if (key !== '_rowid') {
          newProps[key] = row[key];
        }
      }
      return {
        ...feature,
        properties: newProps
      };
    }).filter(Boolean);

    App.currentData = {
      type: 'FeatureCollection',
      features: filteredFeatures
    };

    // Re-analyze columns (SQL might have created new ones)
    analyzeColumns(App.currentData);

    // Re-render
    renderData(App.currentData);

    console.log(`[SQL] Query returned ${filteredFeatures.length} rows`);
    hideLoading();

  } catch (error) {
    console.error('[SQL] Query failed:', error);
    hideLoading();
    showError(`SQL Error: ${error.message}`);
  }
}

/**
 * Reset view to fit current data (zoom/pan to show all current features)
 */
export function resetFilter() {
  if (!App.currentData || !App.map || !App.geoJsonLayer) {
    console.warn('[View] Cannot reset focus - no data or map layer');
    return;
  }

  const bounds = App.geoJsonLayer.getBounds();
  if (bounds && bounds.isValid()) {
    App.map.fitBounds(bounds, {
      padding: [50, 50],
      maxZoom: 16
    });
    console.log('[View] Reset focus to current data');
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
