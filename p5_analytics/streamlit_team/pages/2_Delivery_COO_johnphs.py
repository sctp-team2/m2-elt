"""Pain Point 2 — Operational Performance / Delivery (COO).

Owners: John · Chun Wei · Charmaine.

Problem statement
-----------------
The COO sees weak re-engagement performance, ugly churn metrics and mediocre NPS.
The tempting conclusion is: "our brand is not sticky". This page tests the alternative
explanation: customer experience is being damaged upstream by delivery reliability.

Data contract
-------------
Source is the BigQuery gold mart `fact_orders` only. The page intentionally does not
read local CSV files, because the presentation needs to show data retrieved from BQ.
"""
from __future__ import annotations

import pandas as pd
import streamlit as st
import altair as alt

from lib import bq, config

st.set_page_config(page_title="PP2 · Delivery", page_icon="🚚", layout="wide")

st.title("🚚 Pain Point 2 — Operational Performance (Delivery)")
st.caption("COO · owners: John, Chun Wei, Charmaine · Source: BigQuery gold mart `fact_orders`")

st.info(
    "**Hypothesis:** the churn / re-engagement / NPS symptoms are not mainly a "
    "brand-stickiness problem. They are strongly associated with delivery failures. "
    "Loyalty spend and comms cannot fully compensate for orders that arrive late or never arrive.",
    icon="🎯",
)

FACT_ORDERS = config.table("fact_orders")

# -----------------------------------------------------------------------------
# 1. Pull order-level data from BigQuery
# -----------------------------------------------------------------------------
# Expected fact_orders columns based on the BigQuery export used in analysis:
# order_id, customer_id, order_status, purchase_ts, approved_ts, delivered_ts,
# estimated_ts, payment_value, order_gmv, order_freight, item_count,
# customer_unique_id, customer_state, review_score.
#
# ANY_VALUE is used defensively in case the fact table is accidentally duplicated
# by joins or line-level grain. The output is one row per order_id.
ORDERS_SQL = f"""
WITH order_level AS (
  SELECT
    order_id,
    ANY_VALUE(customer_id) AS customer_id,
    ANY_VALUE(customer_unique_id) AS customer_unique_id,
    ANY_VALUE(customer_state) AS customer_state,
    ANY_VALUE(order_status) AS order_status,
    ANY_VALUE(purchase_ts) AS purchase_ts,
    ANY_VALUE(approved_ts) AS approved_ts,
    ANY_VALUE(delivered_ts) AS delivered_ts,
    ANY_VALUE(estimated_ts) AS estimated_ts,
    ANY_VALUE(payment_value) AS payment_value,
    ANY_VALUE(order_gmv) AS order_gmv,
    ANY_VALUE(order_freight) AS order_freight,
    ANY_VALUE(item_count) AS item_count,
    ANY_VALUE(review_score) AS review_score
  FROM {FACT_ORDERS}
  WHERE purchase_ts IS NOT NULL
  GROUP BY order_id
)
SELECT
  *,
  FORMAT_DATE('%Y-%m', DATE(purchase_ts)) AS purchase_month,
  DATE_DIFF(DATE(delivered_ts), DATE(purchase_ts), DAY) AS delivery_days,
  DATE_DIFF(DATE(delivered_ts), DATE(estimated_ts), DAY) AS delay_days,
  CASE
    WHEN delivered_ts IS NULL THEN 'Not delivered'
    WHEN DATE_DIFF(DATE(delivered_ts), DATE(estimated_ts), DAY) <= 0 THEN 'On time / early'
    WHEN DATE_DIFF(DATE(delivered_ts), DATE(estimated_ts), DAY) <= 3 THEN '1-3 days late'
    WHEN DATE_DIFF(DATE(delivered_ts), DATE(estimated_ts), DAY) <= 7 THEN '4-7 days late'
    ELSE '8+ days late'
  END AS delivery_bucket,
  CASE WHEN delivered_ts IS NULL THEN TRUE ELSE FALSE END AS is_not_delivered,
  CASE
    WHEN delivered_ts IS NOT NULL
     AND DATE_DIFF(DATE(delivered_ts), DATE(estimated_ts), DAY) > 0 THEN TRUE
    ELSE FALSE
  END AS is_late,
  CASE
    WHEN delivered_ts IS NULL THEN TRUE
    WHEN DATE_DIFF(DATE(delivered_ts), DATE(estimated_ts), DAY) > 0 THEN TRUE
    ELSE FALSE
  END AS is_bad_delivery,
  CASE WHEN review_score = 5 THEN TRUE ELSE FALSE END AS is_promoter,
  CASE WHEN review_score <= 3 THEN TRUE ELSE FALSE END AS is_detractor,
  CASE WHEN review_score <= 2 THEN TRUE ELSE FALSE END AS is_low_review
FROM order_level
"""


@st.cache_data(ttl=600, show_spinner="Loading order-level data from BigQuery...")
def load_orders() -> pd.DataFrame:
    """Load one row per order from BigQuery and normalise types for Streamlit analysis."""
    df = bq.run_query(ORDERS_SQL)

    # Normalise types. This keeps the downstream calculations robust if BigQuery
    # returns Arrow decimal / nullable boolean types.
    for col in ["purchase_ts", "approved_ts", "delivered_ts", "estimated_ts"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")

    numeric_cols = [
        "payment_value",
        "order_gmv",
        "order_freight",
        "item_count",
        "review_score",
        "delivery_days",
        "delay_days",
    ]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    bool_cols = [
        "is_not_delivered",
        "is_late",
        "is_bad_delivery",
        "is_promoter",
        "is_detractor",
        "is_low_review",
    ]
    for col in bool_cols:
        if col in df.columns:
            df[col] = df[col].fillna(False).astype(bool)

    return df


def pct(x: float | int | None) -> str:
    if x is None or pd.isna(x):
        return "n/a"
    return f"{x * 100:.1f}%"


def metric_value(x: float | int | None, decimals: int = 1) -> str:
    if x is None or pd.isna(x):
        return "n/a"
    if decimals == 0:
        return f"{x:,.0f}"
    return f"{x:,.{decimals}f}"


def bar_chart(
    data: pd.DataFrame,
    x: str,
    y: str,
    title: str,
    y_title: str | None = None,
    sort: list[str] | str | None = None,
    height: int = 330,
):
    chart = (
        alt.Chart(data)
        .mark_bar()
        .encode(
            x=alt.X(x, sort=sort, title=None),
            y=alt.Y(y, title=y_title),
            tooltip=list(data.columns),
        )
        .properties(title=title, height=height)
    )
    st.altair_chart(chart, use_container_width=True)


def line_chart(
    data: pd.DataFrame,
    x: str,
    y: str,
    title: str,
    y_title: str | None = None,
    height: int = 330,
):
    chart = (
        alt.Chart(data)
        .mark_line(point=True)
        .encode(
            x=alt.X(x, title=None),
            y=alt.Y(y, title=y_title),
            tooltip=list(data.columns),
        )
        .properties(title=title, height=height)
    )
    st.altair_chart(chart, use_container_width=True)


try:
    orders = load_orders()
except Exception as e:  # noqa: BLE001
    st.error(
        "Query failed — check the BigQuery connection on the Home page, and confirm "
        "that the gold mart `fact_orders` table has the expected columns.\n\n"
        f"{e}"
    )
    st.stop()

if orders.empty:
    st.warning("No rows returned from BigQuery `fact_orders`.")
    st.stop()

bucket_order = [
    "On time / early",
    "1-3 days late",
    "4-7 days late",
    "8+ days late",
    "Not delivered",
]

# -----------------------------------------------------------------------------
# 2. Derived summaries
# -----------------------------------------------------------------------------
total_orders = int(orders["order_id"].nunique())
delivered_orders = int((~orders["delivered_ts"].isna()).sum())
late_orders = int(orders["is_late"].sum())
not_delivered_orders = int(orders["is_not_delivered"].sum())
bad_delivery_orders = int(orders["is_bad_delivery"].sum())
late_rate_delivered = late_orders / delivered_orders if delivered_orders else 0
bad_delivery_rate = bad_delivery_orders / total_orders if total_orders else 0
avg_review = orders["review_score"].mean()
low_review_rate = orders["is_low_review"].mean()

# Delivery bucket summary
delivery_summary = (
    orders.groupby("delivery_bucket", dropna=False)
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
    .reindex(bucket_order)
    .reset_index()
)
delivery_summary["orders"] = delivery_summary["orders"].fillna(0).astype(int)
delivery_summary["order_share"] = delivery_summary["orders"] / total_orders
delivery_summary["nps_proxy"] = delivery_summary["promoter_rate"] - delivery_summary["detractor_rate"]

# Monthly summary
monthly = (
    orders.groupby("purchase_month")
    .agg(
        orders=("order_id", "nunique"),
        late_rate=("is_late", "mean"),
        not_delivered_rate=("is_not_delivered", "mean"),
        bad_delivery_rate=("is_bad_delivery", "mean"),
        avg_review=("review_score", "mean"),
        low_review_rate=("is_low_review", "mean"),
    )
    .reset_index()
    .sort_values("purchase_month")
)
monthly = monthly[monthly["orders"] >= 100].copy()

# Repeat / churn proxy: among customers whose first purchase is at least 60 days before
# the dataset end date, did they place another order later?
repeat_summary = pd.DataFrame()
first_order_count = 0
if "customer_unique_id" in orders.columns:
    cust_orders = orders.dropna(subset=["customer_unique_id", "purchase_ts"]).copy()
    if not cust_orders.empty:
        max_purchase_ts = cust_orders["purchase_ts"].max()
        cutoff_ts = max_purchase_ts - pd.Timedelta(days=60)

        cust_orders = cust_orders.sort_values(["customer_unique_id", "purchase_ts", "order_id"])
        order_counts = cust_orders.groupby("customer_unique_id")["order_id"].nunique().rename("customer_order_count")
        first_orders = cust_orders.groupby("customer_unique_id", as_index=False).first()
        first_orders = first_orders.merge(order_counts, on="customer_unique_id", how="left")
        first_orders = first_orders[first_orders["purchase_ts"] <= cutoff_ts].copy()
        first_orders["has_later_order"] = first_orders["customer_order_count"] > 1
        first_order_count = int(first_orders["customer_unique_id"].nunique())

        repeat_summary = (
            first_orders.groupby("delivery_bucket")
            .agg(
                first_order_customers=("customer_unique_id", "nunique"),
                repeat_rate=("has_later_order", "mean"),
                avg_first_review=("review_score", "mean"),
            )
            .reindex(bucket_order)
            .reset_index()
        )
        repeat_summary["no_repeat_rate"] = 1 - repeat_summary["repeat_rate"]

# State-level priority
state_summary = (
    orders.groupby("customer_state")
    .agg(
        orders=("order_id", "nunique"),
        late_rate=("is_late", "mean"),
        not_delivered_rate=("is_not_delivered", "mean"),
        bad_delivery_rate=("is_bad_delivery", "mean"),
        avg_review=("review_score", "mean"),
        low_review_rate=("is_low_review", "mean"),
        promoter_rate=("is_promoter", "mean"),
        detractor_rate=("is_detractor", "mean"),
        total_gmv=("order_gmv", "sum"),
    )
    .reset_index()
)
state_summary["nps_proxy"] = state_summary["promoter_rate"] - state_summary["detractor_rate"]
state_summary["priority_score"] = (
    state_summary["orders"]
    * state_summary["bad_delivery_rate"]
    * (5 - state_summary["avg_review"])
)
state_priority = state_summary[state_summary["orders"] >= 100].sort_values(
    "priority_score", ascending=False
)

# Key numbers used in the executive narrative
on_time_avg_review = delivery_summary.loc[
    delivery_summary["delivery_bucket"] == "On time / early", "avg_review"
].squeeze()
severe_avg_review = delivery_summary.loc[
    delivery_summary["delivery_bucket"] == "8+ days late", "avg_review"
].squeeze()
not_delivered_avg_review = delivery_summary.loc[
    delivery_summary["delivery_bucket"] == "Not delivered", "avg_review"
].squeeze()
on_time_nps = delivery_summary.loc[
    delivery_summary["delivery_bucket"] == "On time / early", "nps_proxy"
].squeeze()
severe_nps = delivery_summary.loc[
    delivery_summary["delivery_bucket"] == "8+ days late", "nps_proxy"
].squeeze()

# -----------------------------------------------------------------------------
# 3. Headline KPIs
# -----------------------------------------------------------------------------
kpi_cols = st.columns(6)
kpi_cols[0].metric("Orders analysed", f"{total_orders:,}")
kpi_cols[1].metric("Delivered orders", f"{delivered_orders:,}")
kpi_cols[2].metric("Late deliveries", f"{late_orders:,}", help="Late among delivered orders")
kpi_cols[3].metric("Late rate", pct(late_rate_delivered), help="Late deliveries / delivered orders")
kpi_cols[4].metric("Not delivered", f"{not_delivered_orders:,}")
kpi_cols[5].metric("Bad delivery rate", pct(bad_delivery_rate), help="Late or not-delivered orders / all orders")

st.divider()

# -----------------------------------------------------------------------------
# 4. Tabs
# -----------------------------------------------------------------------------
tab_summary, tab_delivery, tab_trend, tab_repeat, tab_states, tab_data = st.tabs(
    [
        "Executive summary",
        "Delivery impact",
        "Monthly trend",
        "Repeat / churn proxy",
        "State priorities",
        "Data & SQL",
    ]
)

with tab_summary:
    st.subheader("Executive summary")

    st.markdown(
        f"""
The COO is seeing weak re-engagement, ugly churn metrics and mediocre NPS. The data points
to an operational root cause: **delivery reliability**.

From BigQuery `fact_orders`, **{bad_delivery_orders:,} of {total_orders:,} orders** were either
late or not delivered (**{pct(bad_delivery_rate)}**). The impact on customer sentiment is large:
orders delivered on time or early average **{metric_value(on_time_avg_review, 2)} / 5** review score,
while orders **8+ days late** average **{metric_value(severe_avg_review, 2)} / 5**, and
not-delivered orders average **{metric_value(not_delivered_avg_review, 2)} / 5**.

Using review score as an NPS proxy — score 5 as promoter, score 1–3 as detractor — on-time orders
show an NPS proxy of **{pct(on_time_nps)}**, while 8+ days late orders show **{pct(severe_nps)}**.
That gap is too large to explain as a pure brand-stickiness or email-copy problem.
"""
    )

    st.success(
        "**COO decision:** fix the delivery tail before increasing loyalty or re-engagement spend. "
        "Marketing is being asked to win back customers after operations have already damaged trust.",
        icon="✅",
    )

    c1, c2 = st.columns(2)
    with c1:
        chart_df = delivery_summary[["delivery_bucket", "avg_review"]].dropna()
        bar_chart(
            chart_df,
            x="delivery_bucket:N",
            y="avg_review:Q",
            title="Average review score falls as delivery failure worsens",
            y_title="Average review score",
            sort=bucket_order,
        )
    with c2:
        chart_df = delivery_summary[["delivery_bucket", "nps_proxy"]].dropna().copy()
        chart_df["nps_proxy_pct"] = chart_df["nps_proxy"] * 100
        bar_chart(
            chart_df[["delivery_bucket", "nps_proxy_pct"]],
            x="delivery_bucket:N",
            y="nps_proxy_pct:Q",
            title="NPS proxy by delivery bucket",
            y_title="Promoter % - detractor %",
            sort=bucket_order,
        )

    st.markdown(
        """
**How to explain this in the presentation:**

1. The symptom appears in campaign dashboards and complaints.
2. The tempting but wrong diagnosis is weak brand stickiness.
3. The evidence shows delivery failures create poor reviews and likely reduce willingness to buy again.
4. The operational fix should focus on late-delivery tail reduction, failed-delivery recovery and state-level hotspots.
"""
    )

with tab_delivery:
    st.subheader("Delivery performance and customer experience")

    show = delivery_summary.copy()
    show["order_share"] = show["order_share"].map(lambda x: f"{x:.1%}" if pd.notna(x) else "")
    show["avg_review"] = show["avg_review"].map(lambda x: f"{x:.2f}" if pd.notna(x) else "")
    show["low_review_rate"] = show["low_review_rate"].map(lambda x: f"{x:.1%}" if pd.notna(x) else "")
    show["detractor_rate"] = show["detractor_rate"].map(lambda x: f"{x:.1%}" if pd.notna(x) else "")
    show["promoter_rate"] = show["promoter_rate"].map(lambda x: f"{x:.1%}" if pd.notna(x) else "")
    show["nps_proxy"] = show["nps_proxy"].map(lambda x: f"{x:.1%}" if pd.notna(x) else "")
    show["avg_delivery_days"] = show["avg_delivery_days"].map(lambda x: f"{x:.1f}" if pd.notna(x) else "")
    show["avg_delay_days"] = show["avg_delay_days"].map(lambda x: f"{x:.1f}" if pd.notna(x) else "")
    show["total_gmv"] = show["total_gmv"].map(lambda x: f"{x:,.0f}" if pd.notna(x) else "")

    st.dataframe(show, use_container_width=True, hide_index=True)

    c1, c2 = st.columns(2)
    with c1:
        chart_df = delivery_summary[["delivery_bucket", "orders"]].dropna()
        bar_chart(
            chart_df,
            x="delivery_bucket:N",
            y="orders:Q",
            title="Order count by delivery bucket",
            y_title="Orders",
            sort=bucket_order,
        )
    with c2:
        chart_df = delivery_summary[["delivery_bucket", "low_review_rate"]].dropna().copy()
        chart_df["low_review_pct"] = chart_df["low_review_rate"] * 100
        bar_chart(
            chart_df[["delivery_bucket", "low_review_pct"]],
            x="delivery_bucket:N",
            y="low_review_pct:Q",
            title="Low-review rate by delivery bucket",
            y_title="% review score <= 2",
            sort=bucket_order,
        )

    c3, c4 = st.columns(2)
    with c3:
        chart_df = orders[orders["delay_days"].notna() & (orders["delay_days"].between(-30, 60))]
        hist = (
            chart_df.assign(delay_bin=chart_df["delay_days"].round().astype(int))
            .groupby("delay_bin")
            .agg(orders=("order_id", "nunique"), avg_review=("review_score", "mean"))
            .reset_index()
        )
        line_chart(
            hist,
            x="delay_bin:Q",
            y="orders:Q",
            title="Delivery delay distribution",
            y_title="Orders",
        )
    with c4:
        delay_review = (
            orders[orders["delay_days"].notna() & (orders["delay_days"].between(-30, 60))]
            .assign(delay_bin=lambda d: d["delay_days"].round().astype(int))
            .groupby("delay_bin")
            .agg(avg_review=("review_score", "mean"), orders=("order_id", "nunique"))
            .reset_index()
        )
        line_chart(
            delay_review,
            x="delay_bin:Q",
            y="avg_review:Q",
            title="Review score declines as delay increases",
            y_title="Average review score",
        )

    st.markdown(
        """
**Reading the charts:** late and failed deliveries are a minority of all orders, but they are
heavily over-represented in low reviews. This is why the business can see mediocre NPS even when
most orders are delivered successfully: the operational tail creates a large negative experience.
"""
    )

with tab_trend:
    st.subheader("Monthly operational trend")
    st.caption("Months with fewer than 100 orders are removed to reduce partial-month noise.")

    c1, c2 = st.columns(2)
    with c1:
        trend = monthly[["purchase_month", "bad_delivery_rate", "orders"]].copy()
        trend["bad_delivery_pct"] = trend["bad_delivery_rate"] * 100
        line_chart(
            trend[["purchase_month", "bad_delivery_pct", "orders"]],
            x="purchase_month:N",
            y="bad_delivery_pct:Q",
            title="Bad-delivery rate over time",
            y_title="Late or not delivered %",
        )
    with c2:
        trend = monthly[["purchase_month", "avg_review", "orders"]].copy()
        line_chart(
            trend,
            x="purchase_month:N",
            y="avg_review:Q",
            title="Average review score over time",
            y_title="Average review score",
        )

    c3, c4 = st.columns(2)
    with c3:
        trend = monthly[["purchase_month", "late_rate", "orders"]].copy()
        trend["late_pct"] = trend["late_rate"] * 100
        line_chart(
            trend[["purchase_month", "late_pct", "orders"]],
            x="purchase_month:N",
            y="late_pct:Q",
            title="Late-delivery rate over time",
            y_title="Late %",
        )
    with c4:
        trend = monthly[["purchase_month", "not_delivered_rate", "orders"]].copy()
        trend["not_delivered_pct"] = trend["not_delivered_rate"] * 100
        line_chart(
            trend[["purchase_month", "not_delivered_pct", "orders"]],
            x="purchase_month:N",
            y="not_delivered_pct:Q",
            title="Not-delivered rate over time",
            y_title="Not delivered %",
        )

    st.dataframe(monthly, use_container_width=True, hide_index=True)

with tab_repeat:
    st.subheader("Repeat-purchase / churn proxy")
    st.markdown(
        """
The dataset does not contain email campaign interactions or explicit churn labels. As a proxy,
this section asks: **after a customer's first order, did they place another order later?**

To reduce right-censoring, the analysis only includes customers whose first order occurred at least
60 days before the final purchase date in the dataset.
"""
    )

    if repeat_summary.empty:
        st.warning("Repeat proxy could not be calculated because customer identifiers are missing.")
    else:
        c1, c2, c3 = st.columns(3)
        c1.metric("First-order customers in repeat proxy", f"{first_order_count:,}")
        c2.metric("Overall repeat rate", pct((repeat_summary["repeat_rate"] * repeat_summary["first_order_customers"]).sum() / repeat_summary["first_order_customers"].sum()))
        c3.metric("Proxy definition", "Later order?", help="Customer has more than one order in the dataset")

        c4, c5 = st.columns(2)
        with c4:
            chart_df = repeat_summary[["delivery_bucket", "repeat_rate", "first_order_customers"]].dropna().copy()
            chart_df["repeat_pct"] = chart_df["repeat_rate"] * 100
            bar_chart(
                chart_df[["delivery_bucket", "repeat_pct", "first_order_customers"]],
                x="delivery_bucket:N",
                y="repeat_pct:Q",
                title="Repeat rate by first delivery experience",
                y_title="Repeat rate %",
                sort=bucket_order,
            )
        with c5:
            chart_df = repeat_summary[["delivery_bucket", "no_repeat_rate", "first_order_customers"]].dropna().copy()
            chart_df["no_repeat_pct"] = chart_df["no_repeat_rate"] * 100
            bar_chart(
                chart_df[["delivery_bucket", "no_repeat_pct", "first_order_customers"]],
                x="delivery_bucket:N",
                y="no_repeat_pct:Q",
                title="No-repeat rate by first delivery experience",
                y_title="No-repeat rate %",
                sort=bucket_order,
            )

        show_repeat = repeat_summary.copy()
        show_repeat["repeat_rate"] = show_repeat["repeat_rate"].map(lambda x: f"{x:.1%}" if pd.notna(x) else "")
        show_repeat["no_repeat_rate"] = show_repeat["no_repeat_rate"].map(lambda x: f"{x:.1%}" if pd.notna(x) else "")
        show_repeat["avg_first_review"] = show_repeat["avg_first_review"].map(lambda x: f"{x:.2f}" if pd.notna(x) else "")
        st.dataframe(show_repeat, use_container_width=True, hide_index=True)

    st.caption(
        "Caveat: this is a churn proxy, not a causal experiment. It is still useful for the COO story "
        "because it connects first delivery experience to later customer behaviour."
    )

with tab_states:
    st.subheader("Where should operations focus first?")
    st.markdown(
        """
Priority score combines volume, bad-delivery rate and review pain:

`priority_score = orders × bad_delivery_rate × (5 - avg_review)`

This does not claim to be a finance model. It is a triage score to identify where operational fixes
could have the largest customer-experience impact.
"""
    )

    top_states = state_priority.head(15).copy()

    c1, c2 = st.columns(2)
    with c1:
        bar_chart(
            top_states[["customer_state", "priority_score", "orders"]],
            x="customer_state:N",
            y="priority_score:Q",
            title="Top states by operational priority score",
            y_title="Priority score",
            sort="-y",
        )
    with c2:
        chart_df = top_states[["customer_state", "bad_delivery_rate", "orders"]].copy()
        chart_df["bad_delivery_pct"] = chart_df["bad_delivery_rate"] * 100
        bar_chart(
            chart_df[["customer_state", "bad_delivery_pct", "orders"]],
            x="customer_state:N",
            y="bad_delivery_pct:Q",
            title="Bad-delivery rate in priority states",
            y_title="Late or not delivered %",
            sort="-y",
        )

    show_state = state_priority.copy()
    for col in ["late_rate", "not_delivered_rate", "bad_delivery_rate", "low_review_rate", "nps_proxy"]:
        show_state[col] = show_state[col].map(lambda x: f"{x:.1%}" if pd.notna(x) else "")
    show_state["avg_review"] = show_state["avg_review"].map(lambda x: f"{x:.2f}" if pd.notna(x) else "")
    show_state["total_gmv"] = show_state["total_gmv"].map(lambda x: f"{x:,.0f}" if pd.notna(x) else "")
    show_state["priority_score"] = show_state["priority_score"].map(lambda x: f"{x:,.0f}" if pd.notna(x) else "")
    st.dataframe(show_state, use_container_width=True, hide_index=True)

with tab_data:
    st.subheader("Data source and SQL")
    st.markdown(
        f"""
This page uses the BigQuery table returned by:

```python
config.table("fact_orders")
```

Resolved table in this environment:

```text
{FACT_ORDERS}
```

The page does **not** read `fact_orders.csv` or any other local CSV file.
"""
    )

    with st.expander("Show BigQuery SQL used by this page"):
        st.code(ORDERS_SQL, language="sql")

    st.subheader("Order-level sample retrieved from BigQuery")
    st.dataframe(orders.head(100), use_container_width=True, hide_index=True)

    st.download_button(
        label="Download current BigQuery result sample as CSV",
        data=orders.head(1000).to_csv(index=False).encode("utf-8"),
        file_name="fact_orders_bq_sample.csv",
        mime="text/csv",
    )
