# Production setup — Olist Team Deck (Streamlit) on Cloud Run

Deployed to **Cloud Run** (us-central1), deliberately decoupled from the nightly Dagster
VM. Connects to **BigQuery live** using the Cloud Run service account (ADC) — no keyfile is
baked into the image.

## 1. Prerequisites
- `gcloud` authenticated: `gcloud auth login` (run this yourself: `! gcloud auth login`)
- Project set: `gcloud config set project sctp-team2-project2-elt`
- An Artifact Registry repo (the Makefile uses `olist-elt` in `us-central1`)
- The Cloud Run runtime service account needs **BigQuery Data Viewer** + **BigQuery Job
  User** on `sctp-team2-project2-elt`.

## 2. Deploy
```bash
cd p5_analytics/streamlit_team
make deploy
```
This runs:
```bash
gcloud builds submit --tag <IMAGE> --project sctp-team2-project2-elt .
gcloud run deploy olist-streamlit-team --image <IMAGE> \
  --region us-central1 --platform managed --allow-unauthenticated \
  --memory 1Gi --cpu 1 --port 8080
```
The deploy command prints the public **Service URL** when it finishes.

## 3. Configuration (env vars)
All optional — defaults match the gold mart. Override at deploy time with
`--set-env-vars`:
| Var | Default |
|---|---|
| `GCP_PROJECT` | `sctp-team2-project2-elt` |
| `BQ_GOLD_DATASET` | `olist_gold_mart_prod` |
| `BQ_LOCATION` | `US` |

Example:
```bash
gcloud run services update olist-streamlit-team --region us-central1 \
  --set-env-vars BQ_GOLD_DATASET=olist_gold_mart_prod
```

## 4. Verify
Open the Service URL, then the **Home** page → **Test gold-mart connection** should report
the attached service account. Each pain-point page loads its KPI query live.

## 5. Translation (English mode on the Voice-of-Customer page)

The page's **Language → English (translated)** toggle calls the Cloud Translation API.
The service runs as the **default compute SA** (`513410438758-compute@developer.gserviceaccount.com`),
which holds the BigQuery roles (§1) and — granted 2026-06-11 for this feature —
`roles/cloudtranslate.user`:

```bash
gcloud services enable translate.googleapis.com --project sctp-team2-project2-elt   # already enabled (wordcloud app)
gcloud projects add-iam-policy-binding sctp-team2-project2-elt \
  --member="serviceAccount:513410438758-compute@developer.gserviceaccount.com" \
  --role="roles/cloudtranslate.user" --condition=None
```

Without the role the page still works — it falls back to Portuguese terms with a warning
(`lib/translate.py` + the try/except in `pages/4_Voice_of_Customer.py`).

## 6. Performance (cold first load)

The first page view per instance/cache-window pulls ~99k order-grain rows. Two levers
(2026-06-11):

- **BigQuery Storage Read API** — `google-cloud-bigquery-storage` in requirements.txt
  makes `to_dataframe()` stream Arrow instead of paginating REST: measured **59s → 4s**
  for the orders pull. Needs `roles/bigquery.readSessionUser` on the runtime SA
  (granted):
  ```bash
  gcloud projects add-iam-policy-binding sctp-team2-project2-elt \
    --member="serviceAccount:513410438758-compute@developer.gserviceaccount.com" \
    --role="roles/bigquery.readSessionUser" --condition=None
  ```
- Remaining cold-start cost is the Cloud Run container boot after scale-to-zero. If that
  matters for a demo, pin a warm instance (adds idle cost):
  `gcloud run services update olist-streamlit-team --region us-central1 --min-instances 1`

Redis/Memorystore is **not** needed: `st.cache_data` already memoizes per instance for
1h, traffic is single-instance, and the bottleneck was transfer speed, not cache misses.

## 7. Notes
- No keyfile in the image — production auth is the Cloud Run service account (ADC). The
  `.dockerignore` excludes `secrets/` and `*.json` so a local key never ships.
- `.gcloudignore` keeps `.venv/` out of the Cloud Build upload (added 2026-06-11).
- Query results are cached in-app for 1h (`lib/bq.py`), so BigQuery cost stays trivial.
- After deploying, update the status table in `../app.MD` with the new Service URL.

## Deployed (2026-06-11)

| | |
|---|---|
| Cloud Run service | `olist-streamlit-team` (us-central1) |
| Live URL | https://olist-streamlit-team-513410438758.us-central1.run.app |
| Revision | `olist-streamlit-team-00003-4xf` (100% traffic) |
| Image tag | `0.1.0-fabe305` |
| Runtime SA | `513410438758-compute@developer.gserviceaccount.com` (BQ read/job + cloudtranslate.user) |
| Pages | Home + PP1/PP2/PP3 + Voice of Customer + Summary (live BQ, 1h cache) |
