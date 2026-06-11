"""Pain Point 2 — Operational Performance / Delivery (COO).

Owners: John · Chun Wei · Charmaine.

Question to answer: the churn / re-engagement / NPS symptoms the COO sees are not a
"sticky brand" problem to fix with loyalty spend — they trace to **delivery reliability**.

Migrated from ``../notebooks/team_eda_pp2_johnphs_csv.ipynb``. The notebook analysed
``fact_orders.csv`` exported from BigQuery; this page runs the identical analysis on the
same order-grain frame pulled **live** from the gold mart (lib/queries.ORDERS_SQL).
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from lib import bq, queries

st.set_page_config(page_title="PP2 · Delivery", page_icon="🚚", layout="wide")

st.title("🚚 Pain Point 2 — Operational Performance (Delivery)")
st.caption("COO · owners: John, Chun Wei, Charmaine")

st.info(
    "**Hypothesis:** the churn the COO feels is driven by an operational tail — a "
    "meaningful share of delivered orders arrive *late*, and those orders review and "
    "rebuy dramatically worse. Loyalty comms can't outrun a bad delivery.",
    icon="🎯",
)

try:
    df = bq.run_query(queries.ORDERS_SQL).copy()
except Exception as e:  # noqa: BLE001
    st.error(f"Query failed — check the BigQuery connection on the Home page.\n\n{e}")
    st.stop()

# --- Derived delivery and customer-experience fields (as in the notebook) ------
for c in ["purchase_ts", "delivered_ts", "estimated_ts"]:
    df[c] = pd.to_datetime(df[c], errors="coerce")

df["purchase_month"] = df["purchase_ts"].dt.to_period("M").astype(str)
df["delivery_days"] = (df["delivered_ts"] - df["purchase_ts"]).dt.total_seconds() / 86400
df["delay_days"] = (df["delivered_ts"] - df["estimated_ts"]).dt.total_seconds() / 86400

df["is_delivered"] = df["delivered_ts"].notna()
df["is_late"] = df["delay_days"] > 0

# Review score as NPS proxy: 5 = promoter, 4 = passive, <=3 = detractor.
df["is_promoter"] = df["review_score"].eq(5)
df["is_detractor"] = df["review_score"].le(3)
df["is_low_review"] = df["review_score"].le(2)

BUCKET_ORDER = ["On time / early", "1-3 days late", "4-7 days late", "8+ days late", "Not delivered"]


def delivery_bucket(row) -> str:
    if pd.isna(row["delivered_ts"]):
        return "Not delivered"
    if pd.isna(row["delay_days"]):
        return "Unknown"
    if row["delay_days"] <= 0:
        return "On time / early"
    if row["delay_days"] <= 3:
        return "1-3 days late"
    if row["delay_days"] <= 7:
        return "4-7 days late"
    return "8+ days late"


df["delivery_bucket"] = df.apply(delivery_bucket, axis=1)

# --- Headline KPIs --------------------------------------------------------------
delivered = df[df["is_delivered"]]
late = int(delivered["is_late"].sum())
k = st.columns(4)
k[0].metric("Delivered orders", f"{len(delivered):,}")
k[1].metric("Late deliveries", f"{late:,}")
k[2].metric("Late rate", f"{late / max(len(delivered), 1) * 100:.1f}%")
k[3].metric("Not delivered", f"{int((~df['is_delivered']).sum()):,}")

st.divider()

# --- 1 · Delivery performance summary -------------------------------------------
st.subheader("1 · Delivery performance summary")
st.markdown(
    "Does delivery failure track lower review scores and a worse NPS proxy? "
    "`nps_proxy = promoter_rate − detractor_rate` (promoter = 5★, detractor = 1–3★)."
)

delivery_summary = (
    df.groupby("delivery_bucket")
      .agg(
          orders=("order_id", "nunique"),
          avg_review=("review_score", "mean"),
          low_review_rate=("is_low_review", "mean"),
          detractor_rate=("is_detractor", "mean"),
          promoter_rate=("is_promoter", "mean"),
          avg_delivery_days=("delivery_days", "mean"),
          avg_delay_days=("delay_days", "mean"),
          total_gmv=("order_gmv", "sum"),
      )
      .reindex(BUCKET_ORDER)
)
delivery_summary["order_share"] = delivery_summary["orders"] / df["order_id"].nunique()
delivery_summary["nps_proxy"] = delivery_summary["promoter_rate"] - delivery_summary["detractor_rate"]

st.dataframe(
    delivery_summary.style.format({
        "avg_review": "{:.2f}",
        "low_review_rate": "{:.1%}",
        "detractor_rate": "{:.1%}",
        "promoter_rate": "{:.1%}",
        "order_share": "{:.1%}",
        "nps_proxy": "{:.1%}",
        "avg_delivery_days": "{:.1f}",
        "avg_delay_days": "{:.1f}",
        "total_gmv": "{:,.0f}",
    }),
    use_container_width=True,
)

col_rev, col_nps = st.columns(2)
with col_rev:
    fig = go.Figure(go.Bar(
        x=delivery_summary.index, y=delivery_summary["avg_review"],
        marker_color="#4f81bd",
        text=delivery_summary["avg_review"].round(2), textposition="outside",
    ))
    fig.update_layout(
        title="Average review score falls as delivery failure worsens",
        yaxis=dict(title="Average review score (1–5)", range=[0, 5.4]),
        height=420, margin=dict(t=50, b=10),
    )
    st.plotly_chart(fig, use_container_width=True)

with col_nps:
    fig = go.Figure(go.Bar(
        x=delivery_summary.index, y=delivery_summary["nps_proxy"] * 100,
        marker_color=np.where(delivery_summary["nps_proxy"] >= 0, "#2ecc71", "#e74c3c"),
        text=(delivery_summary["nps_proxy"] * 100).round(1), textposition="outside",
    ))
    fig.add_hline(y=0, line_width=1, line_color="grey")
    fig.update_layout(
        title="NPS proxy by delivery performance",
        yaxis_title="Promoter % − Detractor % (pp)",
        height=420, margin=dict(t=50, b=10),
    )
    st.plotly_chart(fig, use_container_width=True)

fig = go.Figure()
fig.add_bar(x=delivery_summary.index, y=delivery_summary["order_share"] * 100,
            name="Order share", marker_color="#1f4e79")
fig.add_bar(x=delivery_summary.index, y=delivery_summary["low_review_rate"] * 100,
            name="Low review rate (≤2★)", marker_color="#e74c3c")
fig.update_layout(
    barmode="group", height=420, margin=dict(t=50, b=10),
    title="Delivery issues are smaller in volume but much higher in complaints",
    yaxis_title="%", legend=dict(orientation="h", yanchor="bottom", y=1.02),
)
st.plotly_chart(fig, use_container_width=True)
st.caption(
    "🔍 **Reading it:** the late tail is a minority of orders but a majority-grade "
    "complaint machine — low-review rates several times the on-time baseline."
)

st.divider()

# --- 2 · Monthly pattern ---------------------------------------------------------
st.subheader("2 · Monthly pattern — failures and complaints move together")

monthly = (
    df.groupby("purchase_month")
      .agg(
          orders=("order_id", "nunique"),
          late_rate=("is_late", "mean"),
          not_delivered_rate=("is_delivered", lambda s: 1 - s.mean()),
          avg_review=("review_score", "mean"),
          low_review_rate=("is_low_review", "mean"),
      )
      .reset_index()
)
# Keep only months with enough order volume to avoid partial-month noise.
monthly = monthly[monthly["orders"] >= 100]

fig = go.Figure()
for col, label, color in [
    ("late_rate", "Late rate", "#e67e22"),
    ("not_delivered_rate", "Not delivered rate", "#7f8c8d"),
    ("low_review_rate", "Low review rate (≤2★)", "#e74c3c"),
]:
    fig.add_scatter(x=monthly["purchase_month"], y=monthly[col] * 100,
                    name=label, mode="lines+markers", line=dict(color=color))
fig.update_layout(
    height=450, hovermode="x unified", margin=dict(t=30, b=10),
    xaxis_title="Purchase month", yaxis_title="% of orders",
    legend=dict(orientation="h", yanchor="bottom", y=1.02),
)
st.plotly_chart(fig, use_container_width=True)
st.caption(
    "🔍 When the late-rate line spikes (e.g. the 2017-Q4 / 2018-Q1 logistics crunch), "
    "the low-review line spikes *with* it — operational failure and 'brand' complaints "
    "are the same curve."
)

st.divider()

# --- 3 · Repeat-purchase / churn proxy --------------------------------------------
st.subheader("3 · Repeat-purchase proxy — first delivery experience vs coming back")
st.markdown(
    "No campaign-exposure or churn labels exist in the mart, so the proxy is: did the "
    "customer ever place a second order, split by *how their first delivery went*? "
    "Repeat rates are low across the board (the PP1 story) — treat as directional."
)

customer_first = (
    df.sort_values(["customer_unique_id", "purchase_ts"])
      .groupby("customer_unique_id")
      .agg(
          order_count=("order_id", "nunique"),
          first_delivery_bucket=("delivery_bucket", "first"),
          first_review_score=("review_score", "first"),
      )
      .reset_index()
)
customer_first["has_repeat"] = customer_first["order_count"] > 1

repeat_summary = (
    customer_first.groupby("first_delivery_bucket")
      .agg(
          customers=("customer_unique_id", "nunique"),
          repeat_customers=("has_repeat", "sum"),
          repeat_rate=("has_repeat", "mean"),
          avg_first_review=("first_review_score", "mean"),
      )
      .reindex(BUCKET_ORDER)
)
st.dataframe(
    repeat_summary.style.format({"repeat_rate": "{:.2%}", "avg_first_review": "{:.2f}"}),
    use_container_width=True,
)

st.divider()

# --- 4 · State-level operational priority ------------------------------------------
st.subheader("4 · Where to act first — state-level operational priority")
st.markdown("Priority score = `orders × (late_rate + not_delivered_rate) × (5 − avg_review)`.")

state_summary = (
    df.groupby("customer_state")
      .agg(
          orders=("order_id", "nunique"),
          late_rate=("is_late", "mean"),
          not_delivered_rate=("is_delivered", lambda s: 1 - s.mean()),
          avg_review=("review_score", "mean"),
          low_review_rate=("is_low_review", "mean"),
          promoter_rate=("is_promoter", "mean"),
          detractor_rate=("is_detractor", "mean"),
          total_gmv=("order_gmv", "sum"),
      )
      .reset_index()
)
state_summary["bad_delivery_rate"] = state_summary["late_rate"] + state_summary["not_delivered_rate"]
state_summary["nps_proxy"] = state_summary["promoter_rate"] - state_summary["detractor_rate"]
state_summary["priority_score"] = (
    state_summary["orders"]
    * state_summary["bad_delivery_rate"]
    * (5 - state_summary["avg_review"])
)
top_states = state_summary.sort_values("priority_score", ascending=False).head(10)

col_tbl, col_bar = st.columns([3, 2])
with col_tbl:
    st.dataframe(
        top_states[["customer_state", "orders", "late_rate", "not_delivered_rate",
                    "bad_delivery_rate", "avg_review", "low_review_rate", "nps_proxy",
                    "total_gmv", "priority_score"]]
        .style.format({
            "late_rate": "{:.1%}",
            "not_delivered_rate": "{:.1%}",
            "bad_delivery_rate": "{:.1%}",
            "avg_review": "{:.2f}",
            "low_review_rate": "{:.1%}",
            "nps_proxy": "{:.1%}",
            "total_gmv": "{:,.0f}",
            "priority_score": "{:,.0f}",
        }),
        use_container_width=True, hide_index=True,
    )
with col_bar:
    plot_df = top_states.sort_values("priority_score")
    fig = go.Figure(go.Bar(
        x=plot_df["priority_score"], y=plot_df["customer_state"],
        orientation="h", marker_color="#1f4e79",
    ))
    fig.update_layout(
        height=420, margin=dict(t=30, b=10),
        title="Top state-level operational priorities",
        xaxis_title="volume × bad delivery rate × review gap",
        yaxis_title="Customer state",
    )
    st.plotly_chart(fig, use_container_width=True)

st.divider()

st.subheader("Executive interpretation")
st.markdown(
    """
Late and undelivered orders carry materially lower reviews, higher detractor rates and a
collapsed NPS proxy — the problem should be framed as **operational delivery reliability
first**, not marketing or brand stickiness.

**Recommended next steps**
1. Prioritise the states with the highest operational priority scores.
2. Investigate the carriers / sellers / routes behind late and undelivered orders.
3. Measure whether fixing delivery reliability improves review score, complaint rate and
   repeat behaviour **before** increasing loyalty-programme spend.
"""
)
st.caption("Migrated from `../notebooks/team_eda_pp2_johnphs_csv.ipynb` · gold mart, live BigQuery")
