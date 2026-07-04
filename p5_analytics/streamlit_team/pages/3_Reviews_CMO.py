"""Pain Point 3 — Reviews & the Revenue Leak (CMO).  Owners: Bryan · Soon Meng.

Question to answer: low review scores are not "operational noise / a logistics cost" —
they are a **revenue leak**. The smoking gun: review scores collapse the moment delivery
slips late, and a low review predicts the customer never returns.

Migrated from ``../notebooks/team_eda_pp3.ipynb``. The notebook joined bronze tables;
this page keeps the data contract (gold mart only — ``dim_reviews`` current versions via
lib/queries.ORDERS_SQL, which also dedups to one review per order, highest score). The
geopandas state maps are rebuilt as Plotly choropleths on assets/brazil_states.geojson.
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from lib import bq, queries

st.set_page_config(page_title="PP3 · Reviews", page_icon="⭐", layout="wide")

st.title("⭐ Pain Point 3 — Reviews & the Revenue Leak")
st.caption("CMO · owners: Bryan, Soon Meng")

st.info(
    "**Hypothesis:** on-time orders score ~4.3★ while late orders score ~2.6★. The CMO's "
    "low review scores are the COO's late deliveries surfacing as the CEO's churn.",
    icon="🎯",
)

try:
    raw = bq.run_query(queries.ORDERS_SQL)
except Exception as e:  # noqa: BLE001
    st.error(f"Query failed — check the BigQuery connection on the Home page.\n\n{e}")
    st.stop()

# Same filters as the notebook: delivered orders with both dates, clean DQ flags.
df = raw[
    (raw["order_status"] == "delivered")
    & raw["delivered_ts"].notna()
    & raw["estimated_ts"].notna()
    & ~raw["has_invalid_delivery_date"]
    & ~raw["has_missing_delivery_date"]
].copy()
for c in ["delivered_ts", "estimated_ts"]:
    df[c] = pd.to_datetime(df[c], errors="coerce")
# Whole days, matching the notebook's DATE_DIFF(DATE(delivered), DATE(estimated), DAY).
df["delivery_delay_days"] = (
    df["delivered_ts"].dt.normalize() - df["estimated_ts"].dt.normalize()
).dt.days

k = st.columns(4)
k[0].metric("Delivered orders analysed", f"{len(df):,}")
k[1].metric("Avg review score", f"{df['review_score'].mean():.2f} ★")
k[2].metric("On-time avg", f"{df.loc[df['delivery_delay_days'] <= 0, 'review_score'].mean():.2f} ★")
k[3].metric("Late avg", f"{df.loc[df['delivery_delay_days'] > 0, 'review_score'].mean():.2f} ★")

st.divider()

# --- 1 · Delivery delay distribution ---------------------------------------------
st.subheader("1 · Delivery delay distribution")

fig = px.histogram(
    df.assign(delay=df["delivery_delay_days"].clip(-30, 60)),
    x="delay", nbins=60, color_discrete_sequence=["steelblue"],
)
fig.add_vline(x=0, line_dash="dash", line_color="red",
              annotation_text="On-time threshold", annotation_position="top right")
fig.update_layout(
    height=420, margin=dict(t=30, b=10), bargap=0.05,
    xaxis_title="Days late (negative = early, positive = late)",
    yaxis_title="Number of orders",
)
st.plotly_chart(fig, use_container_width=True)
st.caption(
    "🔍 Most orders land *early* — the estimate is padded. The damage lives in the "
    "right-hand tail past 0."
)

st.divider()

# --- 2 · Average review score by delay bucket --------------------------------------
st.subheader("2 · Review score by delivery delay — the cliff")

DELAY_BUCKETS = [
    "1. Very Early (>7d)", "2. Early (1-7d)", "3. On Time",
    "4. Slightly Late (1-3d)", "5. Late (4-7d)", "6. Very Late (7d+)",
]


def delay_bucket(days: float) -> str:
    if days < -7:
        return DELAY_BUCKETS[0]
    if days < 0:
        return DELAY_BUCKETS[1]
    if days == 0:
        return DELAY_BUCKETS[2]
    if days <= 3:
        return DELAY_BUCKETS[3]
    if days <= 7:
        return DELAY_BUCKETS[4]
    return DELAY_BUCKETS[5]


df["delay_bucket"] = df["delivery_delay_days"].apply(delay_bucket)
bucket_scores = (
    df.groupby("delay_bucket")["review_score"].mean().reindex(DELAY_BUCKETS).reset_index()
)

fig = go.Figure(go.Bar(
    x=bucket_scores["delay_bucket"], y=bucket_scores["review_score"],
    marker_color=["#2ecc71", "#82e0aa", "#f4d03f", "#e67e22", "#e74c3c", "#922b21"],
    text=bucket_scores["review_score"].round(2), textposition="outside",
))
fig.add_hline(y=4.0, line_dash="dash", line_color="grey",
              annotation_text="Score = 4.0 threshold")
fig.update_layout(
    height=450, margin=dict(t=30, b=10),
    yaxis=dict(title="Average review score (out of 5)", range=[0, 5.4]),
    xaxis_title="Delivery delay bucket",
)
st.plotly_chart(fig, use_container_width=True)
st.caption(
    "🔍 Scores hold above 4★ for anything on time or early, then fall off a cliff the "
    "moment the promise is broken — and keep falling the later it gets."
)

st.divider()

# --- 3 · Repeat purchase rate by review score ---------------------------------------
st.subheader("3 · Repeat purchase rate by review score — the leak quantified")

repeat = df.groupby("customer_unique_id").agg(
    total_orders=("order_id", "nunique"),
    avg_review=("review_score", "mean"),
).reset_index()
repeat["is_repeat"] = repeat["total_orders"] > 1

repeat_rate = (
    repeat.groupby(repeat["avg_review"].round())["is_repeat"].mean().reset_index()
)
repeat_rate.columns = ["review_score", "repeat_rate"]
repeat_rate = repeat_rate[repeat_rate["review_score"].notna()]
repeat_rate["repeat_rate_pct"] = repeat_rate["repeat_rate"] * 100

fig = go.Figure(go.Bar(
    x=repeat_rate["review_score"].astype(int).astype(str),
    y=repeat_rate["repeat_rate_pct"],
    marker_color=["#922b21", "#e74c3c", "#e67e22", "#82e0aa", "#2ecc71"],
    text=[f"{v:.1f}%" for v in repeat_rate["repeat_rate_pct"]], textposition="outside",
))
fig.update_layout(
    height=420, margin=dict(t=30, b=10),
    xaxis_title="Review score (1–5)", yaxis_title="% customers who bought again",
)
st.plotly_chart(fig, use_container_width=True)
st.caption(
    "🔍 The cleanest signal is at the extremes: 1★ customers rebuy at well under half "
    "the overall rate. Mid buckets are noisy — repeat customers *average* their scores "
    "across orders, which pulls multi-order customers out of the pure-1★/5★ bands "
    "(check the counts below before quoting a single bucket)."
)

with st.expander("Customer counts per score bucket"):
    repeat_count = (
        repeat.groupby(repeat["avg_review"].round())
        .agg(
            total_customers=("customer_unique_id", "count"),
            repeat_customers=("is_repeat", "sum"),
            repeat_rate_pct=("is_repeat", lambda x: x.mean() * 100),
        )
        .reset_index()
        .rename(columns={"avg_review": "review_score"})
    )
    st.dataframe(
        repeat_count.style.format({"repeat_rate_pct": "{:.2f}"}),
        use_container_width=True, hide_index=True,
    )

st.divider()

# --- 4 · Volume of low reviews caused by late delivery -------------------------------
st.subheader("4 · Late deliveries drive the majority of bad reviews")

df["is_late"] = df["delivery_delay_days"] > 0
df["is_low_score"] = df["review_score"] <= 2

low_score_summary = (
    df.groupby("is_late")["is_low_score"]
      .agg(total_orders="count", low_score_orders="sum")
      .reset_index()
)
low_score_summary["low_score_pct"] = (
    low_score_summary["low_score_orders"] / low_score_summary["total_orders"] * 100
)
low_score_summary["label"] = low_score_summary["is_late"].map(
    {False: "On-Time / Early", True: "Late Delivery"}
)

col_pct, col_vol = st.columns(2)
colors = {"On-Time / Early": "#2ecc71", "Late Delivery": "#e74c3c"}
with col_pct:
    fig = go.Figure(go.Bar(
        x=low_score_summary["label"], y=low_score_summary["low_score_pct"],
        marker_color=[colors[l] for l in low_score_summary["label"]],
        text=[f"{v:.1f}%" for v in low_score_summary["low_score_pct"]],
        textposition="outside",
    ))
    fig.update_layout(height=420, margin=dict(t=50, b=10),
                      title="% of orders receiving a low score (≤2★)",
                      yaxis=dict(title="% of orders", range=[0, 100]))
    st.plotly_chart(fig, use_container_width=True)
with col_vol:
    fig = go.Figure(go.Bar(
        x=low_score_summary["label"], y=low_score_summary["low_score_orders"],
        marker_color=[colors[l] for l in low_score_summary["label"]],
        text=[f"{int(v):,}" for v in low_score_summary["low_score_orders"]],
        textposition="outside",
    ))
    fig.update_layout(height=420, margin=dict(t=50, b=10),
                      title="Raw volume of low-score orders (≤2★)",
                      yaxis_title="Number of orders")
    st.plotly_chart(fig, use_container_width=True)
st.caption(
    "🔍 Per order, a late delivery is ~7× more likely to earn a 1–2★ review. On-time "
    "orders still produce low scores in volume (there are far more of them) — but the "
    "late tail is the single biggest *controllable* driver."
)

st.divider()

# --- 5 · Geography: where satisfaction and delay meet --------------------------------
st.subheader("5 · Delivery performance & satisfaction by state")

geo = (
    df.groupby("customer_state")
      .agg(
          avg_review_score=("review_score", "mean"),
          avg_delay_days=("delivery_delay_days", "mean"),
          total_orders=("order_id", "nunique"),
      )
      .reset_index()
      .dropna(subset=["customer_state"])
)


@st.cache_data(show_spinner=False)
def brazil_geojson() -> dict:
    path = Path(__file__).resolve().parents[1] / "assets" / "brazil_states.geojson"
    return json.loads(path.read_text(encoding="utf-8"))


@st.cache_data(show_spinner=False)
def state_centroids() -> dict:
    """Label anchor (lon, lat) per state — area centroid of its largest polygon
    (shoelace formula), so the notebook's geopandas `.centroid` labels work
    without a geopandas dependency."""
    cents: dict[str, tuple[float, float]] = {}
    for feat in brazil_geojson()["features"]:
        geom = feat["geometry"]
        polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
        best_area, best = 0.0, None
        for poly in polys:
            ring = poly[0]  # exterior ring of [lon, lat] pairs
            a = cx = cy = 0.0
            for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
                cross = x1 * y2 - x2 * y1
                a += cross
                cx += (x1 + x2) * cross
                cy += (y1 + y2) * cross
            if a == 0:
                continue
            if abs(a) > best_area:
                best_area, best = abs(a), (cx / (3 * a), cy / (3 * a))
        if best:
            cents[feat["properties"]["sigla"]] = best
    return cents


gj = brazil_geojson()
cents = state_centroids()


def state_map(values: "pd.Series", fmt: str, colorscale: str, title: str, cbar: str,
              suffix: str = ""):
    """Choropleth + a state label (sigla, value) at each state's centroid,
    matching the annotated geopandas maps in the notebook."""
    fig = px.choropleth(
        geo, geojson=gj, locations="customer_state",
        featureidkey="properties.sigla", color=values.name,
        color_continuous_scale=colorscale, hover_data={"total_orders": ":,"},
    )
    labelled = geo[geo["customer_state"].isin(cents)]
    fig.add_scattergeo(
        lon=[cents[s][0] for s in labelled["customer_state"]],
        lat=[cents[s][1] for s in labelled["customer_state"]],
        text=[f"{s}<br>{v:{fmt}}{suffix}" for s, v in
              zip(labelled["customer_state"], labelled[values.name])],
        mode="text", textfont=dict(size=9, color="black"),
        hoverinfo="skip", showlegend=False,
    )
    fig.update_geos(fitbounds="locations", visible=False)
    fig.update_layout(height=480, margin=dict(t=40, b=0, l=0, r=0),
                      title=title, coloraxis_colorbar_title=cbar)
    return fig


col_rev, col_delay = st.columns(2)
with col_rev:
    st.plotly_chart(
        state_map(geo["avg_review_score"], ".2f", "RdYlGn",
                  "Avg review score by state", "★"),
        use_container_width=True,
    )
with col_delay:
    st.plotly_chart(
        state_map(geo["avg_delay_days"], ".1f", "RdYlGn_r",
                  "Avg delivery delay (days vs estimate) by state", "days",
                  suffix="d"),
        use_container_width=True,
    )
st.caption(
    "🔍 The two maps are near mirror images: the states delivered latest (vs estimate) "
    "are the states that score lowest. Geography confirms the causal chain."
)

st.divider()

st.subheader("So what? (closing the loop)")
st.markdown(
    """
A low review is not "operational noise" — it is a **forward-looking churn signal** with
revenue attached: 1★ customers rebuy at *less than half* the overall rate, and the
single biggest controllable producer of 1–2★ reviews is **late delivery** (PP2). Fixing
delivery reliability is therefore a *marketing* investment — it buys back the repeat
purchases the CEO is currently paying acquisition costs to replace (PP1).
"""
)
st.caption("Migrated from `../notebooks/team_eda_pp3.ipynb` · gold mart, live BigQuery")
