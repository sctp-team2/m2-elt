"""Pain Point 2 — Operational Performance / Delivery (COO).

Owners: John · Chun Wei · Charmaine.

Question to answer: the churn / re-engagement / NPS symptoms the COO sees are not a
"sticky brand" problem to fix with loyalty spend — they trace to **delivery reliability**.
Show how big the late-delivery tail is.

SKELETON: one working KPI query + a placeholder chart + TODOs.
"""
from __future__ import annotations

import streamlit as st

from lib import bq, config

st.set_page_config(page_title="PP2 · Delivery", page_icon="🚚", layout="wide")

st.title("🚚 Pain Point 2 — Operational Performance (Delivery)")
st.caption("COO · owners: John, Chun Wei, Charmaine")

st.info(
    "**Hypothesis:** the churn the COO feels is driven by an operational tail — a "
    "meaningful share of delivered orders arrive *late*. Loyalty comms can't outrun a "
    "bad delivery.",
    icon="🎯",
)

# --- Headline KPI: on-time vs late delivery, from the gold mart ----------------
DELIVERY_SQL = f"""
WITH orders AS (
  SELECT
    id AS order_id,
    ANY_VALUE(order_delivered_customer_date)  AS delivered_ts,
    ANY_VALUE(order_estimated_delivery_date)  AS estimated_ts
  FROM {config.table("fact_orders")}
  GROUP BY id
)
SELECT
  CASE
    WHEN delivered_ts IS NULL THEN 'not delivered'
    WHEN delivered_ts <= estimated_ts THEN 'on time'
    ELSE 'late'
  END AS delivery_outcome,
  COUNT(*) AS orders
FROM orders
GROUP BY delivery_outcome
ORDER BY orders DESC
"""

try:
    df = bq.run_query(DELIVERY_SQL)
    delivered = df[df["delivery_outcome"].isin(["on time", "late"])]
    total = int(delivered["orders"].sum()) or 1
    late = int(delivered.loc[delivered["delivery_outcome"] == "late", "orders"].sum())

    k = st.columns(3)
    k[0].metric("Delivered orders", f"{total:,}")
    k[1].metric("Late deliveries", f"{late:,}")
    k[2].metric("Late rate", f"{late / total * 100:.1f}%")

    st.bar_chart(df.set_index("delivery_outcome")["orders"])
except Exception as e:  # noqa: BLE001
    st.error(f"Query failed — check the BigQuery connection on the Home page.\n\n{e}")

st.divider()

st.subheader("To build out")
st.markdown(
    """
- [ ] **Late rate by customer state / lane** — where is the operational tail worst?
- [ ] **Delivery lead-time distribution** — actual vs estimated days
- [ ] **Late rate trend by month** — is it getting better or worse?
- [ ] **Link to churn** — reorder rate of on-time vs late customers (hands off to PP1 / PP3)
"""
)
st.caption("Reference analysis: `../notebooks/team_eda_pp2.ipynb`")
