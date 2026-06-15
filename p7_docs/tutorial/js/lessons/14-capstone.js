/* Lesson 14 — Capstone */
window.TUTORIAL_LESSONS.push({
  id: 'capstone',
  order: 14,
  track: 'capstone',
  icon: '🏆',
  title: 'Capstone — Put It All Together',
  subtitle: 'A consolidating lesson: the end-to-end recap, the assignment evaluation criteria mapped to modules, hands-on exercises that span the whole stack, a glossary, and where to go next.',
  minutes: 40,
  objectives: [
    'Recap the whole pipeline end-to-end in one diagram and one sentence',
    'Map the assignment evaluation criteria onto the seven project modules',
    'Complete hands-on capstone exercises that touch dbt, tests, dashboards, and orchestration',
    'Be fluent in the project glossary (ELT, medallion, SCD2, fact/dim, grain, GMV, repeat-rate…)',
    'Know where to go next to deepen or extend the project'
  ],
  body: `
<h2>The whole thing, in one diagram</h2>
<p>You've now seen every layer. Here is the entire platform on one page — raw CSVs on the left, an executive
decision on the right:</p>
<div class="mermaid-wrap"><pre class="mermaid">
flowchart LR
  CSV["📦 9 Olist CSVs<br/>/ Cloud SQL OLTP"] --> EL["📥 p1 Extract &amp; Load<br/>manual / Meltano"]
  EL --> BR["🥉 Bronze<br/>olist_*_raw"]
  BR -->|dbt stage| SG["🥈 Stage (silver)<br/>stg_* views"]
  SG -->|dbt gold_mart| GD["🥇 Gold mart<br/>fact_orders + dim_*"]
  GD --> DQ["✅ p4 tests<br/>dbt + Great Expectations"]
  GD --> BI["📊 p5 BI apps<br/>Streamlit · Dash · Superset · wordcloud"]
  DAG["🪄 p6 Dagster<br/>nightly 02:00 SGT"] -.orchestrates.-> EL
  DAG -.-> SG
  DAG -.-> GD
  BI --> DEC["🎯 The decision:<br/>fix delivery → lift repeat rate"]
  DOC["📚 p7 docs + this tutorial"] -.documents.- GD
</pre></div>

<div class="callout info">
<p><strong>The one-sentence recap.</strong> Nine raw CSVs are loaded 1:1 into BigQuery bronze, cleaned into stage
views, modelled into a gold star schema, tested for quality, orchestrated nightly by Dagster, and served through
BI apps that prove a single business story: <em>Olist's ~3% repeat rate is the binding constraint, and late
delivery is the lever.</em></p>
</div>

<h2>The assignment, and how the project answers it</h2>
<p>The Module 2 brief (<code>assignment/Module 2 Assignment Project V2.pdf</code>) asks for three deliverables:</p>
<ol>
  <li>A <strong>GitHub repository</strong> on a single main branch with all code and documentation</li>
  <li><strong>Jupyter notebooks</strong> with basic analysis</li>
  <li>A <strong>slide deck</strong> presenting the executive summary and key findings</li>
</ol>
<p>Its <strong>evaluation criteria</strong> are qualitative — there are no weightings or point totals in the brief.
They split into a "Focus" set and a "Good to have":</p>
<table>
  <tr><th>Evaluation criterion (verbatim)</th><th>Mainly answered by</th></tr>
  <tr><td><em>Focus:</em> Accuracy and integrity of the Data Pipeline</td><td>p4 quality gates + p6 orchestration — the Dagster run + QA report</td></tr>
  <tr><td><em>Focus:</em> Quality of code and adherence to best practices</td><td>p3 dbt — model structure, contracts, "one tier down" rule</td></tr>
  <tr><td><em>Focus:</em> Overall architecture and scalability of the solution</td><td>p2 design + p7 docs — medallion star schema + the on-prem migration roadmap</td></tr>
  <tr><td><em>Focus:</em> Good documentation of the system (why these designs/tools)</td><td>p7 docs — comparison tables in <code>final_report.md</code></td></tr>
  <tr><td><em>Good to have:</em> Depth of data analysis and insights generated</td><td>p5 analysis — the repeat-purchase diagnosis (Lesson 12)</td></tr>
</table>
<p>Note brief §6 (Orchestration) is explicitly <strong>optional</strong> — the team implemented it anyway with
Dagster. The p7 deliverables that carry the documentation criteria are: this <code>tutorial/</code>,
<code>architecture.drawio</code> / <code>architecture_diagram.md</code>, <code>final_report.md</code>, the slide
deck, <code>presentation_outline.md</code>, and the root <code>MIGRATION.md</code> (the GCP → on-prem path).</p>
<div class="file-ref">📄 assignment/README.md · p7_docs/README.md · readme.md</div>

<h2>Hands-on capstone exercises</h2>
<p>These exercises each cut a vertical slice through the stack. Do them against your own
<code>.env.&lt;name&gt;</code> sandbox so you never disturb shared data.</p>

<h3>Exercise 1 — Trace a row from CSV to dashboard</h3>
<p>Pick a single order (e.g. an order with a late delivery and a 1★ review) and follow it through every layer:</p>
<pre><code class="language-bash"># 1. find it in the raw CSV
grep "&lt;order_id&gt;" datasets/olist_orders_dataset.csv

# 2. see it in bronze (raw, 1:1)
bq query --use_legacy_sql=false \\
  'SELECT * FROM olist_bronze_dev.olist_orders_raw WHERE order_id="&lt;order_id&gt;"'

# 3. see it cleaned/typed in stage
bq query --use_legacy_sql=false \\
  'SELECT * FROM olist_stage_dev.stg_orders WHERE order_id="&lt;order_id&gt;"'

# 4. see it modelled in gold (joined to dims, business logic applied)
bq query --use_legacy_sql=false \\
  'SELECT * FROM olist_gold_mart_dev.fact_orders WHERE order_id="&lt;order_id&gt;"'</code></pre>
<p>Then open the Dash app, filter to that order's state, and confirm it contributes to the "Late-delivery rate by
state" chart. <strong>Goal:</strong> internalise that every pixel on a dashboard is traceable to a raw row.</p>

<h3>Exercise 2 — Add a new dbt model + test</h3>
<p>Add a small gold model — say <code>dim_payment_type</code> or a <code>fct_seller_performance</code> — to
<code>p3_dbt_project/.../models/gold_mart/</code>. Give it a <code>schema.yml</code> with at least a
<code>unique</code> and a <code>not_null</code> test on its key, then build and test:</p>
<pre><code class="language-bash">dbt build --select gold_mart        # build your model
dbt test  --select &lt;your_model&gt;     # prove unique + not_null pass</code></pre>
<p><strong>Goal:</strong> experience the dbt loop and the "tests as contracts" discipline that powers the p4 quality
gate. Remember the rule: gold reads from stage only, never bronze.</p>

<h3>Exercise 3 — Add a KPI to a dashboard</h3>
<p>Add one metric (e.g. "Avg freight cost" — already ~R$22.79 in the EDA) to the Streamlit deck. Add the derivation
to <code>metrics.py</code>, surface it with an <code>st.metric</code> card in <code>app.py</code>, refresh the
snapshot, and run locally:</p>
<pre><code class="language-bash">cd p5_analytics/streamlit
make snapshot        # re-query gold -&gt; parquet (needs BQ creds)
make run             # open http://localhost:8501</code></pre>
<p><strong>Goal:</strong> see how a number flows from gold → <code>queries.py</code> → <code>metrics.py</code> →
a KPI card.</p>

<h3>Exercise 4 — Run the nightly job by hand</h3>
<p>Don't wait for 02:00 SGT. Launch Dagster and materialize the full refresh yourself:</p>
<pre><code class="language-bash">make dev             # Dagster UI on http://localhost:3000
# In the UI: launch the olist_full_refresh job (bronze -&gt; stage -&gt; gold -&gt; tests)
# Watch the bronze asset reconcile CSV record counts vs BigQuery row counts</code></pre>
<p><strong>Goal:</strong> see orchestration in action — assets materializing in dependency order, with the quality
gate able to fail the run.</p>

<h3>Exercise 5 — Break a test on purpose</h3>
<p>Introduce a duplicate primary key into a stage model (or relax a dedup) and re-run <code>dbt test</code>. Watch the
<code>unique</code> test go red and the run fail. Then fix it. <strong>Goal:</strong> feel why the quality gate exists
— a bad row never silently reaches a dashboard.</p>

<h2>Glossary — the language of the project</h2>
<dl>
  <dt><strong>ELT</strong></dt><dd>Extract, Load, Transform. Load raw data into the warehouse first, then transform it in-place with SQL (dbt). Opposite of ETL.</dd>
  <dt><strong>Medallion architecture</strong></dt><dd>Layering data by refinement: bronze → silver → gold. Each layer reads only one tier down.</dd>
  <dt><strong>Bronze</strong></dt><dd>Raw landing zone. The 9 <code>olist_*_raw</code> tables, 1:1 with source, no cleaning. Replayable source of truth.</dd>
  <dt><strong>Silver / Stage</strong></dt><dd>The <code>stg_*</code> views: dedup + type-cast only. No joins, no business logic.</dd>
  <dt><strong>Gold (mart)</strong></dt><dd>The star schema BI queries: <code>fact_orders</code> + <code>dim_*</code> tables, business logic applied.</dd>
  <dt><strong>Fact table</strong></dt><dd>The measurements/events table at a specific grain. Here <code>fact_orders</code> (order-item grain) holds prices, freight, dates.</dd>
  <dt><strong>Dimension (dim)</strong></dt><dd>The descriptive context you slice facts by: <code>dim_customers</code>, <code>dim_sellers</code>, <code>dim_products</code>, <code>dim_reviews</code>.</dd>
  <dt><strong>Grain</strong></dt><dd>What one row represents. Getting it wrong is the classic bug — e.g. counting repeat customers on per-order <code>customer_id</code> instead of per-person <code>customer_unique_id</code>.</dd>
  <dt><strong>Star schema</strong></dt><dd>One central fact table surrounded by dimensions — the BI-friendly shape gold mart targets.</dd>
  <dt><strong>SCD2</strong></dt><dd>Slowly Changing Dimension type 2: keep history by versioning rows (e.g. <code>is_current</code> flag), so you can ask "what did this product's category look like back then?"</dd>
  <dt><strong>dbt</strong></dt><dd>The transformation tool. SQL models + tests; BigQuery executes the SQL. Owns all writes to silver/gold.</dd>
  <dt><strong>dbt test</strong></dt><dd>A data assertion (<code>unique</code>, <code>not_null</code>, <code>relationships</code>) that fails the build if violated — a contract.</dd>
  <dt><strong>Great Expectations</strong></dt><dd>The complementary p4 data-quality framework for richer expectations beyond dbt's built-ins.</dd>
  <dt><strong>Dagster asset</strong></dt><dd>A unit of data Dagster knows how to produce (e.g. <code>bronze_raw_commerce</code>). Assets form the dependency graph the nightly job materializes.</dd>
  <dt><strong>Singer tap / target</strong></dt><dd>The plugin model Meltano uses: a <em>tap</em> extracts (emits SCHEMA/RECORD/STATE messages), a <em>target</em> loads. STATE enables incremental replication.</dd>
  <dt><strong>GMV</strong></dt><dd>Gross Merchandise Value — total item revenue flowing through the marketplace.</dd>
  <dt><strong>AOV</strong></dt><dd>Average Order Value — GMV divided by orders.</dd>
  <dt><strong>Repeat-purchase rate</strong></dt><dd>Share of customers (by <code>customer_unique_id</code>) who order more than once. Here ~3.12%.</dd>
  <dt><strong>CAC</strong></dt><dd>Customer Acquisition Cost — what you pay to win a new customer. The lower the repeat rate, the more CAC growth costs.</dd>
  <dt><strong>NPS / promoter / detractor</strong></dt><dd>A satisfaction proxy from review scores: 4–5★ = promoter, 1–2★ = detractor.</dd>
  <dt><strong>Cloud Run</strong></dt><dd>GCP serverless container host for the BI apps — scale-to-zero, env-driven config.</dd>
</dl>

<h2>Final quiz — across the whole project</h2>
<p>The quiz below spans every module. If you can answer all of it, you understand the platform end-to-end.</p>

<h2>Where to go next</h2>
<ul>
  <li><strong>Deepen the analysis:</strong> model P(repeat | first-order late / score) controlling for category and
  geography; build a seller/lane scorecard and quantify the R$ at risk (the EDA's stated "next steps").</li>
  <li><strong>Harden the platform:</strong> add alerting on top of the Grafana metrics; add freshness/volume tests.</li>
  <li><strong>Portability:</strong> read the root <code>MIGRATION.md</code> for the GCP → on-prem OSS path
  (the "scalability / sovereignty" story in the rubric).</li>
  <li><strong>Present it:</strong> use <code>p7_docs/presentation_outline.md</code> to rehearse the 10-min talk +
  5-min Q&amp;A — exec summary → business value → architecture → insights → risks → roadmap.</li>
</ul>

<div class="callout tip">
<p><strong>🏆 You made it.</strong> You can now explain every layer from a raw CSV to an executive decision, justify
the tool choices, and extend any part of the stack. That is exactly what the assignment asks you to demonstrate.</p>
</div>
`,
  steps: [
    'Pick one late, low-review order and trace it through bronze → stage → gold → dashboard (Exercise 1)',
    'Add a small gold dbt model with a <code>unique</code> + <code>not_null</code> test, then <code>dbt build</code> &amp; <code>dbt test</code> (Exercise 2)',
    'Add one KPI (e.g. avg freight) to <code>metrics.py</code> + an <code>st.metric</code> card in the Streamlit deck (Exercise 3)',
    'Run <code>make dev</code> and materialize <code>olist_full_refresh</code> in the Dagster UI (Exercise 4)',
    'Break a stage dedup, watch the <code>unique</code> test fail the run, then fix it (Exercise 5)',
    'Read the evaluation criteria in <code>assignment/README.md</code> + the brief and map each to a <code>pN_</code> module',
    'Skim <code>p7_docs/final_report.md</code> and <code>MIGRATION.md</code>, then rehearse from <code>presentation_outline.md</code>'
  ],
  quiz: [
    {
      q: 'A teammate reports the repeat-purchase rate is 0%. What is the most likely bug?',
      options: [
        'The gold mart failed to build last night',
        'They counted repeats on customer_id (per-order) instead of customer_unique_id (per-person) — a grain error',
        'BigQuery dropped the duplicate orders during stage dedup'
      ],
      answer: 1,
      explain: 'Olist mints a new customer_id per order, so on that grain everyone is one-time by construction. The repeat rate (~3.12%) is only visible when you aggregate on customer_unique_id. Grain is the recurring trap in this project.'
    },
    {
      q: 'In what order does the nightly Dagster job materialize the medallion, and where can it fail?',
      options: [
        'gold → stage → bronze; it fails if a dashboard is down',
        'bronze → stage → gold → tests; it fails at the p4 quality gate if a dbt/GE test goes red',
        'stage → gold → bronze → tests; it never fails by design'
      ],
      answer: 1,
      explain: 'olist_full_refresh loads bronze, builds stg_* views, builds the gold star schema, then runs dbt tests + Great Expectations. A failed quality gate fails the run, so bad data never reaches the BI apps.'
    },
    {
      q: 'Which evaluation criterion is "Good to have" rather than core "Focus" in the brief?',
      options: [
        'Accuracy and integrity of the data pipeline',
        'Depth of data analysis and insights generated',
        'Overall architecture and scalability of the solution'
      ],
      answer: 1,
      explain: 'The brief lists pipeline accuracy, code quality, architecture/scalability, and documentation under Focus; depth of analysis/insights is the single "Good to have." (The brief gives no numeric weightings.)'
    },
    {
      q: 'Why can all five BI apps show consistent numbers despite using different frameworks?',
      options: [
        'They all share one Python file that hard-codes the metrics',
        'They all read the same gold mart contract (fact_orders + dim_*), so the numbers come from one certified source',
        'They poll each other and average the results'
      ],
      answer: 1,
      explain: 'The data contract is the gold mart. Whether an app uses Streamlit, Dash, Superset SQL views, or a word cloud, it reads fact_orders and the dimensions from olist_gold_mart_prod — so consistency is structural, not coincidental.'
    },
    {
      q: 'What does SCD2 give you that a plain overwrite dimension does not?',
      options: [
        'Faster queries because there are fewer rows',
        'Historical versions of a dimension row (e.g. is_current), so you can ask what an attribute looked like at a past point in time',
        'Automatic deduplication of the bronze layer'
      ],
      answer: 1,
      explain: 'Slowly Changing Dimension type 2 versions rows instead of overwriting them. With an is_current flag and validity, you can reconstruct history — e.g. which category a product was in when an old order was placed.'
    }
  ]
});
