/* Lesson 12 — B3 · Insights */
window.TUTORIAL_LESSONS.push({
  id: 'insights',
  order: 12,
  track: 'business',
  icon: '💡',
  title: 'B3 · Insights — The Repeat-Purchase Diagnosis',
  subtitle: 'What the data actually told us: acquisition-led growth, a ~3% repeat rate, and the late-delivery → bad-review → no-reorder chain that the org keeps mistaking for three different problems.',
  minutes: 30,
  objectives: [
    'Frame the business question the way the team framed it: "one elephant, three pain points"',
    'Read the repeat-purchase diagnosis computed on <code>customer_unique_id</code> (the ~3% number)',
    'Trace the causal chain: delivery time → review score → reorder likelihood',
    'Explain category and geographic concentration, and what payment behaviour adds',
    'Turn each finding into a recommended action for the CEO, CMO and CTO'
  ],
  body: `
<h2>The business question</h2>
<p>By the time the analytics work (Module 5, <code>p5_analytics/</code>) starts, the warehouse already holds
a clean star schema: <code>fact_orders</code> plus <code>dim_customers</code>, <code>dim_sellers</code>,
<code>dim_products</code> and <code>dim_reviews</code>. The interesting part is no longer <em>can we query it</em>
— it's <em>what is the data trying to tell the business?</em></p>

<p>The team framed the whole analysis around one idea, taken straight from the EDA narrative:</p>

<div class="callout info">
<p><strong>"The company is <em>buying</em> growth it should be <em>earning</em>."</strong> The binding constraint
on profitable growth is the <strong>repeat-purchase rate</strong>, and the single biggest controllable lever on
it is the <strong>delivery experience</strong>.</p>
</div>

<h2>One elephant, three pain points</h2>
<p>Three executives each see a different animal — and each reaches for the wrong fix:</p>
<table>
  <tr><th>Executive</th><th>What they see</th><th>The tempting (wrong) fix</th></tr>
  <tr><td><strong>CEO</strong></td><td>GMV is growing, but marketing spend keeps climbing to sustain it and margins are soft. "We're working harder to grow."</td><td>Squeeze pricing / blame competition. But the leak is <em>retention</em>, not price.</td></tr>
  <tr><td><strong>CMO</strong></td><td>Re-engagement underperforms, churn is ugly, NPS is mediocre. "Our brand isn't sticky."</td><td>Spend more on loyalty comms. But the churn cause is <em>operational</em>, not a messaging problem.</td></tr>
  <tr><td><strong>CTO / COO</strong></td><td>Delivery complaints and low review scores, treated as operational noise / logistics cost.</td><td>Treat late deliveries as a cost line. But those late deliveries <em>are</em> the revenue leak.</td></tr>
</table>

<p>The single chain that connects all three:</p>
<div class="mermaid-wrap"><pre class="mermaid">
flowchart LR
  A["⏰ Late delivery<br/>(CTO/COO domain)"] --> B["⭐ Low review score"]
  B --> C["🚪 Customer never returns"]
  C --> D["📉 Low repeat rate<br/>(CMO retention problem)"]
  D --> E["💸 Rising acquisition spend<br/>& soft margins (CEO P&amp;L)"]
</pre></div>
<p>The cause lives in the <strong>CTO's</strong> domain, surfaces as the <strong>CMO's</strong> retention problem,
and shows up in the <strong>CEO's</strong> P&amp;L. Fixing delivery reliability is cheaper than buying replacement growth.</p>

<h2>Finding 1 — Growth is acquisition-led, not loyalty-led</h2>
<p>Monthly GMV grew roughly <strong>610% from Jan-2017 to Aug-2018, then plateaued</strong> — and the growth was
built on first-time buyers. When you split each month's GMV into "new" vs "repeat" customers, the new-customer
band is almost the entire chart. The company is on an acquisition treadmill: it has to keep buying new customers
just to stay flat.</p>
<div class="file-ref">📄 p5_analytics/notebooks/team_eda_pp1.ipynb — monthly GMV, new vs repeat split</div>

<h2>Finding 2 — Only ~3% of customers ever buy again</h2>
<p>This is the headline. The subtlety is the <strong>grain</strong>: Olist issues a fresh
<code>customer_id</code> per order, so counting on <code>customer_id</code> makes everyone look like a one-time
buyer by construction. The real person is <code>customer_unique_id</code> — and that's the key the repeat-rate
calculation uses.</p>

<pre><code class="language-sql">-- The shape of the repeat-rate diagnosis (computed on customer_unique_id)
SELECT
  COUNT(DISTINCT customer_unique_id)                         AS total_customers,
  COUNT(DISTINCT IF(order_count &gt; 1, customer_unique_id, NULL)) AS repeat_customers
FROM (
  SELECT c.customer_unique_id, COUNT(DISTINCT f.order_id) AS order_count
  FROM fact_orders f
  JOIN dim_customers c USING (customer_id)
  GROUP BY c.customer_unique_id
);</code></pre>

<table>
  <tr><th>Metric</th><th>Value</th></tr>
  <tr><td>Total unique customers (<code>customer_unique_id</code>)</td><td>96,096</td></tr>
  <tr><td>Repeat customers (more than one order)</td><td>2,997</td></tr>
  <tr><td>Repeat-purchase rate</td><td><strong>3.12%</strong> of customers (~3.4% of orders)</td></tr>
</table>

<div class="callout warn">
<p><strong>⚠️ Grain gotcha.</strong> If your repeat rate comes out near 0%, you almost certainly counted on
<code>customer_id</code> (per-order) instead of <code>customer_unique_id</code> (per-person). This single
distinction is the difference between "nobody comes back" and "3% come back." Olist is structurally one-shot.</p>
</div>

<h2>Finding 3 — The smoking gun: delivery → review</h2>
<p>Split delivered orders into on-time vs late and the review scores fall off a cliff. A late delivery roughly
<strong>halves the goodwill</strong> — about a <strong>−1.7★</strong> swing:</p>
<table>
  <tr><th>Delivery</th><th>Orders</th><th>Avg review</th><th>% 1–2★ (detractors)</th><th>% 4–5★ (promoters)</th></tr>
  <tr><td>On-time</td><td>87,708</td><td><strong>4.30★</strong></td><td>9.2%</td><td>82.9%</td></tr>
  <tr><td>Late</td><td>7,615</td><td><strong>2.57★</strong></td><td><strong>54.0%</strong></td><td>34.7%</td></tr>
</table>
<p>Across all delivered orders the late-delivery rate is <strong>8.11%</strong>, average delivery time is
<strong>12.09 days</strong> (median ~10), and the overall average review score is <strong>4.09★</strong> with
14.6% of reviews at 1–2★. The 8% of orders that arrive late produce a wildly disproportionate share of the
1–2★ reviews.</p>
<div class="file-ref">📄 p5_analytics/notebooks/team_eda_pp3.ipynb — delivery delay → review score</div>

<h2>Finding 4 — and the review feeds reorder likelihood</h2>
<p>Close the loop: a customer whose <em>first</em> order arrived on-time reorders at <strong>3.13%</strong>,
versus <strong>2.56%</strong> for a first order that was late. The first delivery is a retention event, not just
a logistics event — a good first experience is the cheapest retention spend the business has.</p>
<div class="callout info">
<p><strong>Be honest about the data.</strong> Repeat rate clearly rises when the first experience is good, but the
per-score breakdown isn't perfectly monotonic (the 5★ bucket reorders <em>less</em> than the 4★ bucket in the
raw table). The robust, defensible claim is the directional one — <em>good first delivery → higher reorder</em> —
not a clean monotonic ladder. The team flagged this honestly rather than over-fitting the story.</p>
</div>

<h2>Finding 5 — Revenue is concentrated by geography and category</h2>
<p><strong>Geography.</strong> Revenue is dominated by the Southeast: São Paulo alone is ~R$5.9M, with RJ (~R$2.1M)
and MG (~R$1.8M) next — and SP/RJ/MG also carry the order volume (SP 46,707 orders, RJ 14,224, MG 12,994). The
<em>lowest</em>-satisfaction states cluster in the North/Northeast (MA, AL, PA, BA, CE — and notably RJ), so late
deliveries are a <strong>targetable lane problem, not random noise</strong>.</p>

<p><strong>Category.</strong> The catalog is long-tailed. Top categories by revenue are
<code>health_beauty</code> (~R$1.26M), <code>watches_gifts</code> (~R$1.21M, the highest AOV at ~R$214) and
<code>bed_bath_table</code> (~R$1.04M); everything past the top ~10 collapses into "Others."</p>
<div class="file-ref">📄 p5_analytics/notebooks/revenue_vs_product_category.csv · p5_analytics/notebooks/team_eda_pp2.ipynb</div>

<h2>Finding 6 — Payment behaviour</h2>
<p>GMV is concentrated in <strong>credit card</strong>, with <strong>boleto</strong> (the Brazilian bank slip),
voucher and debit card making up the rest. The notebooks chart GMV share by <code>payment_type</code> but don't
print exact percentages, so treat this qualitatively: the payment mix is a Brazil-specific context detail
(boleto matters here in a way it wouldn't in the US), not the core diagnosis.</p>

<h2>From findings to recommended actions</h2>
<p>The point of analysis is a decision. Each finding maps to one executive's next move:</p>
<table>
  <tr><th>Owner</th><th>Recommended action</th></tr>
  <tr><td><strong>CTO / COO</strong></td><td>Treat on-time delivery as a <em>revenue</em> KPI. Target the worst states/lanes (largest late-rate × volume). Each prevented late delivery protects ~1.7 review points and a retention-eligible customer.</td></tr>
  <tr><td><strong>CMO</strong></td><td>Redirect re-engagement budget toward customers whose <em>first</em> experience was good (they're winnable). Stop spending against a churn cause marketing can't fix.</td></tr>
  <tr><td><strong>CEO</strong></td><td>The cheapest growth lever is repeat rate via delivery reliability, not incremental acquisition spend. A few points of repeat rate compound GMV without raising CAC.</td></tr>
</table>

<div class="callout tip">
<p><strong>💡 Why this is a good analysis.</strong> It doesn't just report numbers — it connects them into a single
causal story, names who owns each link, and ends with an action that is <em>cheaper</em> than the alternative the
business was about to fund. That is the difference between a chart and an insight.</p>
</div>

<h2>Where to go next</h2>
<ul>
  <li><strong>Next lesson (B4 · Dashboards):</strong> see how these exact findings become the four+ serving apps
  — Streamlit, Dash, Superset and the review word-cloud.</li>
  <li><strong>Technical readers:</strong> the numbers above all come from <code>fact_orders</code> joined to the
  dims — re-run the queries in <code>p5_analytics/notebooks/</code> to verify them yourself.</li>
</ul>
`,
  steps: [
    'Open <code>p5_analytics/notebooks/team_eda_pp2.ipynb</code> and find the printed repeat-purchase rate (~3.12% on <code>customer_unique_id</code>)',
    'In <code>team_eda_pp3.ipynb</code>, find the on-time vs late review table (4.30★ vs 2.57★) — the smoking gun',
    'Trace how <code>customer_unique_id</code> (not <code>customer_id</code>) is used to define a repeat customer',
    'Open <code>revenue_vs_product_category.csv</code> and confirm the long-tail (top ~10 then "Others")',
    'Look at the top-states revenue (SP ≫ RJ ≫ MG) and note which states have the lowest review scores',
    'Write one sentence per executive (CEO/CMO/CTO) stating the action the data recommends'
  ],
  quiz: [
    {
      q: 'Why is the repeat-purchase rate computed on customer_unique_id instead of customer_id?',
      options: [
        'customer_id is missing for late orders, so it would undercount',
        'Olist issues a fresh customer_id per order, so counting on it makes everyone look one-time — customer_unique_id is the per-person key',
        'customer_unique_id is the primary key of fact_orders'
      ],
      answer: 1,
      explain: 'A single person can appear under many customer_id values (one per order). customer_unique_id links those rows to the same person, which is the only way to detect a repeat buyer. Using customer_id yields a near-0% repeat rate by construction.'
    },
    {
      q: 'What is the headline causal chain the diagnosis identifies?',
      options: [
        'High prices → fewer orders → lower GMV → more marketing',
        'Late delivery → low review score → customer never returns → low repeat rate → rising acquisition spend',
        'Bad product photos → low conversion → low GMV → churn'
      ],
      answer: 1,
      explain: 'The chain ties the CTO/COO domain (late delivery) to the CMO problem (churn/retention) to the CEO P&L (acquisition spend & soft margins). The cause is operational, not a pricing or messaging problem.'
    },
    {
      q: 'A late delivery does roughly what to the average review score?',
      options: [
        'Drops it from ~4.30★ (on-time) to ~2.57★ (late) — about a −1.7★ swing, with 54% leaving 1–2★',
        'Has no measurable effect on review scores',
        'Raises it, because customers appreciate the eventual delivery'
      ],
      answer: 0,
      explain: 'On-time orders average ~4.30★ with 82.9% promoters; late orders average ~2.57★ with 54% detractors. The 8% of orders that arrive late generate a disproportionate share of 1–2★ reviews.'
    },
    {
      q: 'Which recommendation follows directly from the diagnosis?',
      options: [
        'Raise prices in SP/RJ/MG to capture more margin from loyal customers',
        'Treat on-time delivery as a revenue KPI and target the worst states/lanes, because that protects retention-eligible customers cheaply',
        'Cut the analytics team and reinvest in paid acquisition'
      ],
      answer: 1,
      explain: 'Since delivery experience drives reviews drives reorders, fixing on-time delivery in the highest late-rate × volume lanes is the cheapest growth lever — cheaper than buying replacement customers via more acquisition spend.'
    }
  ]
});
