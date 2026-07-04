/* Lesson 06 — P3b dbt Gold Mart + Snapshots */
window.TUTORIAL_LESSONS.push({
  id: 'dbt-gold',
  order: 6,
  track: 'technical',
  icon: '🥇',
  title: 'P3b · dbt Gold Mart — Star Schema & SCD2',
  subtitle: 'How the gold layer turns clean silver views into a queryable star schema: a fact_orders table at order-item grain, conformed dimensions with real joins and business logic, and dbt snapshots that capture slowly-changing history (SCD2) for reviews, products and geolocation.',
  minutes: 35,
  objectives: [
    'Explain a <strong>star schema</strong>: one central fact surrounded by conformed dimensions',
    'Read <code>fact_orders.sql</code>: its <strong>grain</strong> (order-item), measures, joins, dedup, validation and data-quality flags',
    'Describe each dimension and why some are plain tables while others are SCD2',
    'Understand dbt <strong>snapshots</strong> and the <code>timestamp</code> vs <code>check</code> strategy',
    'Run the gold layer yourself with <code>dbt snapshot</code> + <code>dbt build --select tag:gold_mart</code>'
  ],
  body: `
<h2>From silver views to a gold star schema</h2>
<p>Lesson 05 left us with nine clean <code>stg_*</code> views — one row per key, type-faithful, but with
<em>no joins and no business logic</em>. The <strong>gold</strong> layer (🥇, <code>models/gold_mart/</code>)
is where that business logic finally happens. It reshapes silver into a <strong>star schema</strong>: one
central <strong>fact</strong> table of measurable events, surrounded by <strong>dimension</strong> tables
that describe the "who / what / where" of each event.</p>

<div class="callout info">
<p><strong>Why a star schema?</strong> BI tools and analysts query a fact joined to a few dimensions. Keeping
measures in one narrow fact and descriptive attributes in dimensions makes those joins fast and the model
easy to reason about. Recall from Lesson 05 that gold is materialized as <strong>tables</strong>
(<code>+materialized: table</code>) so these reads are physical and quick.</p>
</div>

<div class="mermaid-wrap"><pre class="mermaid">
flowchart TB
  FACT["fact_orders<br/>grain: order-item<br/>(id, order_item_id)"]
  DC["dim_customers"]
  DP["dim_products (SCD2)"]
  DS["dim_sellers"]
  DR["dim_reviews (SCD2)"]
  DG["dim_geolocation (SCD2)"]
  DC --> FACT
  DP --> FACT
  DS --> FACT
  DR -. "order_id (warn)" .-> FACT
  DG --> DS
</pre></div>

<h2>fact_orders — the centre of the star</h2>
<p>The fact lives at <strong>order-item grain</strong>: <em>one row per line item</em>, with a composite
primary key <code>(id, order_item_id)</code>. That grain is a deliberate choice — an order with three
products becomes three fact rows, so per-item measures like <code>price</code> and <code>freight_value</code>
stay additive.</p>

<div class="file-ref">📄 p3_dbt_project/brazil_ecommerce/models/gold_mart/fact_orders.sql</div>
<pre><code class="language-sql">WITH orders AS (
    SELECT TRIM(CAST(order_id AS STRING)) AS order_id,
           TRIM(CAST(customer_id AS STRING)) AS customer_id,
           order_status, order_purchase_timestamp, order_approved_at,
           order_delivered_carrier_date, order_delivered_customer_date,
           order_estimated_delivery_date
    FROM {{ ref('stg_orders') }}
    WHERE order_id IS NOT NULL AND customer_id IS NOT NULL
),
items AS (
    SELECT TRIM(CAST(order_id AS STRING)) AS order_id,
           CAST(order_item_id AS INT64) AS order_item_id,
           TRIM(CAST(product_id AS STRING)) AS product_id,
           TRIM(CAST(seller_id AS STRING)) AS seller_id,
           shipping_limit_date, CAST(price AS FLOAT64) AS price,
           CAST(freight_value AS FLOAT64) AS freight_value
    FROM {{ ref('stg_order_items') }}
    WHERE order_id IS NOT NULL AND order_item_id IS NOT NULL
      AND seller_id IS NOT NULL AND product_id IS NOT NULL
),
payments AS ( SELECT ... FROM {{ ref('stg_order_payments') }} )</code></pre>

<p>Three silver models are pulled in via <code>ref()</code> — orders, order_items and order_payments — each
cast to a clean type. Then they are joined and the result is shaped:</p>

<pre><code class="language-sql">joined AS (
    SELECT
        o.order_id AS id,
        o.customer_id,
        -- Default a missing status, then standardise case.
        LOWER(COALESCE(o.order_status, 'unavailable')) AS order_status,
        i.order_item_id, i.product_id, i.seller_id, i.price, i.freight_value,
        p.payment_sequential,
        -- Replace null payment_type with the accepted 'not_defined' value.
        LOWER(COALESCE(p.payment_type, 'not_defined')) AS payment_type,
        p.payment_installments, p.payment_value,
        ROW_NUMBER() OVER (
            PARTITION BY o.order_id, COALESCE(i.order_item_id, 0)
            ORDER BY o.customer_id
        ) AS row_num
    FROM orders o
    LEFT JOIN items i    ON o.order_id = i.order_id
    LEFT JOIN payments p ON o.order_id = p.order_id
)</code></pre>

<p>Notice the <strong>LEFT JOIN</strong>s from orders: an order with no matching line item still produces a
fact row (with null <code>order_item_id</code> / <code>seller_id</code> / <code>product_id</code>). The
<code>COALESCE(i.order_item_id, 0)</code> inside the <code>PARTITION BY</code> lets the dedup
<code>ROW_NUMBER()</code> work even for those item-less orders.</p>

<h3>Validation, then data-quality flags</h3>
<p>After deduping to <code>row_num = 1</code>, a <code>validated</code> CTE nulls out implausible money rather
than dropping rows, and the final <code>SELECT</code> derives seven boolean <strong>data-quality flag</strong>
columns:</p>

<pre><code class="language-sql">-- Null-out implausible monetary values rather than dropping the row.
CASE WHEN price &lt;= 0 THEN NULL ELSE price END               AS price,
CASE WHEN freight_value &lt; 0 THEN NULL ELSE freight_value END AS freight_value,
...
-- Delivered before it was purchased.
order_delivered_customer_date &lt; order_purchase_timestamp     -&gt; has_invalid_delivery_date
-- Estimated delivery passed but order never delivered.
CURRENT_TIMESTAMP() &gt; order_estimated_delivery_date ...       -&gt; is_overdue_delivery
price &gt; 10000                                                 -&gt; is_high_value_product
status='delivered' AND no delivery date                       -&gt; has_missing_delivery_date
DATE_DIFF(delivered, purchased, DAY) &gt; 30                     -&gt; is_long_delivery
payment_type='not_defined' OR payment_value IS NULL           -&gt; has_missing_payment_info
order_item_id IS NULL                                         -&gt; has_no_items</code></pre>

<div class="callout info">
<p><strong>Flags don't drop rows — they label them.</strong> Instead of silently filtering out a weird order,
the fact keeps the row and marks <em>why</em> it's suspect. Lesson 07 (Data Quality) and the BI layer can
then count, filter, or alert on these flags. That is the whole reason business logic lives in gold, not
silver: silver must stay a faithful 1:1 mirror of bronze.</p>
</div>

<h2>The dimensions</h2>
<p>Five dimension models describe the fact. Two are plain tables; three carry SCD2 history (next section).</p>

<table>
  <tr><th>Dimension</th><th>PK</th><th>Built from</th><th>Logic</th></tr>
  <tr><td><code>dim_customers</code></td><td><code>id</code> (customer_id)</td><td><code>stg_customers</code></td><td>Straight projection — customer_unique_id, city, state, zip prefix.</td></tr>
  <tr><td><code>dim_sellers</code></td><td><code>id</code> (seller_id)</td><td><code>stg_sellers</code> ⋈ <code>stg_geolocation</code></td><td>LEFT JOIN one lat/lng per zip. stg_geolocation is already one row per zip, so it does not fan out.</td></tr>
  <tr><td><code>dim_products</code></td><td><code>dbt_scd_id</code></td><td><code>products_snapshot</code> ⋈ translation</td><td>SCD2; joins Portuguese→English category name.</td></tr>
  <tr><td><code>dim_reviews</code></td><td><code>dbt_scd_id</code></td><td><code>reviews_dbt_scd_snapshot</code></td><td>SCD2; one row per review version.</td></tr>
  <tr><td><code>dim_geolocation</code></td><td><code>dbt_scd_id</code></td><td><code>geolocation_dbt_scd_snapshot</code></td><td>SCD2; one row per zip-prefix version.</td></tr>
</table>

<p>The seller join is a good "gold does the joins" example — and a reminder of <em>why</em> silver deduped
geolocation to one current row per zip:</p>

<div class="file-ref">📄 models/gold_mart/dim_sellers.sql</div>
<pre><code class="language-sql">SELECT
    s.seller_id AS id,
    s.seller_zip_code_prefix, s.seller_city, s.seller_state,
    g.geolocation_lat, g.geolocation_lng, g.geolocation_city, g.geolocation_state
FROM {{ ref('stg_sellers') }} s
LEFT JOIN {{ ref('stg_geolocation') }} g
    ON s.seller_zip_code_prefix = g.geolocation_zip_code_prefix</code></pre>

<h2>dbt snapshots = SCD2 history</h2>
<p>A dimension attribute can change over time — a product gets re-categorised, a review answer is edited. A
plain table only ever shows the <em>current</em> value; the past is lost. A <strong>Slowly Changing
Dimension Type 2 (SCD2)</strong> keeps a new row each time an attribute changes, with validity ranges, so you
can ask "what category did this product have <em>at the time</em> of that order?"</p>

<p>dbt implements SCD2 with <strong>snapshots</strong> — special models in <code>snapshots/</code> that dbt
re-reads each run, detects changes, and maintains three columns automatically:</p>
<ul>
  <li><code>dbt_valid_from</code> / <code>dbt_valid_to</code> — the validity window (current row has
  <code>dbt_valid_to IS NULL</code>).</li>
  <li><code>dbt_scd_id</code> — a surrogate key, <strong>unique per version</strong>. This becomes the
  dimension's <code>id</code> primary key.</li>
</ul>

<div class="callout info">
<p><strong>Business key vs surrogate key.</strong> In <code>dim_reviews</code> the surrogate
<code>dbt_scd_id</code> is the unique PK (one per version), while <code>review_id</code> / <code>order_id</code>
are <em>business keys</em> that are deliberately <strong>not unique</strong> — that is how history is preserved.
The fact joins on the business key (<code>order_id</code>), and <code>is_current</code> picks the live version.</p>
</div>

<h3>Two strategies: timestamp vs check</h3>
<p>A snapshot must know <em>how</em> to detect a change. dbt offers two strategies, and this project uses both:</p>

<p><strong>1. <code>timestamp</code> strategy</strong> — trust an <code>updated_at</code>-style column. A newer
timestamp means "this changed". Reviews and geolocation use it:</p>
<div class="file-ref">📄 snapshots/reviews_dbt_scd_snapshot.sql</div>
<pre><code class="language-sql">{{
  config(
    target_schema='snapshots',
    unique_key='review_id',
    strategy='timestamp',
    updated_at='review_answer_timestamp'
  )
}}
SELECT review_id, order_id, review_score, review_comment_title,
       review_comment_message, review_creation_date, review_answer_timestamp
FROM {{ ref('stg_order_reviews') }}</code></pre>

<p><strong>2. <code>check</code> strategy</strong> — no reliable timestamp, so compare a list of columns
row-by-row; if any differs, record a new version. Products use it:</p>
<div class="file-ref">📄 snapshots/products_snapshot.sql</div>
<pre><code class="language-sql">{{
  config(
    target_schema='snapshots',
    unique_key='product_id',
    strategy='check',
    check_cols=[
      'product_category_name', 'product_name_lenght',
      'product_description_lenght', 'product_photos_qty',
      'product_weight_g', 'product_length_cm',
      'product_height_cm', 'product_width_cm'
    ]
  )
}}
SELECT product_id, product_category_name, ... FROM {{ source('brazil_ecommerce', 'olist_products_raw') }}</code></pre>

<div class="callout tip">
<p><strong>💡 Why these three get history.</strong> <em>Reviews</em> can be re-answered/edited;
<em>products</em> can be re-categorised or re-measured; <em>geolocation</em> arrives append-only from EL
(Lesson 03) and genuinely accumulates versions. Customers and sellers are treated as stable, so they stay
plain tables. History is added only where it earns its keep.</p>
</div>

<h3>Snapshot the silver model, not raw bronze</h3>
<p>Note that <code>reviews_dbt_scd_snapshot</code> and <code>geolocation_dbt_scd_snapshot</code> read
<code>{{ ref('stg_...') }}</code>, not bronze. That is essential for geolocation: raw
<code>olist_geolocation_raw</code> has no natural key (many points per zip, append-only), but
<code>stg_geolocation</code> collapses to one current row per <code>geolocation_zip_code_prefix</code> — giving
the <code>unique_key</code> a snapshot requires.</p>

<div class="callout info">
<p><strong>Two review snapshots, one design lesson.</strong> The repo also keeps
<code>reviews_snapshot.sql</code>, which hand-builds its own start/end ranges with window functions. The
<code>reviews_dbt_scd_snapshot.sql</code> shows the better way — return the <em>current</em> state and let dbt
manage <code>dbt_valid_from</code>/<code>to</code>/<code>scd_id</code> for you. The hand-rolled version is a
nice "before" picture of why dbt's snapshot machinery exists.</p>
</div>

<h3>dim_products: snapshot + translation join</h3>
<div class="file-ref">📄 models/gold_mart/dim_products.sql</div>
<pre><code class="language-sql">SELECT
    p.dbt_scd_id AS surrogate_key,
    p.product_id,
    t.product_category_name_english AS product_category,
    p.product_weight_g, p.product_length_cm, ...,
    p.dbt_valid_from AS valid_from,
    p.dbt_valid_to   AS valid_to,
    CASE WHEN p.dbt_valid_to IS NULL THEN TRUE ELSE FALSE END AS is_current
FROM {{ ref('products_snapshot') }} p
LEFT JOIN {{ ref('stg_product_category_translation') }} t
    ON p.product_category_name = t.product_category_name</code></pre>
<p>This is the gold pattern in one model: read the SCD2 snapshot, join the translation lookup to swap the
Portuguese category for English, expose <code>valid_from</code>/<code>valid_to</code>/<code>is_current</code>.</p>

<h2>Building the gold layer</h2>
<p>Gold needs two dbt verbs. <code>dbt snapshot</code> refreshes the SCD2 tables; then
<code>dbt build --select tag:gold_mart</code> builds the marts (and runs their tests — Lesson 07).</p>

<pre><code class="language-bash">cd p3_dbt_project/brazil_ecommerce
set -a &amp;&amp; source ../../.env.dev &amp;&amp; set +a

# 1. refresh SCD2 history (must run before the dims that ref the snapshots)
dbt snapshot

# 2. build the gold marts + run their tests, in DAG order
dbt build --select tag:gold_mart

# verify: fact_orders + 5 dim_* tables
bq ls olist_gold_mart_dev</code></pre>

<div class="callout warn">
<p><strong>⚠️ Order matters.</strong> <code>dim_products</code>, <code>dim_reviews</code> and
<code>dim_geolocation</code> <code>ref()</code> snapshot tables, so <code>dbt snapshot</code> must run first or
those dims build on stale (or missing) history. In the nightly Dagster run the snapshot step is wired ahead of
the gold build for exactly this reason — the same tag selector (<code>tag:gold_mart</code>) Dagster uses for
the gold step.</p>
</div>
`,
  steps: [
    'Open <code>models/gold_mart/fact_orders.sql</code> and identify the grain — what makes one row? (composite PK <code>id, order_item_id</code>)',
    'Find the <code>LOWER(COALESCE(...))</code> calls and explain how missing <code>order_status</code> and <code>payment_type</code> are defaulted',
    'List the seven data-quality flag columns and the condition behind <code>is_long_delivery</code>',
    'Open <code>snapshots/products_snapshot.sql</code> — why does it use <code>strategy=check</code> instead of <code>timestamp</code>?',
    'Open <code>snapshots/geolocation_dbt_scd_snapshot.sql</code> and explain why it snapshots <code>stg_geolocation</code> rather than the raw bronze table',
    'In <code>dim_reviews.sql</code>, identify the surrogate PK vs the business keys and what <code>is_current</code> means',
    'Optional (needs GCP creds): source <code>.env.dev</code>, run <code>dbt snapshot</code> then <code>dbt build --select tag:gold_mart</code>, then <code>bq ls olist_gold_mart_dev</code>'
  ],
  quiz: [
    {
      q: 'What is the grain (one row =) of fact_orders?',
      options: [
        'One row per order',
        'One row per order line item — composite PK (id, order_item_id)',
        'One row per customer'
      ],
      answer: 1,
      explain: 'fact_orders is at order-item grain: schema.yml enforces dbt_utils.unique_combination_of_columns on (id, order_item_id). An order with three items produces three fact rows, keeping per-item price and freight_value additive.'
    },
    {
      q: 'Why are some dimensions (products, reviews, geolocation) built from dbt snapshots while customers and sellers are plain tables?',
      options: [
        'Snapshots are faster to query than tables',
        'Those three attributes change over time and need SCD2 history (validity ranges + a surrogate key per version); customers/sellers are treated as stable',
        'dbt requires every dimension joined to a fact to be a snapshot'
      ],
      answer: 1,
      explain: 'Reviews can be re-answered, products re-categorised, and geolocation arrives append-only — all need history. A snapshot keeps a new row per change with dbt_valid_from/to and a unique dbt_scd_id. Customers and sellers are stable, so they stay plain projections.'
    },
    {
      q: 'What is the difference between the timestamp and check snapshot strategies?',
      options: [
        'timestamp detects change from an updated_at column; check compares a list of columns row-by-row and records a new version if any differs',
        'timestamp is for tables and check is for views',
        'check is faster but only works on numeric columns'
      ],
      answer: 0,
      explain: 'reviews/geolocation use strategy=timestamp with updated_at (review_answer_timestamp / updated_at). products has no reliable timestamp, so it uses strategy=check with check_cols listing the attributes whose change should create a new version.'
    },
    {
      q: 'Why does the geolocation snapshot read stg_geolocation instead of the raw bronze table?',
      options: [
        'Bronze is encrypted',
        'Raw olist_geolocation_raw has no natural key (many points per zip, append-only); stg_geolocation collapses to one current row per zip, giving the unique_key a snapshot requires',
        'The raw table is in a different GCP project'
      ],
      answer: 1,
      explain: 'A snapshot needs a unique_key. The append-only raw geolocation has many rows per zip prefix and no key, but the silver view dedups to one current row per geolocation_zip_code_prefix — exactly the unique key the timestamp-strategy snapshot needs.'
    }
  ]
});
