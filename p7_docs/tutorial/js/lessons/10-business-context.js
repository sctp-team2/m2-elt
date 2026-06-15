/* Lesson 10 — B1 Business Context */
window.TUTORIAL_LESSONS.push({
  id: 'business-context',
  order: 10,
  track: 'business',
  icon: '🛒',
  title: 'B1 · Business Context — The Olist Marketplace',
  subtitle: 'What Olist is, the shape of the data, the customer_id vs customer_unique_id trap, and the one business question the whole project is built to answer.',
  minutes: 20,
  objectives: [
    'Explain what Olist is and how a Brazilian marketplace makes money',
    'Describe the shape of the dataset: span, volume, and the 9 related tables',
    'Distinguish <code>customer_id</code> from <code>customer_unique_id</code> — and why repeat analysis is wrong without it',
    'State the central business question and the three executive viewpoints behind it',
    'Map the assignment brief’s evaluation criteria onto what the analytics deliver'
  ],
  body: `
<h2>What is Olist?</h2>
<p><strong>Olist</strong> is a Brazilian e-commerce <em>marketplace platform</em>. It does not sell its own
inventory. Instead it connects thousands of <strong>small and medium sellers</strong> to customers shopping on
large Brazilian storefronts, and handles the plumbing in between: the storefront listing, the checkout, the
payment, and the logistics hand-off to carriers. Olist earns when a sale flows through the platform.</p>

<p>That business model has a direct consequence for the data — and for this project's central question.
Because Olist's growth comes from putting <em>more sellers</em> and <em>more first-time buyers</em> onto the
platform, the obvious growth lever is <strong>acquisition</strong>. The question this whole pipeline exists to
answer is whether acquisition is actually the <em>cheapest</em> lever, or whether the business is quietly
leaking the customers it already paid to win.</p>

<div class="callout info">
<p><strong>The one-sentence business story</strong> (the same one from the Welcome lesson, now we prove it with
data): Olist's revenue grows on <strong>new-customer acquisition</strong>, but only <strong>~3% of customers
ever buy again</strong> — and the data points to <strong>delivery experience → review scores → reorder
likelihood</strong> as the binding constraint on profitable growth.</p>
</div>

<h2>The shape of the data</h2>
<p>The project runs on the public <a href="https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce" target="_blank">Olist
Brazilian E-Commerce dataset</a> — real, anonymised marketplace activity. The headline figures below are the
<em>actual</em> numbers the team's EDA pulled from the gold mart (not estimates):</p>

<table>
  <tr><th>Property</th><th>Value</th><th>Source</th></tr>
  <tr><td>Date span</td><td><strong>2016-09-04 → 2018-10-17</strong></td><td>EDA run facts</td></tr>
  <tr><td>Orders</td><td><strong>99,441</strong> distinct orders</td><td><code>fact_orders</code></td></tr>
  <tr><td>Order <em>items</em></td><td><strong>113,425</strong> rows (the fact grain is one row per item)</td><td><code>fact_orders</code></td></tr>
  <tr><td>Unique customers</td><td><strong>96,096</strong> distinct people</td><td><code>customer_unique_id</code></td></tr>
  <tr><td>Source tables</td><td><strong>9</strong> related CSVs (orders, items, payments, reviews, customers, sellers, products, geolocation, category translation)</td><td><code>datasets/</code></td></tr>
</table>

<div class="callout tip">
<p><strong>Grain matters.</strong> <code>fact_orders</code> is at the <em>order-item</em> grain — 113,425 rows
for 99,441 orders. Every KPI query in the BI apps first collapses items up to one row per order before counting
orders or summing revenue. Forget this and you double-count multi-item orders.</p>
</div>

<h2>The 9 tables, related</h2>
<p>The nine source files join into a small star around orders. You don't need them all memorised, but you should
recognise how they connect — that's what makes the customer journey reconstructable:</p>

<div class="mermaid-wrap"><pre class="mermaid">
erDiagram
  CUSTOMERS ||--o{ ORDERS : places
  ORDERS ||--|{ ORDER_ITEMS : contains
  ORDERS ||--o| REVIEWS : "rated by"
  ORDERS ||--o{ PAYMENTS : "paid via"
  ORDER_ITEMS }o--|| PRODUCTS : "is a"
  ORDER_ITEMS }o--|| SELLERS : "sold by"
  PRODUCTS }o--|| CATEGORY_TR : "translated by"
  CUSTOMERS }o--o{ GEOLOCATION : "located at"
</pre></div>

<ul>
  <li><strong>orders</strong> — status + the full timestamp lifecycle: purchased → approved → handed to carrier → delivered → <em>estimated</em> delivery. The delivery story lives here.</li>
  <li><strong>order_items</strong> — line items with <code>price</code> and <code>freight_value</code>. Revenue lives here.</li>
  <li><strong>reviews</strong> — a 1–5 star score (and optional comment) per order. Customer satisfaction lives here.</li>
  <li><strong>customers</strong> — the table hiding the most important subtlety in the whole dataset (next section).</li>
  <li><strong>payments, products, sellers, geolocation, category translation</strong> — supporting context.</li>
</ul>

<h2>The trap: <code>customer_id</code> vs <code>customer_unique_id</code></h2>
<p>This single distinction decides whether your repeat-purchase number is right or off by a meaningless factor.
In the Olist data the <code>customers</code> table has <em>two</em> identifiers:</p>

<table>
  <tr><th>Column</th><th>What it identifies</th><th>Repeat behaviour</th></tr>
  <tr><td><code>customer_id</code></td><td>One row <strong>per order</strong> — effectively an order-scoped key</td><td>A person who buys 3 times gets <strong>3 different</strong> <code>customer_id</code> values. Counting these makes <em>everyone</em> look brand new.</td></tr>
  <tr><td><code>customer_unique_id</code></td><td>One value <strong>per real person</strong>, stable across all their orders</td><td>That same person keeps <strong>one</strong> <code>customer_unique_id</code> across all 3 orders. This is the key you must use to detect a reorder.</td></tr>
</table>

<div class="callout warn">
<p><strong>⚠️ If you compute repeat rate on <code>customer_id</code>, you will conclude (wrongly) that the repeat
rate is essentially zero — because the key changes on every order.</strong> The <em>true</em> repeat rate is
computed by grouping on <code>customer_unique_id</code> and asking how many of those people placed more than one
order. Every retention metric in this project keys on <code>customer_unique_id</code> for exactly this reason.</p>
</div>

<p>You can see the team encode this directly: the BI query joins <code>dim_customers</code> to surface
<code>customer_unique_id</code>, and the metrics layer groups on it to flag repeats:</p>

<div class="file-ref">📄 p5_analytics/dash/metrics.py</div>
<pre><code class="language-python"># Order sequence per real person (customer_unique_id) — NOT customer_id.
orders = orders.sort_values("purchase_ts")
grp = orders.groupby("customer_unique_id")
orders["order_seq"]          = grp.cumcount() + 1
orders["cust_total_orders"]  = grp["order_id"].transform("count")
orders["is_repeat_order"]    = orders["order_seq"] &gt; 1</code></pre>

<h2>The business question</h2>
<p>The EDA frames the problem as <em>three executives each seeing one face of the same elephant</em>
(from the team's EDA plan):</p>

<table>
  <tr><th>Exec</th><th>What they see</th></tr>
  <tr><td><strong>CEO</strong></td><td>GMV grows, but marketing spend keeps climbing to sustain it; margins feel soft.</td></tr>
  <tr><td><strong>CMO</strong></td><td>Re-engagement underperforms — blames a "non-sticky brand."</td></tr>
  <tr><td><strong>CTO</strong></td><td>Delivery complaints and low reviews treated as operational noise.</td></tr>
</table>

<p>The hypothesis the analysis tests ties all three together:</p>

<div class="callout info">
<p><em>The binding constraint on profitable growth is the <strong>repeat-purchase rate</strong>, and the largest
controllable lever on repeat purchase is <strong>delivery experience</strong>. Late delivery → low review scores
→ customers don't return. The cause lives in logistics (CTO), surfaces as a retention/marketing problem (CMO),
and bleeds margin (CEO).</em> If true, fixing delivery is cheaper than buying growth with marketing.</p>
</div>

<p>The next lesson (B2) defines the exact KPIs that test this chain. For now, the headline result that the
analysis lands on: only <strong>2,997 customers (3.1%)</strong> of the 96,096 ever reordered — growth really is
almost entirely new-customer acquisition.</p>

<h2>What the brief asks for</h2>
<p>The assignment (<code>assignment/README.md</code>) structures the project as an <strong>enterprise team</strong>:
each of seven modules has a lead accountable for quality and a support member, mapped to a real data role.
Module 5 — <strong>Data Analysis with Python</strong> (John Phang, support Lim Chun Wei, role
"Data Analytics / Business Intelligence") — is where the business question gets answered. Its required
deliverables are explicit:</p>

<table>
  <tr><th>Brief requirement (M5)</th><th>How this project delivers it</th></tr>
  <tr><td>Perform EDA</td><td><code>p5_analytics/notebooks/eda/eda.ipynb</code> — 99,441 orders, Restart &amp; Run All, 0 errors</td></tr>
  <tr><td>Generate KPIs</td><td>GMV, AOV, repeat rate, on-time rate, avg review (Lesson B2)</td></tr>
  <tr><td>Build insights &amp; visualizations</td><td>GMV trend, review-by-delivery, RFM segments, on-time-by-state</td></tr>
  <tr><td>Business recommendations</td><td>Mapped back to CEO / CMO / CTO actions</td></tr>
</table>

<p>There is one hard rule the brief and the M5 README both enforce: <strong>consume gold marts only — never query
silver or raw.</strong> The marts are the contract. Everything in the next lesson runs against
<code>olist_gold_mart</code>.</p>

<div class="callout tip">
<p><strong>Why an analyst should care about the pipeline.</strong> The repeat-rate number is only trustworthy
because the upstream layers guarantee it: stage dedups so a person isn't counted twice, gold conforms
<code>customer_unique_id</code> into <code>dim_customers</code>, and the p4 quality gates block the marts from
publishing if those keys break. Good business numbers are a <em>data-engineering</em> achievement.</p>
</div>
`,
  steps: [
    'Read the root <code>readme.md</code> and find the one-sentence business story (~3% repeat purchase)',
    'Open <code>assignment/README.md</code> and locate Module 5 (Data Analysis) — note its deliverables and enterprise role',
    'Read the EDA plan <code>my-work/HoongJun/dev/p5_analytics/notebooks/eda/eda-plan-result.md</code> — Section A.1 (the three executives) and Section B.1 (headline findings)',
    'In <code>p5_analytics/dash/metrics.py</code>, confirm that <code>is_repeat_order</code> is derived by grouping on <code>customer_unique_id</code>, not <code>customer_id</code>',
    'Note the data span (2016-09 → 2018-10) and the order vs order-item counts (99,441 vs 113,425)'
  ],
  quiz: [
    {
      q: 'What kind of business is Olist?',
      options: [
        'A Brazilian marketplace platform connecting small/medium sellers to customers — it does not hold its own inventory',
        'A logistics carrier that delivers parcels across Brazil',
        'A bank that processes installment payments for e-commerce'
      ],
      answer: 0,
      explain: 'Olist is a marketplace: it connects sellers to buyers on large storefronts and handles checkout, payment, and the carrier hand-off. Its growth lever is putting more sellers and first-time buyers onto the platform — which is exactly why the repeat-rate question matters.'
    },
    {
      q: 'Why must repeat-purchase rate be computed on customer_unique_id rather than customer_id?',
      options: [
        'customer_id is missing for most orders',
        'customer_id is order-scoped — a person gets a new customer_id for each order, so counting it makes everyone look brand new; customer_unique_id is stable per real person',
        'customer_unique_id is the only one indexed in BigQuery'
      ],
      answer: 1,
      explain: 'In the Olist data, customer_id changes on every order while customer_unique_id stays constant for the same person. Repeat detection requires the stable per-person key; using customer_id would make the repeat rate falsely collapse toward zero.'
    },
    {
      q: 'What is the central hypothesis the analysis tests?',
      options: [
        'Discounting deeper would raise GMV',
        'The binding constraint on profitable growth is the repeat-purchase rate, and the biggest controllable lever on it is delivery experience (late delivery → low reviews → no reorder)',
        'Adding more product categories would attract more sellers'
      ],
      answer: 1,
      explain: 'The CEO (soft margins / rising spend), CMO (non-sticky brand), and CTO (delivery noise) are three views of one elephant: a logistics problem that depresses retention. The EDA tests whether fixing delivery is cheaper than buying replacement growth.'
    }
  ]
});
