/**
 * VecGeo Viewer - Data Viewer Module
 *
 * Handles the data table modal with search, sort, and pagination.
 */

import {App} from '../app.js';
import {showError} from './ui.js';

// ============================================
// Data Viewer State
// ============================================

export const dataViewerState = {
  currentPage: 1,
  pageSize: 50,
  sortColumn: null,
  sortDirection: 'asc',
  searchTerm: '',
  filteredData: []
};

// ============================================
// Modal Controls
// ============================================

/**
 * Show data viewer modal
 */
export function showDataViewer() {
  if (!App.currentData || !App.currentData.features || App.currentData.features.length === 0) {
    showError('No data loaded to view.');
    return;
  }

  // Reset state
  dataViewerState.currentPage = 1;
  dataViewerState.searchTerm = '';
  dataViewerState.sortColumn = null;
  dataViewerState.sortDirection = 'asc';
  const dataSearchInput = document.getElementById('dataSearchInput');
  if (dataSearchInput) {
    dataSearchInput.value = '';
  }

  // Build and render table
  buildDataTable();

  // Show modal
  const dataViewerModal = document.getElementById('dataViewerModal');
  if (dataViewerModal) {
    dataViewerModal.classList.add('active');
  }
  console.log('[DataViewer] Opened');
}

/**
 * Hide data viewer modal
 */
export function hideDataViewer() {
  const dataViewerModal = document.getElementById('dataViewerModal');
  if (dataViewerModal) {
    dataViewerModal.classList.remove('active');
  }
  console.log('[DataViewer] Closed');
}

// ============================================
// Table Building
// ============================================

/**
 * Build data table from current data
 */
export function buildDataTable() {
  if (!App.currentData || !App.currentData.features) {
    console.warn('[DataViewer] No data available to build table');
    return;
  }

  const features = App.currentData.features;
  const columns = App.columns || [];

  // Apply search filter
  let filteredFeatures = features;
  if (dataViewerState.searchTerm) {
    const term = dataViewerState.searchTerm.toLowerCase();
    filteredFeatures = features.filter(f => {
      if (!f.properties) return false;
      return Object.values(f.properties).some(v =>
        v !== null && v !== undefined && String(v).toLowerCase().includes(term)
      );
    });
  }

  // Apply sorting
  if (dataViewerState.sortColumn) {
    const col = dataViewerState.sortColumn;
    const dir = dataViewerState.sortDirection === 'asc' ? 1 : -1;
    filteredFeatures = [...filteredFeatures].sort((a, b) => {
      const aVal = a.properties?.[col];
      const bVal = b.properties?.[col];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return (aVal - bVal) * dir;
      }
      return String(aVal).localeCompare(String(bVal)) * dir;
    });
  }

  dataViewerState.filteredData = filteredFeatures;

  // Build table header
  const thead = document.getElementById('dataTableHead');
  if (!thead) return;

  const headerRow = document.createElement('tr');

  // Add row number column
  const rowNumTh = document.createElement('th');
  rowNumTh.textContent = '#';
  rowNumTh.style.width = '50px';
  headerRow.appendChild(rowNumTh);

  columns.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col;
    th.dataset.column = col;
    th.onclick = () => sortDataTable(col);

    if (dataViewerState.sortColumn === col) {
      th.classList.add(dataViewerState.sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
    }

    headerRow.appendChild(th);
  });

  thead.innerHTML = '';
  thead.appendChild(headerRow);

  // Calculate pagination
  const totalRows = filteredFeatures.length;
  const totalPages = Math.ceil(totalRows / dataViewerState.pageSize);
  const startIdx = (dataViewerState.currentPage - 1) * dataViewerState.pageSize;
  const endIdx = Math.min(startIdx + dataViewerState.pageSize, totalRows);
  const pageFeatures = filteredFeatures.slice(startIdx, endIdx);

  // Build table body
  const tbody = document.getElementById('dataTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  pageFeatures.forEach((feature, idx) => {
    const tr = document.createElement('tr');

    // Row number
    const rowNumTd = document.createElement('td');
    rowNumTd.textContent = startIdx + idx + 1;
    rowNumTd.style.color = 'var(--text-muted)';
    tr.appendChild(rowNumTd);

    columns.forEach(col => {
      const td = document.createElement('td');
      const val = feature.properties?.[col];
      if (val === null || val === undefined) {
        td.textContent = '';
        td.style.color = 'var(--text-muted)';
      } else if (typeof val === 'object') {
        td.textContent = JSON.stringify(val);
      } else {
        td.textContent = val;
      }
      td.title = td.textContent; // Tooltip for truncated text
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  // Update row count and pagination info
  const dataRowCount = document.getElementById('dataRowCount');
  if (dataRowCount) {
    dataRowCount.textContent = dataViewerState.searchTerm
      ? `${totalRows} of ${features.length} rows`
      : `${totalRows} rows`;
  }

  const dataPageInfo = document.getElementById('dataPageInfo');
  if (dataPageInfo) {
    dataPageInfo.textContent = totalPages > 0
      ? `Page ${dataViewerState.currentPage} of ${totalPages}`
      : 'No results';
  }

  // Update pagination button states
  const dataPrevBtn = document.getElementById('dataPrevBtn');
  const dataNextBtn = document.getElementById('dataNextBtn');
  if (dataPrevBtn) {
    dataPrevBtn.disabled = dataViewerState.currentPage <= 1;
  }
  if (dataNextBtn) {
    dataNextBtn.disabled = dataViewerState.currentPage >= totalPages;
  }
}

// ============================================
// Table Controls
// ============================================

/**
 * Filter data table by search term
 * @param {string} searchTerm - Search term
 */
export function filterDataTable(searchTerm) {
  dataViewerState.searchTerm = searchTerm;
  dataViewerState.currentPage = 1;
  buildDataTable();
}

/**
 * Sort data table by column
 * @param {string} column - Column name
 */
export function sortDataTable(column) {
  if (dataViewerState.sortColumn === column) {
    // Toggle direction
    dataViewerState.sortDirection = dataViewerState.sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    dataViewerState.sortColumn = column;
    dataViewerState.sortDirection = 'asc';
  }
  dataViewerState.currentPage = 1;
  buildDataTable();
}

/**
 * Go to previous page
 */
export function dataTablePrevPage() {
  if (dataViewerState.currentPage > 1) {
    dataViewerState.currentPage--;
    buildDataTable();
  }
}

/**
 * Go to next page
 */
export function dataTableNextPage() {
  const totalPages = Math.ceil(dataViewerState.filteredData.length / dataViewerState.pageSize);
  if (dataViewerState.currentPage < totalPages) {
    dataViewerState.currentPage++;
    buildDataTable();
  }
}

/**
 * Set page size
 * @param {string|number} size - Page size
 */
export function setDataTablePageSize(size) {
  dataViewerState.pageSize = parseInt(size, 10);
  dataViewerState.currentPage = 1;
  buildDataTable();
}
