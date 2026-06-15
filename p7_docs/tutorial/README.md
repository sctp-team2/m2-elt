# 🎓 Olist ELT Academy — Tutorial Webapp

A self-contained, step-by-step tutorial webapp for the entire **M2-ELT** project —
both the **technical pipeline** (EL → warehouse design → dbt → data quality →
Dagster → GCP deployment) and the **business analysis** (Olist context, KPIs,
the repeat-purchase diagnosis, BI dashboards).

## Run it

No build step, no dependencies. Any of these works:

```bash
# Option 1 — simple static server (recommended)
cd p7_docs/tutorial
python3 -m http.server 8080
# open http://localhost:8080

# Option 2 — just open the file directly
open p7_docs/tutorial/index.html        # macOS
```

> Syntax highlighting (highlight.js) and diagrams (mermaid) load from CDNs,
> so an internet connection is needed for those to render. Everything else
> works offline.

## Deploy it (optional)

It's a pure static site, so it deploys anywhere:

- **GitHub Pages**: point Pages at the repo and use `/p7_docs/tutorial` as the path
  (or copy the folder to a `docs/` root).
- **Cloud Run / nginx**: drop the folder into any static-file server — e.g. add a
  `location /tutorial/ { alias ...; }` block to the existing `nginx-dagster.conf`.

## Structure

```
tutorial/
├── index.html          # app shell — lists every lesson <script>
├── css/styles.css      # theme (light/dark), layout, components
├── js/app.js           # engine: nav, routing, progress, quizzes, search
└── js/lessons/         # one file per lesson, self-registering
    ├── 00-welcome.js          (Getting Started)
    ├── 01-big-picture.js
    ├── 02-setup.js
    ├── 03-extract-load.js     (Technical Track: P1 → deployment)
    ├── 04-warehouse-design.js
    ├── 05-dbt-stage.js
    ├── 06-dbt-gold.js
    ├── 07-data-quality.js
    ├── 08-orchestration.js
    ├── 09-deployment.js
    ├── 10-business-context.js (Business Track)
    ├── 11-kpis.js
    ├── 12-insights.js
    ├── 13-dashboards.js
    └── 14-capstone.js         (Capstone: exercises + glossary)
```

## Features

- **Two learning tracks** — Technical (~3.5 h) and Business (~1.5 h) — plus a capstone
- **Progress tracking** — completed lessons, per-lesson hands-on checklists, and quiz
  answers persist in `localStorage` (use the ↺ Reset button to clear)
- **Quizzes** with instant feedback and explanations
- **Mermaid diagrams**, syntax-highlighted code with copy buttons, search (`/`),
  dark mode (🌙)

## Adding or editing a lesson

1. Create `js/lessons/NN-your-lesson.js` that pushes an object into
   `window.TUTORIAL_LESSONS` — copy `00-welcome.js` as a template.
2. Add a `<script src="js/lessons/NN-your-lesson.js"></script>` tag to `index.html`.
3. Inside the `body` template literal: never use a raw backtick or `${` sequence,
   and HTML-escape `<`, `>`, `&` inside code blocks.
4. Sanity-check: `node --check js/lessons/NN-your-lesson.js`
