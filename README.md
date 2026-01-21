## VecGeo Viewer

A simple web-based vector geospatial dataset viewer powered by DuckDB-WASM.

> [!NOTE]
> Report bugs and feature requests on the [issues page](https://github.com/CogitatorTech/vecgeo-viewer/issues).

> [!IMPORTANT]
> This application needs a working internet connection to work properly.

### Features

- Load GeoJSON, Shapefile, and Parquet/GeoParquet files
- Interactive map visualization
- Color mapping by numeric or categorical columns
- Object filtering and transformations using DuckDB SQL
- Export filtered data as GeoJSON
- Light and dark theme support
- Keyboard shortcuts for navigation

---

### Getting Started

Visit the live app: [VecGeo Viewer](https://cogitatortech.github.io/vecgeo-viewer/index.html)

#### Run with Docker

You can also run the application using the pre-built Docker image:

```bash
docker run -d -p 8080:80 ghcr.io/cogitatortech/vecgeo-viewer:latest
```

Then open http://localhost:8080 in your browser.

#### Run Locally (for development)

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

---

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to make a contribution.

### License

This project is licensed under the MIT License ([LICENSE](LICENSE))
