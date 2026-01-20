/**
 * VecGeo Viewer - CRS Transformation Module
 *
 * Handles coordinate reference system detection and transformation using Proj4js.
 */

import {showLoading} from './ui.js';

// ============================================
// Projection Definitions
// ============================================

const PROJECTIONS = {
  'EPSG:27700': '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs',
  'EPSG:3857': '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs',
  'EPSG:32632': '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs',
  'EPSG:32633': '+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs',
  'EPSG:2154': '+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'EPSG:25832': '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'EPSG:25833': '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
};

// ============================================
// Proj4 Initialization
// ============================================

/**
 * Initialize Proj4 with common projection definitions
 * @returns {boolean} Whether Proj4 is available
 */
export function initProj4Definitions() {
  if (typeof proj4 === 'undefined') {
    console.warn('[Proj4] Proj4js not loaded, CRS transformation unavailable');
    return false;
  }

  for (const [code, def] of Object.entries(PROJECTIONS)) {
    try {
      proj4.defs(code, def);
    } catch (e) {
      console.warn(`[Proj4] Failed to define ${code}:`, e);
    }
  }

  return true;
}

// ============================================
// CRS Detection
// ============================================

/**
 * Detect CRS from GeoJSON
 * @param {Object} geojson - GeoJSON object
 * @returns {string} EPSG code (e.g., 'EPSG:4326')
 */
export function detectCRS(geojson) {
  // Check for CRS property (common in older GeoJSON)
  if (geojson.crs && geojson.crs.properties && geojson.crs.properties.name) {
    const crsName = geojson.crs.properties.name;
    // Extract EPSG code
    const match = crsName.match(/EPSG::?(\d+)/i);
    if (match) {
      return `EPSG:${match[1]}`;
    }
    // Handle urn:ogc:def:crs format
    if (crsName.includes('CRS84') || crsName.includes('4326')) {
      return 'EPSG:4326';
    }
  }

  // Heuristic: check coordinate ranges from first feature
  if (geojson.features && geojson.features.length > 0) {
    const coords = getFirstCoordinate(geojson.features[0].geometry);
    if (coords) {
      const [x, y] = coords;
      // WGS84 range check
      if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
        return 'EPSG:4326';
      }
      // British National Grid (rough check)
      if (x > 0 && x < 700000 && y > 0 && y < 1300000) {
        console.log('[CRS] Detected British National Grid (EPSG:27700) from coordinates');
        return 'EPSG:27700';
      }
      // Web Mercator (large values)
      if (Math.abs(x) > 180 && Math.abs(x) < 20037509) {
        return 'EPSG:3857';
      }
    }
  }

  // Default to WGS84
  return 'EPSG:4326';
}

/**
 * Get first coordinate from a geometry
 * @param {Object} geometry - GeoJSON geometry object
 * @returns {Array|null} Coordinate pair [x, y] or null
 */
export function getFirstCoordinate(geometry) {
  if (!geometry || !geometry.coordinates) return null;

  let coords = geometry.coordinates;
  // Drill down to get an actual coordinate pair
  while (Array.isArray(coords) && Array.isArray(coords[0])) {
    coords = coords[0];
  }
  return coords;
}

// ============================================
// Coordinate Transformation
// ============================================

/**
 * Transform coordinates recursively
 * @param {Array} coords - Coordinates (can be nested)
 * @param {Function} transformer - Proj4 forward transformation function
 * @returns {Array} Transformed coordinates
 */
export function transformCoordinates(coords, transformer) {
  if (!Array.isArray(coords)) return coords;

  // Check if this is a coordinate pair [x, y] or [x, y, z]
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    const [x, y] = transformer([coords[0], coords[1]]);
    if (coords.length > 2) {
      return [x, y, coords[2]]; // Preserve Z if present
    }
    return [x, y];
  }

  // Recursively transform nested arrays
  return coords.map(c => transformCoordinates(c, transformer));
}

/**
 * Transform GeoJSON from source CRS to WGS84
 * @param {Object} geojson - GeoJSON object
 * @returns {Object} Transformed GeoJSON in WGS84
 */
export async function transformCRS(geojson) {
  if (!initProj4Definitions()) {
    return geojson;
  }

  const sourceCRS = detectCRS(geojson);
  console.log(`[CRS] Detected source CRS: ${sourceCRS}`);

  // Already in WGS84
  if (sourceCRS === 'EPSG:4326') {
    return geojson;
  }

  // Check if proj4 knows this projection
  try {
    const sourceProj = proj4(sourceCRS);
    if (!sourceProj) {
      console.warn(`[CRS] Unknown projection: ${sourceCRS}, trying to display as-is`);
      return geojson;
    }
  } catch (e) {
    console.warn(`[CRS] Cannot use projection ${sourceCRS}:`, e);
    return geojson;
  }

  showLoading(`Transforming coordinates from ${sourceCRS}...`);

  // Create transformer
  const transformer = proj4(sourceCRS, 'EPSG:4326').forward;

  // Deep clone and transform
  const transformed = JSON.parse(JSON.stringify(geojson));

  // Remove the old CRS property (GeoJSON spec says WGS84 is default)
  delete transformed.crs;

  // Transform all features
  let transformedCount = 0;
  for (const feature of transformed.features) {
    if (feature.geometry && feature.geometry.coordinates) {
      feature.geometry.coordinates = transformCoordinates(
        feature.geometry.coordinates,
        transformer
      );
      transformedCount++;
    }
  }

  console.log(`[CRS] Transformed ${transformedCount} features from ${sourceCRS} to WGS84`);
  return transformed;
}
