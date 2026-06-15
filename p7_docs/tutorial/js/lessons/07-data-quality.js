/* Lesson 07 — P4 Data Quality */
window.TUTORIAL_LESSONS.push({
  id: 'data-quality',
  order: 7,
  track: 'technical',
  icon: '✅',
  title: 'P4 · Data Quality — Tests & Gates',
  subtitle: 'How the pipeline proves its gold marts are trustworthy before any dashboard reads them: dbt schema tests that fail the run, Great Expectations statistical suites, and plain-SQL business validations — all acting as a gate the nightly Dagster run must pass.',
  minutes: 30,
  objectives: [
    'Explain why data quality is a <strong>gate</strong> placed before BI serving, not an afterthought',
    'Read real dbt schema tests: <code>unique</code>, <code>not_null</code>, <code>relationships</code>, <code>accepted_values</code>',
    'Understand <strong>severity</strong> (error vs warn) and <code>store_failures</code>',
    'Describe the Great Expectations layer and the SQL business validations',
    'See how a red test halts the nightly Dagster run before gold reaches dashboards'
  ],
  body: `
<h2>Quality as a gate, not a report</h2>
<p>The gold marts from Lesson 06 feed dashboards and ML downstream. If a primary key silently duplicates or a
foreign key points at nothing, every number built on top is wrong. Module 4 (<code>p4_data_quality/</code>)
makes correctness a <strong>gate</strong>: tests run as part of the pipeline, and a failure <em>halts</em> the
build before anyone reads stale or broken data.</p>

<div class="callout info">
<p><strong>The contract from p4_data_quality/README.md:</strong> <em>"Failing tests gate the gold marts… M5
can trust the gold marts because these gates passed. M6 runs these tests as part of the orchestrated pipeline;
failures halt downstream."</em> Quality is wired into the DAG, not run by hand afterwards.</p>
</div>

<p>There are three layers, fastest and cheapest first:</p>
<table>
  <tr><th>Layer</th><th>Tool</th><th>Catches</th></tr>
  <tr><td>1 · dbt schema tests</td><td>dbt (runs in the build)</td><td>PK uniqueness, nulls, broken FKs, illegal enum values, wrong types</td></tr>
  <tr><td>2 · Great Expectations</td><td>GE suites + checkpoints</td><td>Distributions, value ranges, null-rate envelopes — statistical/business rules</td></tr>
  <tr><td>3 · SQL validations</td><td>Plain BigQuery SQL</td><td>Reconciliation + business-logic checks clearest as queries</td></tr>
</table>

<div class="mermaid-wrap"><pre class="mermaid">
flowchart LR
  GOLD["gold marts<br/>fact_orders + dim_*"] --> T1["dbt tests<br/>unique / not_null / relationships / accepted_values"]
  T1 -- pass --> T2["Great Expectations<br/>ranges + distributions"]
  T2 -- pass --> T3["SQL validations<br/>reconciliation"]
  T3 -- pass --> BI["✅ BI / ML serving"]
  T1 -- fail --> STOP["❌ halt nightly run"]
</pre></div>

<h2>Layer 1 — dbt schema tests</h2>
<p>dbt's <strong>generic tests</strong> are declared right next to the model in <code>schema.yml</code>. Each
compiles to a query that selects the <em>failing</em> rows; if it returns any, the test fails. Because the
team runs <code>dbt build</code> (not <code>dbt run</code>), these execute <em>in the same command</em> that
builds the marts.</p>

<h3>unique + not_null — every primary key</h3>
<div class="file-ref">📄 p3_dbt_project/brazil_ecommerce/models/gold_mart/schema.yml</div>
<pre><code class="language-yaml">models:
  - name: dim_customers
    columns:
      - name: id
        description: "Primary key (customer_id)."
        tests:
          - unique
          - not_null</code></pre>
<p>Every dimension PK gets this pair. It is the gold-side guarantee that the silver dedup (Lesson 05) actually
held: one row per key, never null.</p>

<h3>unique_combination_of_columns — the composite key</h3>
<p><code>fact_orders</code> has no single unique column; its key is the pair <code>(id, order_item_id)</code>.
The <code>dbt_utils</code> package (pulled by <code>packages.yml</code>) provides a model-level test for that:</p>
<pre><code class="language-yaml">  - name: fact_orders
    data_tests:
      - dbt_utils.unique_combination_of_columns:
          arguments:
            combination_of_columns:
              - id
              - order_item_id</code></pre>

<h3>relationships — every foreign key</h3>
<p>A <code>relationships</code> test asserts that every value in a fact FK column exists in its dimension's key
— catching orphaned references:</p>
<pre><code class="language-yaml">      - name: customer_id
        tests:
          - not_null
          - relationships:
              arguments:
                to: ref('dim_customers')
                field: id
      - name: product_id
        tests:
          - relationships:
              arguments:
                to: ref('dim_products')
                field: id
              config:
                severity: warn   # not every line resolves; warn, don't fail</code></pre>

<div class="callout info">
<p><strong>severity: warn vs error.</strong> The <code>customer_id</code> FK is a hard <code>error</code> — an
order with no customer is a real bug. But <code>product_id</code>, <code>seller_id</code> and the review join
use <code>severity: warn</code>, because Lesson 06 builds <code>fact_orders</code> with LEFT JOINs:
item-less orders legitimately carry null FKs, and not every order has a review. <strong>warn</strong> surfaces
the count in the logs without failing the run; <strong>error</strong> (the default) stops it.</p>
</div>

<h3>accepted_values — enums</h3>
<p>Categorical columns must only hold known values. This is where the gold defaulting from Lesson 06 pays off —
<code>COALESCE(order_status,'unavailable')</code> and <code>COALESCE(payment_type,'not_defined')</code> ensure
no null sneaks past the enum check:</p>
<pre><code class="language-yaml">      - name: order_status
        tests:
          - not_null
          - accepted_values:
              arguments:
                values: ['approved','canceled','created','delivered','invoiced',
                         'processing','shipped','unavailable']
      - name: payment_type
        tests:
          - not_null
          - accepted_values:
              arguments:
                values: ['boleto','credit_card','debit_card','voucher','not_defined']</code></pre>

<h3>Typed assertions via dbt_expectations</h3>
<p>The second package, <code>dbt_expectations</code>, adds column-type checks used throughout
<code>schema.yml</code> — e.g. <code>price</code> must be <code>FLOAT64</code>, timestamps must be
<code>TIMESTAMP</code>, <code>order_item_id</code> must be <code>INT64</code>:</p>
<pre><code class="language-yaml">      - name: price
        tests:
          - dbt_expectations.expect_column_values_to_be_of_type:
              arguments:
                column_type: FLOAT64</code></pre>

<h3>store_failures — keep the evidence</h3>
<p><code>dbt_project.yml</code> sets <code>+store_failures: true</code> project-wide, so failing rows are
written to an audit dataset instead of vanishing:</p>
<div class="file-ref">📄 p3_dbt_project/brazil_ecommerce/dbt_project.yml</div>
<pre><code class="language-yaml">data_tests:
  +store_failures: true</code></pre>
<p>When a test goes red you can <code>SELECT</code> the exact offending rows from the audit table rather than
re-deriving them — invaluable for debugging a 3 a.m. pipeline failure.</p>

<h2>Layer 2 — Great Expectations</h2>
<p>dbt tests are great at structural rules but blunt at <em>statistical</em> ones. Great Expectations (GE)
adds suites of business-rule and distribution checks on the gold marts.</p>
<div class="file-ref">📄 p4_data_quality/great_expectations/README.md</div>
<ul>
  <li><code>review_score</code> between 1 and 5</li>
  <li><code>order_purchase</code> timestamps within the dataset's valid window</li>
  <li><code>lifetime_value &gt;= 0</code>; mean order value within historical bounds</li>
  <li>referential integrity: every <code>customer_sk</code> exists in <code>dim_customer</code></li>
</ul>
<p>Some of these overlap deliberately with dbt expressed as <code>dbt_expectations</code> tests — the
<code>GoldMart_tests.md</code> file shows range checks like <code>expect_column_values_to_be_between</code>
for <code>price</code>, <code>review_score</code> and <code>payment_value</code>, plus standalone SQL tests
(e.g. <em>every delivered order must have a delivery date</em>, <em>no future purchase dates</em>). GE produces
HTML "data docs" so the pass/fail picture is human-readable for the QA report.</p>

<div class="callout tip">
<p><strong>💡 Coverage targets (from the README):</strong> every PK <code>unique + not_null</code>; every FK a
<code>relationships</code> test; every enum an <code>accepted_values</code>; and at least one statistical check
per gold mart (null-rate / range / distribution). That checklist is how you know the gate is complete.</p>
</div>

<h2>Layer 3 — SQL business validations</h2>
<p>Some checks read most clearly as plain SQL — reconciliation and business-logic queries over the marts.
<code>p4_data_quality/sql_validations/</code> holds these plus a human-readable <code>qa_report.md</code>. The
<code>BizQueries.md</code> collection doubles as both validation and analytics, e.g. revenue reconciliation,
seller delivery-quality ranking, and SLA analysis that lean on the Lesson 06 flags:</p>
<pre><code class="language-sql">-- Delivery SLA + data-quality flags, per seller state
SELECT
    s.seller_state,
    COUNT(DISTINCT f.id) AS total_orders,
    COUNTIF(f.is_long_delivery)   AS long_deliveries,
    COUNTIF(f.is_overdue_delivery) AS overdue_deliveries,
    ROUND(COUNTIF(f.is_overdue_delivery) / COUNT(*) * 100, 2) AS overdue_rate_pct
FROM fact_orders f
LEFT JOIN dim_sellers s ON f.seller_id = s.id
WHERE f.order_status = 'delivered'
GROUP BY 1
ORDER BY overdue_rate_pct DESC</code></pre>
<p>Because the data-quality flags (<code>is_long_delivery</code>, <code>is_overdue_delivery</code>,
<code>has_invalid_delivery_date</code>) were computed once in <code>fact_orders</code>, the validation queries
just <code>COUNTIF</code> them — quality logic and reporting share the same source of truth.</p>

<h2>The gate in the nightly run</h2>
<p>Because the tests are part of <code>dbt build</code>, they execute every time Dagster builds gold. A
<strong>red test fails the build</strong>, the gold asset is marked failed, and downstream assets (BI, exports)
do not run on the bad data.</p>
<pre><code class="language-bash">cd p3_dbt_project/brazil_ecommerce
set -a &amp;&amp; source ../../.env.dev &amp;&amp; set +a

# build runs the models AND their tests; a failing test exits non-zero
dbt build --select tag:gold_mart

# or run only the tests against already-built marts
dbt test --select tag:gold_mart

# then the richer GE suites
python p4_data_quality/run_ge.py</code></pre>

<div class="callout warn">
<p><strong>⚠️ A green run is the promise.</strong> The nightly Dagster pipeline (Lesson on Orchestration) only
serves gold to BI when these gates pass. That is why severity is chosen so carefully: a real integrity
violation must be <code>error</code> so it stops the run, while expected-null FKs are <code>warn</code> so
they don't cry wolf and desensitise the team to red.</p>
</div>
`,
  steps: [
    'Open <code>models/gold_mart/schema.yml</code> and find the <code>unique</code> + <code>not_null</code> tests on every <code>dim_*</code> PK',
    'Find the <code>dbt_utils.unique_combination_of_columns</code> test on <code>fact_orders</code> and explain why a single unique column won\'t do',
    'Compare the <code>relationships</code> test on <code>customer_id</code> (error) with the one on <code>product_id</code> (warn) — why the difference?',
    'List the allowed <code>accepted_values</code> for <code>payment_type</code> and connect them to the <code>COALESCE(...,\'not_defined\')</code> in fact_orders',
    'Open <code>dbt_project.yml</code> and find <code>+store_failures: true</code> — what does it give you when a test fails?',
    'Skim <code>p4_data_quality/great_expectations/GoldMart_tests.md</code> for a range check that dbt\'s generic tests do not cover',
    'Optional (needs GCP creds): run <code>dbt build --select tag:gold_mart</code> and watch the test summary'
  ],
  quiz: [
    {
      q: 'Why is data quality described as a "gate" in this project?',
      options: [
        'Tests run weekly in a separate report no one blocks on',
        'Tests run inside the pipeline (dbt build / Dagster) and a failure halts downstream so BI never reads broken gold',
        'It only checks that files exist before loading'
      ],
      answer: 1,
      explain: 'p4_data_quality/README.md states failing tests gate the gold marts and M6 runs them in the orchestrated pipeline so failures halt downstream. Because tests are part of dbt build, a red test fails the gold asset and stops serving.'
    },
    {
      q: 'What does a dbt relationships test assert, and why is product_id set to severity: warn?',
      options: [
        'That two tables have the same row count; warn because counts drift',
        'That every FK value exists in the referenced dimension key; product_id is warn because fact_orders uses LEFT JOINs, so item-less orders legitimately carry null/unmatched FKs',
        'That the columns have matching data types'
      ],
      answer: 1,
      explain: 'relationships checks referential integrity from a fact FK to a dimension PK. customer_id is a hard error, but product_id/seller_id/review use severity: warn because Lesson 06 builds fact_orders with LEFT JOINs — orders without line items keep null FKs, an expected condition.'
    },
    {
      q: 'Which test guarantees fact_orders has no duplicate rows, given it lacks a single unique column?',
      options: [
        'A not_null test on order_item_id',
        'dbt_utils.unique_combination_of_columns on (id, order_item_id)',
        'accepted_values on order_status'
      ],
      answer: 1,
      explain: 'fact_orders is at order-item grain with composite PK (id, order_item_id). schema.yml uses the dbt_utils.unique_combination_of_columns test on those two columns together to enforce uniqueness of the pair.'
    },
    {
      q: 'What does +store_failures: true in dbt_project.yml provide?',
      options: [
        'It retries failed tests automatically',
        'It writes the failing rows to an audit dataset so you can query exactly which records broke a test',
        'It downgrades all errors to warnings'
      ],
      answer: 1,
      explain: 'With +store_failures: true, dbt persists the rows returned by a failing test into an audit table instead of discarding them, so debugging a red test is a SELECT away rather than a re-derivation.'
    }
  ]
});
