/* Lesson 08 — P6 Orchestration (Dagster) */
window.TUTORIAL_LESSONS.push({
  id: 'orchestration',
  order: 8,
  track: 'technical',
  icon: '🪄',
  title: 'P6 · Orchestration — Dagster Assets & the Nightly Run',
  subtitle: 'How Dagster turns the whole EL→dbt pipeline into one asset graph — bronze → stage → gold → tests — and fires it every night at 02:00 SGT.',
  minutes: 30,
  objectives: [
    'Explain Dagster\'s core concepts: <strong>assets</strong>, <strong>jobs</strong>, <strong>schedules</strong>, <strong>resources</strong>, and the <code>Definitions</code> object',
    'Trace the real asset graph: <code>bronze_raw_commerce</code> → dbt <code>stage</code> → dbt <code>gold_mart</code> → tests',
    'Read the <code>olist_nightly</code> schedule (cron <code>0 2 * * *</code>, Asia/Singapore) and the <code>olist_full_refresh</code> job',
    'Understand how <code>BRONZE_LOAD_METHOD</code> selects the loader and how resources wire BigQuery + dbt together',
    'Run the whole pipeline locally via <code>run-dagster.sh</code> / <code>make dev</code> and materialize assets in the UI on <code>:3000</code>'
  ],
  body: `
<h2>What problem does orchestration solve?</h2>
<p>By now the pieces exist independently: an EL step that loads bronze (Lesson on Extract &amp; Load),
and dbt models that build stage and gold. But who runs them, <em>in the right order</em>, every night,
and tells you when something breaks? That is the job of <strong>Module 6</strong>
(<code>p6_orchestration/</code>), built on <a href="https://dagster.io" target="_blank">Dagster</a>.</p>

<div class="callout info">
<p><strong>Dagster's key idea: the dependency graph IS the pipeline.</strong> Instead of writing a script
that calls step 1, then step 2, then step 3, you declare each output as an <em>asset</em> and let Dagster
work out the order from the dependencies. The bronze tables, every <code>stg_*</code> view, and every
<code>dim_*</code> / <code>fact_orders</code> table all become assets in one lineage graph you can see and
materialize from a UI.</p>
</div>

<div class="file-ref">📄 p6_orchestration/README.md</div>
<p>The module's brief puts it plainly: <em>"Wire the whole pipeline together with Dagster: every source
and dbt model becomes an asset, so the dependency graph IS the pipeline. Run end-to-end on a schedule
and on demand, with live lineage."</em></p>

<h2>The five Dagster concepts you need</h2>
<table>
  <tr><th>Concept</th><th>What it is</th><th>Where in this project</th></tr>
  <tr><td><strong>Asset</strong></td><td>A persistent object Dagster knows how to produce (a table, a view). Its function declares dependencies.</td><td><code>bronze_raw_commerce</code> (9 bronze tables) + the dbt-generated <code>stg_*</code> / <code>dim_*</code> / <code>fact_orders</code> assets</td></tr>
  <tr><td><strong>Job</strong></td><td>A selection of assets to materialize together.</td><td><code>olist_full_refresh</code> (everything), <code>stg_only</code>, <code>gold_mart_only</code></td></tr>
  <tr><td><strong>Schedule</strong></td><td>A cron rule that launches a job automatically.</td><td><code>olist_nightly</code> — 02:00 SGT</td></tr>
  <tr><td><strong>Resource</strong></td><td>Shared, configured connection/tool injected into assets.</td><td><code>dbt_resource</code> (a <code>DbtCliResource</code> pointing at the dbt project)</td></tr>
  <tr><td><strong>Definitions</strong></td><td>The single object that registers assets + jobs + schedules + resources so the Dagster instance can load them.</td><td><code>defs = Definitions(...)</code> in <code>definitions.py</code></td></tr>
</table>

<h2>The asset graph: bronze → stage → gold → tests</h2>
<p>The full lineage Dagster materializes on a nightly run, in dependency order:</p>
<div class="mermaid-wrap"><pre class="mermaid">
flowchart LR
  subgraph BRONZE["bronze_raw_commerce (multi_asset · compute_kind: bigquery)"]
    B1["olist_orders_raw"]
    B2["olist_order_items_raw"]
    B3["... 9 olist_*_raw tables"]
  end
  subgraph DBT["dbt_models (@dbt_assets — one dbt build)"]
    S["stg_* views<br/>tag: stage"]
    G["dim_* + fact_orders<br/>tag: gold_mart"]
    T["dbt tests<br/>unique · not_null · relationships"]
  end
  BRONZE --> S --> G --> T
</pre></div>

<p>Two things produce all those assets. First, a hand-written <strong>multi-asset</strong> that loads
bronze; second, a single <code>@dbt_assets</code> function that turns <em>every</em> dbt model into a
Dagster asset automatically.</p>

<div class="file-ref">📄 p6_orchestration/olist_orchestration/olist_orchestration/assets.py</div>
<pre><code class="language-python">@multi_asset(
    outs={t: AssetOut(key=[BRONZE_KEY_PREFIX, t]) for t in config.BRONZE_TABLES},
    compute_kind="bigquery",
)
def bronze_raw_commerce(context: AssetExecutionContext):
    """Load all Olist CSVs into the BigQuery bronze dataset, then verify every
    CSV's record count landed in its table.

    Three load paths (BRONZE_LOAD_METHOD):
      - "manual"          (default): load datasets/*.csv straight into BQ via load jobs.
      - "meltano_csv":    run tap-csv -&gt; target-bigquery in p1_el/meltano-raw-csv.
      - "meltano_postgres": run tap-postgres -&gt; target-bigquery in p1_el/olist-meltano-pg.
    """
    method = config.BRONZE_LOAD_METHOD
    ...

@dbt_assets(manifest=dbt_project.manifest_path, dagster_dbt_translator=OlistDbtTranslator())
def dbt_models(context: AssetExecutionContext, dbt: DbtCliResource):
    yield from dbt.cli(["build"], context=context).stream()</code></pre>

<div class="callout tip">
<p><strong>💡 One function, dozens of assets.</strong> <code>@dbt_assets</code> reads dbt's
<code>manifest.json</code> and emits one Dagster asset per dbt model — so Dagster's lineage mirrors dbt's
DAG exactly, and a single <code>dbt build</code> command materializes them all. You never hand-list the
stage or gold models in Python.</p>
</div>

<h2>How BRONZE_LOAD_METHOD selects the loader</h2>
<p>The bronze asset is the one place all three EL paths converge. The branch inside
<code>bronze_raw_commerce</code> reads one env var and either shells out to Meltano or issues BigQuery
load jobs directly:</p>

<pre><code class="language-python">if method in ("meltano_csv", "meltano_postgres"):
    if method == "meltano_postgres":
        meltano_dir = config.MELTANO_PG_DIR          # p1_el/olist-meltano-pg
        run_args = ["postgres-all-to-bigquery-bronze"]
    else:
        meltano_dir = config.MELTANO_CSV_DIR         # p1_el/meltano-raw-csv
        run_args = ["tap-csv", "target-bigquery"]
    subprocess.run(
        ["meltano", f"--environment={config.OLIST_ENV}", "run", *run_args],
        cwd=meltano_dir, check=True,
    )
else:
    # manual: loop datasets/*.csv -&gt; BigQuery load jobs
    for t in config.BRONZE_TABLES:
        _load_csv_to_bq(client, t, config.OLIST_DATA_DIR / config.CSV_FILES[t])</code></pre>

<p>After a <code>manual</code> or <code>meltano_csv</code> load the asset <strong>reconciles row counts</strong>
— CSV records vs BigQuery rows per table — logging <code>✅ exact</code> / <code>⚠️ appended (dupes)</code> /
<code>❌ MISSING ROWS</code>. The <code>meltano_postgres</code> path reads Cloud SQL, has no source CSV to
compare against, so that check is skipped.</p>

<div class="file-ref">📄 p6_orchestration/olist_orchestration/olist_orchestration/config.py</div>
<pre><code class="language-python"># How to populate bronze. One of: manual | meltano_csv | meltano_postgres.
# Legacy alias: "meltano" is treated as "meltano_csv" for backward compatibility.
BRONZE_LOAD_METHOD = os.getenv("BRONZE_LOAD_METHOD", "manual")
if BRONZE_LOAD_METHOD == "meltano":
    BRONZE_LOAD_METHOD = "meltano_csv"</code></pre>

<h2>Asset keys that follow the medallion + environment</h2>
<p>A custom <code>DagsterDbtTranslator</code> names the dbt assets by <em>medallion layer and environment</em>
so a dev run and a prod run show as distinct assets in the catalog
(<code>olist_bronze_dev/…</code> vs <code>olist_bronze_prod/…</code>):</p>

<pre><code class="language-python">class OlistDbtTranslator(DagsterDbtTranslator):
    def get_asset_key(self, dbt_resource_props):
        if dbt_resource_props["resource_type"] == "source":
            return AssetKey([BRONZE_KEY_PREFIX, dbt_resource_props["name"]])
        tags = dbt_resource_props.get("tags") or []
        if "stage" in tags:
            return AssetKey([f"olist_stage_{ENV}", dbt_resource_props["name"]])
        if "gold_mart" in tags:
            return AssetKey([f"olist_gold_mart_{ENV}", dbt_resource_props["name"]])
        return AssetKey([dbt_resource_props["name"]])</code></pre>

<p>Because the dbt <em>source</em> assets share <code>BRONZE_KEY_PREFIX</code> with the bronze multi-asset,
Dagster wires <code>bronze → stg</code> automatically — the source the dbt models read <em>is</em> the
asset the loader produces.</p>

<h2>Jobs, the schedule, and Definitions</h2>
<p>Everything is registered in one file. Note how the stage/gold jobs are built by <em>selecting on dbt
tags</em> (<code>tag:stage</code>, <code>tag:gold_mart</code>) — the same tags set in
<code>dbt_project.yml</code> — so you can iterate on just one layer without rebuilding bronze.</p>

<div class="file-ref">📄 p6_orchestration/olist_orchestration/olist_orchestration/definitions.py</div>
<pre><code class="language-python">stg_selection  = build_dbt_asset_selection([dbt_models], dbt_select="tag:stage")
gold_selection = build_dbt_asset_selection([dbt_models], dbt_select="tag:gold_mart")

# Full refresh: bronze load -&gt; all stg -&gt; all gold, in dependency order.
olist_full_refresh = define_asset_job("olist_full_refresh", selection=AssetSelection.all())
stg_only           = define_asset_job("stg_only", selection=stg_selection)
gold_mart_only     = define_asset_job("gold_mart_only", selection=gold_selection)

# Nightly full refresh (02:00 Asia/Singapore). default_status=RUNNING arms it on deploy.
olist_nightly = ScheduleDefinition(
    name="olist_nightly",
    job=olist_full_refresh,
    cron_schedule="0 2 * * *",
    execution_timezone="Asia/Singapore",
    default_status=DefaultScheduleStatus.RUNNING,
)

defs = Definitions(
    assets=[bronze_raw_commerce, dbt_models],
    jobs=[olist_full_refresh, stg_only, gold_mart_only],
    schedules=[olist_nightly],
    resources={"dbt": dbt_resource},
)</code></pre>

<div class="callout info">
<p><strong>Two details that matter.</strong> (1) <code>execution_timezone="Asia/Singapore"</code> is a
<em>clock</em> setting for when the cron fires — it is NOT a GCP region; all the BigQuery infra is in
<code>US</code>. (2) <code>default_status=RUNNING</code> means the schedule is armed the moment the
container starts — no manual toggle in the UI is needed after a deploy. The
<strong>dagster-daemon</strong> (bundled into <code>dagster dev</code>) is what actually fires it.</p>
</div>

<h2>Resources: wiring dbt (and BigQuery) in once</h2>
<p>Assets receive their tools via <em>resources</em>. The <code>dbt_resource</code> is configured once and
injected into the <code>dbt_models</code> asset. Importantly, importing <code>config</code> first loads the
<code>.env.&lt;env&gt;</code> file and resolves <code>GOOGLE_APPLICATION_CREDENTIALS</code> <em>before</em>
dbt parses — so the BigQuery connection env vars are already set.</p>

<div class="file-ref">📄 p6_orchestration/olist_orchestration/olist_orchestration/resources.py</div>
<pre><code class="language-python"># Importing config first loads .env and sets GOOGLE_APPLICATION_CREDENTIALS etc.
from . import config  # side-effect: load env

dbt_project = DbtProject(project_dir=config.DBT_DIR)   # p3_dbt_project/brazil_ecommerce
dbt_project.prepare_if_dev()                            # auto-runs dbt parse -&gt; manifest in dev

dbt_resource = DbtCliResource(
    project_dir=dbt_project,
    profiles_dir=str(config.DBT_DIR),                   # do not fall back to ~/.dbt
)</code></pre>

<p>The bronze asset doesn't take a resource — it builds its own BigQuery client from
<code>GOOGLE_APPLICATION_CREDENTIALS</code> inside <code>_bq_client()</code>. So between them, the two
assets cover both halves of the stack: <strong>BigQuery for the load, dbt for the transforms.</strong></p>

<h2>Running it locally</h2>
<p>Locally, <code>dagster dev</code> bundles the webserver (UI on <code>:3000</code>) and the daemon
(schedules) into one process — exactly what runs in prod. Start it, then materialize from the UI:</p>

<pre><code class="language-bash"># From the repo root — make dev loads .env.dev and starts dagster dev on :3000
make dev
# (personal sandbox: make dev ENV=jun loads .env.jun, olist_*_jun datasets)

# then in the browser at http://localhost:3000:
#   Assets  -&gt; "Materialize all"          (bronze -&gt; stg -&gt; gold -&gt; tests)
#   Jobs    -&gt; olist_full_refresh         (the same, as a job)
#   Jobs    -&gt; stg_only / gold_mart_only  (iterate on one dbt layer)
#   Schedules -&gt; olist_nightly            (should show RUNNING)</code></pre>

<p>On the prod VM the same app is launched by <code>run-dagster.sh</code> with
<code>dagster dev -h 0.0.0.0 -p 3000 -m olist_orchestration.definitions</code> (covered in the next
lesson). You can also run a job headless from the CLI:</p>

<pre><code class="language-bash"># one-shot, no UI — used by the Dockerfile's default CMD and for ad-hoc runs
dagster job execute -m olist_orchestration.definitions -j olist_full_refresh</code></pre>

<div class="callout warn">
<p><strong>⚠️ The re-materialize-bronze append trap.</strong> Wiping Dagster's UI markers
(<code>dagster asset wipe</code>) only resets metadata — the BigQuery data stays. Re-materializing the
<strong>bronze</strong> asset with a Meltano path then <em>appends again</em>, creating duplicates. Only
re-run bronze if you also reset the bronze dataset (<code>./reset_dagster.sh --bronze</code>); otherwise
re-materialize just the <code>stg_*</code> / dbt assets. See <code>notes/wipes-dagster.md</code>.</p>
</div>
`,
  steps: [
    'Open <code>p6_orchestration/olist_orchestration/olist_orchestration/assets.py</code> and find the three branches inside <code>bronze_raw_commerce</code> keyed on <code>BRONZE_LOAD_METHOD</code>',
    'In the same file, read <code>OlistDbtTranslator.get_asset_key</code> and note how <code>stage</code> / <code>gold_mart</code> tags map to <code>olist_stage_&lt;env&gt;</code> / <code>olist_gold_mart_&lt;env&gt;</code> asset keys',
    'Open <code>definitions.py</code> and confirm the schedule cron (<code>0 2 * * *</code>), timezone (<code>Asia/Singapore</code>), and <code>default_status=RUNNING</code>',
    'In <code>resources.py</code>, trace why <code>config</code> is imported before the dbt resource is built',
    'Run <code>make dev</code>, open <code>http://localhost:3000</code>, and use <strong>Materialize all</strong> to build bronze → stage → gold → tests',
    'Check the <code>bronze_raw_commerce</code> asset logs and find the CSV-vs-BQ row-count verification lines (✅ exact / ⚠️ appended / ❌ MISSING ROWS)'
  ],
  quiz: [
    {
      q: 'How does Dagster know to run bronze before stage before gold?',
      options: [
        'A numbered list of steps in definitions.py executes them top to bottom',
        'It infers order from asset dependencies — the dbt source assets share the bronze key prefix, and @dbt_assets mirrors dbt\'s DAG — so the lineage graph defines the order',
        'A cron schedule fires each layer at a staggered time'
      ],
      answer: 1,
      explain: 'Dagster materializes assets in dependency order. bronze_raw_commerce produces the olist_*_raw tables under BRONZE_KEY_PREFIX; the dbt source assets share that prefix, so stg depends on bronze, and gold depends on stg via dbt\'s own DAG (exposed by @dbt_assets). The graph IS the order.'
    },
    {
      q: 'What does the olist_nightly schedule do, and what fires it?',
      options: [
        'Triggers olist_full_refresh at 02:00 Asia/Singapore (cron 0 2 * * *); the bundled dagster-daemon fires it, and default_status=RUNNING arms it on deploy',
        'Runs a GitHub Actions cron every night at midnight UTC',
        'Calls a Cloud Run job that executes dbt directly, bypassing Dagster'
      ],
      answer: 0,
      explain: 'ScheduleDefinition wires cron 0 2 * * * (Asia/Singapore) to the olist_full_refresh job. The dagster-daemon bundled into `dagster dev` triggers it; default_status=RUNNING means it\'s active the moment the container starts, no UI toggle required. The timezone is a clock setting, not a GCP region.'
    },
    {
      q: 'Why is a single @dbt_assets function enough to produce all the stage and gold assets?',
      options: [
        'It runs each dbt model as a separate Python subprocess listed by hand',
        'It reads dbt\'s manifest.json and emits one Dagster asset per dbt model, so one `dbt build` materializes them all and Dagster\'s lineage mirrors dbt\'s DAG',
        'It only builds gold; stage is loaded manually'
      ],
      answer: 1,
      explain: '@dbt_assets parses the dbt manifest and creates one asset per model automatically. The asset body just streams `dbt build`. You never enumerate the stg_* or dim_* models in Python — dbt\'s DAG becomes Dagster\'s lineage.'
    },
    {
      q: 'What is the role of resources.py importing config before building dbt_resource?',
      options: [
        'It speeds up dbt parsing by caching the manifest',
        'Importing config has the side-effect of loading .env.<env> and resolving GOOGLE_APPLICATION_CREDENTIALS, so the BigQuery connection env vars are set before dbt parses',
        'It selects which jobs appear in the Dagster UI'
      ],
      answer: 1,
      explain: 'config.py loads the repo-root .env.<env> and makes the keyfile path absolute as an import side-effect. resources.py imports it first so that prepare_if_dev() / dbt parse and any BigQuery client already see the right project, datasets, and credentials.'
    }
  ]
});
