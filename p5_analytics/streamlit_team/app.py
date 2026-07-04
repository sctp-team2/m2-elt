"""Olist Gold Mart — Team Executive Deck (Streamlit, multipage).

One connected story told through three pain points, one page each, plus the
qualitative evidence and the synthesis:

  1. Customer Retention            (CEO)   — owners: Jun, Jenn Fang
  2. Operational Performance       (COO)   — owners: John, Chun Wei, Charmaine
  3. Reviews & the Revenue Leak    (CMO)   — owners: Bryan, Soon Meng
  4. Voice of the Customer         — review free-text analysis (word clouds)
  5. Summary                       — the causal chain, diagnosis & recommendations

This is the HOME page (the landing tab). Each page lives under ``pages/`` and is
selectable from the left sidebar — Streamlit builds the nav automatically.

Run locally:   streamlit run app.py            # → http://localhost:8501
See:           notes/setup.local.md  /  notes/setup.prod.md
"""
from __future__ import annotations

import streamlit as st

from lib import bq, config, version

st.set_page_config(
    page_title="Olist · Team Deck",
    page_icon="📦",
    layout="wide",
    initial_sidebar_state="expanded",
)

# --- Version / build provenance in the sidebar (set at deploy by CI) ----------
with st.sidebar:
    st.caption(version.short())
    with st.expander("About this build"):
        st.markdown(version.full())

st.title("📦 Olist — One Elephant, Three Pain Points")
st.caption(f"Gold mart: `{config.GCP_PROJECT}.{config.GOLD_DATASET}` · live BigQuery")

st.markdown(
    """
> **The thesis (proven page by page):** the company is *buying* growth it should
> be *earning*. The binding constraint is the **repeat-purchase rate**, and the upstream
> cause is **delivery experience → review scores**. Three leaders each see one face of
> the same problem.
"""
)

# --- The three pain points, mapped to executive + owners + page ----------------
c1, c2, c3 = st.columns(3)
with c1:
    st.subheader("1 · Customer Retention")
    st.markdown(
        "**CEO** — GMV grows but marketing spend climbs to sustain it; margins feel soft. "
        "Gut feeling: *“we're working harder to grow.”* The unseen cause: **repeat rate** "
        "is the binding constraint.\n\n"
        "**Owners:** Jun · Jenn Fang"
    )
    st.page_link("pages/1_Retention_CEO.py", label="→ Open Pain Point 1", icon="📈")
with c2:
    st.subheader("2 · Operational Performance")
    st.markdown(
        "**COO** — re-engagement emails underperform, churn metrics are ugly, NPS is "
        "mediocre. Instinct: *“our brand isn't sticky.”* The misattributed cause: it's "
        "**delivery**, not marketing.\n\n"
        "**Owners:** John · Chun Wei · Charmaine"
    )
    st.page_link("pages/2_Delivery_COO_johnphs.py", label="→ Open Pain Point 2", icon="🚚")
with c3:
    st.subheader("3 · Reviews & Revenue Leak")
    st.markdown(
        "**CMO** — delivery complaints and low review scores roll in, treated as "
        "operational noise. The cause is sitting in front of them: low reviews are a "
        "**revenue leak**, not a logistics cost.\n\n"
        "**Owners:** Bryan · Soon Meng"
    )
    st.page_link("pages/3_Reviews_CMO.py", label="→ Open Pain Point 3", icon="⭐")

# --- Evidence + synthesis -------------------------------------------------------
c4, c5 = st.columns(2)
with c4:
    st.subheader("4 · Voice of the Customer")
    st.markdown(
        "What customers actually *say* — word clouds and n-grams over the review "
        "free text. The negative cloud is delivery language, verbatim."
    )
    st.page_link("pages/4_Voice_of_Customer.py", label="→ Open the text analysis", icon="💬")
with c5:
    st.subheader("5 · Summary — the diagnosis")
    st.markdown(
        "The three pain points are one causal chain: **late delivery → low review → "
        "no second purchase → growth must be bought**. Numbers, chain, recommendations."
    )
    st.page_link("pages/5_Summary.py", label="→ Open the summary", icon="🐘")

st.divider()

# --- Live connection check so the team knows BigQuery is wired before presenting -
st.subheader("BigQuery connection")
if st.button("Test gold-mart connection", type="primary"):
    ok, msg = bq.healthcheck()
    (st.success if ok else st.error)(msg)
else:
    st.caption("Click to verify credentials (keyfile → ADC → Cloud Run service account).")

st.divider()
st.caption("Source: BigQuery gold mart only (data contract). Marketing/CAC figures, where "
           "shown, are illustrative finance assumptions — not warehouse data.")
