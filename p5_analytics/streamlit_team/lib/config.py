"""Configuration for the team Streamlit app.

Resolves the BigQuery project / dataset / credentials so the app can run both
locally (service-account keyfile under ``m2-elt/secrets/`` or your ``gcloud`` ADC)
and in production (Cloud Run's attached service account). Mirrors the convention
used in ``../notebooks/team_eda_pp1.ipynb``.

Environment overrides (all optional):
  GCP_PROJECT                     default: sctp-team2-project2-elt
  BQ_GOLD_DATASET                 default: olist_gold_mart_prod
  BQ_LOCATION                     default: US
  GOOGLE_APPLICATION_CREDENTIALS  path to a service-account keyfile (else ADC)
"""
from __future__ import annotations

import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # python-dotenv is optional
    load_dotenv = None

# streamlit_team/lib/ -> streamlit_team/ -> p5_analytics/ -> m2-elt/ (holds secrets/ + .env.<env>)
LIB_DIR = Path(__file__).resolve().parent
APP_DIR = LIB_DIR.parent
REPO_ROOT = APP_DIR.parents[1] if len(APP_DIR.parents) > 1 else APP_DIR

ENV = os.environ.get("ENV", "prod")

# Load repo-root .env.<env> if present (local dev). On Cloud Run there is none — real
# environment variables are used instead, so a missing file is fine.
if load_dotenv is not None:
    _env_file = REPO_ROOT / f".env.{ENV}"
    if _env_file.exists():
        load_dotenv(_env_file)

GCP_PROJECT = os.environ.get("GCP_PROJECT", "sctp-team2-project2-elt")
BQ_LOCATION = os.environ.get("BQ_LOCATION", "US")
GOLD_DATASET = os.environ.get("BQ_GOLD_DATASET", "olist_gold_mart_prod")


def table(name: str) -> str:
    """Fully-qualified gold-mart table ref, e.g. table('fact_orders')."""
    return f"`{GCP_PROJECT}.{GOLD_DATASET}.{name}`"


# --- Credentials resolution (same approach as the EDA notebook) --------------
# 1. Honour GOOGLE_APPLICATION_CREDENTIALS if set (absolute or relative to repo root).
# 2. Else auto-detect the rotated keyfile under m2-elt/secrets/.
# 3. Else fall through to Application Default Credentials (your `gcloud auth login`
#    locally, or the attached service account on Cloud Run).
def _resolve_credentials() -> None:
    cred = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if cred:
        p = Path(cred)
        if not p.is_absolute():
            p = (REPO_ROOT / p).resolve()
        if p.exists():
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(p)
            return

    secrets_dir = REPO_ROOT / "secrets"
    if secrets_dir.is_dir():
        keys = sorted(secrets_dir.glob("*.json"))
        if keys:
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(keys[0])
    # else: leave unset -> ADC.


_resolve_credentials()
