"""Shared SQL against the Olist gold mart for the team deck pages.

Design: one modest order-grain pull (``ORDERS_SQL``, ~99k rows) feeds pages 2, 3 and
the Summary — each page derives its own buckets / rates in pandas. Page-specific
aggregates (revenue trend, payment mix, category revenue, review text) have their own
queries. Everything reads **gold-mart tables only** (the data contract); the EDA
notebooks' joins to bronze/snapshot tables are rewritten here against ``dim_reviews``
(current SCD versions).

``bq.run_query`` caches by SQL string for 1 hour, so flipping between pages reuses the
same result instead of re-billing BigQuery.
"""
from __future__ import annotations

from lib import config

F = config.table("fact_orders")
DC = config.table("dim_customers")
DR = config.table("dim_reviews")
DP = config.table("dim_products")

# One row per ORDER (fact_orders is item grain — aggregate up), with the customer's
# stable identity (customer_unique_id — the key to retention), state, the current
# review score, and the order-level data-quality flags. Mirrors the frame the EDA
# notebooks worked from (notebooks/fact_orders.csv was this exact shape).
ORDERS_SQL = f"""
WITH ord AS (
  SELECT
    id                                        AS order_id,
    ANY_VALUE(customer_id)                    AS customer_id,
    ANY_VALUE(order_status)                   AS order_status,
    ANY_VALUE(order_purchase_timestamp)       AS purchase_ts,
    ANY_VALUE(order_delivered_customer_date)  AS delivered_ts,
    ANY_VALUE(order_estimated_delivery_date)  AS estimated_ts,
    ANY_VALUE(payment_value)                  AS payment_value,
    SUM(price)                                AS order_gmv,
    SUM(freight_value)                        AS order_freight,
    COUNT(*)                                  AS item_count,
    LOGICAL_OR(has_invalid_delivery_date)     AS has_invalid_delivery_date,
    LOGICAL_OR(has_missing_delivery_date)     AS has_missing_delivery_date
  FROM {F}
  GROUP BY id
),
cur_reviews AS (  -- current review version per order (dim_reviews is a Type-2 SCD)
  SELECT order_id, MAX(review_score) AS review_score
  FROM {DR}
  WHERE is_current AND order_id IS NOT NULL
  GROUP BY order_id
)
SELECT
  o.*,
  c.customer_unique_id,
  c.customer_state,
  r.review_score
FROM ord o
LEFT JOIN {DC} c ON o.customer_id = c.id
LEFT JOIN cur_reviews r ON o.order_id = r.order_id
"""

# Monthly GMV / revenue with the first-vs-repeat purchase split (delivered orders).
# order_seq ranks each customer's orders over time: seq 1 = acquisition, >1 = retention.
REVENUE_TREND_SQL = f"""
WITH order_rank AS (
  SELECT
    id AS order_id,
    ANY_VALUE(customer_id) AS customer_id,
    ANY_VALUE(order_purchase_timestamp) AS purchase_ts
  FROM {F}
  WHERE order_status = 'delivered'
  GROUP BY id
),
customer_rank AS (
  SELECT
    order_id,
    ROW_NUMBER() OVER (PARTITION BY c.customer_unique_id ORDER BY purchase_ts) AS order_seq
  FROM order_rank r
  LEFT JOIN {DC} c ON r.customer_id = c.id
)
SELECT
  DATE(DATE_TRUNC(DATE(f.order_purchase_timestamp), MONTH)) AS order_month,
  SUM(f.price)         AS total_gmv,
  SUM(f.payment_value) AS total_revenue,
  SUM(CASE WHEN cr.order_seq = 1 THEN f.price ELSE 0 END) AS gmv_first_purchase,
  SUM(CASE WHEN cr.order_seq > 1 THEN f.price ELSE 0 END) AS gmv_repeat_purchase
FROM {F} f
LEFT JOIN customer_rank cr ON f.id = cr.order_id
WHERE f.order_status = 'delivered'
GROUP BY order_month
ORDER BY order_month
"""

# GMV by payment method (item grain is fine — price sums to the same total).
PAYMENT_MIX_SQL = f"""
SELECT
  payment_type,
  SUM(price) AS total_gmv,
  COUNT(DISTINCT id) AS order_count
FROM {F}
WHERE payment_type != 'not_defined'
GROUP BY payment_type
ORDER BY total_gmv DESC
"""

# Item revenue by product category (replaces the notebook's pre-exported
# revenue_vs_product_category.csv with a live gold-mart query).
CATEGORY_REVENUE_SQL = f"""
SELECT
  COALESCE(p.product_category, 'unknown') AS product_category,
  SUM(f.price)         AS total_revenue,
  COUNT(DISTINCT f.id) AS total_orders
FROM {F} f
LEFT JOIN {DP} p ON f.product_id = p.product_id AND p.is_current  -- dim_products is an SCD
GROUP BY product_category
ORDER BY total_revenue DESC
"""

# One row per review (latest version), both free-text fields + score — for the
# Voice-of-Customer text analysis. Whitespace-only strings normalised to NULL.
REVIEWS_TEXT_SQL = f"""
SELECT
  review_id,
  review_score,
  NULLIF(TRIM(review_comment_title),   '') AS title,
  NULLIF(TRIM(review_comment_message), '') AS message
FROM {DR}
QUALIFY ROW_NUMBER() OVER (
  PARTITION BY review_id ORDER BY review_answer_timestamp DESC
) = 1
"""
