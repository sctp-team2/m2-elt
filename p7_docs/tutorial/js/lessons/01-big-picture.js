/* Lesson 01 — The Big Picture */
window.TUTORIAL_LESSONS.push({
  id: 'big-picture',
  order: 1,
  track: 'start',
  icon: '🗺️',
  title: 'The Big Picture — Architecture & Data Flow',
  subtitle: 'ELT vs ETL, the medallion warehouse, the nightly Dagster run, and the GCP services that make it all real.',
  minutes: 20,
  objectives: [
    'Explain ELT vs ETL and why this project transforms <em>inside</em> BigQuery',
    'Describe the purpose of each medallion layer: bronze, stage (silver), and gold',
    'Trace a nightly run end-to-end: schedule → bronze → stage → gold → tests → BI',
    'Name the GCP services used and what each one does in this project',
    'Know the 7 modules, who owned them, and how dev/prod environments are separated'
  ],
  body: `
<h2>ELT, not ETL — and why it matters</h2>
<p>Classic <strong>ETL</strong> (Extract → Transform → Load) transforms data <em>before</em> it reaches the
warehouse, usually in a separate processing engine. <strong>ELT</strong> flips the last two steps:
load the raw data into the warehouse first, then transform it <em>in place</em> with SQL.</p>
<table>
  <tr><th></th><th>ETL (classic)</th><th>ELT (this project)</th></tr>
  <tr><td>Where transforms run</td><td>External engine (Spark, Informatica…)</td><td>Inside the warehouse (BigQuery executes dbt's SQL)</td></tr>
  <tr><td>Raw data kept?</td><td>Often discarded after transform</td><td>Always kept (bronze) — re-transform any time</td></tr>
  <tr><td>Debugging</td><td>Re-run the whole extract</td><td>Re-run just the SQL model</td></tr>
  <tr><td>Tooling here</td><td>—</td><td>dlt / Meltano load → dbt transforms → Dagster orchestrates</td></tr>
</table>
<p>Because BigQuery does the heavy compute, the orchestration machine only runs "Python glue" —
which is why (as you'll see in the deployment lesson) the whole production pipeline fits on a tiny
<code>e2-medium</code> VM.</p>

<h2>The medallion architecture: what each layer is FOR</h2>
<p>The warehouse is organised as a <strong>medallion</strong> — three layers of increasing refinement.
Each layer has one job, and a hard rule from the root <code>readme.md</code>:
<em>"Models read one tier down only: silver←bronze, gold←silver. Never skip a tier."</em></p>
<table>
  <tr><th>Layer</th><th>BigQuery dataset (dev / prod)</th><th>What it is FOR</th><th>Built by</th></tr>
  <tr><td>🥉 <strong>Bronze</strong></td><td><code>olist_bronze_dev</code> / <code>olist_bronze</code></td><td>Raw landing zone — 9 <code>olist_*_raw</code> tables, 1:1 with the source CSVs / Postgres tables. No cleaning. The replayable source of truth.</td><td>manual CSV load <em>or</em> Meltano (<code>p1_el/</code>)</td></tr>
  <tr><td>🥈 <strong>Stage (silver)</strong></td><td><code>olist_stage_dev</code> / <code>olist_stage</code></td><td><code>stg_*</code> <strong>views</strong>: dedup + type-casting only. No joins, no business logic. Cheap to rebuild (views), guarantees clean inputs for gold.</td><td>dbt (<code>p3_dbt_project/.../models/stage/</code>)</td></tr>
  <tr><td>🥇 <strong>Gold mart</strong></td><td><code>olist_gold_mart_dev</code> / <code>olist_gold_mart</code></td><td>The star schema BI queries: <code>fact_orders</code> + <code>dim_customers / dim_sellers / dim_products / dim_reviews</code> as <strong>tables</strong>. Business logic lives here.</td><td>dbt (<code>.../models/gold_mart/</code>)</td></tr>
</table>
<div class="callout info">
<p><strong>Why split stage from gold?</strong> Stage answers "is the data clean?" (one row per key, correct
types). Gold answers "is the data useful?" (joined, modelled, aggregated). Keeping them separate
means a business-logic bug never contaminates your only clean copy of the data — and another
project rule enforces it: <em>"dbt owns all writes to silver/gold — never hand-write SQL into those datasets."</em></p>
</div>

<h2>The full system architecture</h2>
<p>This is the real architecture from <code>p7_docs/architecture_diagram.md</code>, lightly simplified.
The seven <code>p1_</code>…<code>p7_</code> folders map directly onto it:</p>
<div class="mermaid-wrap"><pre class="mermaid">
flowchart TB
  subgraph SRC["📥 Sources"]
    CSV["9 Olist CSVs<br/>datasets/"]
    PG[("Cloud SQL Postgres<br/>(optional live OLTP)")]
  end
  subgraph P1["p1_el — Extract &amp; Load"]
    EL["manual loader / Meltano<br/>tap-csv · tap-postgres"]
  end
  subgraph BQ["☁️ BigQuery medallion (US)"]
    BR[("🥉 olist_bronze<br/>9 raw_* tables")]
    SG[("🥈 olist_stage<br/>stg_* views")]
    GD[("🥇 olist_gold_mart<br/>dim_* + fact_orders")]
  end
  DQ["✅ p4 quality gates<br/>dbt tests + Great Expectations"]
  BI["📊 p5 analytics<br/>Streamlit · Superset · Dash"]
  subgraph P6["🪄 p6 Dagster"]
    SCHED["olist_nightly<br/>02:00 SGT"]
  end
  subgraph INFRA["🏗️ GCP infra / CI-CD"]
    GH["GitHub Actions"] --> CB["Cloud Build →<br/>Artifact Registry"]
    CB --> VM["Compute Engine VM<br/>Dagster + nginx auth"]
    GH --> CR["Cloud Run<br/>analytics apps"]
  end
  CSV --> EL
  PG --> EL
  EL --> BR
  BR -->|dbt stage| SG
  SG -->|dbt gold_mart| GD
  GD --> DQ
  DQ -.gates.-> BI
  GD --> BI
  P6 ==>|orchestrates| P1
  P6 ==>|runs dbt| SG
  VM -.hosts.- P6
  CR -.hosts.- BI
</pre></div>
<div class="file-ref">📄 p7_docs/architecture_diagram.md — the full C4-style diagram with every node</div>

<h2>One night in the life of the pipeline</h2>
<p>Every night at <strong>02:00 Singapore time</strong>, the Dagster schedule <code>olist_nightly</code>
fires the <code>olist_full_refresh</code> job. Here is the end-to-end sequence
(condensed from <code>p7_docs/sequence_diagram.md</code>):</p>
<div class="mermaid-wrap"><pre class="mermaid">
sequenceDiagram
  autonumber
  participant SCH as ⏰ olist_nightly (02:00 SGT)
  participant DAG as 🪄 Dagster
  participant EL as ⚙️ p1_el loader
  participant BQ as ☁️ BigQuery
  participant DBT as 🔧 dbt
  participant DQ as ✅ p4 tests
  SCH->>DAG: Trigger olist_full_refresh
  DAG->>EL: Materialize bronze_raw_commerce
  EL->>BQ: Load 9 raw_* tables (bronze)
  BQ-->>EL: Row counts verified vs source
  DAG->>DBT: dbt build (tag stage)
  DBT->>BQ: Build stg_* views (dedup + typed)
  DAG->>DBT: dbt build (tag gold_mart)
  DBT->>BQ: Build dim_* + fact_orders tables
  DAG->>DQ: dbt tests (unique, not_null, relationships)
  DQ-->>DAG: ✅ green — gold certified (or ❌ run fails)
  Note over BQ: BI apps query gold marts on demand
</pre></div>
<table>
  <tr><th>#</th><th>Stage</th><th>Component</th><th>Action</th></tr>
  <tr><td>1</td><td>Trigger</td><td><strong>p6</strong> Dagster <code>olist_nightly</code></td><td>Kicks off <code>olist_full_refresh</code> at 02:00 SGT (cron <code>0 2 * * *</code>)</td></tr>
  <tr><td>2</td><td>Extract &amp; Load</td><td><strong>p1_el</strong></td><td>9 sources → bronze <code>raw_*</code> tables (+ CSV-vs-BQ row-count check)</td></tr>
  <tr><td>3</td><td>Stage / silver</td><td><strong>p3</strong> dbt</td><td><code>stg_*</code> views: dedup + type-clean (per the <strong>p2</strong> contract)</td></tr>
  <tr><td>4</td><td>Gold</td><td><strong>p3</strong> dbt</td><td><code>dim_*</code> (incl. SCD2), <code>fact_orders</code> tables</td></tr>
  <tr><td>5</td><td>Quality gate</td><td><strong>p4</strong></td><td>dbt tests + Great Expectations — gold released only if green</td></tr>
  <tr><td>6</td><td>Serve</td><td><strong>p5</strong></td><td>Streamlit / Superset / Dash query the gold marts for execs</td></tr>
</table>
<div class="callout tip">
<p><strong>p2 (warehouse design) is not a runtime step.</strong> It's the up-front <em>contract</em> —
the star-schema spec that p3 implements and p4 validates. Design documents can be part of a
pipeline's architecture without ever executing.</p>
</div>

<h2>The GCP services and what each one does here</h2>
<p>The project runs in GCP project <code>sctp-team2-project2-elt</code> (BigQuery location <code>US</code>):</p>
<table>
  <tr><th>Service</th><th>Role in this project</th></tr>
  <tr><td><strong>BigQuery</strong></td><td>The warehouse itself — all three medallion datasets, and the engine that executes every dbt model. The single most important service.</td></tr>
  <tr><td><strong>Compute Engine</strong></td><td>One <code>e2-medium</code> VM (<code>olist-dagster</code>, Container-Optimized OS) hosting the Dagster container + an nginx auth proxy. Deleted nightly to save cost, recreated each morning.</td></tr>
  <tr><td><strong>Artifact Registry</strong></td><td>Docker registry (<code>us-central1-docker.pkg.dev/.../olist-elt</code>) holding the pipeline image, tagged <code>:latest</code> and per-commit <code>:&lt;sha&gt;</code>.</td></tr>
  <tr><td><strong>Cloud Build</strong></td><td>Builds the Docker image from <code>cloudbuild.yaml</code> (triggered by GitHub Actions or manually) and pushes it to Artifact Registry.</td></tr>
  <tr><td><strong>Cloud Run</strong></td><td>Hosts the p5 analytics apps (Dash, Superset, Streamlit, wordcloud, ops portal) — serverless, scale-to-zero, each with its own deploy workflow.</td></tr>
  <tr><td><strong>Cloud SQL</strong></td><td>A PostgreSQL instance (<code>sctp-m2-olist</code>) simulating a live OLTP source. The <code>meltano_postgres</code> bronze load path reads <code>oltp.*</code> from it via tap-postgres.</td></tr>
</table>

<h2>The team: 7 modules, enterprise roles</h2>
<p>From <code>assignment/README.md</code> — each module has a lead (accountable for quality) and a
support member, mapped to a real enterprise data role:</p>
<table>
  <tr><th>Module</th><th>Lead</th><th>Support</th><th>Enterprise role</th></tr>
  <tr><td>1. Data Ingestion (<code>p1_el/</code>)</td><td>John Phang</td><td>Bryan Teo</td><td>Data Engineering</td></tr>
  <tr><td>2. Warehouse Design (<code>p2_warehouse_design/</code>)</td><td>Charmaine</td><td>Soon Meng</td><td>Data Architecture / Modeling</td></tr>
  <tr><td>3. ELT Pipeline — dbt (<code>p3_dbt_project/</code>)</td><td>Hoong Jun</td><td>Bryan Teo</td><td>Analytics Engineering</td></tr>
  <tr><td>4. Data Quality (<code>p4_data_quality/</code>)</td><td>Charmaine</td><td>Ang Jenn Fang</td><td>Data Quality / Governance</td></tr>
  <tr><td>5. Data Analysis (<code>p5_analytics/</code>)</td><td>John Phang</td><td>Lim Chun Wei</td><td>Analytics / BI</td></tr>
  <tr><td>6. Orchestration (<code>p6_orchestration/</code>)</td><td>Hoong Jun</td><td>Soon Meng</td><td>Data Orchestration / Ops</td></tr>
  <tr><td>7. Docs &amp; Presentation (<code>p7_docs/</code>)</td><td colspan="2">All team members</td><td>Cross-functional delivery</td></tr>
</table>
<p>Note the deliberate folder convention from the root <code>readme.md</code>: top-level folders are
prefixed <code>p1_</code>…<code>p7_</code> <em>to encode pipeline order</em>, while inner folders
(dbt's <code>models/</code>, <code>.github/workflows/</code>) stay bare because the tools require those exact names.</p>

<h2>Dev vs prod: one codebase, env-driven config</h2>
<p>The same code runs in dev and prod — only the <strong>environment file</strong> changes. Config lives in
<code>.env.&lt;env&gt;</code> files at the repo root (git-ignored; template in <code>.env.example</code>):</p>
<pre><code class="language-bash"># .env.example (real excerpt)
GCP_PROJECT=sctp-team2-project2-elt
GOOGLE_APPLICATION_CREDENTIALS=./secrets/sctp-team2-project2-elt-ROTATED-dbcb3cd092f4.json
BQ_LOCATION=US
# Datasets carry a _dev suffix in dev and no suffix in prod.
BQ_BRONZE_DATASET=olist_bronze_dev
BQ_STAGE_DATASET=olist_stage_dev
BQ_GOLD_DATASET=olist_gold_mart_dev
DBT_TARGET=dev
MELTANO_ENVIRONMENT=dev
OLIST_DATA_DIR=./datasets</code></pre>
<p>The convention is simple: <strong>dev datasets carry a <code>_dev</code> suffix, prod datasets have no
suffix</strong> (<code>olist_bronze_dev</code> vs <code>olist_bronze</code>). An <code>OLIST_ENV</code>
variable selects which file is loaded — <code>make dev</code> loads <code>.env.dev</code>,
the prod container runs with <code>.env.prod</code>. There's even a third tier: personal sandboxes
like <code>.env.jun</code> point at <code>olist_*_jun</code> datasets so individual experiments never
clobber shared data (covered in the Setup lesson).</p>

<h2>Where to go next</h2>
<ul>
  <li><strong>Technical track:</strong> the next lesson gets the whole pipeline running on your laptop.</li>
  <li><strong>Business track:</strong> jump ahead to the analytics lessons — you now know enough about the gold marts to understand the dashboards.</li>
</ul>
`,
  steps: [
    'Open <code>p7_docs/architecture_diagram.md</code> and find the three medallion datasets in the BigQuery subgraph',
    'Read <code>p7_docs/sequence_diagram.md</code> and identify which step is the quality gate that can fail a run',
    'Read the root <code>readme.md</code> "Project conventions" section — note the "one tier down only" rule',
    'Open <code>.env.example</code> and confirm the <code>_dev</code> dataset-suffix convention',
    'Check <code>assignment/README.md</code> and map each module owner to a <code>pN_</code> folder',
    'Optional: open the BigQuery console for project <code>sctp-team2-project2-elt</code> and find <code>olist_bronze_dev</code>, <code>olist_stage_dev</code>, <code>olist_gold_mart_dev</code>'
  ],
  quiz: [
    {
      q: 'In this project, why is the architecture called ELT rather than ETL?',
      options: [
        'Raw data is loaded into BigQuery bronze first, then transformed in-place by dbt SQL',
        'The data is encrypted, loaded, then transferred to the BI layer',
        'Transformation happens in Meltano before the data ever reaches BigQuery'
      ],
      answer: 0,
      explain: 'EL tools (manual loader / Meltano) only move raw data into bronze. All transformation is SQL executed by BigQuery, authored as dbt models — load first, transform after.'
    },
    {
      q: 'What is the stage (silver) layer allowed to do?',
      options: [
        'Join orders to payments and compute business metrics',
        'Dedup and type-cast only — one stg_* view per bronze table, no joins or business logic',
        'Aggregate facts into executive KPI marts'
      ],
      answer: 1,
      explain: 'Stage models are deliberately boring: SELECT from one bronze source, deduplicate on the primary key, cast types. Joins and business logic belong in gold_mart.'
    },
    {
      q: 'Which statement about the nightly run is correct?',
      options: [
        'GitHub Actions runs the pipeline every night at midnight UTC',
        'A Cloud Run job triggers dbt directly, skipping Dagster',
        'The Dagster schedule olist_nightly (cron 0 2 * * *, Asia/Singapore) triggers the olist_full_refresh job'
      ],
      answer: 2,
      explain: 'The dagster-daemon (bundled in `dagster dev`) fires olist_nightly at 02:00 SGT, which materializes bronze → stage → gold → tests in dependency order. GitHub Actions only handles CI/CD deploys.'
    },
    {
      q: 'What role does Cloud SQL (PostgreSQL) play in this architecture?',
      options: [
        'It stores the Dagster run history in production',
        'It acts as an optional live OLTP source — the meltano_postgres path loads bronze from its oltp schema',
        'It hosts the gold mart tables for the BI dashboards'
      ],
      answer: 1,
      explain: 'Cloud SQL simulates a production transactional database. With BRONZE_LOAD_METHOD=meltano_postgres, Meltano tap-postgres reads oltp.* and lands the same olist_*_raw bronze tables as the CSV paths. The warehouse is BigQuery, and Dagster run history is SQLite on a volume.'
    }
  ]
});
