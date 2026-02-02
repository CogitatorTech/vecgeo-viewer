/**
 * VecGeo Viewer - Visualization Module
 *
 * Handles color scales, column analysis, legend, and visualization settings.
 */

import {App} from '../app.js';

// ============================================
// Custom Colormap Definitions
// ============================================

// Turbo colormap (Google AI) - sampled color stops
const TURBO_COLORS = [
  '#30123b', '#4145ab', '#4675ed', '#39a2fc', '#1bcfd4',
  '#24eca6', '#61fc6c', '#a4fc3b', '#d1e834', '#f3c63a',
  '#fe9b2d', '#f36315', '#d93806', '#b11901', '#7a0402'
];

// Cividis colormap (colorblind-friendly) - sampled color stops
const CIVIDIS_COLORS = [
  '#00204d', '#00306f', '#1e4174', '#3d5076', '#575d6d',
  '#6f6b5d', '#867a49', '#9f8a32', '#ba9b1c', '#d6ac00',
  '#f4c800', '#fee838', '#fdfd66'
];

// Register custom colormaps with chroma
if (typeof chroma !== 'undefined') {
  chroma.brewer = chroma.brewer || {};
  chroma.brewer.turbo = TURBO_COLORS;
  chroma.brewer.cividis = CIVIDIS_COLORS;
}

// ============================================
// Column Analysis
// ============================================

/**
 * Analyze columns in the GeoJSON data
 * @param {Object} geojson - GeoJSON FeatureCollection
 */
export function analyzeColumns(geojson) {
  const allCols = new Set();
  const numericCols = new Set();
  const categoricalCols = new Set();

  const sampleSize = Math.min(100, geojson.features.length);
  const sampleFeatures = geojson.features.slice(0, sampleSize);

  sampleFeatures.forEach(f => {
    if (!f.properties) return;

    Object.entries(f.properties).forEach(([key, value]) => {
      allCols.add(key);

      if (value === null || value === undefined) return;

      if (typeof value === 'number' && !isNaN(value)) {
        numericCols.add(key);
      } else if (typeof value === 'string' || typeof value === 'boolean') {
        categoricalCols.add(key);
      }
    });
  });

  // Remove numeric columns from categorical
  numericCols.forEach(col => categoricalCols.delete(col));

  App.columns = Array.from(allCols);
  App.numericColumns = Array.from(numericCols);
  App.categoricalColumns = Array.from(categoricalCols);

  updateColumnSelector();

  console.log(`[Columns] Found ${numericCols.size} numeric, ${categoricalCols.size} categorical`);
}

/**
 * Update column selector dropdown
 */
export function updateColumnSelector() {
  const select = document.getElementById('columnSelect');
  if (!select) return;

  // Clear ALL children (options AND optgroups) except the first placeholder option
  const placeholder = select.querySelector('option[value=""]');
  select.innerHTML = '';
  if (placeholder) {
    select.appendChild(placeholder);
  } else {
    // Recreate placeholder if it was lost
    const newPlaceholder = document.createElement('option');
    newPlaceholder.value = '';
    newPlaceholder.textContent = '-- Select column --';
    select.appendChild(newPlaceholder);
  }

  // Add numeric columns
  if (App.numericColumns.length > 0) {
    const numericGroup = document.createElement('optgroup');
    numericGroup.label = 'Numeric';

    App.numericColumns.forEach(col => {
      const option = document.createElement('option');
      option.value = col;
      option.textContent = col;
      numericGroup.appendChild(option);
    });

    select.appendChild(numericGroup);
  }

  // Add categorical columns
  if (App.categoricalColumns.length > 0) {
    const catGroup = document.createElement('optgroup');
    catGroup.label = 'Categorical';

    App.categoricalColumns.forEach(col => {
      const option = document.createElement('option');
      option.value = col;
      option.textContent = col;
      catGroup.appendChild(option);
    });

    select.appendChild(catGroup);
  }
}

// ============================================
// Color Scales
// ============================================

/**
 * Create color scale based on current column
 * @param {Object} geojson - GeoJSON FeatureCollection
 */
export function createColorScale(geojson) {
  if (!App.currentColumn) {
    App.colorScale = null;
    return;
  }

  const values = geojson.features
    .map(f => f.properties?.[App.currentColumn])
    .filter(v => v !== null && v !== undefined);

  if (values.length === 0) {
    App.colorScale = null;
    return;
  }

  if (App.numericColumns.includes(App.currentColumn)) {
    // Numeric scale with 5th-95th percentile
    const numericValues = values.map(v => parseFloat(v)).filter(v => !isNaN(v)).sort((a, b) => a - b);

    if (numericValues.length === 0) {
      App.colorScale = null;
      return;
    }

    const p5Index = Math.min(Math.floor(numericValues.length * 0.05), numericValues.length - 1);
    const p95Index = Math.min(Math.floor(numericValues.length * 0.95), numericValues.length - 1);
    const p5 = numericValues[p5Index];
    const p95 = numericValues[p95Index];

    App.colorScale = chroma.scale(App.currentColormap).domain([p5, p95]);
    App.colorScale.min = p5;
    App.colorScale.max = p95;

  } else {
    // Categorical scale
    const uniqueValues = [...new Set(values)].slice(0, 20); // Limit to 20 categories
    const colors = chroma.scale('Set2').colors(uniqueValues.length);

    const colorMap = {};
    uniqueValues.forEach((v, i) => {
      colorMap[v] = colors[i];
    });

    App.colorScale = (val) => colorMap[val] || '#888';
    App.colorScale.categories = uniqueValues;
    App.colorScale.colors = colors;
  }
}

// ============================================
// Legend
// ============================================

/**
 * Update legend display
 */
export function updateLegend() {
  const legendSection = document.getElementById('legendSection');
  const legendContent = document.getElementById('legendContent');

  if (!legendSection || !legendContent) {
    return;
  }

  if (!App.currentColumn || !App.colorScale) {
    legendSection.style.display = 'none';
    return;
  }

  legendSection.style.display = 'block';

  try {
    if (App.numericColumns.includes(App.currentColumn)) {
      // Numeric gradient legend
      const colors = chroma.scale(App.currentColormap).colors(10);
      const gradient = `linear-gradient(to right, ${colors.join(', ')})`;

      const minVal = App.colorScale.min ?? 0;
      const maxVal = App.colorScale.max ?? 1;

      legendContent.innerHTML = `
                <div class="legend-gradient" style="background: ${gradient}"></div>
                <div class="legend-range">
                    <span>${minVal.toFixed(2)}</span>
                    <span>${maxVal.toFixed(2)}</span>
                </div>
            `;
    } else {
      // Categorical legend
      if (App.colorScale.categories && App.colorScale.colors) {
        const items = App.colorScale.categories.map((cat, i) => `
                    <div class="legend-item">
                        <div class="legend-color" style="background: ${App.colorScale.colors[i] || '#888'}"></div>
                        <span class="legend-label">${cat}</span>
                    </div>
                `).join('');

        legendContent.innerHTML = `<div class="legend-categories">${items}</div>`;
      } else {
        legendSection.style.display = 'none';
      }
    }
  } catch (e) {
    console.warn('[Legend] Failed to update legend:', e);
    legendSection.style.display = 'none';
  }
}

/**
 * Update status bar
 * @param {Object} geojson - GeoJSON FeatureCollection
 */
export function updateStatus(geojson) {
  const count = geojson?.features?.length || 0;
  const featureCountEl = document.getElementById('featureCount');
  const currentColumnEl = document.getElementById('currentColumn');
  const dataSizeEl = document.getElementById('dataSize');
  const memoryUsageEl = document.getElementById('memoryUsage');

  if (featureCountEl) {
    featureCountEl.textContent = `${count.toLocaleString()} objects`;
  }
  if (currentColumnEl) {
    currentColumnEl.textContent = App.currentColumn || '—';
  }

  // Estimate Data Size (Dynamic based on filtered data)
  const estimatedSizeBytes = estimateDataSize(geojson);
  if (estimatedSizeBytes > 0 && dataSizeEl) {
    const sizeMB = estimatedSizeBytes / (1024 * 1024);
    const sizeText = sizeMB >= 1 ? `~${sizeMB.toFixed(2)} MB` : `~${(estimatedSizeBytes / 1024).toFixed(2)} KB`;
    dataSizeEl.textContent = `Dataset Size: ${sizeText}`;
  } else if (dataSizeEl) {
    dataSizeEl.textContent = 'Dataset Size: —';
  }

  // Estimate Memory Usage (Dynamic based on filtered data)
  // We use the estimated memory for consistency across filtering actions,
  // as browser heap size (Chrome) is global and lazy-collected.
  const estimatedMem = estimateDataMemory(geojson);
  if (estimatedMem > 0 && memoryUsageEl) {
    memoryUsageEl.textContent = `Memory Usage: ~${estimatedMem.toFixed(1)} MB`;
    memoryUsageEl.title = "Estimated RAM usage of current data (JSON + Object overhead)";
  } else if (memoryUsageEl) {
    memoryUsageEl.textContent = 'Memory Usage: N/A';
  }
}

/**
 * Estimate raw JSON size of GeoJSON data
 */
function estimateDataSize(geojson) {
  if (!geojson || !geojson.features || geojson.features.length === 0) return 0;

  const sampleSize = Math.min(50, geojson.features.length);
  const sampleFeatures = geojson.features.slice(0, sampleSize);

  let sampleBytes = 0;
  try {
    sampleBytes = JSON.stringify(sampleFeatures).length;
  } catch (e) {
    return 0;
  }

  const avgBytesPerFeature = sampleBytes / sampleSize;
  return avgBytesPerFeature * geojson.features.length;
}

/**
 * Estimate memory usage of GeoJSON data (Fallback for Firefox/Safari)
 * Samples 50 features to calculate average size + overhead
 */
function estimateDataMemory(geojson) {
  if (!geojson || !geojson.features || geojson.features.length === 0) return 0;

  const sampleSize = Math.min(50, geojson.features.length);
  const sampleFeatures = geojson.features.slice(0, sampleSize);

  // Serialize sample to get approximation of raw data size
  let sampleBytes = 0;
  try {
    sampleBytes = JSON.stringify(sampleFeatures).length;
  } catch (e) {
    return 0; // Circular structure or error
  }

  // Calculate average per feature
  const avgBytesPerFeature = sampleBytes / sampleSize;
  const totalRawBytes = avgBytesPerFeature * geojson.features.length;

  // JS Objects take more memory than raw JSON string (V8/SpiderMonkey overhead)
  // Rule of thumb: ~1.5x - 2x overhead for object structures + properties
  const objectOverheadFactor = 2.0;

  const totalBytes = totalRawBytes * objectOverheadFactor;
  return totalBytes / (1024 * 1024); // MB
}

// ============================================
// Public API - Column & Colormap Selection
// ============================================

/**
 * Set color-by column
 * @param {string} column - Column name
 * @param {Function} renderData - Render function to call
 */
export function setColumn(column, renderData) {
  App.currentColumn = column || null;
  App.columnIndex = [...App.numericColumns, ...App.categoricalColumns].indexOf(column);

  // Update dropdown
  const columnSelect = document.getElementById('columnSelect');
  if (columnSelect) {
    columnSelect.value = column || '';
  }

  // Re-render (preserve current view)
  if (App.currentData && renderData) {
    renderData(App.currentData, true);
  }

  console.log(`[Column] Set to: ${column || 'none'}`);
}

/**
 * Cycle through columns
 * @param {number} direction - 1 for next, -1 for previous
 * @param {Function} renderData - Render function to call
 */
export function cycleColumn(direction, renderData) {
  const allCols = [...App.numericColumns, ...App.categoricalColumns];
  if (allCols.length === 0) return;

  App.columnIndex = (App.columnIndex + direction + allCols.length) % allCols.length;
  setColumn(allCols[App.columnIndex], renderData);
}

/**
 * Set colormap
 * @param {string} colormap - Colormap name
 * @param {Function} renderData - Render function to call
 */
export function setColormap(colormap, renderData) {
  App.currentColormap = colormap;
  App.colormapIndex = App.colormaps.indexOf(colormap);

  // Update dropdown
  const colormapSelect = document.getElementById('colormapSelect');
  if (colormapSelect) {
    colormapSelect.value = colormap;
  }

  // Re-render (preserve current view)
  if (App.currentData && renderData) {
    renderData(App.currentData, true);
  }

  console.log(`[Colormap] Set to: ${colormap}`);
}

/**
 * Cycle through colormaps
 * @param {Function} renderData - Render function to call
 */
export function cycleColormap(renderData) {
  App.colormapIndex = (App.colormapIndex + 1) % App.colormaps.length;
  setColormap(App.colormaps[App.colormapIndex], renderData);
}
