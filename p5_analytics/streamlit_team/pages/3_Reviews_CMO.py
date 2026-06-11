"""Pain Point 3 — Reviews & the Revenue Leak (CMO).  Owners: Bryan · Soon Meng.

Question to answer: low review scores are not "operational noise / a logistics cost" —
they are a **revenue leak**. The smoking gun: review scores collapse the moment delivery
slips late, and a low review predicts the customer never returns.

SKELETON: working review-distribution KPI + a starter chart linking delivery to reviews.
"""
from __future__ import annotations

import streamlit as st

from lib import bq, config

st.set_page_config(page_title="PP3 · Reviews", page_icon="⭐", layout="wide")

st.title("⭐ Pain Point 3 — Reviews & the Revenue Leak")
st.caption("CMO · owners: Bryan, Soon Meng")

st.info(
    "**Hypothesis:** on-time orders score ~4.3★ while late orders score ~2.6★. The CMO's "
    "low review scores are the CTO/COO's late deliveries surfacing as the CEO's churn.",
    icon="🎯",
)

# --- Headline KPI: average review + score distribution from the gold mart -----
REVIEW_DIST_SQL = f"""
SELECT review_score, COUNT(*) AS reviews
FROM {config.table("dim_reviews")}
WHERE review_score IS NOT NULL AND is_current   -- dim_reviews is an SCD table; current rows only
GROUP BY review_score
ORDER BY review_score
"""

try:
    df = bq.run_query(REVIEW_DIST_SQL)
    total = int(df["reviews"].sum()) or 1
    avg = (df["review_score"] * df["reviews"]).sum() / total
    low = int(df.loc[df["review_score"] <= 2, "reviews"].sum())

    k = st.columns(3)
    k[0].metric("Reviews", f"{total:,}")
    k[1].metric("Average score", f"{avg:.2f} ★")
    k[2].metric("1–2★ share", f"{low / total * 100:.1f}%")

    st.bar_chart(df.set_index("review_score")["reviews"])
except Exception as e:  # noqa: BLE001
    st.error(f"Query failed — check the BigQuery connection on the Home page.\n\n{e}")

st.divider()

st.subheader("To build out")
st.markdown(
    """
- [ ] **Avg review by delivery bucket** — on-time vs 1–3 / 4–7 / 8+ days late (the smoking gun)
- [ ] **Reorder rate by review score** — quantify the revenue leak per lost star
- [ ] **Revenue at risk** — GMV tied to 1–2★ customers who don't return
- [ ] **Join reviews → orders → customers** to close the loop with PP1 and PP2
"""
)
st.caption("Reference analysis: `../notebooks/team_eda_pp3.ipynb`")
