# Olist Team Deck (Streamlit · multipage)

A presentation deck over the **`olist_gold_mart_prod`** BigQuery gold mart (live queries,
cached 1 h in-app). The story is told through **three pain points** — one page each, owned
by a sub-team — plus the qualitative evidence and a synthesis page:

| # | Page | Executive | Owners | File |
|---|------|-----------|--------|------|
| 1 | Customer Retention | CEO | Jun, Jenn Fang | `pages/1_Retention_CEO.py` |
| 2 | Operational Performance (Delivery) | COO | John, Chun Wei, Charmaine | `pages/2_Delivery_COO.py` |
| 3 | Reviews & the Revenue Leak | CMO | Bryan, Soon Meng | `pages/3_Reviews_CMO.py` |
| 4 | Voice of the Customer (review text, word clouds) | — | — | `pages/4_Voice_of_Customer.py` |
| 5 | Summary — diagnosis & recommendations | — | — | `pages/5_Summary.py` |

`app.py` is the landing page (overview + a BigQuery connection test). Streamlit builds the
left-sidebar nav automatically from the `pages/` folder.

Pages 1–3 are migrated from the team EDA notebooks
(`../notebooks/team_eda_pp1.ipynb`, `team_eda_pp2_johnphs_csv.ipynb`, `team_eda_pp3.ipynb`)
— same analysis, rebuilt on live BigQuery with Plotly. Page 4 is a port of the standalone
`../wordcloud/` app (PT→EN term translation via Cloud Translation, with graceful fallback
to Portuguese). Page 5 recomputes the causal chain — *late delivery → low review → no
second purchase → growth must be bought* — from the mart on load.

## Layout
```
streamlit_team/
├── app.py                    # home / overview + connection test
├── pages/                    # auto-discovered nav (see table above)
├── lib/
│   ├── config.py             # project / dataset / credential resolution
│   ├── bq.py                 # cached BigQuery client + run_query()
│   ├── queries.py            # shared gold-mart SQL (one order-grain pull feeds pp2/pp3/summary)
│   ├── text.py               # PT stopwords, tokens, n-grams (Voice of Customer)
│   └── translate.py          # PT→EN term translation (Cloud Translation API)
├── assets/brazil_states.geojson   # choropleth basemap for the PP3 state maps
├── requirements.txt
├── Dockerfile  ·  .dockerignore  ·  Makefile
└── notes/{setup.local.md, setup.prod.md}
```

## Run it
- **Local:** see [`notes/setup.local.md`](notes/setup.local.md) — `make venv && make run`
- **Production (Cloud Run):** see [`notes/setup.prod.md`](notes/setup.prod.md) — `make deploy`

> Gold marts only (the data contract) — never silver or raw. The PP3 notebook's bronze
> joins were rewritten against `dim_reviews` (current SCD versions) in the migration.
>
> The English toggle on page 4 needs the Cloud Translation API enabled and
> `roles/cloudtranslate.user` on the runtime service account; without it the page shows
> the original Portuguese terms and a warning.
