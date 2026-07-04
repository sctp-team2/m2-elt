"""Summary — the three pain points are one problem.

Synthesis page: pulls the headline numbers behind PP1–PP3 from the gold mart and lays
out the causal chain — late delivery → low review → no second purchase → growth must be
bought — plus the underlying problem statement and per-exec recommendations.
"""
from __future__ import annotations

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from lib import bq, queries

st.set_page_config(page_title="Summary · Diagnosis", page_icon="🐘", layout="wide")

st.title("🐘 Summary — One Elephant, Not Three Problems")
st.caption("The synthesis: every page so far is a different face of the same causal chain.")

try:
    raw = bq.run_query(queries.ORDERS_SQL)
except Exception as e:  # noqa: BLE001
    st.error(f"Query failed — check the BigQuery connection on the Home page.\n\n{e}")
    st.stop()

df = raw.copy()
for c in ["delivered_ts", "estimated_ts"]:
    df[c] = pd.to_datetime(df[c], errors="coerce")

# --- The chain, computed live ---------------------------------------------------
delivered = df[df["delivered_ts"].notna() & df["estimated_ts"].notna()]
late_mask = delivered["delivered_ts"] > delivered["estimated_ts"]
late_rate = late_mask.mean()

review_on_time = delivered.loc[~late_mask, "review_score"].mean()
review_late = delivered.loc[late_mask, "review_score"].mean()
low_share_late = (delivered.loc[late_mask, "review_score"] <= 2).mean()

per_customer = df.groupby("customer_unique_id").agg(
    n_orders=("order_id", "nunique"), avg_review=("review_score", "mean")
)
repeat_rate = (per_customer["n_orders"] > 1).mean()
score_band = per_customer["avg_review"].round()
# Cleanest churn signal: customers whose (avg) review is 1★ vs the overall base.
# Mid bands are noisy — repeat customers average their scores across orders.
repeat_by_score = per_customer.groupby(score_band)["n_orders"].agg(lambda s: (s > 1).mean())
repeat_one_star = repeat_by_score.get(1.0, float("nan"))

gmv_total = df["order_gmv"].sum()
gmv_late = delivered.loc[late_mask, "order_gmv"].sum()

# --- Pain points at a glance ------------------------------------------------------
st.subheader("The three pain points — and the one number behind each")
c1, c2, c3 = st.columns(3)
with c1:
    st.metric("PP1 · Repeat-customer rate", f"{repeat_rate * 100:.1f}%",
              help="Customers who ever placed a second order. Growth is being re-bought "
                   "every month through new acquisition.")
    st.markdown("**CEO** — GMV grows but margins feel soft. *Growth is bought, not earned.*")
    st.page_link("pages/1_Retention_CEO.py", label="→ Pain Point 1", icon="📈")
with c2:
    st.metric("PP2 · Late-delivery rate", f"{late_rate * 100:.1f}%",
              help="Delivered orders arriving after the estimated delivery date.")
    st.markdown("**COO** — churn and NPS look like a brand problem. *It's the delivery tail.*")
    st.page_link("pages/2_Delivery_COO.py", label="→ Pain Point 2", icon="🚚")
with c3:
    st.metric("PP3 · Review score when late", f"{review_late:.2f} ★",
              f"{review_late - review_on_time:.2f} vs on-time", delta_color="inverse")
    st.markdown("**CMO** — low reviews treated as noise. *They are a revenue leak.*")
    st.page_link("pages/3_Reviews_CMO.py", label="→ Pain Point 3", icon="⭐")

st.divider()

# --- The causal chain ----------------------------------------------------------------
st.subheader("The underlying problem — one causal chain")

k = st.columns(4)
k[0].metric("1 · Delivery slips", f"{late_rate * 100:.1f}%", "of delivered orders are late",
            delta_color="off")
k[1].metric("2 · Reviews collapse", f"{review_on_time:.1f}★ → {review_late:.1f}★",
            f"{low_share_late * 100:.0f}% of late orders leave ≤2★", delta_color="off")
k[2].metric("3 · Customers don't return", f"{repeat_one_star * 100:.1f}%",
            f"repeat rate of 1★ customers (vs {repeat_rate * 100:.1f}% overall)",
            delta_color="off")
k[3].metric("4 · Growth must be bought", f"{repeat_rate * 100:.1f}%",
            "repeat rate caps earned growth", delta_color="off")

st.markdown(
    f"""
> **Late delivery → low review → customer never returns → repeat rate stays ~{repeat_rate * 100:.0f}% →
> every month's GMV must be re-purchased with acquisition spend.**
>
> The cause lives in the **COO's** domain, surfaces as the **CMO's** review problem, and
> lands in the **CEO's** P&L. R$ {gmv_late / 1e6:.1f}M of GMV (of R$ {gmv_total / 1e6:.1f}M total)
> already sits on late orders — and the Voice-of-Customer page shows customers naming the
> cause verbatim: *"não recebi", "atraso"* — it's the delivery, not the product.
"""
)

col_a, col_b = st.columns(2)
with col_a:
    fig = go.Figure(go.Bar(
        x=["On time / early", "Late"], y=[review_on_time, review_late],
        marker_color=["#2ecc71", "#e74c3c"],
        text=[f"{review_on_time:.2f}", f"{review_late:.2f}"], textposition="outside",
    ))
    fig.update_layout(height=380, margin=dict(t=50, b=10),
                      title="Avg review score by delivery outcome",
                      yaxis=dict(range=[0, 5.2], title="★"))
    st.plotly_chart(fig, use_container_width=True)
with col_b:
    fig = go.Figure(go.Bar(
        x=["1★ customers", "All customers"],
        y=[repeat_one_star * 100, repeat_rate * 100],
        marker_color=["#922b21", "#1f4e79"],
        text=[f"{repeat_one_star * 100:.1f}%", f"{repeat_rate * 100:.1f}%"],
        textposition="outside",
    ))
    fig.update_layout(height=380, margin=dict(t=50, b=10),
                      title="Repeat-purchase rate: 1★ customers vs the base",
                      yaxis_title="% who bought again")
    st.plotly_chart(fig, use_container_width=True)
    st.caption("Full per-score breakdown (and its caveats) on the PP3 page.")

st.divider()

# --- Each exec sees one face ------------------------------------------------------------
st.subheader("Why nobody saw it — each executive holds one piece")
st.markdown(
    """
| Who | What they see | What they conclude | Why that's the wrong fix |
| --- | --- | --- | --- |
| **CEO** | GMV grows, but marketing spend climbs to sustain it; margins soft | "We're working harder to grow" | The leak is *retention*, not pricing or competition |
| **COO** | Re-engagement underperforms, churn ugly, NPS mediocre | "Our brand isn't sticky → spend more on loyalty" | The churn cause is operational, not a comms problem |
| **CMO** | Delivery complaints, low review scores | "Logistics cost to optimise" (noise) | Those late deliveries *are* the revenue leak |
"""
)

st.divider()

# --- Recommendations ----------------------------------------------------------------------
st.subheader("Recommendation: fix delivery reliability before buying more growth")
st.markdown(
    """
1. **Treat the late tail as a P&L line, not a logistics metric.** Report late-delivery
   rate alongside CAC in the monthly exec pack — they are two ends of one chain.
2. **Target the worst lanes first.** PP2's state-level priority score (volume × bad-delivery
   rate × review gap) gives the ranked worklist; start with the top states and the
   carriers/sellers behind them.
3. **Re-baseline the delivery promise.** Most orders arrive *early* — the estimate is
   padded — yet 8% still miss it. Tighten estimates where reliable, fix operations where not:
   the review cliff sits exactly at "promise broken".
4. **Close the loop on reviews.** Intercept 1–2★ reviews on late orders with service
   recovery (refund freight / voucher) — these customers are identifiable the day the
   order slips, *before* they churn.
5. **Measure retention, not sentiment.** Success metric = repeat-purchase rate moving off
   ~3%, not NPS or campaign engagement. Hold loyalty-programme spend flat until the
   delivery fix shows up in reorder behaviour.
"""
)

st.caption(
    "All figures computed live from the gold mart on page load · synthesis of "
    "PP1 (`team_eda_pp1.ipynb`), PP2 (`team_eda_pp2_johnphs_csv.ipynb`), "
    "PP3 (`team_eda_pp3.ipynb`) and the Voice-of-Customer text analysis."
)
