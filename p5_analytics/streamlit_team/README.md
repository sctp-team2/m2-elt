# Olist Team Deck (Streamlit · multipage skeleton)

A presentation skeleton over the **`olist_gold_mart_prod`** BigQuery gold mart. The story
is split into **three pain points**, one page each, so each sub-team owns a page:

| # | Page | Executive | Owners | File |
|---|------|-----------|--------|------|
| 1 | Customer Retention | CEO | Jun, Jenn Fang | `pages/1_Retention_CEO.py` |
| 2 | Operational Performance (Delivery) | COO | John, Chun Wei, Charmaine | `pages/2_Delivery_COO.py` |
| 3 | Reviews & the Revenue Leak | CMO | Bryan, Soon Meng | `pages/3_Reviews_CMO.py` |

`app.py` is the landing page (overview + a BigQuery connection test). Streamlit builds the
left-sidebar nav automatically from the `pages/` folder.

Each page is a **skeleton**: one working KPI query against the gold mart plus a `TODO`
checklist. The analysis it should grow into is sketched in `../notebooks/team_eda_pp{1,2,3}.ipynb`.

## Layout
```
streamlit_team/
├── app.py                    # home / overview + connection test
├── pages/                    # one page per pain point (auto-discovered nav)
│   ├── 1_Retention_CEO.py
│   ├── 2_Delivery_COO.py
│   └── 3_Reviews_CMO.py
├── lib/
│   ├── config.py             # project / dataset / credential resolution
│   └── bq.py                 # cached BigQuery client + run_query()
├── requirements.txt
├── Dockerfile  ·  .dockerignore  ·  Makefile
└── notes/{setup.local.md, setup.prod.md}
```

## Run it
- **Local:** see [`notes/setup.local.md`](notes/setup.local.md) — `make venv && make run`
- **Production (Cloud Run):** see [`notes/setup.prod.md`](notes/setup.prod.md) — `make deploy`

> Gold marts only (the data contract) — never silver or raw.
