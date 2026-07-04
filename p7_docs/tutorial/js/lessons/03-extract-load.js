/* Lesson 03 — P1 Extract & Load */
window.TUTORIAL_LESSONS.push({
  id: 'extract-load',
  order: 3,
  track: 'technical',
  icon: '📥',
  title: 'P1 · Extract & Load — Raw Data to Bronze',
  subtitle: 'How 9 Olist CSVs (and an optional Cloud SQL Postgres) land in BigQuery as the bronze layer — via manual load jobs or Meltano Singer pipelines.',
  minutes: 30,
  objectives: [
    'Name the 9 Olist source files and what each table contains',
    'Explain what the <strong>bronze</strong> layer is and why EL loads data 1:1 with no transformation',
    'Read a real <code>meltano.yml</code>: taps, targets, incremental replication, stream maps',
    'Switch between the three load paths with <code>BRONZE_LOAD_METHOD</code> and run a load yourself'
  ],
  body: `
<h2>What problem does Extract &amp; Load solve?</h2>
<p>Before anyone can transform or analyze data, it has to <em>exist in the warehouse</em>. The EL step
(Module 1, <code>p1_el/</code>) does exactly one job: copy source data into BigQuery <strong>as-is</strong>,
1:1 with the source, with no business logic. In medallion terms this landing zone is the
<strong>bronze</strong> layer.</p>

<div class="callout info">
<p><strong>Bronze = raw, immutable-ish, replayable.</strong> If a downstream transformation has a bug,
you never re-extract from the source — you just rebuild stage/gold from bronze. That separation is the
whole point of EL<strong>T</strong> over ET<strong>L</strong>: load first, transform inside the warehouse.</p>
</div>

<h2>The 9 Olist source files</h2>
<p>The raw data lives in <code>datasets/</code> at the repo root — the public Kaggle export of Olist's
2016–2018 marketplace activity:</p>

<table>
  <tr><th>CSV file</th><th>Bronze table</th><th>What it contains</th></tr>
  <tr><td><code>olist_orders_dataset.csv</code></td><td><code>olist_orders_raw</code></td><td>~100K orders: status + the full timestamp lifecycle (purchase, approval, carrier hand-off, customer delivery, estimated delivery)</td></tr>
  <tr><td><code>olist_order_items_dataset.csv</code></td><td><code>olist_order_items_raw</code></td><td>Line items: (order_id, order_item_id) → product, seller, price, freight_value</td></tr>
  <tr><td><code>olist_order_payments_dataset.csv</code></td><td><code>olist_order_payments_raw</code></td><td>Payments per order: type (credit_card, boleto…), installments, value</td></tr>
  <tr><td><code>olist_order_reviews_dataset.csv</code></td><td><code>olist_order_reviews_raw</code></td><td>Review score 1–5 + comment title/message per order</td></tr>
  <tr><td><code>olist_customers_dataset.csv</code></td><td><code>olist_customers_raw</code></td><td>customer_id (per order) + customer_unique_id (per person) + city/state/zip prefix</td></tr>
  <tr><td><code>olist_sellers_dataset.csv</code></td><td><code>olist_sellers_raw</code></td><td>Sellers with city/state/zip prefix</td></tr>
  <tr><td><code>olist_products_dataset.csv</code></td><td><code>olist_products_raw</code></td><td>Products: category (Portuguese), dimensions, weight, photo count</td></tr>
  <tr><td><code>olist_geolocation_dataset.csv</code></td><td><code>olist_geolocation_raw</code></td><td>~1M lat/lng points keyed by zip-code prefix — <strong>no natural primary key</strong></td></tr>
  <tr><td><code>product_category_name_translation.csv</code></td><td><code>product_category_name_translation_raw</code></td><td>Portuguese → English category names</td></tr>
</table>

<p>Note the naming convention: every bronze table gets a <code>_raw</code> suffix, and they all land in the
dataset named by the <code>BQ_BRONZE_DATASET</code> env var — <code>olist_bronze_dev</code> in dev,
<code>olist_bronze</code> in prod (see <code>.env.example</code>).</p>

<div class="file-ref">📄 .env.example</div>
<pre><code class="language-bash"># --- GCP / auth ---------------------------------------------------------------
GCP_PROJECT=sctp-team2-project2-elt
GOOGLE_APPLICATION_CREDENTIALS=./secrets/sctp-team2-project2-elt-ROTATED-dbcb3cd092f4.json

# --- BigQuery -----------------------------------------------------------------
BQ_LOCATION=US
# Datasets carry a _dev suffix in dev and no suffix in prod.
BQ_BRONZE_DATASET=olist_bronze_dev
BQ_STAGE_DATASET=olist_stage_dev
BQ_GOLD_DATASET=olist_gold_mart_dev

# --- Source data --------------------------------------------------------------
OLIST_DATA_DIR=./datasets</code></pre>

<h2>The EL tool landscape: dlt vs Meltano vs Airbyte</h2>
<p>There are three popular open-source approaches to EL, and this project touched all three families of thinking:</p>
<table>
  <tr><th>Tool</th><th>Style</th><th>Strengths</th><th>Trade-offs</th></tr>
  <tr><td><strong>dlt</strong></td><td>Pure Python library</td><td>9 CSVs loadable in ~15 lines; schema inference; great for developers</td><td>You own the code; fewer off-the-shelf connectors</td></tr>
  <tr><td><strong>Meltano</strong></td><td>Config-driven CLI over the <em>Singer</em> spec</td><td>Hundreds of taps/targets; declarative YAML; built-in incremental state</td><td>Plugin quality varies by variant; YAML gets long</td></tr>
  <tr><td><strong>Airbyte</strong></td><td>UI + containerized connectors</td><td>Point-and-click; huge connector catalog</td><td>Heavy to self-host for a 9-file project; overkill here</td></tr>
</table>

<p>The team's design doc (<code>p1_el/README.md</code>) framed it as <em>"two EL approaches… both land
identical raw tables (EL-tool interchangeability behind one contract)"</em> — dlt as the quick Pythonic
path and Meltano as the config-driven comparison. What is <strong>wired and running today</strong> is a
three-way switch (next section): a dependency-free manual loader as the default, plus two Meltano
projects. Airbyte was ruled out as too heavy for a 9-table batch project. The key architectural insight
survives regardless of tool: <strong>downstream only depends on the bronze table names</strong>
(<code>olist_*_raw</code>), so the EL tool is swappable.</p>

<h2>The three load paths: BRONZE_LOAD_METHOD</h2>
<p>Dagster's bronze asset (<code>p6_orchestration/olist_orchestration/olist_orchestration/assets.py</code>,
<code>bronze_raw_commerce</code>) picks the loader from one env var:</p>

<pre><code class="language-python"># p6_orchestration/.../config.py
# How to populate bronze. One of:
#   manual          - load datasets/*.csv straight into BQ via load jobs (default).
#   meltano_csv     - run the tap-csv -&gt; target-bigquery pipeline (p1_el/meltano-raw-csv).
#   meltano_postgres- run the tap-postgres -&gt; target-bigquery pipeline (p1_el/olist-meltano-pg).
# Legacy alias: "meltano" is treated as "meltano_csv" for backward compatibility.
BRONZE_LOAD_METHOD = os.getenv("BRONZE_LOAD_METHOD", "manual")</code></pre>

<div class="mermaid-wrap"><pre class="mermaid">
flowchart LR
  subgraph Sources
    CSV["datasets/*.csv<br/>9 Olist files"]
    PG["Cloud SQL Postgres<br/>schema: oltp"]
  end
  CSV -- "manual<br/>(BQ load jobs)" --> BQ["olist_bronze_dev<br/>olist_*_raw tables"]
  CSV -- "meltano_csv<br/>tap-csv → target-bigquery" --> BQ
  PG -- "meltano_postgres<br/>tap-postgres → target-bigquery" --> BQ
  BQ --> DBT["p3 dbt stage views"]
</pre></div>

<ul>
  <li><strong>manual</strong> (default) — Python loops over <code>datasets/*.csv</code> and issues plain
  BigQuery <em>load jobs</em>. Zero extra dependencies, fastest to demo.</li>
  <li><strong>meltano_csv</strong> — runs the tap-csv → target-bigquery pipeline in
  <code>p1_el/meltano-raw-csv</code> against the same CSVs.</li>
  <li><strong>meltano_postgres</strong> — runs tap-postgres → target-bigquery from a Cloud SQL Postgres
  (<code>oltp</code> schema) in <code>p1_el/olist-meltano-pg</code> — simulating a real production OLTP source.</li>
</ul>

<p>Crucially, all three paths land the <em>same</em> <code>olist_*_raw</code> tables, so the dbt sources
in <code>p3_dbt_project/.../models/stage/sources.yml</code> never change. After a manual or
meltano_csv load, the Dagster asset even <strong>reconciles row counts</strong> — CSV records vs
BigQuery rows per table — and logs ✅ exact / ⚠️ appended / ❌ MISSING ROWS.</p>

<h2>Meltano anatomy: the Singer tap/target model</h2>
<p><a href="https://hub.meltano.com" target="_blank">Meltano</a> orchestrates <strong>Singer</strong>
plugins: a <em>tap</em> (extractor) reads the source and emits a stream of JSON
<code>SCHEMA</code> / <code>RECORD</code> / <code>STATE</code> messages on stdout; a <em>target</em>
(loader) consumes that stream and writes the destination. The <code>STATE</code> messages are how
incremental replication remembers where it left off.</p>

<div class="file-ref">📄 p1_el/olist-meltano-pg/meltano.yml</div>
<pre><code class="language-yaml">plugins:
  extractors:
    - name: tap-postgres
      variant: meltanolabs
      pip_url: git+https://github.com/MeltanoLabs/tap-postgres.git
      config:
        host: \${POSTGRES_HOST}
        port: \${POSTGRES_PORT}
        user: \${POSTGRES_USER}
        password: \${POSTGRES_PASSWORD}
        database: \${POSTGRES_DB}
        ssl: true
        filter_schemas:
          - oltp</code></pre>

<p>Everything is driven by <code>\${ENV_VARS}</code> loaded from <code>.env.&lt;env&gt;</code>, so the
three Meltano environments (<code>dev</code>, <code>prod</code>, <code>jun</code> — a personal sandbox)
need no per-environment YAML overrides at all.</p>

<h2>Incremental replication from Postgres</h2>
<p>Each stream declares <em>how</em> to replicate. The team uses key-based incremental replication on an
<code>updated_at</code> column, with explicit primary keys per table:</p>

<pre><code class="language-yaml">      metadata:
        oltp-olist_orders:
          replication-method: INCREMENTAL
          replication-key: updated_at
          key-properties:
            - order_id

        oltp-olist_order_items:
          replication-method: INCREMENTAL
          replication-key: updated_at
          key-properties:
            - order_id
            - order_item_id</code></pre>

<p>On each run the tap only fetches rows where <code>updated_at</code> is newer than the bookmarked
STATE — so a nightly sync moves only the delta, not 100K orders every time.</p>

<h2>The geolocation special case: append-only history</h2>
<p>One table breaks the pattern. <code>olist_geolocation</code> has <strong>no natural primary key</strong>
(many lat/lng points per zip prefix), so it cannot be upserted or deduped like the keyed streams. The
config solves this with plugin inheritance — a child tap that selects only geolocation, paired with a
child target that turns upsert <em>off</em>:</p>

<pre><code class="language-yaml">    # Geolocation has no natural primary key, so it can't be upserted/deduped like
    # the other streams. It's extracted on its own and loaded append-only.
    - name: tap-postgres-geolocation
      inherit_from: tap-postgres
      select:
        - oltp-olist_geolocation.*

  loaders:
    # Append-only variant: every run appends rows (SCD-style history).
    - name: target-bigquery-append
      inherit_from: target-bigquery
      config:
        upsert: false
        dedupe_before_upsert: false
        overwrite: false</code></pre>

<p>Every run <em>appends</em> geolocation rows, building an SCD-style history in bronze that the dbt
snapshot layer (Lesson on Gold &amp; SCD2) later formalizes into <code>dim_geolocation</code>.</p>

<h2>The loader: target-bigquery, tuned</h2>
<p>The loader is the <code>z3z1ma</code> variant of target-bigquery, with two production-grade details
worth studying:</p>

<pre><code class="language-yaml">  loaders:
    - name: target-bigquery
      variant: z3z1ma
      config:
        project: \${GCP_PROJECT}
        dataset: \${BQ_BRONZE_DATASET}
        credentials_path: \${GOOGLE_APPLICATION_CREDENTIALS}
        location: \${BQ_LOCATION}
        method: batch_job
        # Default batch_size is 500 rows -&gt; the 1M-row geolocation stream becomes
        # ~2000 load jobs ... which trips BigQuery's "too many partitioned table
        # update operations" 429 quota. 100k rows/batch keeps it to a handful.
        batch_size: 100000
        denormalized: true
        upsert: true
        dedupe_before_upsert: true
        stream_maps:
          oltp-olist_orders:
            __alias__: olist_orders_raw</code></pre>

<ol>
  <li><strong>batch_size: 100000</strong> — a real war story: the default 500-row batches turned the
  1M-row geolocation stream into ~2,000 BigQuery load jobs and tripped a 429 quota error. Bigger batches
  fixed it.</li>
  <li><strong>stream_maps __alias__</strong> — the tap names streams <code>oltp-&lt;table&gt;</code>, but
  dbt's sources expect <code>olist_*_raw</code>. Aliasing inside the target means the Postgres path feeds
  <em>exactly the same</em> bronze tables as the CSV path. That alias list <em>is</em> the M1→M3 contract.</li>
</ol>

<h2>Jobs: composing taps and targets</h2>
<p>Meltano <em>jobs</em> chain tap→target tasks. The combined job is what Dagster invokes when
<code>BRONZE_LOAD_METHOD=meltano_postgres</code>:</p>

<pre><code class="language-yaml">jobs:
  - name: postgres-to-bigquery-bronze            # keyed streams (upsert)
    tasks:
      - tap-postgres target-bigquery
  - name: postgres-geolocation-to-bigquery-bronze # geolocation (append)
    tasks:
      - tap-postgres-geolocation target-bigquery-append
  - name: postgres-all-to-bigquery-bronze         # full bronze load (Dagster runs this)
    tasks:
      - tap-postgres target-bigquery
      - tap-postgres-geolocation target-bigquery-append</code></pre>

<h2>Running a load yourself</h2>
<pre><code class="language-bash"># 0. one-time config
cp .env.example .env.dev          # fill in keyfile path if needed
set -a &amp;&amp; source .env.dev &amp;&amp; set +a

# Path A — default manual load, via the Dagster asset (UI on :3000)
make dev                          # then materialize the bronze_raw_commerce asset

# Path B — Meltano CSV pipeline (tap-csv -&gt; target-bigquery)
make meltano-run

# Path C — Meltano Postgres pipeline (needs Cloud SQL creds in .env)
cd p1_el/olist-meltano-pg
meltano --environment=dev run postgres-all-to-bigquery-bronze

# verify: expect 9 olist_*_raw tables
bq ls olist_bronze_dev</code></pre>

<div class="callout tip">
<p><strong>💡 Personal sandboxes:</strong> the <code>.env.&lt;name&gt;</code> convention (e.g.
<code>.env.jun</code> with <code>_jun</code> datasets) plus <code>make dev ENV=jun</code> lets each
teammate load into their own datasets without clobbering shared dev. The Meltano project mirrors this
with a third declared environment, <code>jun</code>.</p>
</div>

<div class="callout warn">
<p><strong>⚠️ Bronze is loaded raw on purpose.</strong> No type fixes, no dedup, no renames here —
duplicates from append-only loads are <em>expected</em> and handled one tier up by the dbt stage layer
(<code>QUALIFY ROW_NUMBER() … = 1</code>). Resist the urge to "clean a little" during EL.</p>
</div>
`,
  steps: [
    'Run <code>ls datasets/</code> and confirm you see all 9 Olist CSVs',
    'Open <code>p1_el/olist-meltano-pg/meltano.yml</code> and find the <code>replication-key</code> for <code>oltp-olist_orders</code>',
    'Find the <code>stream_maps</code> block and trace how <code>oltp-olist_customers</code> becomes <code>olist_customers_raw</code>',
    'Read <code>.env.example</code> and note which env var names the bronze dataset (<code>BQ_BRONZE_DATASET</code>)',
    'In <code>p6_orchestration/.../assets.py</code>, read <code>bronze_raw_commerce</code> and find where the three <code>BRONZE_LOAD_METHOD</code> paths branch',
    'Optional (needs GCP creds): copy <code>.env.example</code> to <code>.env.dev</code>, run <code>make dev</code>, and materialize the bronze asset; then <code>bq ls olist_bronze_dev</code>'
  ],
  quiz: [
    {
      q: 'Why is the geolocation stream loaded with a separate append-only target instead of the normal upsert target?',
      options: [
        'It is too large for upsert to handle in BigQuery',
        'It has no natural primary key, so rows cannot be upserted/deduped — appending preserves an SCD-style history instead',
        'Geolocation data never changes, so appending is just faster'
      ],
      answer: 1,
      explain: 'olist_geolocation has many lat/lng rows per zip prefix and no unique key. meltano.yml extracts it via tap-postgres-geolocation and loads it with target-bigquery-append (upsert: false), appending every run. The dbt stage layer later collapses it to one current row per zip, and a snapshot tracks history.'
    },
    {
      q: 'What does BRONZE_LOAD_METHOD=manual (the default) actually do?',
      options: [
        'Loads datasets/*.csv straight into BigQuery via load jobs from the Dagster asset, then verifies row counts',
        'Prompts you to upload CSVs through the BigQuery console by hand',
        'Runs the Meltano tap-csv pipeline'
      ],
      answer: 0,
      explain: 'The bronze_raw_commerce Dagster asset loops over the 9 CSVs and issues BigQuery load jobs, then reconciles CSV record counts against BigQuery row counts per table. meltano_csv and meltano_postgres are the alternative paths.'
    },
    {
      q: 'Why was batch_size raised to 100000 in the target-bigquery config?',
      options: [
        'To make the data load in sorted order',
        'Because BigQuery rejects batches smaller than 100K rows',
        'The default 500-row batches turned the ~1M-row geolocation stream into ~2000 load jobs, tripping a BigQuery partitioned-table quota (429)'
      ],
      answer: 2,
      explain: 'A comment in meltano.yml documents this exact incident: too many small load jobs against one date-partitioned staging table hit the "too many partitioned table update operations" quota. Fewer, bigger batches solved it.'
    },
    {
      q: 'What is the "contract" that makes the EL tool swappable in this project?',
      options: [
        'All loaders must be written in Python',
        'Every load path must land the same bronze table names (olist_*_raw) that dbt sources.yml expects — enforced for Postgres via stream_maps aliases',
        'All three paths must read from the same CSV files'
      ],
      answer: 1,
      explain: 'Downstream dbt models reference sources, not tools. Because manual, meltano_csv, and meltano_postgres all produce identical olist_*_raw tables (the Postgres streams are aliased via __alias__), the EL implementation can change without touching a single dbt model.'
    }
  ]
});
