"""Pain Point 1 — Customer Retention (CEO).  Owners: Jun · Jenn Fang.

Question to answer: is GMV growth being *bought* (new-customer acquisition) rather than
*earned* (repeat purchases)? Show that the repeat-purchase rate is the binding constraint.

Migrated from ``../notebooks/team_eda_pp1.ipynb`` — same queries and charts, rebuilt on
live BigQuery (the notebook's pre-exported revenue_vs_product_category.csv is replaced
by a gold-mart query).
"""
from __future__ import annotations

import plotly.graph_objects as go
import streamlit as st

from lib import bq, queries

st.set_page_config(page_title="PP1 · Retention", page_icon="📈", layout="wide")

st.title("📈 Pain Point 1 — Customer Retention")
st.caption("CEO · owners: Jun, Jenn Fang")

st.info(
    "**Hypothesis:** only ~3% of customers ever buy again, so growth ≈ pure "
    "new-customer acquisition. Retention — not pricing or competition — is the leak.",
    icon="🎯",
)

try:
    orders = bq.run_query(queries.ORDERS_SQL)
    trend = bq.run_query(queries.REVENUE_TREND_SQL)
    payment = bq.run_query(queries.PAYMENT_MIX_SQL)
    category = bq.run_query(queries.CATEGORY_REVENUE_SQL)
except Exception as e:  # noqa: BLE001  show the error in-app instead of a stack trace
    st.error(f"Query failed — check the BigQuery connection on the Home page.\n\n{e}")
    st.stop()

# --- Headline KPIs: the retention constraint, straight from the gold mart ------
per_customer = orders.groupby("customer_unique_id")["order_id"].nunique()
customers = len(per_customer)
repeat_customers = int((per_customer > 1).sum())
repeat_rate = repeat_customers / customers

k = st.columns(4)
k[0].metric("Orders", f"{orders['order_id'].nunique():,}")
k[1].metric("Unique customers", f"{customers:,}")
k[2].metric("Repeat customers", f"{repeat_customers:,}")
k[3].metric("Repeat-customer rate", f"{repeat_rate * 100:.1f}%")
st.caption(
    f"{customers:,} customers placed {orders['order_id'].nunique():,} orders — almost "
    "1:1. Nearly every order requires *acquiring a new customer*."
)

st.divider()

# --- 1 · Monthly GMV & revenue trend, split by first vs repeat purchase --------
st.subheader("Monthly GMV & revenue — growth is almost entirely first purchases")

fig = go.Figure()
fig.add_scatter(x=trend["order_month"], y=trend["total_gmv"], name="Total GMV",
                mode="lines+markers", line=dict(color="#2ca02c", width=3))
fig.add_scatter(x=trend["order_month"], y=trend["total_revenue"], name="Total revenue (payments)",
                mode="lines+markers", line=dict(color="#1f77b4", width=3))
fig.add_scatter(x=trend["order_month"], y=trend["gmv_first_purchase"],
                name="First-purchase GMV (acquisition)", mode="lines+markers",
                line=dict(color="#9467bd", width=2, dash="dash"), marker_symbol="x")
fig.add_scatter(x=trend["order_month"], y=trend["gmv_repeat_purchase"],
                name="Repeat-purchase GMV (retention)", mode="lines+markers",
                line=dict(color="#e377c2", width=2, dash="dot"), marker_symbol="square")
fig.update_layout(
    height=450, hovermode="x unified",
    xaxis_title="Purchase month", yaxis_title="Value (R$)",
    legend=dict(orientation="h", yanchor="bottom", y=1.02),
    margin=dict(t=30, b=10),
)
st.plotly_chart(fig, use_container_width=True)
st.caption(
    "🔍 **Reading it:** the acquisition (dashed) line sits almost on top of total GMV, "
    "while the retention (dotted) line hugs zero — the growth curve is *bought*, month "
    "after month, not compounded from returning customers."
)

st.divider()

# --- 2 · Customer mix: new acquisition vs retention -----------------------------
col_mix, col_pay = st.columns(2)

with col_mix:
    st.subheader("Customer mix")
    # Same per_customer series as the header KPIs, so the two bars sum exactly to
    # the "Unique customers" metric above.
    mix = (per_customer == 1).map({True: "First-Time Customer", False: "Repeat Customer"}) \
        .value_counts().rename_axis("customer_type").reset_index(name="total_customers")
    mix["pct"] = mix["total_customers"] / mix["total_customers"].sum() * 100

    fig = go.Figure(go.Bar(
        x=mix["customer_type"], y=mix["total_customers"],
        marker_color=["#1f4e79", "#ffc000"],
        text=[f"{n:,}<br>({p:.1f}%)" for n, p in zip(mix["total_customers"], mix["pct"])],
        textposition="outside",
    ))
    fig.update_layout(height=420, yaxis_title="Unique customers",
                      margin=dict(t=30, b=10), yaxis_range=[0, mix["total_customers"].max() * 1.15])
    st.plotly_chart(fig, use_container_width=True)
    st.caption("🔍 All orders — bars sum to the unique-customer KPI above. The repeat "
               "segment is a rounding error of the base.")

with col_pay:
    st.subheader("GMV share by payment type")
    fig = go.Figure(go.Pie(
        labels=payment["payment_type"], values=payment["total_gmv"],
        hole=0.55, marker=dict(line=dict(color="white", width=2)),
        textinfo="label+percent",
    ))
    fig.update_layout(height=420, showlegend=False, margin=dict(t=30, b=10))
    st.plotly_chart(fig, use_container_width=True)
    st.caption("🔍 Credit card dominates checkout — payment friction is *not* the retention blocker.")

st.divider()

# --- 3 · Revenue share by product category (top 10 + consolidated long tail) ----
st.subheader("Revenue share by product category — top 10 vs the long tail")

top_n = 10
cat = category.copy()
top = cat.head(top_n)
others = cat.iloc[top_n:]["total_revenue"].sum()
labels = [str(c).replace("_", " ").title() for c in top["product_category"]] + ["Others"]
values = list(top["total_revenue"]) + [others]
colors = ["#1f4e79", "#2e75b6", "#4f81bd", "#bdd7ee", "#ffc000",
          "#ed7d31", "#70ad47", "#305496", "#7030a0", "#a5a5a5", "#d9d9d9"]

fig = go.Figure(go.Pie(
    labels=labels, values=values, sort=False,
    marker=dict(colors=colors, line=dict(color="white", width=1.2)),
    textinfo="label+percent", textfont_size=11,
))
fig.update_layout(height=520, showlegend=False, margin=dict(t=30, b=10))
st.plotly_chart(fig, use_container_width=True)
st.caption(
    "🔍 Revenue is broad-based across categories — no single-category dependency. The "
    "retention problem is *structural*, not a category-mix artefact."
)

st.divider()

st.subheader("So what? (hand-off to PP2)")
st.markdown(
    """
**The CEO sees:** GMV grows, but marketing spend climbs to sustain it and margins feel
soft — *"we're working harder to grow."*

**What the data says:** with a **~3% repeat rate**, every month's growth must be re-bought
through new-customer acquisition. The leak is **retention**, not pricing or competition.
**Why customers don't return** is the next page → *Pain Point 2: Delivery*.
"""
)
st.caption("Migrated from `../notebooks/team_eda_pp1.ipynb` · gold mart, live BigQuery")
