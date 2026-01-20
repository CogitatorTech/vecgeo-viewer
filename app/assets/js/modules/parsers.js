/**
 * VecGeo Viewer - Parsers Module
 *
 * Handles file parsing for GeoJSON, Shapefile, and Parquet formats.
 */

import { App } from '../app.js';
import { hideLoading, showError, showLoading } from './ui.js';
import { transformCRS } from './crs.js';
import { analyzeColumns } from './visualization.js';
import { renderData } from './map.js';
import { registerInDuckDB } from './duckdb.js';

// ============================================
// File Handler
// ============================================

/**
 * Handle uploaded file
 * @param {File} file - The uploaded file
 */
export async function handleFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.'));

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
        throw new Error(`Unsupported file format: .${ext}. Supported: GeoJSON, Shapefile (zip), Parquet.`);
    }

    await loadGeoJSON(geojson, file.name);

  } catch (error) {
    console.error('[File] Error loading file:', error);
    hideLoading();
    showError(`Error loading file: ${error.message}`);
  }
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
  const transformedGeoJSON = await transformCRS(geojson);
  return transformedGeoJSON;
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
  if (!App.conn) {
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
  let sql;
  if (geometryCol) {
    // Has geometry - use spatial extension hint
    sql = `SELECT *
           FROM parquet_scan('${file.name}')`;
  } else {
    sql = `SELECT *
           FROM parquet_scan('${file.name}')`;
  }

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
    geojson = { type: 'FeatureCollection', features: [geojson] };
  } else if (geojson.type !== 'FeatureCollection') {
    throw new Error('Invalid GeoJSON: Expected Feature or FeatureCollection');
  }

  // Apply feature limit
  const originalCount = geojson.features.length;
  if (App.featureLimit > 0 && originalCount > App.featureLimit) {
    geojson = {
      type: 'FeatureCollection',
      features: geojson.features.slice(0, App.featureLimit)
    };
    console.log(`[Loader] Limited from ${originalCount} to ${App.featureLimit} objects`);
    showError(`Showing ${App.featureLimit.toLocaleString()} of ${originalCount.toLocaleString()} objects. Adjust limit in Performance Settings.`);
  }

  // Store original data
  App.originalData = geojson;
  App.currentData = geojson;

  // Analyze columns
  analyzeColumns(geojson);

  // Register data in DuckDB for SQL queries
  await registerInDuckDB(geojson);

  // Add to map
  renderData(geojson);

  // Show controls
  document.getElementById('dataControls').style.display = 'block';
  document.getElementById('visualizationControls').style.display = 'block';
  document.getElementById('quickFilterSection').style.display = 'block';
  document.getElementById('sqlSection').style.display = 'block';
  document.getElementById('welcomeOverlay').classList.add('hidden');

  // Auto-select first numeric column for coloring
  if (App.numericColumns.length > 0) {
    App.setColumn(App.numericColumns[0]);
  } else if (App.categoricalColumns.length > 0) {
    App.setColumn(App.categoricalColumns[0]);
  }

  hideLoading();
  console.log(`[VecGeo Viewer] Loaded ${geojson.features.length} objects from ${filename}`);
}
