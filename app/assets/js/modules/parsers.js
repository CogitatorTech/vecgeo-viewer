/**
 * VecGeo Viewer - Parsers Module
 *
 * Handles file parsing for GeoJSON, Shapefile, and Parquet formats.
 */

import {App} from '../app.js';
import {hideLoading, showError, showLoading, showWarning} from './ui.js';
import {transformCRS} from './crs.js';
import {analyzeColumns} from './visualization.js';
import {renderData} from './map.js';
import {parseRemoteParquet, registerInDuckDB} from './duckdb.js';

// ============================================
// File Handler
// ============================================

/**
 * Handle uploaded file
 * @param {File} file - The uploaded file
 */
export async function handleFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  // Store file size
  App.fileSize = file.size;

  showLoading(`Loading ${file.name}...`);

  try {
    let geojson;

    switch (ext) {
      case 'geojson':
      case 'json':
        geojson = await parseGeoJSON(file);
        break;

      case 'zip':
        geojson = await parseShapefile(file);
        break;

      case 'parquet':
      case 'geoparquet':
        geojson = await parseParquet(file);
        break;

      case 'gpkg':
        throw new Error('GeoPackage (.gpkg) is not yet supported in the browser. Please convert to GeoJSON using QGIS or ogr2ogr.');

      case 'kml':
      case 'kmz':
        throw new Error('KML/KMZ files are not yet supported. Please convert to GeoJSON using geojson.io or QGIS.');

      case 'gdb':
        throw new Error('FileGDB (.gdb) requires desktop tools. Please convert to GeoJSON using QGIS or ArcGIS.');

      default:
        throw new Error(`Unsupported file format: .${ext}. Supported: GeoJSON, Shapefile (Zipped), Parquet.`);
    }

    await loadGeoJSON(geojson, file.name);

  } catch (error) {
    console.error('[File] Error loading file:', error);
    hideLoading();
    showError(`Error loading file: ${error.message}`);
  }
}

// ============================================
// URL Handler
// ============================================

/**
 * Handle loading data from a remote URL
 * @param {string} url - The URL to load data from
 */
export async function handleURL(url) {
  // Validate URL
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    showError('Invalid URL. Please enter a valid URL starting with http:// or https://');
    return;
  }

  // Extract file extension from URL path
  const pathname = parsedUrl.pathname;
  const ext = pathname.split('.').pop().toLowerCase();

  showLoading(`Loading from ${parsedUrl.hostname}...`);

  try {
    let geojson;

    switch (ext) {
      case 'geojson':
      case 'json':
        geojson = await fetchGeoJSON(url);
        break;

      case 'parquet':
      case 'geoparquet':
        geojson = await parseRemoteParquet(url);
        break;

      case 'zip':
        throw new Error('Remote Shapefile (.zip) loading is not supported. Please download the file and upload it locally.');

      default:
        // Try to detect from Content-Type or attempt GeoJSON
        console.log(`[URL] Unknown extension "${ext}", attempting to detect format...`);
        geojson = await fetchGeoJSON(url);
    }

    // Use URL hostname + path as filename
    const filename = `${parsedUrl.hostname}${pathname}`;
    await loadGeoJSON(geojson, filename);

  } catch (error) {
    console.error('[URL] Error loading from URL:', error);
    hideLoading();

    // Provide user-friendly error messages
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      showError('Failed to fetch data. The URL may be blocked by CORS policy or unreachable.');
    } else {
      showError(`Error loading from URL: ${error.message}`);
    }
  }
}

/**
 * Fetch and parse GeoJSON from URL
 * @param {string} url - URL to fetch GeoJSON from
 * @returns {Object} Parsed GeoJSON
 */
async function fetchGeoJSON(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const text = await response.text();
  const geojson = JSON.parse(text);

  // Estimate file size from response
  App.fileSize = text.length;

  // Transform CRS if needed
  return await transformCRS(geojson);
}

// ============================================
// GeoJSON Parser
// ============================================

/**
 * Parse GeoJSON file
 * @param {File} file - GeoJSON file
 * @returns {Object} Parsed and transformed GeoJSON
 */
async function parseGeoJSON(file) {
  const text = await file.text();
  const geojson = JSON.parse(text);

  // Check if transformation is needed
  return await transformCRS(geojson);
}

// ============================================
// Shapefile Parser
// ============================================

/**
 * Parse Shapefile (as zip)
 * @param {File} file - Zipped shapefile
 * @returns {Object} GeoJSON
 */
async function parseShapefile(file) {
  const arrayBuffer = await file.arrayBuffer();
  return await shp(arrayBuffer);
}

// ============================================
// Parquet Parser
// ============================================

/**
 * Parse Parquet file using DuckDB
 * @param {File} file - Parquet file
 * @returns {Object} GeoJSON FeatureCollection
 */
async function parseParquet(file) {
  if (!App.db || !App.conn) {
    throw new Error('DuckDB is not initialized. Cannot read Parquet files.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // Register file with DuckDB
  await App.db.registerFileBuffer(file.name, uint8Array);

  // Try to read geometry column
  const schemaResult = await App.conn.query(`DESCRIBE SELECT * FROM parquet_scan('${file.name}')`);
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

  // Query data
  const sql = `SELECT *
               FROM parquet_scan('${file.name}')`;

  const result = await App.conn.query(sql);
  const rows = result.toArray();

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
          console.warn(`[Parquet] Could not parse geometry for row ${idx}`);
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
// GeoJSON Loader
// ============================================

/**
 * Load GeoJSON data and display on map
 * @param {Object} geojson - GeoJSON FeatureCollection
 * @param {string} filename - Source filename
 */
export async function loadGeoJSON(geojson, filename) {
  showLoading('Processing data...');

  // Normalize to FeatureCollection
  if (geojson.type === 'Feature') {
    geojson = {type: 'FeatureCollection', features: [geojson]};
  } else if (geojson.type !== 'FeatureCollection') {
    throw new Error('Invalid GeoJSON: Expected Feature or FeatureCollection');
  }

  // Store FULL original data BEFORE applying limit
  App.originalData = geojson;

  // Apply feature limit to create current data
  const originalCount = geojson.features.length;
  let currentData;

  if (App.featureLimit > 0 && originalCount > App.featureLimit) {
    currentData = {
      type: 'FeatureCollection',
      features: geojson.features.slice(0, App.featureLimit)
    };
    console.log(`[Loader] Limited from ${originalCount} to ${App.featureLimit} objects`);
    showWarning(`Showing ${App.featureLimit.toLocaleString()} of ${originalCount.toLocaleString()} objects. Adjust limit in Performance Settings.`);

    // Update status display
    const featureLimitStatus = document.getElementById('featureLimitStatus');
    if (featureLimitStatus) {
      featureLimitStatus.textContent = `Showing ${App.featureLimit.toLocaleString()} of ${originalCount.toLocaleString()}`;
      featureLimitStatus.style.color = 'var(--accent-warning, orange)';
    }
  } else {
    currentData = geojson;

    // Update status display
    const featureLimitStatus = document.getElementById('featureLimitStatus');
    if (featureLimitStatus && originalCount > 0) {
      featureLimitStatus.textContent = `Showing all ${originalCount.toLocaleString()} objects`;
      featureLimitStatus.style.color = 'var(--text-muted)';
    }
  }

  App.currentData = currentData;

  // Analyze columns
  analyzeColumns(currentData);

  // Register FULL original data in DuckDB for SQL queries (so SQL can access all rows)
  await registerInDuckDB(App.originalData);

  // Add CURRENT (limited) data to map
  renderData(currentData);

  // Show controls
  const dataControls = document.getElementById('dataControls');
  const visualizationControls = document.getElementById('visualizationControls');
  const sqlSection = document.getElementById('sqlSection');
  const welcomeOverlay = document.getElementById('welcomeOverlay');

  if (dataControls) {
    dataControls.style.display = 'block';
  }
  if (visualizationControls) {
    visualizationControls.style.display = 'block';
  }
  if (sqlSection) {
    sqlSection.style.display = 'block';
  }
  if (welcomeOverlay) {
    welcomeOverlay.classList.add('hidden');
  }

  // Auto-select first numeric column for coloring
  if (App.numericColumns.length > 0) {
    App.setColumn(App.numericColumns[0]);
  } else if (App.categoricalColumns.length > 0) {
    App.setColumn(App.categoricalColumns[0]);
  }

  // Note: hideLoading() is called in map.js finishRendering() after render completes
  const displayedCount = currentData.features.length;
  const totalCount = App.originalData.features.length;
  if (displayedCount < totalCount) {
    console.log(`[VecGeo Viewer] Loaded ${totalCount} objects from ${filename}, displaying ${displayedCount}`);
  } else {
    console.log(`[VecGeo Viewer] Loaded ${totalCount} objects from ${filename}`);
  }
}
