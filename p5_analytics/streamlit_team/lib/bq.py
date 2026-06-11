"""Thin BigQuery access layer for the team app.

One shared, cached client + a ``run_query`` helper that returns a pandas DataFrame.
Results are cached in-Streamlit (``@st.cache_data``) so flipping between pages and
re-running widgets does not re-bill BigQuery.

Used by every page under ``pages/``. Reads gold-mart tables only (the data contract).
"""
from __future__ import annotations

import os

import db_dtypes  # noqa: F401  registers BigQuery DATE dtype for clean pandas round-trips
import pandas as pd
import streamlit as st

from lib import config


@st.cache_resource(show_spinner=False)
def get_client():
    """A single BigQuery client per server process (cached across reruns)."""
    from google.cloud import bigquery

    return bigquery.Client(project=config.GCP_PROJECT, location=config.BQ_LOCATION)


@st.cache_data(ttl=3600, show_spinner="Querying the gold mart …")
def run_query(sql: str) -> pd.DataFrame:
    """Run SQL against BigQuery and return a DataFrame (cached for 1 hour)."""
    return get_client().query(sql).result().to_dataframe()


def healthcheck() -> tuple[bool, str]:
    """Return (ok, message) for a trivial 'SELECT 1' — used on the home page."""
    try:
        get_client().query("SELECT 1").result()
        cred = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")
        how = f"keyfile ({cred.split('/')[-1]})" if cred else "gcloud ADC / Cloud Run SA"
        return True, f"Connected to {config.GCP_PROJECT}.{config.GOLD_DATASET} via {how}"
    except Exception as e:  # noqa: BLE001  surface any auth/network error to the UI
        return False, str(e)
