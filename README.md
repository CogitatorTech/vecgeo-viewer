## VecGeo Viewer

A simple web-based vector geospatial dataset viewer powered by DuckDB-WASM.

> [!NOTE]
> Report bugs and feature requests on the [issues page](https://github.com/CogitatorTech/vecgeo-viewer/issues).

### Features

- Load GeoJSON, Shapefile, and Parquet/GeoParquet files
- Interactive map visualization
- Color mapping by numeric or categorical columns
- SQL filtering and transformations via DuckDB-WASM
- Export filtered data as GeoJSON
- Light and dark theme support
- Keyboard shortcuts for navigation

### Getting Started

Visit the live app: [VecGeo Viewer](https://cogitatortech.github.io/vecgeo-viewer/index.html)

#### Run Locally

1. Clone the repository:
   ```bash
   git clone https://github.com/CogitatorTech/vecgeo-viewer.git
   cd vecgeo-viewer
   ```

2. Start the local HTTP server:
   ```bash
   bash scripts/start_server.sh
   ```

3. Open http://localhost:8085/index.html in your browser.

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to make a contribution.

### License

This project is licensed under the MIT License ([LICENSE](LICENSE))
