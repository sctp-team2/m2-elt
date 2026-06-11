"""Pain Point 1 — Customer Retention (CEO).  Owners: Jun · Jenn Fang.

Question to answer: is GMV growth being *bought* (new-customer acquisition) rather than
*earned* (repeat purchases)? Show that the repeat-purchase rate is the binding constraint.

This is a SKELETON: one working KPI query against the gold mart + placeholders marked
TODO for the team to flesh out. Charts use Streamlit natives so there are no extra deps.
"""
from __future__ import annotations

import streamlit as st

from lib import bq, config

st.set_page_config(page_title="PP1 · Retention", page_icon="📈", layout="wide")

st.title("📈 Pain Point 1 — Customer Retention")
st.caption("CEO · owners: Jun, Jenn Fang")

st.info(
    "**Hypothesis:** only ~3% of orders are repeat purchases, so growth ≈ pure "
    "new-customer acquisition. Retention — not pricing or competition — is the leak.",
    icon="🎯",
)

# --- Headline KPI: repeat-customer rate, straight from the gold mart -----------
# fact_orders is at order-item grain; collapse to orders, then to customers.
REPEAT_RATE_SQL = f"""
WITH orders AS (
  SELECT id AS order_id, ANY_VALUE(customer_id) AS customer_id
  FROM {config.table("fact_orders")}
  GROUP BY id
),
per_customer AS (
  SELECT c.customer_unique_id, COUNT(DISTINCT o.order_id) AS n_orders
  FROM orders o
  JOIN {config.table("dim_customers")} c ON o.customer_id = c.id
  GROUP BY c.customer_unique_id
)
SELECT
  COUNT(*)                                              AS customers,
  COUNTIF(n_orders > 1)                                 AS repeat_customers,
  SAFE_DIVIDE(COUNTIF(n_orders > 1), COUNT(*))          AS repeat_rate
FROM per_customer
"""

try:
    df = bq.run_query(REPEAT_RATE_SQL)
    row = df.iloc[0]
    k = st.columns(3)
    k[0].metric("Unique customers", f"{int(row['customers']):,}")
    k[1].metric("Repeat customers", f"{int(row['repeat_customers']):,}")
    k[2].metric("Repeat-customer rate", f"{row['repeat_rate'] * 100:.1f}%")
except Exception as e:  # noqa: BLE001  show the error in-app instead of a stack trace
    st.error(f"Query failed — check the BigQuery connection on the Home page.\n\n{e}")

st.divider()

# --- TODO placeholders for the team -------------------------------------------
st.subheader("To build out")
st.markdown(
    """
- [ ] **Repeat-rate trend by month** — is it improving or flat? (`fact_orders` + `dim_customers`)
- [ ] **Orders-per-customer distribution** — how many customers order exactly once?
- [ ] **Cohort retention heatmap** — % of each acquisition cohort still active by month N
- [ ] **CAC / margin scenario** — illustrative: GMV upside of a +Xpp repeat-rate lift vs paid acquisition
"""
)
st.caption("Reference analysis: `../notebooks/team_eda_pp1.ipynb`")
