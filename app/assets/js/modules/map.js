/**
 * VecGeo Viewer - Map Module
 *
 * Handles map initialization, rendering, basemaps, and view controls.
 */

import {App} from '../app.js';
import {createColorScale, updateLegend, updateStatus} from './visualization.js';

// ============================================
// Basemap Definitions
// ============================================

export const BASEMAPS = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    options: {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }
  },
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    options: {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }
  },
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: {
      attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
      maxZoom: 18
    }
  },
  terrain: {
    url: 'https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}{r}.png',
    options: {
      attribution: '&copy; <a href="https://stadiamaps.com/">Stadia</a> &copy; <a href="https://stamen.com/">Stamen</a>',
      maxZoom: 18
    }
  }
};

// ============================================
// Map Initialization
// ============================================

/**
 * Initialize Leaflet map
 */
export function initMap() {
  App.map = L.map('map', {
    center: [20, 0],
    zoom: 2,
    zoomControl: true,
    preferCanvas: true // Better performance for many features
  });

  // Add default basemap
  const defaultBasemap = BASEMAPS[App.currentBasemap];
  App.basemapLayer = L.tileLayer(defaultBasemap.url, defaultBasemap.options);
  App.basemapLayer.addTo(App.map);

  console.log('[Map] Initialized');

  // Update zoom display
  const updateZoom = () => {
    const zoom = App.map.getZoom();
    const maxZoom = App.map.getMaxZoom() || 20;
    const percentage = Math.round((zoom / maxZoom) * 100);
    const zoomEl = document.getElementById('zoomLevel');
    if (zoomEl) {
      zoomEl.textContent = `Zoom: ${percentage}%`;
    }
  };

  App.map.on('zoomend', updateZoom);
  updateZoom(); // Initial check
}

// ============================================
// Rendering
// ============================================

/**
 * Render GeoJSON data on the map
 * @param {Object} geojson - GeoJSON data to render
 * @param {boolean} preserveView - If true, don't change the current map view
 */
export function renderData(geojson, preserveView = false) {
  // Remove existing layer
  if (App.geoJsonLayer) {
    App.map.removeLayer(App.geoJsonLayer);
    App.geoJsonLayer = null;
  }

  // Validate geojson
  if (!geojson || !geojson.features || geojson.features.length === 0) {
    console.warn('[Map] No features to render');
    updateStatus(geojson);
    updateLegend();
    return;
  }

  // Create color scale
  if (App.currentColumn) {
    createColorScale(geojson);
  }

  // Style function
  const style = (feature) => {
    let fillColor = '#666';
    let fillOpacity = 0.7;
    let weight = 1;
    let color = '#333';

    if (App.currentColumn && App.colorScale) {
      const val = feature.properties?.[App.currentColumn];
      if (val !== null && val !== undefined) {
        try {
          if (App.numericColumns.includes(App.currentColumn)) {
            const numVal = parseFloat(val);
            if (!isNaN(numVal) && isFinite(numVal)) {
              const chromaColor = App.colorScale(numVal);
              if (chromaColor && typeof chromaColor.hex === 'function') {
                fillColor = chromaColor.hex();
              }
            } else {
              fillColor = '#888';
              fillOpacity = 0.3;
            }
          } else {
            const catColor = App.colorScale(val);
            if (catColor && typeof catColor === 'string') {
              fillColor = catColor;
            }
          }
        } catch (e) {
          // If color scale fails, use default
          fillColor = '#888';
          fillOpacity = 0.3;
        }
      } else {
        fillColor = '#888';
        fillOpacity = 0.3;
      }
    }

    return {
      fillColor,
      fillOpacity,
      weight,
      color,
      opacity: 0.8
    };
  };

  // Point style
  const pointToLayer = (feature, latlng) => {
    const styleOpts = style(feature);
    return L.circleMarker(latlng, {
      radius: App.pointRadius,
      ...styleOpts
    });
  };

  // Create layer
  App.geoJsonLayer = L.geoJSON(geojson, {
    style,
    pointToLayer,
    onEachFeature: (feature, layer) => {
      // Popup with properties
      if (feature.properties) {
        const props = Object.entries(feature.properties)
          .filter(([k, v]) => v !== null && v !== undefined)
          .map(([k, v]) => `<strong>${k}:</strong> ${v}`)
          .join('<br>');
        layer.bindPopup(`<div style="max-height:200px;overflow:auto">${props}</div>`);
      }
    }
  }).addTo(App.map);

  // Fit bounds only if not preserving view
  if (!preserveView) {
    const bounds = App.geoJsonLayer.getBounds();
    if (bounds.isValid()) {
      App.dataBounds = bounds;
      // Use maxZoom to prevent zooming too far in on small result sets
      App.map.fitBounds(bounds, {
        padding: [50, 50],
        maxZoom: 16
      });
    }
  }

  // Update status
  updateStatus(geojson);

  // Update legend
  updateLegend();
}

// ============================================
// Basemap Controls
// ============================================

/**
 * Set basemap
 * @param {string} basemapId - Basemap identifier
 */
export function setBasemap(basemapId) {
  App.currentBasemap = basemapId;

  // Update dropdown
  const basemapSelect = document.getElementById('basemapSelect');
  if (basemapSelect) {
    basemapSelect.value = basemapId;
  }

  // Remove current basemap layer
  if (App.basemapLayer && App.map.hasLayer(App.basemapLayer)) {
    App.map.removeLayer(App.basemapLayer);
  }

  // Add new basemap if not 'none'
  if (basemapId !== 'none' && BASEMAPS[basemapId]) {
    const basemap = BASEMAPS[basemapId];
    App.basemapLayer = L.tileLayer(basemap.url, basemap.options);
    App.basemapLayer.addTo(App.map);
    // Ensure basemap is behind data layer
    App.basemapLayer.bringToBack();
    App.basemapVisible = true;
  } else {
    App.basemapLayer = null;
    App.basemapVisible = false;
  }

  console.log(`[Basemap] Set to: ${basemapId}`);
}

/**
 * Cycle through available basemaps
 */
export function toggleBasemap() {
  const basemaps = Object.keys(BASEMAPS).filter(k => k !== 'none');
  let currentIndex = basemaps.indexOf(App.currentBasemap);

  // If current is 'none' or not found, start with first
  if (currentIndex === -1) {
    currentIndex = -1;
  }

  const nextIndex = (currentIndex + 1) % basemaps.length;
  const nextBasemap = basemaps[nextIndex];

  setBasemap(nextBasemap);
  console.log(`[Basemap] Cycled to: ${nextBasemap}`);
}

/**
 * Reset view to fit data
 */
export function resetView() {
  if (App.dataBounds && App.map) {
    App.map.fitBounds(App.dataBounds, {padding: [20, 20]});
    console.log('[View] Reset');
  }
}
