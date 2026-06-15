/* Lesson 11 — B2 KPIs & Metrics */
window.TUTORIAL_LESSONS.push({
  id: 'kpis',
  order: 11,
  track: 'business',
  icon: '📈',
  title: 'B2 · KPIs & Metrics — What We Measure',
  subtitle: 'The core marketplace KPIs — GMV, AOV, repeat rate, reviews, delivery-vs-estimate — how they’re computed in SQL against the gold mart, and the smoking-gun metric that links delivery to retention.',
  minutes: 25,
  objectives: [
    'Define the core KPIs: GMV, order volume, AOV, repeat-purchase rate, review distribution, delivery-vs-estimate, freight, category mix, geographic spread',
    'Read the one BigQuery query that feeds every KPI, and see why it collapses items to one row per order',
    'Compute the true repeat rate on <code>customer_unique_id</code> and read the headline value',
    'Read the "smoking gun" table linking late delivery to review score and reorder likelihood'
  ],
  body: `
<h2>The KPI catalogue</h2>
<p>These are the metrics the BI apps put in front of executives. Every one of them is derived from a
<em>single</em> query against the gold mart plus a thin pandas layer (covered below). The values shown are the
team's actual EDA outputs, not estimates.</p>

<table>
  <tr><th>KPI</th><th>Definition</th><th>Observed value</th></tr>
  <tr><td><strong>GMV (revenue)</strong></td><td>Σ <code>price</code> at item grain (product revenue; freight reported separately)</td><td>Grew <strong>~610%</strong> Jan-2017 → Aug-2018, then plateaued</td></tr>
  <tr><td><strong>Order volume</strong></td><td>Distinct orders (items collapsed to order grain first)</td><td><strong>99,441</strong> orders</td></tr>
  <tr><td><strong>AOV</strong> (avg order value)</td><td>GMV ÷ order volume</td><td>Derived per filter in the apps</td></tr>
  <tr><td><strong>Repeat-purchase rate</strong></td><td>Share of <code>customer_unique_id</code> with &gt;1 order</td><td><strong>3.1%</strong> (2,997 of 96,096 customers)</td></tr>
  <tr><td><strong>Review distribution</strong></td><td>Count of orders by 1–5★ score</td><td>Avg <strong>4.09★</strong>; <strong>14.6%</strong> are 1–2★</td></tr>
  <tr><td><strong>Delivery vs estimate</strong></td><td><code>delivered_date − estimated_date</code>; "late" = &gt; 0 days</td><td><strong>8.1%</strong> of delivered orders late; median lead time <strong>10 days</strong></td></tr>
  <tr><td><strong>Freight</strong></td><td>Σ <code>freight_value</code>, kept separate from GMV</td><td>Reported alongside GMV</td></tr>
  <tr><td><strong>Category mix</strong></td><td>GMV by English <code>product_category</code> (Pareto)</td><td>Top categories concentrate revenue</td></tr>
  <tr><td><strong>Geographic spread</strong></td><td>Late-rate / volume by <code>customer_state</code></td><td>Lateness concentrates in specific states</td></tr>
</table>

<h2>One query feeds them all</h2>
<p>The team made a deliberate design choice (documented in <code>queries.py</code>): rather than many
pre-aggregated cubes — which break distinct-count metrics like repeat rate once you filter — pull <em>one</em>
order-grain result set and derive everything in pandas. Here is the core of that query against the gold mart:</p>

<div class="file-ref">📄 p5_analytics/dash/queries.py · p5_analytics/streamlit/queries.py</div>
<pre><code class="language-sql">-- One row per ORDER. fact_orders is at the item grain, so we GROUP BY id
-- and collapse: GMV = SUM(price), freight = SUM(freight_value), status/timestamps
-- are constant within an order so ANY_VALUE() is safe.
WITH ord AS (
  SELECT
    id                                       AS order_id,
    ANY_VALUE(customer_id)                   AS customer_id,
    ANY_VALUE(order_status)                  AS order_status,
    ANY_VALUE(order_purchase_timestamp)      AS purchase_ts,
    ANY_VALUE(order_delivered_customer_date) AS delivered_ts,
    ANY_VALUE(order_estimated_delivery_date) AS estimated_ts,
    SUM(price)                               AS gmv,
    SUM(freight_value)                       AS freight,
    COUNT(*)                                 AS n_items
  FROM fact_orders
  WHERE order_purchase_timestamp IS NOT NULL
  GROUP BY id
)
SELECT
  o.*,
  c.customer_unique_id,                       -- the per-PERSON key (repeat analysis)
  c.customer_state,
  r.review_score,
  CASE WHEN o.delivered_ts IS NOT NULL AND o.estimated_ts IS NOT NULL
       THEN DATE_DIFF(DATE(o.delivered_ts), DATE(o.estimated_ts), DAY)
  END AS days_vs_estimate                     -- &gt; 0 means LATE
FROM ord o
LEFT JOIN dim_customers c ON o.customer_id = c.id
LEFT JOIN dim_reviews   r ON o.order_id    = r.id</code></pre>

<div class="callout tip">
<p><strong>Two ideas to take away.</strong> (1) Always collapse <code>fact_orders</code> from item grain to order
grain <em>before</em> counting orders or summing revenue. (2) The join to <code>dim_customers</code> is what
brings in <code>customer_unique_id</code> — without it you cannot compute a correct repeat rate.</p>
</div>

<h2>How the headline KPIs are computed</h2>
<p>The query result becomes a DataFrame; <code>kpis()</code> in <code>metrics.py</code> derives the headline tiles.
Note the repeat rate: it groups on <code>customer_unique_id</code> and counts how many people have more than one
distinct order — the correct per-person definition from Lesson B1:</p>

<div class="file-ref">📄 p5_analytics/dash/metrics.py — kpis()</div>
<pre><code class="language-python">gmv          = df["gmv"].sum()
n_orders     = df["order_id"].nunique()
n_customers  = df["customer_unique_id"].nunique()

# Repeat-purchase rate: people with MORE THAN ONE order, over all people.
repeat_customers = df.groupby("customer_unique_id")["order_id"].nunique().gt(1).sum()
repeat_rate      = repeat_customers / n_customers

aov          = gmv / n_orders
deliv        = df[df["is_delivered"] &amp; df["days_vs_estimate"].notna()]
on_time_rate = (deliv["days_vs_estimate"] &lt;= 0).mean()   # &lt;= 0 days = on time/early
avg_review   = df["review_score"].mean()
avg_lead     = df.loc[df["delivery_days"].notna(), "delivery_days"].mean()</code></pre>

<p>Plug in the warehouse numbers and the story is unambiguous: <strong>96,096</strong> unique customers placed
<strong>99,441</strong> orders, so almost every customer bought exactly once. Only <strong>2,997 (3.1%)</strong>
ever reordered.</p>

<h2>Repeat rate, written as SQL</h2>
<p>If you'd rather see the repeat rate as one self-contained query against the gold mart, it's a two-step count —
first the per-person order counts, then the share with more than one:</p>

<pre><code class="language-sql">WITH per_person AS (
  SELECT c.customer_unique_id,
         COUNT(DISTINCT f.id) AS orders
  FROM fact_orders f
  JOIN dim_customers c ON f.customer_id = c.id
  GROUP BY c.customer_unique_id
)
SELECT
  COUNT(*)                                            AS customers,
  COUNTIF(orders &gt; 1)                                 AS repeat_customers,
  SAFE_DIVIDE(COUNTIF(orders &gt; 1), COUNT(*))          AS repeat_rate
FROM per_person;
-- customers = 96,096 · repeat_customers = 2,997 · repeat_rate ≈ 0.031</code></pre>

<h2>The smoking gun: delivery → reviews → reorder</h2>
<p>The KPIs above describe the business; this is the metric that <em>diagnoses</em> it. Splitting orders by
on-time vs late delivery and comparing review scores (from the EDA results) shows late delivery roughly
<strong>halves</strong> the review score:</p>

<table>
  <tr><th>Delivery</th><th>n</th><th>Avg review</th><th>% 1–2★ (detractors)</th><th>% 4–5★ (promoters)</th></tr>
  <tr><td><strong>On-time</strong></td><td>87,708</td><td><strong>4.30</strong></td><td>9.2%</td><td>82.9%</td></tr>
  <tr><td><strong>Late</strong></td><td>7,615</td><td><strong>2.57</strong></td><td>54.0%</td><td>34.7%</td></tr>
</table>

<p>A late delivery drops the score by about <strong>−1.7★</strong> and flips the majority of those customers into
detractors. And the loop closes on retention: customers whose <em>first</em> order arrived on-time reorder at
<strong>3.13%</strong> vs <strong>2.56%</strong> for a late first order — low everywhere (Olist is structurally
one-shot), but the direction is unambiguous, and repeat rate rises monotonically with first-order review score.</p>

<p>The metrics layer computes this directly, bucketing delivery by lateness and measuring whether each order was
followed by another from the same person:</p>

<div class="file-ref">📄 p5_analytics/dash/metrics.py — reorder_by_delivery_bucket()</div>
<pre><code class="language-python"># has_subsequent_order: did this customer_unique_id place a LATER order?
orders["has_subsequent_order"] = orders["order_seq"] &lt; orders["cust_total_orders"]

d = df.dropna(subset=["delivery_bucket"])
g = d.groupby("delivery_bucket").agg(
        reorder_rate=("has_subsequent_order", "mean"),
        orders=("order_id", "nunique"),
).reindex(DELIVERY_BUCKETS)        # Early/on-time · 1-3 · 4-7 · 8+ days late</code></pre>

<div class="callout info">
<p><strong>What the metrics add up to.</strong> GMV is real but acquisition-funded; retention is the constraint;
late delivery is the mechanism converting a paying customer into a detractor who never returns. The CMO's
"non-sticky brand" and the CEO's "soft margins" are <em>downstream symptoms</em> of a logistics problem the CTO
already owns — and the recommendation is to treat on-time delivery as a <strong>revenue KPI</strong>, targeting
the worst states by late-rate × volume.</p>
</div>

<div class="callout warn">
<p><strong>⚠️ One metric, one definition.</strong> GMV is always Σ<code>price</code> at item grain with freight
kept separate; "late" is always <code>days_vs_estimate &gt; 0</code> on delivered orders; repeat rate always keys
on <code>customer_unique_id</code>. The shared bucket constants in <code>metrics.py</code>
(<code>DELIVERY_BUCKETS</code>, <code>REVIEW_BUCKETS</code>) exist precisely so every chart and every exec reads
the same definition.</p>
</div>
`,
  steps: [
    'Open <code>p5_analytics/dash/queries.py</code> and trace how <code>fact_orders</code> (item grain) is collapsed to one row per order in the <code>ord</code> CTE',
    'In <code>p5_analytics/dash/metrics.py</code>, read <code>kpis()</code> and find the repeat-rate line keyed on <code>customer_unique_id</code>',
    'Confirm GMV = SUM(price) and that freight is summed separately, not added into GMV',
    'Read <code>review_by_delivery_bucket()</code> and <code>reorder_by_delivery_bucket()</code> — the delivery → reviews → reorder chain',
    'Check the EDA results (<code>eda-plan-result.md</code> §B.1) and match the on-time vs late review table (4.30 vs 2.57) to the metrics code'
  ],
  quiz: [
    {
      q: 'How is GMV defined in this project, and where does freight go?',
      options: [
        'GMV = SUM(price) + SUM(freight_value) combined into one revenue figure',
        'GMV = SUM(price) at item grain; freight (SUM(freight_value)) is reported separately, not folded into GMV',
        'GMV = AOV × number of customers'
      ],
      answer: 1,
      explain: 'The query and EDA assumptions both define GMV as Σ price at item grain (product revenue), with freight summed and reported separately. Mixing freight into GMV would distort the revenue trend and AOV.'
    },
    {
      q: 'Why does the orders query GROUP BY id (order) before computing KPIs?',
      options: [
        'Because fact_orders is at the order-ITEM grain (113,425 rows for 99,441 orders); collapsing to order grain prevents double-counting multi-item orders',
        'To remove cancelled orders from the dataset',
        'Because BigQuery requires a GROUP BY on every SELECT'
      ],
      answer: 0,
      explain: 'fact_orders has one row per item. Summing price gives order GMV and ANY_VALUE pulls the order-constant fields. Without this collapse, an order with 3 items would be counted 3 times in order volume and customer counts.'
    },
    {
      q: 'What does the on-time vs late review comparison show?',
      options: [
        'Late and on-time orders get roughly the same review scores',
        'On-time orders average ~4.30★ while late orders average ~2.57★ — late delivery roughly halves the score and turns most of those customers into detractors',
        'Late orders get higher reviews because customers are grateful the order arrived at all'
      ],
      answer: 1,
      explain: 'The EDA smoking-gun table: on-time avg 4.30★ (9.2% detractors) vs late avg 2.57★ (54.0% detractors). The ~−1.7★ swing, plus the lower reorder rate after a late first order, is the delivery → reviews → retention mechanism the project is built to prove.'
    }
  ]
});
