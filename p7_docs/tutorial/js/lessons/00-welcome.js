/* Lesson 00 — Welcome */
window.TUTORIAL_LESSONS.push({
  id: 'welcome',
  order: 0,
  track: 'start',
  icon: '👋',
  title: 'Welcome to the Olist ELT Academy',
  subtitle: 'Learn how SCTP Team 2 built a production-grade ELT platform — from raw CSVs to executive dashboards.',
  minutes: 10,
  objectives: [
    'Understand what this tutorial covers and how it maps to the 7 project modules',
    'Pick your learning path: Technical, Business, or both',
    'Know where the real code lives in the <code>m2-elt</code> repository'
  ],
  body: `
<h2>What is this project?</h2>
<p>This tutorial teaches the <strong>SCTP DSAI Module 2 capstone</strong>: a complete, production-deployed
<strong>ELT (Extract → Load → Transform) data platform</strong> built on the
<a href="https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce" target="_blank">Olist Brazilian E-Commerce dataset</a> —
~100,000 real orders from 2016–2018 across customers, sellers, products, payments, reviews, and geolocation.</p>

<p>By the end you will understand <em>every layer</em> of a modern data stack:</p>

<div class="mermaid-wrap"><pre class="mermaid">
flowchart LR
  A["📦 Raw Data<br/>9 Olist CSVs / Postgres"] --> B["📥 Extract &amp; Load<br/>dlt / Meltano"]
  B --> C["🥉 Bronze<br/>BigQuery raw tables"]
  C --> D["🥈 Stage (Silver)<br/>dbt views: dedup + types"]
  D --> E["🥇 Gold Mart<br/>Star schema: dims + facts"]
  E --> F["📊 BI Apps<br/>Dash · Superset · Streamlit"]
  G["⚙️ Dagster<br/>nightly 02:00 SGT"] -.orchestrates.-> C
  G -.-> D
  G -.-> E
</pre></div>

<h2>The 7 project modules</h2>
<table>
  <tr><th>Module</th><th>Folder</th><th>What it does</th><th>Covered in</th></tr>
  <tr><td>1. Extract &amp; Load</td><td><code>p1_el/</code></td><td>CSVs / Postgres → BigQuery bronze</td><td>Technical · Lesson 4</td></tr>
  <tr><td>2. Warehouse Design</td><td><code>p2_warehouse_design/</code></td><td>Star schema spec, grains, SCD2</td><td>Technical · Lesson 5</td></tr>
  <tr><td>3. dbt Transformations</td><td><code>p3_dbt_project/</code></td><td>Bronze → stage views → gold marts</td><td>Technical · Lessons 6–7</td></tr>
  <tr><td>4. Data Quality</td><td><code>p4_data_quality/</code></td><td>dbt tests + Great Expectations</td><td>Technical · Lesson 8</td></tr>
  <tr><td>5. Analytics &amp; BI</td><td><code>p5_analytics/</code></td><td>EDA notebooks, Dash, Superset, Streamlit</td><td>Business · Lessons 11–14</td></tr>
  <tr><td>6. Orchestration</td><td><code>p6_orchestration/</code></td><td>Dagster assets, jobs, nightly schedule</td><td>Technical · Lesson 9</td></tr>
  <tr><td>7. Documentation</td><td><code>p7_docs/</code></td><td>Diagrams, report, this tutorial!</td><td>Everywhere</td></tr>
</table>

<h2>Choose your path</h2>
<div class="track-grid">
  <div class="track-card">
    <div class="track-icon">🔧</div>
    <h3>Technical Track</h3>
    <p>For data engineers. Build the pipeline end-to-end: extraction, warehouse modeling, dbt, testing, Dagster orchestration, and GCP deployment. ~3.5 hours.</p>
  </div>
  <div class="track-card">
    <div class="track-icon">📊</div>
    <h3>Business Track</h3>
    <p>For analysts &amp; stakeholders. The Olist business model, KPI definitions, the repeat-purchase diagnosis, and the BI dashboards that tell the story. ~1.5 hours.</p>
  </div>
  <div class="track-card">
    <div class="track-icon">🏆</div>
    <h3>Full Journey</h3>
    <p>Do both tracks in order, then the Capstone exercises. This mirrors how the team actually built and presented the project. ~5 hours.</p>
  </div>
</div>

<div class="callout tip">
<p><strong>💡 How to use this app:</strong> each lesson has learning objectives, a hands-on checklist
(tick items as you do them against the real repo), and a short quiz. Progress is saved in your browser.
Press <code>/</code> to search lessons.</p>
</div>

<h2>What you need</h2>
<ul>
  <li>The <code>m2-elt</code> repository cloned locally (this tutorial lives in <code>p7_docs/tutorial/</code>)</li>
  <li>Basic SQL and Python familiarity</li>
  <li>Optional, for hands-on runs: a GCP project with BigQuery + the team service-account key (see the Setup lesson)</li>
</ul>

<div class="callout info">
<p><strong>The one-sentence business story</strong> you'll see proven with data: Olist's revenue grows on
new-customer acquisition, but only <strong>~3% of customers ever buy again</strong> — and the data shows
the binding constraint is <strong>delivery experience → review scores → reorder likelihood</strong>.</p>
</div>
`,
  steps: [
    'Open the repo root <code>m2-elt/</code> in your editor and skim the top-level folders <code>p1_el</code> … <code>p7_docs</code>',
    'Read the root <code>readme.md</code> (5 min) — note the medallion naming convention',
    'Decide your track: Technical, Business, or Full Journey',
    'Bookmark this tutorial (it runs from <code>p7_docs/tutorial/index.html</code>)'
  ],
  quiz: [
    {
      q: 'What does ELT stand for, and where does the "T" happen in this project?',
      options: [
        'Extract, Load, Transform — transformation happens inside the warehouse (BigQuery) via dbt',
        'Extract, Link, Transfer — transformation happens in Python before loading',
        'Export, Load, Test — transformation happens in the BI tools'
      ],
      answer: 0,
      explain: 'In ELT, raw data is loaded into the warehouse first (bronze), then transformed in-place with dbt (stage → gold). This is the opposite of classic ETL, where transformation happens before loading.'
    },
    {
      q: 'Which dataset powers this entire project?',
      options: [
        'A synthetic dataset generated by the team',
        'The Olist Brazilian e-commerce dataset (~100K orders, 2016–2018) from Kaggle',
        'Live data scraped from Brazilian e-commerce sites'
      ],
      answer: 1,
      explain: 'Olist is a real Brazilian marketplace. The public Kaggle dataset contains 9 related tables: orders, order items, customers, sellers, products, payments, reviews, geolocation, and a category-name translation.'
    }
  ]
});
