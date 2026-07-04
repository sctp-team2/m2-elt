/* Lesson 04 — P2 Warehouse Design */
window.TUTORIAL_LESSONS.push({
  id: 'warehouse-design',
  order: 4,
  track: 'technical',
  icon: '🏛️',
  title: 'P2 · Warehouse Design — The Star Schema Contract',
  subtitle: 'Dimensional modelling for the Olist marketplace: facts vs dimensions, the grain of fact_orders, SCD2 for the dims that change, and why p2 is a design contract that p3 builds and p4 validates — not a runtime step.',
  minutes: 30,
  objectives: [
    'Explain the difference between a <strong>fact</strong> and a <strong>dimension</strong>, and why a star schema beats one wide table',
    'State the <strong>grain</strong> of <code>fact_orders</code> and why the composite key is <code>(id, order_item_id)</code>',
    'Name the five dimensions and explain which are <strong>SCD2</strong> (history-tracked) and why',
    'Distinguish <strong>surrogate</strong> from <strong>natural</strong> keys and where each appears in the model',
    'Understand that p2 is a <em>design contract</em>: p3 implements it, p4 validates it, and it never runs at night'
  ],
  body: `
<h2>What problem does Warehouse Design solve?</h2>
<p>Bronze gives you nine raw tables that mirror the source. That is great for replay, but it is a terrible
shape to <em>query</em>: to answer "monthly revenue by product category and customer state" you would
join orders → items → products → category-translation → customers, every single time, in every dashboard.
Module 2 (<code>p2_warehouse_design/</code>) fixes that by designing a <strong>star schema</strong> — the
agreed-upon shape of the gold layer — <em>before</em> a single gold model is written.</p>

<div class="callout info">
<p><strong>p2 is design, not build.</strong> Its own README says it plainly:
<em>"This folder is the design, not the build — it defines the contract everyone downstream depends on."</em>
The deliverables are diagrams and a <code>star_schema.md</code> spec, not SQL. p3 (dbt) implements these
exact shapes, p4 writes tests against these columns and relationships, and p5 builds charts assuming the
mart columns exist. All three can work in parallel against the spec before p3 finishes building.</p>
</div>

<h2>Star schema 101: facts vs dimensions</h2>
<p>A star schema splits the world into two kinds of tables, arranged so a central fact is surrounded by
dimensions — the "star":</p>
<table>
  <tr><th></th><th>Fact table</th><th>Dimension table</th></tr>
  <tr><td>Answers</td><td>"What happened, how much?" — the measurable events</td><td>"Who / what / where?" — the descriptive context</td></tr>
  <tr><td>Contents</td><td>Numeric <em>measures</em> (price, freight, payment_value) + foreign keys</td><td>Attributes (customer city, product category, review score)</td></tr>
  <tr><td>Rows</td><td>Many — one per business event at the grain</td><td>Few(er) — one per entity (or per <em>version</em> of an entity)</td></tr>
  <tr><td>Here</td><td><code>fact_orders</code></td><td><code>dim_customers</code>, <code>dim_sellers</code>, <code>dim_products</code>, <code>dim_reviews</code>, <code>dim_geolocation</code></td></tr>
</table>
<p>Why not just one giant denormalized table? Because dimensions are shared and reusable — the same
<code>dim_products</code> serves revenue, delivery, and review analyses — and keeping descriptive
attributes out of the fact keeps the fact narrow, cheap to scan, and unambiguous about its grain.</p>

<div class="callout info">
<p><strong>A note on naming evolution.</strong> The p2 design summary sketched the model with classic
Kimball names (<code>dim_customer</code>, <code>fct_order_items</code>, a <code>dim_date</code>, and
consumer marts like <code>mart_customer_360</code>). What p3 actually shipped — and what p4 tests — is the
realized schema below: pluralized dims, <code>fact_orders</code>, and SCD2 dims for reviews and
geolocation. This lesson teaches the <em>built</em> contract (<code>models/gold_mart/schema.yml</code>),
because that is the one every downstream consumer depends on.</p>
</div>

<h2>The realized star: fact_orders + five dimensions</h2>
<div class="mermaid-wrap"><pre class="mermaid">
flowchart TB
  FACT["⭐ fact_orders<br/>grain: one order line item<br/>PK (id, order_item_id)"]
  DC["dim_customers<br/>PK id"]
  DS["dim_sellers<br/>PK id"]
  DP["dim_products<br/>PK id"]
  DR["dim_reviews · SCD2<br/>PK dbt_scd_id<br/>biz key order_id"]
  DG["dim_geolocation · SCD2<br/>PK dbt_scd_id<br/>biz key zip prefix"]
  FACT -->|customer_id| DC
  FACT -->|seller_id| DS
  FACT -->|product_id| DP
  FACT -->|id = order_id| DR
  DS -.zip prefix.-> DG
  DC -.zip prefix.-> DG
</pre></div>
<div class="file-ref">📄 p3_dbt_project/brazil_ecommerce/models/gold_mart/schema.yml — the contract this lesson reads from</div>

<h2>The grain of fact_orders</h2>
<p>The single most important decision in dimensional modelling is the <strong>grain</strong>: what one row
of the fact represents. The schema states it directly:
<em>"Order fact at order-item grain. Composite PK = (id, order_item_id)."</em></p>
<p>An Olist order can contain several line items (a customer buys three products in one order). Choosing the
<em>order-item</em> grain — not the order grain — means each product line gets its own row with its own
<code>price</code>, <code>freight_value</code>, <code>product_id</code> and <code>seller_id</code>. That is
why no single column is the primary key: uniqueness is the <em>combination</em> <code>(id, order_item_id)</code>,
enforced by a real test:</p>
<pre><code class="language-yaml">data_tests:
  - dbt_utils.unique_combination_of_columns:
      arguments:
        combination_of_columns:
          - id
          - order_item_id</code></pre>

<div class="callout warn">
<p><strong>⚠️ Grain edge case.</strong> A few orders have no line items at all. The design keeps them (flagged
<code>has_no_items = TRUE</code>) rather than dropping them, so <code>order_item_id</code>, <code>seller_id</code>
and <code>product_id</code> can be null on those rows. That is why the schema <em>intentionally omits</em>
<code>not_null</code> on <code>order_item_id</code> — a comment in the YAML says so explicitly. Honest grain
beats a tidy-looking one.</p>
</div>

<h2>The five dimensions</h2>
<table>
  <tr><th>Dimension</th><th>Primary key</th><th>Grain</th><th>Type</th></tr>
  <tr><td><code>dim_customers</code></td><td><code>id</code> (= customer_id)</td><td>one row per customer</td><td>simple (SCD1 — overwrite)</td></tr>
  <tr><td><code>dim_sellers</code></td><td><code>id</code> (= seller_id)</td><td>one row per seller (with geolocation)</td><td>simple (SCD1)</td></tr>
  <tr><td><code>dim_products</code></td><td><code>id</code> (= product_id)</td><td>one row per product (English category)</td><td>simple (SCD1)</td></tr>
  <tr><td><code>dim_reviews</code></td><td><code>dbt_scd_id</code> (surrogate)</td><td>one row per review <em>version</em></td><td><strong>SCD2</strong> — history</td></tr>
  <tr><td><code>dim_geolocation</code></td><td><code>dbt_scd_id</code> (surrogate)</td><td>one row per zip-prefix <em>version</em></td><td><strong>SCD2</strong> — history</td></tr>
</table>

<h2>Why SCD2 for reviews and geolocation?</h2>
<p>A <strong>Slowly Changing Dimension Type 2</strong> keeps history: when an attribute changes, instead of
overwriting the row, you close the old version (<code>dbt_valid_to</code> set) and insert a new one
(<code>dbt_valid_to IS NULL</code>). The dimension then holds <em>every</em> version, and a
<code>is_current</code> flag marks the live one.</p>
<p>Two dims earn SCD2 because their facts genuinely change over time and the change is analytically
interesting:</p>
<ul>
  <li><strong>dim_reviews</strong> — a buyer can update a review: a score or comment that changes after the
  fact. The schema describes it as <em>"Type-2 SCD from reviews_dbt_scd_snapshot, one row per review
  version."</em> Keeping versions lets you answer "did satisfaction improve after we responded?" rather
  than only seeing the final score.</li>
  <li><strong>dim_geolocation</strong> — recall from Lesson 03 that bronze loads geolocation
  <strong>append-only</strong> (it has no natural key, many lat/lng points per zip prefix). p2 formalizes
  that history into a snapshot: <em>"one row per zip-prefix version."</em></li>
</ul>
<p>By contrast, customers, sellers and products are modelled as simple <strong>SCD1</strong> dimensions —
the current attributes are what analysis needs, so the dim just carries one current row per entity.</p>

<div class="callout tip">
<p><strong>💡 Surrogate keys are the SCD2 tell.</strong> Because an SCD2 dim has many rows per business
entity, the business key alone is no longer unique. So the primary key becomes a generated
<strong>surrogate</strong> — dbt's <code>dbt_scd_id</code> — unique per <em>version</em>, while the
business key (<code>order_id</code> for reviews, <code>geolocation_zip_code_prefix</code> for geolocation)
is explicitly <strong>not unique</strong>. The schema documents exactly this: <em>"Business key — NOT
unique (history preserved)."</em></p>
</div>

<h2>Surrogate vs natural keys</h2>
<table>
  <tr><th></th><th>Natural key</th><th>Surrogate key</th></tr>
  <tr><td>Source</td><td>Comes from the business data</td><td>Generated by the warehouse</td></tr>
  <tr><td>Examples here</td><td><code>customer_id</code>, <code>product_id</code>, <code>seller_id</code>, <code>order_id</code></td><td><code>dbt_scd_id</code> on the two SCD2 dims</td></tr>
  <tr><td>Stays unique when…</td><td>the entity has exactly one version</td><td>the entity has many versions over time</td></tr>
</table>
<p>So the simple dims use their natural business id directly as <code>id</code>, while the SCD2 dims need a
surrogate because the natural key repeats across versions.</p>

<h2>The contract is the foreign keys and tests</h2>
<p>What makes this a <em>contract</em> and not just a diagram is that every relationship is a checkable
assertion. <code>fact_orders</code> declares its FKs back to the dims, and p4 enforces them:</p>
<pre><code class="language-yaml">- name: customer_id
  description: "FK to dim_customers."
  tests:
    - not_null
    - relationships:
        arguments:
          to: ref('dim_customers')
          field: id
- name: id
  description: "Part of the composite PK (order_id); FK to dim_reviews.order_id."
  tests:
    - relationships:
        arguments:
          to: ref('dim_reviews')
          field: order_id
        config:
          # Not every order has a review, so a missing match is expected.
          severity: warn</code></pre>
<p>Note the deliberate <code>severity: warn</code> on the optional relationships (reviews, products,
sellers): not every order has a review or a line item, so a missing match is a warning, not a failure.
The <em>required</em> FK to <code>dim_customers</code> is a hard error. Encoding that nuance in the design
is what lets p4 run as an automated gate.</p>

<h2>Where the design lands at runtime</h2>
<p>p2 itself never executes in the nightly run. But its decisions show up everywhere:</p>
<table>
  <tr><th>Module</th><th>Uses the p2 contract to…</th></tr>
  <tr><td><strong>p3</strong> dbt</td><td>build <code>stg_*</code> views and then the gold <code>dim_*</code> / <code>fact_orders</code> tables in exactly these shapes (incl. SCD2 snapshots)</td></tr>
  <tr><td><strong>p4</strong> quality</td><td>run the <code>unique</code> / <code>not_null</code> / <code>relationships</code> / <code>accepted_values</code> tests written against these columns</td></tr>
  <tr><td><strong>p5</strong> analytics</td><td>query <code>fact_orders</code> joined to the dims, trusting the grain and keys</td></tr>
</table>

<div class="callout info">
<p><strong>Data-quality flags live on the fact.</strong> Beyond measures and keys, <code>fact_orders</code>
carries boolean flags ported from the design — <code>has_invalid_delivery_date</code>,
<code>is_overdue_delivery</code>, <code>is_high_value_product</code>, <code>has_missing_delivery_date</code>,
<code>is_long_delivery</code>, <code>has_missing_payment_info</code>, <code>has_no_items</code>. They let
analysts filter out dirty rows without re-deriving the logic in every query — a small but real part of the
contract.</p>
</div>
`,
  steps: [
    'Open <code>p2_warehouse_design/README.md</code> and read the "Design summary" plus the line "This folder is the design, not the build"',
    'Open <code>p3_dbt_project/brazil_ecommerce/models/gold_mart/schema.yml</code> and find the <code>fact_orders</code> grain comment ("order-item grain. Composite PK = (id, order_item_id)")',
    'In that same file, find the two SCD2 dims and note their <code>dbt_scd_id</code> primary key and "Business key — NOT unique" comment',
    'Trace the <code>relationships</code> tests on <code>fact_orders</code> and note which use <code>severity: warn</code> and why',
    'Compare the README design summary names (<code>dim_customer</code>, <code>fct_order_items</code>) with the realized names (<code>dim_customers</code>, <code>fact_orders</code>) and note the evolution',
    'List the data-quality flag columns on <code>fact_orders</code> and explain what each lets an analyst skip'
  ],
  quiz: [
    {
      q: 'What is the grain of fact_orders, and why is its primary key composite?',
      options: [
        'One row per order; the key is just order_id',
        'One row per order line item; uniqueness is the combination (id, order_item_id) because an order can contain several items',
        'One row per customer; the key is customer_id plus order_id'
      ],
      answer: 1,
      explain: 'schema.yml states "Order fact at order-item grain. Composite PK = (id, order_item_id)." Because one order can have many line items, no single column is unique — dbt_utils.unique_combination_of_columns enforces uniqueness on the pair.'
    },
    {
      q: 'Why are dim_reviews and dim_geolocation modelled as SCD2 while dim_customers/sellers/products are not?',
      options: [
        'Their tables are larger, so SCD2 compresses them',
        'Their attributes genuinely change over time and the history is analytically useful (a review can be updated; geolocation is loaded append-only) — so versions are kept, while the simple dims just need the current row',
        'SCD2 is required for any dimension with a string primary key'
      ],
      answer: 1,
      explain: 'A review score/comment can change after the fact, and geolocation lands append-only with no natural key. Both are snapshotted into one-row-per-version SCD2 dims (is_current flags the live one). Customers, sellers and products only need current attributes, so they stay simple SCD1.'
    },
    {
      q: 'In an SCD2 dimension here, why is the primary key a surrogate (dbt_scd_id) instead of the natural business key?',
      options: [
        'Surrogate keys are always faster to join in BigQuery',
        'Because the dim holds many versions per entity, the business key (e.g. order_id) repeats and is NOT unique — so a generated key unique per version becomes the PK',
        'The natural key is hidden for security reasons'
      ],
      answer: 1,
      explain: 'schema.yml marks dbt_scd_id as "Surrogate primary key — unique per review version" and the business key as "NOT unique (history preserved)." With multiple versions per entity, only a per-version surrogate can be unique.'
    },
    {
      q: 'Why does p2 count as part of the pipeline architecture even though it never runs at night?',
      options: [
        'It is scheduled separately on weekends',
        'It is a design contract — the star-schema spec that p3 implements, p4 validates, and p5 builds charts against; all three depend on it but it produces docs, not runtime code',
        'It runs first every night before bronze loads'
      ],
      answer: 1,
      explain: 'The README calls it "the central contract." Its outputs are diagrams and star_schema.md. p3/p4/p5 can all work in parallel against the spec, and the FK/grain/key decisions become dbt models and tests — but the design folder itself does not execute in the nightly job.'
    }
  ]
});
