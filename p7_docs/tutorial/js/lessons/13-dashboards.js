/* Lesson 13 — B4 · Dashboards */
window.TUTORIAL_LESSONS.push({
  id: 'dashboards',
  order: 13,
  track: 'business',
  icon: '📊',
  title: 'B4 · Dashboards — Telling the Story with BI',
  subtitle: 'The same repeat-purchase diagnosis, served five ways: an executive Streamlit deck, an interactive Dash app, a self-serve Superset BI lab, a review-text word cloud, and a Grafana ops portal — all reading the gold mart.',
  minutes: 30,
  objectives: [
    'Tour the serving layer (Module 5, <code>p5_analytics/</code>) and know when to reach for each app',
    'Explain how the apps read the gold mart and the two caching patterns (<code>bq.py</code>)',
    'Describe how each app is deployed to Cloud Run, scale-to-zero and env-driven',
    'Place the p6 observability / Grafana ops portal as the "is the platform healthy?" dashboard'
  ],
  body: `
<h2>One diagnosis, many audiences</h2>
<p>Lesson 12 produced a single story: <em>growth is acquisition-led, repeat rate is ~3%, and late delivery →
bad review → no reorder is the cheapest lever.</em> But an exec who wants a narrated slide, an analyst who wants
to slice by state, and an SRE who wants to know if the pipeline ran last night need very different surfaces.
That's why the team built <strong>several</strong> serving apps over the <em>same</em> gold mart, rather than one
do-everything tool.</p>

<div class="callout info">
<p><strong>The data contract.</strong> Every app reads the <strong>gold mart only</strong> — BigQuery dataset
<code>olist_gold_mart_prod</code> in project <code>sctp-team2-project2-elt</code> (location <code>US</code>):
the <code>fact_orders</code> fact plus the <code>dim_customers / dim_sellers / dim_products / dim_reviews</code>
dimensions. No app touches bronze or stage. That single rule is what lets five different UIs stay consistent.</p>
</div>

<div class="file-ref">📄 p5_analytics/README.md · p5_analytics/app.MD — the app index &amp; live URLs</div>

<h2>The serving layer at a glance</h2>
<table>
  <tr><th>App</th><th>Folder</th><th>Audience / when to use</th><th>Tech</th><th>Cloud Run service</th></tr>
  <tr><td>📈 Streamlit deck</td><td><code>streamlit/</code></td><td>Narrated executive one-pager (CEO/CMO/CTO sections)</td><td>Streamlit + seaborn + Plotly</td><td><code>olist-streamlit</code></td></tr>
  <tr><td>🟣 Dash app</td><td><code>dash/</code></td><td>Presentation-grade interactive exec dashboard</td><td>Plotly Dash + Mantine</td><td><code>olist-dash</code></td></tr>
  <tr><td>🟢 Streamlit (team)</td><td><code>streamlit_team/</code></td><td>Multipage "team deck", one page per sub-team, live BQ</td><td>Streamlit multipage + Plotly</td><td><code>olist-streamlit-team</code></td></tr>
  <tr><td>🔵 Superset</td><td><code>superset/</code></td><td>Self-serve BI / SQL lab — slice &amp; dice, build your own charts</td><td>Apache Superset 4.1.1</td><td><code>olist-superset</code></td></tr>
  <tr><td>☁️ Word cloud</td><td><code>wordcloud/</code></td><td>Review-text sentiment — what customers actually <em>say</em></td><td>Streamlit + wordcloud</td><td><code>olist-wordcloud</code></td></tr>
  <tr><td>🩺 Ops portal + Grafana</td><td><code>p6_orchestration/observability/</code></td><td>"Is the platform healthy / did the job run?"</td><td>Flask + Grafana</td><td><code>olist-ops-portal</code></td></tr>
</table>

<h2>How the apps read gold — two <code>bq.py</code> patterns</h2>
<p>There are two deliberate flavours of warehouse access, and knowing which is which explains the apps' behaviour.</p>

<h3>Pattern A — cached snapshot (Streamlit deck + Dash)</h3>
<p>The <code>streamlit/</code> and <code>dash/</code> apps share a three-tier cache in <code>bq.py</code>:
in-process memo → on-disk parquet → live BigQuery. This means a demo can run fully offline from baked-in parquet
files, so a conference Wi-Fi outage never breaks the talk.</p>
<div class="file-ref">📄 p5_analytics/streamlit/bq.py · p5_analytics/dash/bq.py (same logic)</div>
<pre><code class="language-python"># bq.cached(name, sql) resolves in order:
#   1. _MEMO[name]                      - already in memory this process
#   2. data/&lt;name&gt;.parquet (if _fresh)  - on-disk snapshot, TTL-checked / OFFLINE
#   3. live BigQuery, then write parquet
def cached(name, sql):
    if name in _MEMO:
        return _MEMO[name]
    if _fresh(name):                      # honours DASH_OFFLINE / TTL
        df = pd.read_parquet(_path(name))
    else:
        client = bigquery.Client(project=PROJECT, location=LOCATION)
        df = client.query(sql).result().to_dataframe()
        df.to_parquet(_path(name))        # snapshot for next time
    _MEMO[name] = df
    return df</code></pre>
<p>Both apps share <code>queries.py</code>: <code>ORDERS_SQL</code> (one row per order — <code>ANY_VALUE</code> /
<code>SUM(price)</code> over <code>fact_orders</code>, LEFT JOIN to <code>dim_customers</code> and
<code>dim_reviews</code>) and <code>CATEGORY_SQL</code> (item revenue by month/state/category, joining
<code>dim_products</code> and <code>dim_customers</code>). All the KPIs (GMV, repeat rate, on-time rate, avg review)
are derived in pandas in <code>metrics.py</code>. <code>make snapshot</code> re-queries BQ and rewrites the parquet
that gets baked into the image.</p>
<div class="callout tip">
<p><strong>💡 Note the default flip.</strong> The Streamlit deck ships <code>DASH_OFFLINE=1</code> (parquet only —
the live demo never hits BQ), while Dash defaults <code>DASH_OFFLINE=0</code> (queries live gold in prod). Same
code, one env var.</p>
</div>

<h3>Pattern B — live, always (team Streamlit + word cloud)</h3>
<p>The <code>streamlit_team/</code> and <code>wordcloud/</code> apps skip parquet entirely and query BigQuery on
every (cached) call using Streamlit's own caching:</p>
<pre><code class="language-python"># streamlit_team/lib/bq.py — live only, no parquet
@st.cache_resource
def get_client():
    return bigquery.Client(project=PROJECT, location=LOCATION)

@st.cache_data(ttl=3600)            # one BQ hit per query per hour
def run_query(sql):
    return get_client().query(sql).result().to_dataframe()</code></pre>
<p>Their <code>queries.py</code> leans on the gold mart's quality flags and SCD2 history — e.g.
<code>is_current</code> filters on <code>dim_products</code>, and <code>QUALIFY ROW_NUMBER()</code> to pick the latest
review version in <code>dim_reviews</code>. This is the path you want when freshness matters more than offline
resilience.</p>

<h2>App 1 — Streamlit executive deck</h2>
<p>A narrated one-page management deck. The sidebar walks the same five beats as the diagnosis: <em>Executive
overview (CEO) → Retention &amp; customers (CMO) → Delivery &amp; experience (CTO) → Product catalog → The
diagnosis.</em> It surfaces the six headline KPIs via <code>st.metric</code> (GMV, Orders, Avg order value,
Repeat-customer rate, On-time delivery, Avg review) plus an explicitly-illustrative CAC scenario panel ("GMV upside
of +N pp repeat"). Charts include "Monthly GMV — new vs. repeat customers", a "Late-delivery rate by state"
choropleth (using <code>assets/brazil_states.geojson</code>), cohort-retention heatmap and RFM segments.</p>
<div class="file-ref">📄 p5_analytics/streamlit/app.py · charts.py · metrics.py</div>

<h2>App 2 — Plotly Dash interactive dashboard</h2>
<p>The same narrative as a presentation-grade, dark-themed interactive app built on Plotly Dash (Flask underneath)
with <code>dash-mantine-components</code>. Tabs: <strong>Overview (CEO) · Retention (CMO) · Delivery (CTO) ·
Diagnosis</strong>, each with KPI cards and per-exec "recommended action" cards, ending in a flow diagram —
"the chain the org isn't connecting." It reuses the exact same <code>metrics.py</code> / <code>queries.py</code> /
<code>bq.py</code> as the Streamlit deck — only the chart engine (all Plotly <code>go.Figure</code>) and the page
layout differ.</p>
<div class="file-ref">📄 p5_analytics/dash/app.py · views.py · components.py</div>

<h2>App 3 — Streamlit team deck (multipage, live)</h2>
<p>Tells the story as "One Elephant, Three Pain Points," one page per sub-team, against <strong>live BigQuery</strong>
(cached 1h). Pages: <code>1_Retention_CEO</code>, <code>2_Delivery_COO</code>, <code>3_Reviews_CMO</code>,
<code>4_Voice_of_Customer</code> (PT→EN review word clouds via Cloud Translation), <code>5_Summary</code>. The landing
page has a "Test gold-mart connection" button (<code>bq.healthcheck</code> → <code>SELECT 1</code>), and the sidebar
shows build provenance (<code>VERSION</code> + git SHA) so you always know which build you're looking at.</p>
<div class="file-ref">📄 p5_analytics/streamlit_team/app.py · pages/ · lib/queries.py</div>

<h2>App 4 — Superset self-serve BI / SQL lab</h2>
<p>The same executive story on a real BI platform — but here the value is <strong>self-serve</strong>: analysts can
slice with native filters (Order month + Customer state) and build their own charts without writing app code. The
single tabbed dashboard "Olist — Executive Dashboard" has tabs <em>Executive · Retention · Delivery &amp; Reviews ·
Catalog</em> and ~18 charts.</p>
<p>There's no pandas layer at all: Superset 4.1.1 queries BigQuery directly over SQLAlchemy, and the semantic layer
is a set of <strong>SQL virtual datasets</strong> in <code>sql/</code> — <code>v_orders</code> (order-grain with window
functions for <code>order_seq</code> / <code>cohort_month</code> and CASE buckets for delivery/review),
<code>v_customers</code> (RFM), <code>v_cohort_retention</code>, <code>v_category</code> — templated with
<code>{{PROJECT}}.{{GOLD}}</code>. The whole dashboard is generated as a deterministic-UUID import bundle
(<code>bootstrap/build_bundle.py</code> → <code>dist/olist_bundle.zip</code>) so it deploys reproducibly.</p>
<div class="callout info">
<p><strong>Why Superset is the odd one out operationally.</strong> Superset needs a persistent metadata DB, so its
state lives in a <code>superset</code> database on the shared Cloud SQL instance
(<code>sctp-m2-olist</code>) — which survives the nightly Dagster-VM teardown. It runs with
<code>--min-instances=1</code> (no scale-to-zero) and is login-gated (<code>team2 / password</code>).</p>
</div>
<div class="file-ref">📄 p5_analytics/superset/sql/ · bootstrap/build_bundle.py · deploy/deploy.sh</div>

<h2>App 5 — Review-text word cloud</h2>
<p>The only app that reads the free-text fields of <code>dim_reviews</code> (Brazilian Portuguese). It shows
review-volume KPIs, a configurable word cloud (title / message / both, filtered by score), top-20 words and bigrams,
comment-length distributions, and a side-by-side <strong>low-score (1–2★) vs high-score (4–5★)</strong> cloud — so you
literally see what angry vs happy customers say. A language toggle translates PT→EN via the Cloud Translation API.
This is the qualitative companion to the quantitative review scores in Lesson 12.</p>
<div class="file-ref">📄 p5_analytics/wordcloud/app.py · text.py</div>

<h2>App 6 — the ops dashboard (p6 observability + Grafana)</h2>
<p>The BI apps answer "what is the business doing?" The <strong>ops portal</strong> answers "is the platform
healthy and did last night's job run?" It's a Flask page that polls <code>/api/status</code> every 15s and shows a
green/yellow/red board for every component — the five analytics apps, the <code>olist-dagster</code> VM and the
<code>sctp-m2-olist</code> Cloud SQL instance — using GCP Admin APIs (Cloud Run / Compute) plus simple pings. It does
<em>not</em> query the gold mart; it's pure infra health.</p>
<p>Behind it, <strong>Grafana</strong> provisions two dashboards from Cloud Monitoring + BigQuery datasources (auth
via the runtime SA, no keys): <em>"Platform Health (Manager)"</em> (Cloud Run instances, req/s, 5xx, p95 latency;
Cloud SQL CPU; BigQuery bytes billed) and <em>"Engineering Deep Dive"</em> (CPU/memory, DB connections, BQ query
count, top jobs by bytes billed).</p>
<div class="file-ref">📄 p6_orchestration/observability/app.py · grafana/platform-health.json · grafana/eng-deep-dive.json</div>

<h2>How they're deployed — Cloud Run, env-driven</h2>
<p>Every app follows the same recipe: a <code>Dockerfile</code>, a <code>Makefile</code> with a
<code>make deploy</code> target that runs <code>gcloud builds submit</code> then <code>gcloud run deploy</code>,
all in region <strong>us-central1</strong>. Behaviour is env-driven (e.g. <code>BQ_GOLD_DATASET=olist_gold_mart_prod</code>,
<code>DASH_OFFLINE</code>), and most services are serverless scale-to-zero.</p>
<pre><code class="language-bash"># p5_analytics/dash/Makefile — the deploy shape (abridged)
make deploy        # = gcloud builds submit  +  gcloud run deploy olist-dash \\
                   #     --region us-central1 --memory 1Gi --cpu 1 \\
                   #     --set-env-vars ENV=prod,GCP_PROJECT=...,BQ_GOLD_DATASET=olist_gold_mart_prod

# Streamlit deck bakes a fresh snapshot before shipping:
make snapshot      # re-query BQ -&gt; data/*.parquet
make deploy        # gcloud run deploy olist-streamlit --set-env-vars DASH_OFFLINE=1</code></pre>

<table>
  <tr><th>App</th><th>Serves data via</th><th>Live or snapshot?</th><th>Scale-to-zero?</th></tr>
  <tr><td>Streamlit deck</td><td>parquet (Pattern A)</td><td>Snapshot (<code>DASH_OFFLINE=1</code>)</td><td>Yes</td></tr>
  <tr><td>Dash</td><td>parquet / live (Pattern A)</td><td>Live in prod</td><td>Yes</td></tr>
  <tr><td>Streamlit team</td><td>live BQ (Pattern B)</td><td>Live, 1h cache</td><td>Yes</td></tr>
  <tr><td>Superset</td><td>SQLAlchemy → BQ</td><td>Live</td><td>No (<code>min-instances=1</code>, Cloud SQL metadata)</td></tr>
  <tr><td>Word cloud</td><td>live BQ (Pattern B)</td><td>Live, 1h cache</td><td>Yes</td></tr>
</table>

<div class="callout tip">
<p><strong>💡 When to reach for which.</strong> Streamlit deck = narrated stakeholder walkthrough.
Dash = polished interactive demo. Team Streamlit = each sub-team owns a live page. Superset = let analysts answer
their <em>own</em> questions in SQL. Word cloud = qualitative "voice of the customer." Ops portal/Grafana =
operations, not analytics.</p>
</div>

<h2>Where to go next</h2>
<ul>
  <li><strong>Capstone (Lesson 14):</strong> add a new KPI to one of these dashboards end-to-end and trace a row from
  CSV all the way to a chart.</li>
  <li><strong>Try it:</strong> run any app locally with its <code>make</code> target, then open the live Cloud Run
  URL listed in <code>p5_analytics/app.MD</code>.</li>
</ul>
`,
  steps: [
    'Open <code>p5_analytics/app.MD</code> and list the five analytics Cloud Run services and their URLs',
    'Read <code>p5_analytics/streamlit/bq.py</code> and trace the memo → parquet → BigQuery fallback in <code>cached()</code>',
    'Compare it with <code>p5_analytics/streamlit_team/lib/bq.py</code> — note the live-only <code>@st.cache_data(ttl=3600)</code> pattern',
    'In <code>p5_analytics/streamlit/queries.py</code>, find <code>ORDERS_SQL</code> and see which gold tables it joins',
    'Open <code>p5_analytics/superset/sql/</code> and read <code>v_orders</code> — the SQL semantic layer',
    'Open <code>p6_orchestration/observability/app.py</code> and find the <code>DEFAULT_TARGETS</code> the ops portal health-checks',
    'Run one app: <code>cd p5_analytics/dash &amp;&amp; make run</code> (or open the live URL) and click through the four tabs'
  ],
  quiz: [
    {
      q: 'What do ALL of the p5 analytics apps read from — and what do they never touch?',
      options: [
        'They read the bronze raw tables; they never touch stage',
        'They read the gold mart (fact_orders + dim_* in olist_gold_mart_prod); they never touch bronze or stage',
        'They each have their own copy of the CSVs; they never touch BigQuery'
      ],
      answer: 1,
      explain: 'Every serving app reads the gold mart only. That single contract — fact_orders plus the dimension tables — is what keeps five different UIs telling the same numbers.'
    },
    {
      q: 'How does the Streamlit deck (Pattern A) avoid breaking when there is no network?',
      options: [
        'It refuses to start without BigQuery access',
        'bq.cached() falls back to on-disk data/*.parquet snapshots (DASH_OFFLINE=1 by default), so the live demo never needs BQ',
        'It downloads the entire warehouse to the browser'
      ],
      answer: 1,
      explain: 'bq.cached resolves memo → parquet → live BigQuery. The Streamlit deck ships DASH_OFFLINE=1 and bakes parquet into the image via make snapshot, so a conference Wi-Fi outage never breaks the talk.'
    },
    {
      q: 'Why does Superset deploy differently from the other apps (min-instances=1, Cloud SQL)?',
      options: [
        'Superset is slower and needs a warm instance for performance only',
        'Superset needs a persistent metadata database for its dashboards/users, so it stores state in a database on the shared Cloud SQL instance and cannot scale to zero',
        'Superset cannot run on Cloud Run at all'
      ],
      answer: 1,
      explain: 'Unlike the stateless Streamlit/Dash apps, Superset keeps its own metadata (charts, datasets, users). That lives in a superset database on Cloud SQL (which survives the nightly VM teardown), and the service runs with min-instances=1.'
    },
    {
      q: 'What is the role of the p6 observability ops portal + Grafana relative to the BI apps?',
      options: [
        'It is a sixth executive dashboard showing GMV and repeat rate',
        'It answers "is the platform healthy / did the job run?" — health of the apps, VM and Cloud SQL plus Grafana infra metrics — and does not query the gold mart',
        'It replaces Dagster as the orchestrator'
      ],
      answer: 1,
      explain: 'The ops portal polls component health (the five apps, the Dagster VM, Cloud SQL) and links to Grafana dashboards built on Cloud Monitoring + BigQuery metrics. It is operations, not analytics — it never reads the gold mart.'
    }
  ]
});
