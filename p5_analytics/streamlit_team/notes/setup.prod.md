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

## 5. Notes
- No keyfile in the image — production auth is the Cloud Run service account (ADC). The
  `.dockerignore` excludes `secrets/` and `*.json` so a local key never ships.
- Query results are cached in-app for 1h (`lib/bq.py`), so BigQuery cost stays trivial.
- After deploying, update the status table in `../app.MD` with the new Service URL.
