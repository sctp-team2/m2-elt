/* Lesson 09 — P6b Deployment (GCP, CI/CD, nightly VM) */
window.TUTORIAL_LESSONS.push({
  id: 'deployment',
  order: 9,
  track: 'technical',
  icon: '🚀',
  title: 'P6b · Deployment — GCP, CI/CD & the Nightly VM',
  subtitle: 'How the pipeline image is built by Cloud Build, shipped via GitHub Actions, and run on a tiny Compute Engine VM behind an nginx password gate — one that is deleted nightly and recreated each morning to save cost.',
  minutes: 30,
  objectives: [
    'Trace the build chain: <code>cloudbuild.yaml</code> → Docker image → Artifact Registry (<code>:latest</code> + per-commit <code>:&lt;sha&gt;</code>)',
    'Read the GitHub Actions workflows: <code>deploy-prod.yml</code> for Dagster, plus per-app Cloud Run deploys',
    'Describe the runtime topology: an <code>e2-medium</code> VM (Container-Optimized OS) running <code>dagster dev</code> behind an <strong>nginx Basic-Auth proxy</strong>',
    'Explain the cost-saving <strong>nightly VM teardown/recreate</strong> lifecycle and why <code>team2</code> basic-auth must be re-added each morning',
    'Know where Cloud Run fits (analytics apps) and the roadmap from GCP toward on-prem / split OSS topology'
  ],
  body: `
<h2>From code to a running pipeline</h2>
<p>Lesson 08 showed the Dagster app. This lesson is about <em>getting it into production</em>. The shape of
the deployment is deliberately small: BigQuery does all the heavy compute, so the orchestrator only runs
"Python glue" and fits on a 4&nbsp;GB VM. The path from a git push to a running container has three legs —
<strong>build</strong> (Cloud Build), <strong>ship</strong> (GitHub Actions), and <strong>run</strong>
(Compute Engine VM).</p>

<div class="mermaid-wrap"><pre class="mermaid">
flowchart LR
  PUSH["git push -&gt; main"] --> GHA["GitHub Actions<br/>deploy-prod.yml"]
  GHA -->|gcloud builds submit| CB["Cloud Build<br/>cloudbuild.yaml"]
  CB --> AR[("Artifact Registry<br/>olist-elt :latest + :sha")]
  GHA -->|if VM running: scp + ssh| VM["Compute Engine VM<br/>e2-medium · COS<br/>olist-dagster"]
  AR -->|docker pull| VM
  subgraph VMBOX["on the VM (docker network dagnet)"]
    PROXY["nginx Basic-Auth proxy<br/>:3000 public"] --> DAG["dagster dev<br/>internal :3001"]
  end
  VM -.runs.- VMBOX
  DAG --> BQ[("BigQuery US")]
</pre></div>

<h2>Build: Cloud Build → Artifact Registry</h2>
<p>The image is built by <strong>Cloud Build</strong>, not a plain <code>docker build --tag</code>. Why?
The Dockerfile lives in a subfolder but the build <em>context</em> is the repo root (it must include
<code>p3_dbt_project/</code>, <code>p1_el/</code>, <code>datasets/</code>). <code>gcloud builds submit --tag</code>
assumes <code>./Dockerfile</code>, so the project uses a config file that passes the Dockerfile with
<code>-f</code>.</p>

<div class="file-ref">📄 cloudbuild.yaml (repo root)</div>
<pre><code class="language-yaml">substitutions:
  _VERSION: manual
steps:
  - name: gcr.io/cloud-builders/docker
    args:
      - build
      - -f
      - p6_orchestration/olist_orchestration/Dockerfile
      - --build-arg
      - APP_VERSION=\${_VERSION}
      - -t
      - \${_IMAGE}        # the :latest tag (what run-dagster.sh pulls)
      - -t
      - \${_IMAGE_SHA}    # same image tagged with the git short SHA (immutable)
      - .                # build context = repo root
images:
  - \${_IMAGE}
  - \${_IMAGE_SHA}
options:
  logging: CLOUD_LOGGING_ONLY</code></pre>

<p>Every build pushes <strong>two tags</strong>: <code>:latest</code> (what the VM pulls) and a per-commit
<code>:&lt;sha&gt;</code> (immutable, so a running container traces back to an exact commit). The SHA is also
baked in as <code>APP_VERSION</code> / an OCI revision label, visible via
<code>docker exec olist-dagster printenv APP_VERSION</code>.</p>

<div class="file-ref">📄 p6_orchestration/olist_orchestration/Dockerfile</div>
<pre><code class="language-dockerfile">FROM python:3.11-slim
ARG APP_VERSION=dev
ENV DAGSTER_HOME=/opt/dagster/home  OLIST_ENV=prod  APP_VERSION=$APP_VERSION
# git is needed: Meltano installs tap-csv / target-bigquery from git pip_urls
RUN apt-get install -y git build-essential ...
COPY p6_orchestration/olist_orchestration/ /app/p6_orchestration/olist_orchestration/
COPY p3_dbt_project/                        /app/p3_dbt_project/
COPY p1_el/olist-meltano-pg/                 /app/p1_el/olist-meltano-pg/
COPY datasets/                               /app/datasets/
RUN pip install -e /app/p6_orchestration/olist_orchestration && pip install dagster-webserver meltano
# default CMD is a one-shot full refresh; run-dagster.sh overrides it with dagster dev
CMD ["dagster", "job", "execute", "-m", "olist_orchestration.definitions", "-j", "olist_full_refresh"]</code></pre>

<div class="callout info">
<p><strong>Config is never baked into the image.</strong> <code>.env.prod</code> (non-sensitive config) and
<code>.env.key</code> (the service-account JSON) are <em>git-ignored</em> and injected at runtime — passed
via <code>--env-file</code> and mounted to <code>/secrets/sa.json</code>. So a clean CI build needs no
secrets, and rotating a key is a file swap on the VM, not a rebuild.</p>
</div>

<h2>Ship: GitHub Actions</h2>
<p>The <code>.github/workflows/</code> folder holds one workflow for Dagster plus several per-app Cloud Run
deploys (Streamlit, Dash, Superset, ops-portal, wordcloud, grafana) and a notify workflow.</p>

<div class="file-ref">📄 .github/workflows/deploy-prod.yml</div>
<pre><code class="language-yaml">on:
  push:
    branches: [main]
    paths:                 # only rebuild when the baked-in code changes
      - 'p1_el/**'
      - 'p3_dbt_project/**'
      - 'cloudbuild.yaml'
      - 'run-dagster.sh'
      - 'nginx-dagster.conf'
      - '.github/workflows/deploy-prod.yml'
  workflow_dispatch: {}
jobs:
  build-deploy:
    steps:
      - uses: google-github-actions/auth@v2
        with: { credentials_json: \${{ secrets.GCP_SA_KEY }} }
      - name: Build &amp; push image (Cloud Build)
        run: |
          SHA=$(git rev-parse --short HEAD)
          BASE=$REGION-docker.pkg.dev/$PROJECT/$REPO/olist-elt
          gcloud builds submit --config cloudbuild.yaml \\
            --substitutions=_IMAGE="$BASE:latest",_IMAGE_SHA="$BASE:$SHA",_VERSION="$SHA" .</code></pre>

<p>After the build, a second step <strong>only redeploys if the VM is up</strong>:</p>

<pre><code class="language-yaml">      - name: Redeploy on VM if it is running
        run: |
          STATUS=$(gcloud compute instances describe "$VM" --zone "$ZONE" \\
            --format='value(status)' 2>/dev/null || echo ABSENT)
          if [ "$STATUS" != "RUNNING" ]; then
            echo "VM not running ($STATUS) — skipping. Morning recreate pulls :latest."
            exit 0
          fi
          # bring its own deploy assets, scp them in, then ssh + run-dagster.sh</code></pre>

<div class="callout tip">
<p><strong>💡 The skip-if-down branch is the key design choice.</strong> Because the VM is deleted nightly
(below), a push at 3am can't deploy to a machine that doesn't exist. So CI just builds and pushes
<code>:latest</code>; the next <em>morning recreate</em> pulls that latest image itself. Build and run are
decoupled. The per-app Cloud Run workflows are simpler — e.g. <code>deploy-streamlit.yml</code> just runs
the app's own <code>make deploy</code> on a path change.</p>
</div>

<h2>Run: the e2-medium VM topology</h2>
<p>Production is <strong>one <code>e2-medium</code> VM</strong> (2 vCPU / 4 GB), named
<code>olist-dagster</code>, on <strong>Container-Optimized OS</strong> (COS — ships <code>docker</code> but
not <code>docker compose</code>, so containers are launched with plain <code>docker run</code>). It runs
<strong>two</strong> containers on a private docker network (<code>dagnet</code>):</p>

<table>
  <tr><th>Container</th><th>Image</th><th>Exposure</th><th>Job</th></tr>
  <tr><td><code>olist-dagster</code></td><td>the ELT image</td><td>internal only (<code>127.0.0.1:3001</code>)</td><td><code>dagster dev</code> — webserver + daemon (UI + schedules)</td></tr>
  <tr><td><code>dagster-proxy</code></td><td><code>nginx:stable</code></td><td><strong>public <code>:3000</code></strong></td><td>HTTP Basic-Auth gate in front of the UI; also serves the dbt docs site</td></tr>
</table>

<p>The Dagster UI has <strong>no built-in auth</strong>, so it is never published directly. The only thing
on public <code>:3000</code> is nginx, which forces a username/password.</p>

<div class="file-ref">📄 nginx-dagster.conf (repo root)</div>
<pre><code class="language-nginx">server {
    listen 3000;
    location / {
        auth_basic           "Olist Dagster — sign in";
        auth_basic_user_file /etc/nginx/.htpasswd;
        proxy_pass http://olist-dagster:3000;   # docker-network name, internal
        # Dagster's UI uses WebSockets (GraphQL subscriptions) — forward upgrades:
        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;               # keep long run-log streams open
    }
}</code></pre>

<div class="file-ref">📄 run-dagster.sh (repo root)</div>
<pre><code class="language-bash"># Dagster app — internal only (reachable by the proxy via the docker-network name)
docker run -d --name olist-dagster --restart unless-stopped --network dagnet \\
  -p 127.0.0.1:3001:3000 \\
  --env-file "$PWD/.env.prod" \\
  -v dagster_home:/opt/dagster/home \\
  -v "$PWD/.env.key:/secrets/sa.json:ro" \\
  "$IMAGE" \\
  dagster dev -h 0.0.0.0 -p 3000 -m olist_orchestration.definitions

# nginx Basic-Auth proxy — the ONLY container published to public :3000
docker run -d --name dagster-proxy --restart unless-stopped --network dagnet \\
  -p 3000:3000 \\
  -v "$PWD/nginx-dagster.conf:/etc/nginx/conf.d/default.conf:ro" \\
  -v "$PWD/dagster.htpasswd:/etc/nginx/.htpasswd:ro" \\
  nginx:stable</code></pre>

<p>The <code>dagster_home</code> docker <em>volume</em> persists run history across a
<code>docker restart</code> — but not across a VM delete, which is the next section.</p>

<h2>The nightly VM lifecycle: delete at night, recreate each morning</h2>
<p>To avoid paying for an idle VM 24/7, the team <strong>deletes the whole VM every evening and recreates
it every morning</strong>. Deleting (not just stopping) frees the boot disk too — the trade-off is that
the VM is rebuilt from scratch daily, and a few things must be re-established each morning.</p>

<div class="mermaid-wrap"><pre class="mermaid">
flowchart LR
  M["🌅 Morning recreate"] --> C["gcloud compute instances create<br/>olist-dagster (e2-medium, COS)"]
  C --> S["scp run-dagster.sh + .env.prod + .env.key"]
  S --> R["ssh: bash run-dagster.sh<br/>(docker pull :latest + start)"]
  R --> A["re-add team2 to dagster.htpasswd<br/>nginx -s reload"]
  A --> RUN["UI live + olist_nightly armed"]
  RUN --> E["🌙 Evening: instances delete --quiet"]
  E -.next day.-> M
</pre></div>

<div class="file-ref">📄 notes/setup.prod.md §11 — Daily redeploy</div>
<pre><code class="language-bash"># 🌅 Morning — recreate + deploy (run from your local Mac)
gcloud compute instances create olist-dagster \\
  --zone=$ZONE --machine-type=e2-medium \\
  --image-family=cos-stable --image-project=cos-cloud \\
  --service-account=$SA_EMAIL --scopes=cloud-platform \\
  --boot-disk-size=30GB --tags=dagster-ui

cd "$REPO_ROOT"
gcloud compute scp run-dagster.sh .env.prod .env.key olist-dagster:~ --zone=$ZONE
gcloud compute ssh olist-dagster --zone=$ZONE --command="
  chmod 600 .env.key
  docker-credential-gcr configure-docker --registries=us-central1-docker.pkg.dev
  bash run-dagster.sh
"

# 🌙 Evening — delete VM to stop billing
gcloud compute instances delete olist-dagster --zone=$ZONE --quiet</code></pre>

<div class="callout warn">
<p><strong>⚠️ The nginx basic-auth user must be re-added every morning.</strong> The
<code>dagster.htpasswd</code> file lived on the deleted VM's disk, so each recreate needs the
<code>team2</code> user re-created (login: <code>team2</code> / <code>password</code>) and nginx reloaded:</p>
<pre><code class="language-bash"># run each morning after run-dagster.sh — the htpasswd file is gone with the old VM
gcloud compute ssh olist-dagster --zone=$ZONE --command="
  HASH=\\$(openssl passwd -apr1 'password')
  echo \\"team2:\\$HASH\\" &gt;&gt; ~/dagster.htpasswd
  docker exec dagster-proxy nginx -s reload
"</code></pre>
<p>The <code>deploy-prod.yml</code> CI path does the same — it creates <code>team2:&lt;hash&gt;</code> only
if <code>dagster.htpasswd</code> is absent, matching the manual morning setup.</p>
</div>

<div class="callout info">
<p><strong>A fresh IP every morning.</strong> A recreated VM gets a new external IP, so each day you fetch
it (<code>... describe ... --format='get(networkInterfaces[0].accessConfigs[0].natIP)'</code>) and the
Cloud SQL Postgres source must allow it. Because the <code>meltano_postgres</code> bronze path connects to
Cloud SQL over its public IP, confirm the VM's IP is in the instance's authorized networks (or
<code>0.0.0.0/0</code>). See <code>notes/setup.prod.md</code> §4 and §11.</p>
</div>

<h2>Cloud Run: the analytics apps</h2>
<p>The Dagster orchestrator lives on the VM, but the <strong>p5 analytics apps</strong> (Streamlit, Dash,
Superset, wordcloud, ops-portal, grafana) run on <strong>Cloud Run</strong> — serverless, scale-to-zero,
each with its own GitHub Actions workflow keyed to its subfolder:</p>

<pre><code class="language-yaml"># .github/workflows/deploy-streamlit.yml
on:
  push:
    branches: [main]
    paths:
      - 'p5_analytics/streamlit/**'
      - '.github/workflows/deploy-streamlit.yml'
jobs:
  deploy:
    steps:
      - uses: google-github-actions/auth@v2
        with: { credentials_json: \${{ secrets.GCP_SA_KEY }} }
      - name: Build &amp; deploy to Cloud Run
        working-directory: p5_analytics/streamlit
        run: make deploy PROJECT="$PROJECT" REGION="$REGION"</code></pre>

<p>This split is intentional: the orchestrator must be <em>always-on</em> for the scheduler (so it lives on
a VM), while the dashboards are <em>bursty</em> and benefit from scale-to-zero (so they live on Cloud Run).</p>

<h2>Where this is headed: the roadmap</h2>
<p><code>dagster dev</code> prints a "not for production" warning — expected and fine at this scale, since it
bundles webserver + daemon into one process. The deployment plan
(<code>plan/plan2-prod-deploy.md</code> §14) lists the hardening roadmap:</p>
<ul>
  <li><strong>Graduate to the split topology</strong> — separate <code>dagster-webserver</code> +
  <code>dagster-daemon</code> + a real Postgres for run storage (instead of bundled SQLite on a volume).</li>
  <li><strong>Migrate to GKE / Dagster+</strong> if the team outgrows a single VM (isolation, autoscaling).</li>
  <li><strong>GCP → on-prem OSS</strong> — the entire stack (Dagster, dbt, Meltano, nginx) is open source and
  container-based, so the same images could run on self-hosted hardware; only BigQuery would need a warehouse
  substitute. The medallion + asset-graph design is deliberately portable.</li>
</ul>

<div class="callout tip">
<p><strong>💡 Why this fits on a tiny VM.</strong> The whole production pipeline runs on an
<code>e2-medium</code> because <strong>BigQuery does the heavy compute</strong> — dbt only issues SQL, and
the VM just runs Python glue. There's enough headroom that you could trim to <code>e2-small</code> to save
a few dollars a month if nightly runs stay light.</p>
</div>
`,
  steps: [
    'Open <code>cloudbuild.yaml</code> and find why the build needs <code>-f</code> (Dockerfile in a subfolder, context at repo root) and the two image tags it pushes',
    'In <code>.github/workflows/deploy-prod.yml</code>, read the "Redeploy on VM if it is running" step and explain what happens when the VM is ABSENT',
    'Open <code>nginx-dagster.conf</code> and confirm <code>auth_basic</code> + the WebSocket upgrade headers proxying to <code>olist-dagster:3000</code>',
    'In <code>run-dagster.sh</code>, note which container is published to public <code>:3000</code> and which is internal-only',
    'Read <code>notes/setup.prod.md</code> §11 and list the steps that must be repeated <em>every morning</em> after the VM is recreated',
    'Open a per-app Cloud Run workflow (e.g. <code>deploy-streamlit.yml</code>) and see how its <code>paths:</code> filter scopes the trigger to one subfolder'
  ],
  quiz: [
    {
      q: 'Why does the project build the image with cloudbuild.yaml instead of `gcloud builds submit --tag`?',
      options: [
        'Cloud Build is the only way to push to Artifact Registry',
        'The Dockerfile is in a subfolder but the build context must be the repo root (to include p3_dbt_project, p1_el, datasets); --tag assumes ./Dockerfile, so the config passes the Dockerfile via -f',
        '--tag cannot apply more than one image tag'
      ],
      answer: 1,
      explain: 'The build context is the repo root so the image can COPY p3_dbt_project/, p1_el/, and datasets/. Since the Dockerfile lives in p6_orchestration/.../, cloudbuild.yaml passes it explicitly with -f — something `gcloud builds submit --tag` (which assumes ./Dockerfile) can\'t do.'
    },
    {
      q: 'What protects the Dagster UI on the production VM\'s public :3000?',
      options: [
        'Dagster\'s built-in login page',
        'An nginx Basic-Auth reverse proxy (dagster-proxy) — the only container published to :3000 — sitting in front of the internal-only dagster container',
        'A GCP firewall rule that blocks all inbound traffic'
      ],
      answer: 1,
      explain: 'The Dagster UI has no auth, so the olist-dagster container is internal-only on the dagnet network. nginx (dagster-proxy) is the only thing on public :3000, enforcing HTTP Basic Auth (team2/password) and forwarding WebSocket upgrades to olist-dagster:3000.'
    },
    {
      q: 'What must be re-done every morning because the VM is deleted nightly?',
      options: [
        'The BigQuery datasets must be recreated from scratch',
        'The VM is recreated, run-dagster.sh re-run (pulling :latest), and the team2 nginx basic-auth user re-added to dagster.htpasswd with nginx reloaded — because that file lived on the deleted disk',
        'The Docker image must be rebuilt from source on the VM'
      ],
      answer: 1,
      explain: 'Deleting the VM frees its disk, so dagster.htpasswd is gone. Each morning the VM is recreated, files are scp\'d, run-dagster.sh pulls :latest and starts the containers, and team2/password must be re-added to htpasswd (then `nginx -s reload`). The new VM also gets a fresh IP to authorize on Cloud SQL.'
    },
    {
      q: 'How does the deploy-prod.yml workflow behave when a push lands while the VM is deleted?',
      options: [
        'It fails the whole workflow because it can\'t SSH in',
        'It still builds and pushes :latest to Artifact Registry, then skips the redeploy step — the morning recreate pulls :latest itself',
        'It recreates the VM automatically and deploys'
      ],
      answer: 1,
      explain: 'The redeploy step checks the VM status; if it is not RUNNING it logs a skip and exits 0. The build/push of :latest still happens, so the next morning recreate (run-dagster.sh -> docker pull) picks up the newest image. Build and run are decoupled.'
    }
  ]
});
