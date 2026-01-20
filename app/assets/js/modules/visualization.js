/**
 * VecGeo Viewer - Visualization Module
 *
 * Handles color scales, column analysis, legend, and visualization settings.
 */

import {App} from '../app.js';

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

  // Clear existing options except the first placeholder
  while (select.options.length > 1) {
    select.remove(1);
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
  document.getElementById('featureCount').textContent = `${count.toLocaleString()} features`;
  document.getElementById('currentColumn').textContent = App.currentColumn || '—';
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
  document.getElementById('columnSelect').value = column || '';

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
  document.getElementById('colormapSelect').value = colormap;

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
