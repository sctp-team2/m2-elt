/* Lesson 05 — P3a dbt Stage Layer */
window.TUTORIAL_LESSONS.push({
  id: 'dbt-stage',
  order: 5,
  track: 'technical',
  icon: '🥈',
  title: 'P3a · dbt Stage Layer — Clean Silver Views',
  subtitle: 'What dbt is, how the brazil_ecommerce project is wired, and how the stage models turn raw bronze into clean silver views — dedup + type fidelity only, no joins, no business logic — routed to the right dataset by one macro.',
  minutes: 30,
  objectives: [
    'Explain what <strong>dbt</strong> is and how <code>ref()</code> / <code>source()</code> build a dependency graph',
    'Read the real project wiring: <code>dbt_project.yml</code>, <code>profiles.yml</code>, <code>packages.yml</code>, <code>sources.yml</code>',
    'Describe the one job of a stage model: <strong>dedup via QUALIFY ROW_NUMBER()</strong>, nothing more',
    'Understand how <code>generate_schema_name</code> routes models into <code>olist_stage_dev</code> vs <code>olist_stage</code>',
    'Run the silver layer yourself with <code>dbt build --select tag:stage</code>'
  ],
  body: `
<h2>What is dbt?</h2>
<p><strong>dbt</strong> (data build tool) is how the "T" in ELT happens. You write <code>SELECT</code>
statements as <code>.sql</code> files (called <em>models</em>); dbt wraps each in
<code>CREATE VIEW</code>/<code>CREATE TABLE</code>, sends it to the warehouse to execute, and figures out
the build order automatically. Crucially it does <em>not</em> have its own compute engine — BigQuery runs
every query. dbt is the authoring layer, version control, dependency graph, and test runner on top.</p>

<div class="callout info">
<p><strong>The magic is <code>ref()</code> and <code>source()</code>.</strong> Instead of hard-coding a
table name, a model says <code>{{ source('brazil_ecommerce', 'olist_orders_raw') }}</code> (a raw bronze
input) or <code>{{ ref('stg_orders') }}</code> (another model). dbt reads those Jinja calls to build a DAG,
so it always builds upstream before downstream and you never manage run order by hand.</p>
</div>

<h2>The project at a glance</h2>
<p>The dbt project lives at <code>p3_dbt_project/brazil_ecommerce/</code>. Its layout follows the medallion:</p>
<pre><code class="language-bash">brazil_ecommerce/
├── dbt_project.yml         # project config: materializations, schemas, tags
├── profiles.yml            # BigQuery connection (env-driven)
├── packages.yml            # dbt_utils + dbt_expectations
├── macros/
│   └── generate_schema_name.sql   # routes models to the right dataset
└── models/
    ├── stage/              # 🥈 silver: stg_* views (this lesson)
    │   ├── sources.yml     #   declares the 9 bronze raw tables
    │   ├── schema.yml      #   stg_* tests (unique, not_null)
    │   └── stg_*.sql       #   one view per bronze table
    └── gold_mart/          # 🥇 next lesson: dim_* + fact_orders tables</code></pre>

<h2>dbt_project.yml — materializations and tags</h2>
<p>The project config declares, per layer, <em>how</em> models are built and <em>where</em> they land. Note
the two layers get different materializations and tags:</p>
<div class="file-ref">📄 p3_dbt_project/brazil_ecommerce/dbt_project.yml</div>
<pre><code class="language-yaml">models:
  brazil_ecommerce:
    # Staging: thin 1:1 dedup of bronze. Views are cheap and always fresh.
    stage:
      +materialized: view
      +schema: "{{ env_var('BQ_STAGE_DATASET', 'olist_stage_dev') }}"
      +tags: ['stage']
    # Gold marts: physical tables for fast downstream reads (BI, analytics).
    gold_mart:
      +materialized: table
      +schema: "{{ env_var('BQ_GOLD_DATASET', 'olist_gold_mart_dev') }}"
      +tags: ['gold_mart']</code></pre>
<ul>
  <li><strong>Stage = <code>view</code></strong>. A view stores no data — it re-runs its SELECT on read. That
  is exactly right for silver: it is always fresh against bronze and costs nothing to "rebuild".</li>
  <li><strong>Gold = <code>table</code></strong>. The marts are physical tables so BI reads are fast.</li>
  <li><strong><code>+tags</code></strong> let you build a whole layer at once:
  <code>dbt build --select tag:stage</code> — which is exactly how Dagster runs the silver step.</li>
</ul>
<div class="callout info">
<p><strong>One subtle bug they fixed.</strong> A comment in the file warns that the top key
<em>must</em> equal the project <code>name:</code> (<code>brazil_ecommerce</code>). It was once
<code>brazil_ecommerce_proj</code>, which silently disabled every setting below it. Naming matters.</p>
</div>

<h2>profiles.yml — the BigQuery connection, env-driven</h2>
<p>Everything is parameterized so the same project runs locally, in Dagster, and on Cloud Run:</p>
<div class="file-ref">📄 p3_dbt_project/brazil_ecommerce/profiles.yml</div>
<pre><code class="language-yaml">brazil_ecommerce:
  outputs:
    dev:
      type: bigquery
      method: oauth     # resolves creds via google.auth.default()
      project: "{{ env_var('GCP_PROJECT', 'sctp-team2-project2-elt') }}"
      dataset: "{{ env_var('BQ_BRONZE_DATASET', 'olist_bronze_dev') }}"  # fallback only
      location: "{{ env_var('BQ_LOCATION', 'US') }}"
      threads: 4
  target: "{{ env_var('DBT_TARGET', 'dev') }}"</code></pre>
<p><code>method: oauth</code> honours both <code>GOOGLE_APPLICATION_CREDENTIALS</code> (a service-account
keyfile, used in Dagster/Cloud Run) and local <code>gcloud</code> ADC — so the same profile works in every
environment. The <code>dataset:</code> here is only a fallback; the real per-layer dataset comes from the
<code>+schema</code> settings above.</p>

<h2>packages.yml — standing on test libraries</h2>
<pre><code class="language-yaml">packages:
  - package: dbt-labs/dbt_utils
    version: 1.3.3
  - package: metaplane/dbt_expectations
    version: 0.10.10</code></pre>
<p>These two are pulled by <code>dbt deps</code> and power tests you saw in the gold contract:
<code>dbt_utils.unique_combination_of_columns</code> (the composite-key check on <code>fact_orders</code>)
and <code>dbt_expectations.expect_column_values_to_be_of_type</code> (type assertions). The stage layer
keeps it simpler — just built-in <code>unique</code> and <code>not_null</code>.</p>

<h2>sources.yml — declaring the bronze inputs</h2>
<p>Before a stage model can read bronze, dbt must know the bronze tables exist. <code>sources.yml</code>
declares all nine, pointing at the bronze dataset via the same env var the loader used:</p>
<div class="file-ref">📄 p3_dbt_project/brazil_ecommerce/models/stage/sources.yml</div>
<pre><code class="language-yaml">sources:
  - name: brazil_ecommerce
    database: "{{ env_var('GCP_PROJECT', 'sctp-team2-project2-elt') }}"
    schema: "{{ env_var('BQ_BRONZE_DATASET', 'olist_bronze_dev') }}"
    tables:
      - name: olist_customers_raw
        # ...columns documented...
      - name: olist_orders_raw
      - name: olist_order_items_raw
      # ...and the rest of the 9 olist_*_raw tables</code></pre>
<p>This is the seam from Lesson 03: because every load path lands the same <code>olist_*_raw</code> table
names, <code>sources.yml</code> never changes regardless of which EL tool ran. A stage model then reads a
source with <code>{{ source('brazil_ecommerce', 'olist_orders_raw') }}</code>.</p>

<h2>The stage model: one job, dedup</h2>
<p>A stage model is deliberately boring. The header of <code>schema.yml</code> states the whole philosophy:
<em>"Staging = 1:1 dedup of bronze. Tests assert each PK is unique + not_null, which is exactly what the
dedup guarantees. Business-logic tests live in gold_mart."</em> Here is a complete stage model:</p>
<div class="file-ref">📄 p3_dbt_project/brazil_ecommerce/models/stage/stg_orders.sql</div>
<pre><code class="language-sql">-- 1:1 dedup of bronze olist_orders_raw. One row per order_id (latest purchase).
SELECT *
FROM {{ source('brazil_ecommerce', 'olist_orders_raw') }}
QUALIFY ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY order_purchase_timestamp DESC) = 1</code></pre>
<p>That is the entire model. The <strong>QUALIFY ROW_NUMBER()</strong> pattern is the heart of the silver
layer:</p>
<ul>
  <li><code>PARTITION BY order_id</code> — group all rows that share the primary key.</li>
  <li><code>ORDER BY order_purchase_timestamp DESC</code> — rank within the group, newest first.</li>
  <li><code>QUALIFY … = 1</code> — keep only rank 1, i.e. the latest version of each key.</li>
</ul>
<p>The result: exactly one row per <code>order_id</code>, which is precisely what
<code>schema.yml</code> then asserts with <code>tests: [unique, not_null]</code>. Bronze can hold
duplicates (append-only loads, re-runs) — the stage view collapses them so gold gets clean keys.</p>

<div class="callout info">
<p><strong>Why <code>QUALIFY</code> and not a subquery?</strong> <code>QUALIFY</code> is BigQuery's filter
on the result of a window function — like a <code>WHERE</code> for <code>ROW_NUMBER()</code>. It keeps the
model to a single readable SELECT instead of a nested "rank then filter" subquery.</p>
</div>

<h2>Type fidelity, not transformation</h2>
<p>Note what the model does <em>not</em> do: no joins, no renames, no derived columns, no business logic —
it is <code>SELECT *</code>. Correct column <em>types</em> are inherited from how bronze was loaded
(BigQuery load jobs / target-bigquery infer schema), so silver mostly preserves type fidelity rather than
re-casting. Anything richer — coalescing payment types, deriving delivery flags, joining the
category-translation — is gold's job, in the next lesson.</p>

<h2>Two models worth a closer look</h2>
<p><strong>Reviews</strong> dedup on <code>review_id</code>, keeping the latest answer:</p>
<div class="file-ref">📄 models/stage/stg_order_reviews.sql</div>
<pre><code class="language-sql">SELECT *
FROM {{ source('brazil_ecommerce', 'olist_order_reviews_raw') }}
QUALIFY ROW_NUMBER() OVER (PARTITION BY review_id ORDER BY review_answer_timestamp DESC) = 1</code></pre>
<p><strong>Geolocation</strong> is the special case. Bronze holds many lat/lng points per zip prefix
<em>and</em>, because it is loaded append-only, multiple historical versions. The stage view collapses it to
one current row per zip so downstream joins don't fan out:</p>
<div class="file-ref">📄 models/stage/stg_geolocation.sql</div>
<pre><code class="language-sql">SELECT *
FROM {{ source('brazil_ecommerce', 'olist_geolocation_raw') }}
QUALIFY ROW_NUMBER() OVER (
    PARTITION BY geolocation_zip_code_prefix
    ORDER BY updated_at DESC, _sdc_batched_at DESC
) = 1</code></pre>
<p>The double <code>ORDER BY</code> uses the source change time, then the Singer load-batch timestamp
(<code>_sdc_batched_at</code>) as a tiebreaker — picking the genuinely latest version. The append-only
<em>history</em> isn't thrown away: a gold SCD2 snapshot (Lesson 04) formalizes it into
<code>dim_geolocation</code>.</p>

<h2>generate_schema_name — routing to the right dataset</h2>
<p>By default dbt names a custom schema <code>&lt;target_schema&gt;_&lt;custom_schema&gt;</code> — e.g.
<code>olist_bronze_dev_olist_stage_dev</code>, which is not what we want. A one-macro override makes dbt
use the <code>+schema</code> value <em>verbatim</em>:</p>
<div class="file-ref">📄 p3_dbt_project/brazil_ecommerce/macros/generate_schema_name.sql</div>
<pre><code class="language-sql">{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- if custom_schema_name is none -%}
        {{ target.schema }}
    {%- else -%}
        {{ custom_schema_name | trim }}
    {%- endif -%}
{%- endmacro %}</code></pre>
<p>So a stage model whose <code>+schema</code> resolves to <code>olist_stage_dev</code> lands in exactly
that dataset — no target prefix bleeding in. Combined with the env vars, this is what gives the clean
dev/prod split: <code>BQ_STAGE_DATASET=olist_stage_dev</code> in dev, <code>olist_stage</code> in prod, and
the macro routes models there without any code change.</p>

<h2>Building the silver layer</h2>
<pre><code class="language-bash">cd p3_dbt_project/brazil_ecommerce

# 0. one-time: pull dbt_utils + dbt_expectations
dbt deps

# load env so the dataset/project vars resolve
set -a &amp;&amp; source ../../.env.dev &amp;&amp; set +a

# build just the stage layer (views) and run its tests
dbt build --select tag:stage

# verify: 9 stg_* views in the stage dataset
bq ls olist_stage_dev</code></pre>
<p><code>dbt build</code> runs <em>and</em> tests in one command, in DAG order. Because stage models are
tagged <code>stage</code>, <code>--select tag:stage</code> builds the nine <code>stg_*</code> views and
immediately checks the <code>unique</code> / <code>not_null</code> assertions — the same command Dagster
issues for the silver step in the nightly run.</p>

<div class="callout tip">
<p><strong>💡 Selectors are how Dagster talks to dbt.</strong> The whole pipeline orchestrates dbt by tag:
<code>tag:stage</code> for silver, <code>tag:gold_mart</code> for gold. Tagging layers in
<code>dbt_project.yml</code> is what makes "build just this medallion tier" a one-flag operation.</p>
</div>

<div class="callout warn">
<p><strong>⚠️ Resist adding logic to stage.</strong> The temptation is to "just join one little table" or
"coalesce a null" in silver. Don't. A stage model that joins is no longer a 1:1 clean copy, and its
<code>unique</code> test can start failing for reasons that have nothing to do with data quality. Keep
silver to dedup + type fidelity; put every join and derivation in gold.</p>
</div>
`,
  steps: [
    'Open <code>p3_dbt_project/brazil_ecommerce/dbt_project.yml</code> and confirm stage is <code>+materialized: view</code> with <code>+tags: [\'stage\']</code>',
    'Open <code>models/stage/sources.yml</code> and find the 9 <code>olist_*_raw</code> tables and the <code>schema:</code> env var pointing at bronze',
    'Read <code>models/stage/stg_orders.sql</code> and trace the <code>QUALIFY ROW_NUMBER() … = 1</code> dedup on <code>order_id</code>',
    'Open <code>models/stage/stg_geolocation.sql</code> and explain why it orders by <code>updated_at DESC, _sdc_batched_at DESC</code>',
    'Read <code>macros/generate_schema_name.sql</code> and explain how it stops <code>&lt;target&gt;_&lt;schema&gt;</code> concatenation',
    'Optional (needs GCP creds): <code>dbt deps</code>, source <code>.env.dev</code>, run <code>dbt build --select tag:stage</code>, then <code>bq ls olist_stage_dev</code>'
  ],
  quiz: [
    {
      q: 'What is the ONLY job of a stage (silver) model in this project?',
      options: [
        'Join orders to payments and compute revenue metrics',
        'Deduplicate bronze to one row per primary key (via QUALIFY ROW_NUMBER()) and preserve type fidelity — no joins, no business logic',
        'Aggregate the data into monthly KPI tables'
      ],
      answer: 1,
      explain: 'schema.yml states "Staging = 1:1 dedup of bronze." Each stg_* model is a single SELECT * from one bronze source with QUALIFY ROW_NUMBER() = 1 to keep one row per key. Joins and business logic belong in gold_mart.'
    },
    {
      q: 'How does the QUALIFY ROW_NUMBER() pattern in stg_orders.sql deduplicate?',
      options: [
        'It deletes rows from the bronze table directly',
        'It partitions by order_id, ranks rows newest-first by order_purchase_timestamp, and keeps only rank 1 — one row per order_id',
        'It uses SELECT DISTINCT across all columns'
      ],
      answer: 1,
      explain: 'PARTITION BY order_id groups duplicate keys, ORDER BY order_purchase_timestamp DESC ranks the latest first, and QUALIFY ... = 1 keeps only the newest row per order_id. The view is recomputed on every read, so it is always fresh against bronze.'
    },
    {
      q: 'Why are stage models materialized as views while gold marts are tables?',
      options: [
        'Views are required by dbt for any model that uses source()',
        'Stage is a thin always-fresh dedup of bronze that costs nothing to rebuild, so views fit; gold marts are physical tables so BI reads are fast',
        'BigQuery cannot create tables from a SELECT *'
      ],
      answer: 1,
      explain: 'dbt_project.yml sets stage +materialized: view ("cheap and always fresh") and gold_mart +materialized: table ("physical tables for fast downstream reads"). A view stores no data and re-runs its SELECT, which is exactly what a 1:1 dedup layer wants.'
    },
    {
      q: 'What does the custom generate_schema_name macro change about dbt\'s default behaviour?',
      options: [
        'It encrypts the dataset names before sending them to BigQuery',
        'It uses the +schema value verbatim instead of dbt\'s default <target_schema>_<custom_schema> concatenation, so models land in olist_stage_dev / olist_stage exactly',
        'It renames every stg_ model to add a _dev suffix'
      ],
      answer: 1,
      explain: 'By default dbt would build into <target_schema>_<custom_schema>. The macro returns the trimmed custom schema name as-is, so each layer\'s env-driven dataset (olist_stage_dev in dev, olist_stage in prod) is used directly with no prefix bleeding in.'
    }
  ]
});
