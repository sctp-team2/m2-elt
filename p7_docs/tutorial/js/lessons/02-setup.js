/* Lesson 02 — P0 Setup */
window.TUTORIAL_LESSONS.push({
  id: 'setup',
  order: 2,
  track: 'start',
  icon: '⚙️',
  title: 'P0 · Setup — Run It on Your Laptop',
  subtitle: 'Clone, drop the service-account key into secrets/, pick an .env.<env>, and launch the whole bronze → stage → gold pipeline behind Dagster on localhost:3000.',
  minutes: 25,
  objectives: [
    'Clone the repo and place the GCP service-account key in <code>secrets/</code> (and know why it is git-ignored)',
    'Explain the <code>.env.&lt;env&gt;</code> convention — <code>dev</code>, <code>prod</code>, and personal sandboxes like <code>jun</code>',
    'Use the key <code>Makefile</code> targets: <code>make install</code>, <code>make dev</code>, <code>make dbt-build</code>, <code>make meltano-run</code>',
    'Launch Dagster on <code>:3000</code> and materialize <code>olist_full_refresh</code>',
    'Verify a full run produced the expected bronze / stage / gold datasets in BigQuery'
  ],
  body: `
<h2>What this lesson gets you</h2>
<p>By the end you will have the entire ELT pipeline running locally: <strong>bronze (CSV → BigQuery)
→ dbt stage views → dbt gold tables</strong>, optionally driven end-to-end by Dagster. Nothing here is
invented — every command comes straight from the root <code>Makefile</code> and the runbook in
<code>notes/setup.local.md</code>.</p>

<div class="callout info">
<p><strong>Mental model:</strong> your laptop runs only "Python glue" — Dagster, dbt, and the loaders.
The heavy compute (every transform) happens inside BigQuery in the cloud. So setup is really about two
things: <em>credentials</em> (the service-account key) and <em>config</em> (which <code>.env.&lt;env&gt;</code>
file, i.e. which BigQuery datasets you write to).</p>
</div>

<div class="mermaid-wrap"><pre class="mermaid">
flowchart LR
  A["git clone"] --> B["secrets/&lt;key&gt;.json<br/>(service account)"]
  B --> C[".env.dev<br/>(GCP_PROJECT, BQ_*_DATASET)"]
  C --> D["make install<br/>(pip -e the Dagster project)"]
  D --> E["make dev<br/>dagster dev → :3000"]
  E --> F["materialize<br/>olist_full_refresh"]
  F --> G["bq ls olist_*_dev<br/>(verify)"]
</pre></div>

<h2>0 · Prerequisites</h2>
<p>From <code>notes/setup.local.md</code> — the verified toolchain is a conda env named <code>dagster</code>
on Python 3.11: dbt-core 1.10 + dbt-bigquery, dagster 1.12, meltano 4.0, and the Google Cloud SDK
(<code>bq</code> / <code>gcloud</code>).</p>
<ul>
  <li><strong>git</strong>, <strong>conda</strong> (Miniconda/Anaconda), <strong>Google Cloud SDK</strong>.</li>
  <li>Access to GCP project <code>sctp-team2-project2-elt</code> (BigQuery Data Editor + Job User).</li>
  <li>The service-account keyfile <code>sctp-team2-project2-elt-ROTATED-dbcb3cd092f4.json</code> from the
  team vault (Google Drive → SCTP Team2 → keys). It is git-ignored — <strong>never commit it</strong>.</li>
</ul>

<h2>1 · Clone the repo</h2>
<pre><code class="language-bash">git clone &lt;repo-url&gt; &amp;&amp; cd m2-elt</code></pre>
<p>Everything in this lesson is run from the repo root (<code>m2-elt/</code>) unless stated otherwise.</p>

<h2>2 · The service-account key goes in secrets/</h2>
<p>Authentication to BigQuery is via a GCP <em>service-account JSON keyfile</em>. The dbt profile uses
<code>method: oauth</code>, which simply reads the <code>GOOGLE_APPLICATION_CREDENTIALS</code> path — so if
the keyfile is present, <strong>no <code>gcloud auth</code> is required</strong>.</p>

<div class="file-ref">📄 notes/setup.local.md §2a</div>
<pre><code class="language-bash"># Is the key already here?
ls secrets/sctp-team2-project2-elt-ROTATED-dbcb3cd092f4.json

# If missing, download from the team Google Drive (SCTP Team2 → keys), then:
mkdir -p secrets
cp ~/Downloads/sctp-team2-project2-elt-ROTATED-dbcb3cd092f4.json secrets/</code></pre>

<div class="callout warn">
<p><strong>⚠️ Never commit the key.</strong> The whole <code>secrets/</code> directory and every
<code>.env.*</code> file (except <code>.env.example</code>) are git-ignored:</p>
</div>
<div class="file-ref">📄 .gitignore</div>
<pre><code class="language-bash"># Secrets / env
**/secrets/
**/.env
**/.env.*
!**/.env.example</code></pre>
<p>The <code>secrets/</code> folder exists for exactly one purpose: to hold that service-account key on
disk where the config can find it, without it ever reaching git. (Prefer your own login instead? Run
<code>gcloud auth application-default login</code> and leave the keyfile path unset.)</p>

<h2>3 · The .env.&lt;env&gt; convention</h2>
<p>The same code runs in every environment — only the <strong>environment file</strong> changes. Config
lives in <code>.env.&lt;env&gt;</code> files at the repo root, with <code>.env.example</code> as the
checked-in template. Copy it to <code>.env.dev</code>:</p>

<div class="file-ref">📄 .env.example → copy to .env.dev</div>
<pre><code class="language-bash"># --- GCP / auth ---------------------------------------------------------------
GCP_PROJECT=sctp-team2-project2-elt
GOOGLE_APPLICATION_CREDENTIALS=./secrets/sctp-team2-project2-elt-ROTATED-dbcb3cd092f4.json

# --- BigQuery -----------------------------------------------------------------
BQ_LOCATION=US
# Datasets carry a _dev suffix in dev and no suffix in prod.
BQ_BRONZE_DATASET=olist_bronze_dev
BQ_STAGE_DATASET=olist_stage_dev
BQ_GOLD_DATASET=olist_gold_mart_dev

# --- dbt / meltano targets ----------------------------------------------------
DBT_TARGET=dev
MELTANO_ENVIRONMENT=dev

# --- Source data --------------------------------------------------------------
OLIST_DATA_DIR=./datasets
OLIST_GCS_BUCKET=m2_olin_raw</code></pre>

<p><code>config.py</code> in the orchestration package is what reads these. It loads the right file based
on the <code>OLIST_ENV</code> variable, then resolves a relative keyfile path to an absolute one (because
the process cwd differs from the repo root):</p>

<div class="file-ref">📄 p6_orchestration/olist_orchestration/olist_orchestration/config.py</div>
<pre><code class="language-python"># OLIST_ENV selects which env file to load (dev|prod). Defaults to dev.
OLIST_ENV = os.getenv("OLIST_ENV", "dev")
_env_file = REPO_ROOT / f".env.{OLIST_ENV}"
if _env_file.exists():
    load_dotenv(_env_file)

# Resolve a possibly-relative keyfile path to an absolute one.
_keyfile = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
if _keyfile and not os.path.isabs(_keyfile):
    _abs = (REPO_ROOT / _keyfile).resolve()
    if _abs.exists():
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(_abs)</code></pre>

<h3>The three tiers of environment</h3>
<table>
  <tr><th>Env file</th><th>Selected by</th><th>Datasets</th><th>Purpose</th></tr>
  <tr><td><code>.env.dev</code></td><td><code>make dev</code> (default <code>ENV=dev</code>)</td><td><code>olist_*_dev</code></td><td>Shared development warehouse — the team's working datasets.</td></tr>
  <tr><td><code>.env.prod</code></td><td><code>make prod</code> / the prod container</td><td><code>olist_*</code> (no suffix)</td><td>Production. Datasets drop the <code>_dev</code> suffix entirely.</td></tr>
  <tr><td><code>.env.jun</code> (any name)</td><td><code>make dev ENV=jun</code> or <code>make jun</code></td><td><code>olist_*_jun</code></td><td>Personal sandbox — load into your own datasets without clobbering shared <code>_dev</code>.</td></tr>
</table>

<div class="callout tip">
<p><strong>💡 The dataset-suffix rule:</strong> dev datasets end in <code>_dev</code>, prod has no suffix,
and a personal sandbox <code>.env.&lt;name&gt;</code> points at <code>olist_*_&lt;name&gt;</code> datasets.
Only the <code>BQ_*_DATASET</code> values differ between them — project, keyfile, location, and dbt target
stay identical. Create one by copying <code>.env.dev</code> and editing the dataset names:</p>
</div>
<pre><code class="language-bash">cp .env.dev .env.your_name      # then edit: BQ_*_DATASET=olist_*_your_name
make dev       ENV=your_name     # Dagster on your own datasets
make dbt-build ENV=your_name     # dbt build into your own datasets</code></pre>

<h2>4 · Install + the key Makefile targets</h2>
<p>Create the conda env, then <code>make install</code> (an editable pip install of the Dagster project):</p>
<pre><code class="language-bash">conda create -n dagster python=3.11 -y
conda activate dagster

make install                    # pip install -e '.[dev]' the Dagster project
pip install meltano             # only needed for the Meltano load paths

# sanity check
python -c "import dotenv, dagster_dbt, google.cloud.bigquery, dbt.adapters.bigquery; print('deps OK')"</code></pre>

<p>The <code>Makefile</code> is the single entrypoint. Every target honours <code>ENV=&lt;name&gt;</code>
(which sets <code>OLIST_ENV</code>), defaulting to <code>dev</code>:</p>

<div class="file-ref">📄 Makefile (key targets)</div>
<pre><code class="language-bash">install        # pip install -e '.[dev]' the Dagster project
dev            # cd p6.../ &amp;&amp; OLIST_ENV=$(ENV) dagster dev   (web UI on :3000)
prod           # shortcut for: make dev ENV=prod
&lt;name&gt;         # auto-target per .env.&lt;name&gt; file -> make dev ENV=&lt;name&gt;
dbt-build      # dbt deps + dbt build against .env.$(ENV)
dbt-test       # dbt test against .env.$(ENV)
meltano-run    # run the Meltano tap-csv -> target-bigquery pipeline</code></pre>

<table>
  <tr><th>Target</th><th>What it runs</th></tr>
  <tr><td><code>make install</code></td><td><code>cd p6_orchestration/olist_orchestration &amp;&amp; pip install -e '.[dev]'</code></td></tr>
  <tr><td><code>make dev</code></td><td><code>OLIST_ENV=dev dagster dev</code> — Dagster web UI + daemon on <code>:3000</code></td></tr>
  <tr><td><code>make prod</code></td><td>just <code>make dev ENV=prod</code></td></tr>
  <tr><td><code>make jun</code></td><td>auto-generated from <code>.env.jun</code>; equals <code>make dev ENV=jun</code></td></tr>
  <tr><td><code>make dbt-build</code></td><td><code>dbt deps</code> + <code>dbt build</code> (stage views + gold tables) against <code>.env.$(ENV)</code></td></tr>
  <tr><td><code>make meltano-run</code></td><td>the <code>p1_el/meltano-raw-csv</code> tap-csv → target-bigquery pipeline</td></tr>
</table>

<div class="callout info">
<p><strong>Why are recipes written as one long <code>; \\</code> shell line?</strong> macOS ships GNU make
3.81, which ignores <code>.ONESHELL:</code>. Without the single-invocation trick, each line runs in its own
shell and the <code>source .env.&lt;env&gt;</code> vars are lost before dbt runs. The <code>dbt-build</code>
recipe also re-exports <code>GOOGLE_APPLICATION_CREDENTIALS</code> as an absolute path for the same
cwd reason seen in <code>config.py</code>.</p>
</div>

<h2>5 · Launch Dagster on :3000</h2>
<p>The recommended path runs the whole DAG through the Dagster UI. <code>make dev</code> launches
<code>dagster dev</code> (webserver + daemon) and serves the UI at <strong>http://localhost:3000</strong>:</p>
<pre><code class="language-bash">make dev                        # Dagster UI at http://localhost:3000</code></pre>
<p>In the UI, materialize the job <strong><code>olist_full_refresh</code></strong> — it loads bronze, then
builds the stage views and gold tables in dependency order. Narrower jobs exist too: <code>stg_only</code>
and <code>gold_mart_only</code>.</p>

<div class="callout info">
<p><strong>That same <code>dagster dev</code> is what prod runs too</strong> — just inside a container.
<code>run-dagster.sh</code> on the GCE VM starts the app container with
<code>dagster dev -h 0.0.0.0 -p 3000 -m olist_orchestration.definitions</code>, internal-only on
<code>127.0.0.1:3001</code>, behind an nginx Basic-Auth proxy that is the only thing published on public
<code>:3000</code>. Locally you skip the proxy and hit <code>:3000</code> directly. (Deployment is its own
lesson — see <code>notes/setup.prod.md</code>.)</p>
</div>

<h3>The bronze load method (which tap feeds bronze)</h3>
<p>Bronze can be populated three ways, selected by <code>BRONZE_LOAD_METHOD</code> in your
<code>.env.&lt;env&gt;</code> (or an <code>export</code> for a one-off). All three land the same
<code>olist_*_raw</code> tables, so stage/gold are identical downstream:</p>
<table>
  <tr><th>Value</th><th>Source</th><th>Project</th></tr>
  <tr><td><code>manual</code> (the config default)</td><td><code>datasets/*.csv</code> via BQ load jobs</td><td>code path in <code>assets.py</code></td></tr>
  <tr><td><code>meltano_csv</code> (alias <code>meltano</code>)</td><td><code>datasets/*.csv</code></td><td><code>p1_el/meltano-raw-csv</code></td></tr>
  <tr><td><code>meltano_postgres</code></td><td>Cloud SQL <code>oltp.*</code></td><td><code>p1_el/olist-meltano-pg</code></td></tr>
</table>
<div class="callout tip">
<p><strong>💡 The shipped <code>.env.dev</code> defaults this to <code>meltano_postgres</code></strong>
(the live OLTP source). Offline or without Cloud SQL access, fall back to CSV with
<code>export BRONZE_LOAD_METHOD=manual</code>. The full extract/load story is the next lesson.</p>
</div>

<h2>6 · Verify the run</h2>
<p>A successful full run produces, in project <code>sctp-team2-project2-elt</code>:</p>
<ul>
  <li><code>olist_bronze_dev</code> — 9 raw tables (<code>olist_*_raw</code>, row counts == CSV records)</li>
  <li><code>olist_stage_dev</code> — 9 <code>stg_*</code> <strong>views</strong></li>
  <li><code>olist_gold_mart_dev</code> — <code>fact_orders</code> + <code>dim_customers/sellers/products/reviews</code> <strong>tables</strong></li>
  <li><code>dbt build</code> ends with <code>PASS=51 ... ERROR=0</code> (14 models + 37 tests)</li>
</ul>
<pre><code class="language-bash"># CLI check — expect the three datasets populated
bq --project_id=sctp-team2-project2-elt ls olist_bronze_dev
bq --project_id=sctp-team2-project2-elt ls olist_stage_dev
bq --project_id=sctp-team2-project2-elt ls olist_gold_mart_dev</code></pre>
<div class="callout tip">
<p><strong>💡 Verify in the UI too:</strong> <strong>Jobs → <code>olist_full_refresh</code> → Runs</strong> —
the latest run should be green (SUCCESS). On the <strong>Assets</strong> page every asset should show a
green tick; a red one is clickable for logs.</p>
</div>

<h2>Where to go next</h2>
<ul>
  <li><strong>Next (technical):</strong> the Extract &amp; Load lesson — how those 9 CSVs (and the optional
  Postgres source) actually become the bronze <code>olist_*_raw</code> tables.</li>
  <li><strong>Stuck?</strong> <code>notes/setup.local.md</code> has a full troubleshooting table —
  <code>No module named 'dotenv'</code> → <code>pip install python-dotenv</code>;
  <code>Could not find profile</code> → run via <code>make</code> from the repo root.</li>
</ul>
`,
  steps: [
    'Clone the repo and <code>cd m2-elt</code>',
    'Run <code>ls secrets/*.json</code> — if missing, download the key from the team Drive and copy it into <code>secrets/</code>',
    'Copy the template: <code>cp .env.example .env.dev</code>, then confirm <code>GCP_PROJECT</code>, the keyfile path, and the three <code>BQ_*_DATASET</code> values',
    'Open the root <code>Makefile</code> and find how <code>make dev</code> sets <code>OLIST_ENV=$(ENV)</code> before <code>dagster dev</code>',
    'Run <code>make install</code> in a Python 3.11 conda env, then the <code>python -c "import ..."</code> sanity check (expect <code>deps OK</code>)',
    'Run <code>make dev</code> and open <code>http://localhost:3000</code>; materialize <code>olist_full_refresh</code>',
    'Verify with <code>bq ls olist_bronze_dev</code> / <code>olist_stage_dev</code> / <code>olist_gold_mart_dev</code>',
    'Optional: create a personal sandbox — <code>cp .env.dev .env.&lt;you&gt;</code>, edit the dataset suffixes, then <code>make &lt;you&gt;</code>'
  ],
  quiz: [
    {
      q: 'What is the difference between .env.dev, .env.prod, and a personal .env.<name> file?',
      options: [
        'They use completely different code paths and credentials',
        'Only the BQ_*_DATASET values differ — dev uses an _dev suffix, prod has none, and a sandbox uses _<name>; project/keyfile/location stay the same',
        '.env.prod is the only one that can run Dagster'
      ],
      answer: 1,
      explain: 'The same code runs in every environment; config.py just loads the file named by OLIST_ENV. Dev datasets carry a _dev suffix, prod drops the suffix, and .env.<name> points at olist_*_<name> datasets so personal runs never clobber shared dev. Project, keyfile, location, and dbt target are identical across all three.'
    },
    {
      q: 'Where does the GCP service-account key go, and why must it never be committed?',
      options: [
        'In .env.dev as a base64 string; it is encrypted so committing is fine',
        'In secrets/ at the repo root; the whole secrets/ folder and all .env.* files (except .env.example) are git-ignored',
        'In p6_orchestration/; Dagster only reads keys from its own package'
      ],
      answer: 1,
      explain: 'The keyfile lives in secrets/, referenced by GOOGLE_APPLICATION_CREDENTIALS in .env.dev. .gitignore excludes **/secrets/ and **/.env.* (keeping only .env.example), so the credential never reaches git. config.py also resolves the relative path to an absolute one at runtime.'
    },
    {
      q: 'What does `make dev` do, and where does the Dagster UI appear?',
      options: [
        'Runs OLIST_ENV=dev dagster dev, serving the web UI + daemon on localhost:3000',
        'Builds the dbt gold tables only, with no UI',
        'Deploys the pipeline to the production VM'
      ],
      answer: 0,
      explain: 'make dev runs `OLIST_ENV=$(ENV) dagster dev` (default ENV=dev) from the orchestration project, launching the webserver and daemon at http://localhost:3000. There you materialize olist_full_refresh to run bronze → stage → gold in dependency order. The same dagster dev command runs in prod inside a container behind an nginx auth proxy.'
    }
  ]
});
