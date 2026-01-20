## Template Single-page Web App

This is a minimal template for a single-page web application (SPA).

> [!NOTE]
> Report bugs and feature requests use the [issues page](https://github.com/habedi/template-single-page-app/issues).

### Getting Started

To use the App, visit [this URL](https://habedi.github.io/template-single-page-app/index.html) in your browser.

#### Run the App Locally

1. Clone the repository:

   ```bash
   git clone https://github.com/habedi/template-single-page-app.git
   cd template-single-page-app
   ```

2. Start the local HTTP server:

   ```bash
   bash scripts/start_server.sh
   ```

Then open http://localhost:8085/index.html in your browser.

### File Structure

```
template-single-page-app/
├── app/                    # Main application files
│   ├── index.html          # Entry point
│   ├── 404.html            # Fallback for SPA routing
│   └── assets/             # Static assets
│       ├── css/
│       │   └── styles.css  # Main stylesheet
│       └── js/
│           └── app.js      # Main JavaScript
├── scripts/
│   └── start_server.sh     # Local dev server script
├── .github/
│   └── workflows/
│       └── docs.yml        # GitHub Pages deployment
├── .editorconfig           # Editor formatting rules
├── .prettierignore         # Prettier exclusions
└── README.md
```

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to make a contribution.

### License

This project is licensed under the MIT License ([LICENSE](LICENSE) or https://opensource.org/licenses/MIT)
