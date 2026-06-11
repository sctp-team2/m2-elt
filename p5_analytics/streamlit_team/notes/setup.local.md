# Local setup — Olist Team Deck (Streamlit)

A multipage Streamlit skeleton over the `olist_gold_mart_prod` gold mart. Three pain-point
pages, one per sub-team. Connects to **BigQuery live** (no offline snapshot in the skeleton).

## 1. Prerequisites
- Python 3.11
- Access to the `sctp-team2-project2-elt` BigQuery project, via **one** of:
  - a service-account keyfile under `m2-elt/secrets/*.json` (auto-detected — same key the
    EDA notebook uses), **or**
  - your own `gcloud` login: `gcloud auth application-default login`

## 2. Create the venv & install
```bash
cd p5_analytics/streamlit_team
make venv          # python3.11 -m venv .venv + pip install -r requirements.txt
```

## 3. Run it
```bash
make run           # → http://localhost:8501   (ENV=prod, live BigQuery)
```
Then on the **Home** page click **“Test gold-mart connection”** to confirm credentials
resolve before you present. Use the left sidebar to switch between the three pain points.

Custom port / env:
```bash
make run PORT=8502
ENV=dev .venv/bin/streamlit run app.py        # if you keep a repo-root .env.dev
```

Point at a specific keyfile explicitly (overrides auto-detect):
```bash
GOOGLE_APPLICATION_CREDENTIALS=../secrets/your-key.json make run
```

## 4. How it's wired
| File | Role |
|---|---|
| `lib/config.py` | resolves project / dataset / credentials (keyfile → ADC) |
| `lib/bq.py` | cached BigQuery client + `run_query()` (`@st.cache_data`, 1h TTL) |
| `app.py` | home page + connection test; Streamlit auto-builds nav from `pages/` |
| `pages/*.py` | one pain point each — a working KPI query + TODO checklist |

## 5. Container smoke test (optional, mirrors Cloud Run)
```bash
make docker-build
# mount your key so the container can reach BigQuery:
docker run --rm -p 8501:8080 -e PORT=8080 \
  -e GOOGLE_APPLICATION_CREDENTIALS=/key.json \
  -v "$PWD/../secrets/$(ls ../secrets | head -1)":/key.json:ro \
  olist-streamlit-team:local
# → http://localhost:8501
```
