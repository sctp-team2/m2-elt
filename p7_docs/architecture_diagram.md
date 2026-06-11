# Olist ELT Platform — Architecture Diagram

This document describes **how the solution is designed**: the major building blocks
(p1–p6), the GCP infrastructure they run on, and the medallion data layers in BigQuery.

- **p1_el** — Extract & Load (dlt / Meltano → BigQuery bronze)
- **p2_warehouse_design** — Dimensional star-schema contract
- **p3_dbt_project** — dbt transforms (bronze → stage/silver → gold)
- **p4_data_quality** — dbt tests + Great Expectations quality gates
- **p5_analytics** — Streamlit / Superset / Dash / notebooks BI layer
- **p6_orchestration** — Dagster asset DAG, scheduling & observability

---

## C4-style System Architecture

```mermaid
flowchart TB
    %% ===================== SOURCES =====================
    subgraph SRC["📥 Data Sources"]
        CSV["9 Olist CSV files<br/>(Kaggle brazilian-ecommerce)<br/>./datasets/"]
        PG[("Cloud SQL<br/>PostgreSQL<br/>(optional live source)")]
    end

    %% ===================== P1 EL =====================
    subgraph P1["⚙️ p1_el — Extract &amp; Load"]
        DLT["dlt loader<br/>(default path)"]
        MEL["Meltano (Singer)<br/>tap-csv / tap-postgres<br/>→ target-bigquery"]
    end

    %% ===================== WAREHOUSE =====================
    subgraph BQ["☁️ Google BigQuery — Medallion Warehouse (US)"]
        direction TB
        BRONZE[("🥉 Bronze<br/>olist_bronze_dev<br/>9 raw_* tables (1:1 CSV)")]
        STAGE[("🥈 Stage / Silver<br/>olist_stage_dev<br/>stg_* VIEWs (dedup + typed)")]
        GOLD[("🥇 Gold Mart<br/>olist_gold_mart_dev<br/>dim_*, fact_orders, mart_*<br/>(Iceberg / BigLake)")]
    end

    %% ===================== P2 DESIGN =====================
    subgraph P2["📐 p2_warehouse_design"]
        SPEC["star_schema.md<br/>drawio + dbdiagram.io<br/>(dims · fact · marts contract)"]
    end

    %% ===================== P3 DBT =====================
    subgraph P3["🔧 p3_dbt_project — dbt (brazil_ecommerce)"]
        STG["models/stage/<br/>11 staging views"]
        GLD["models/gold_mart/<br/>dim_customers, dim_products,<br/>dim_sellers, dim_geolocation (SCD2),<br/>dim_reviews (SCD2), fact_orders"]
        XDB["macros/cross_db/<br/>migration seams → Trino"]
    end

    %% ===================== P4 DQ =====================
    subgraph P4["✅ p4_data_quality — Quality Gates"]
        DBTEST["dbt tests<br/>unique · not_null · relationships ·<br/>accepted_values"]
        GE["Great Expectations<br/>+ SQL validations"]
    end

    %% ===================== P5 ANALYTICS =====================
    subgraph P5["📊 p5_analytics — BI &amp; Insights"]
        ST["streamlit_team<br/>Exec deck — CEO / COO / CMO"]
        OTHER["Superset · Dash ·<br/>Wordcloud · Notebooks (EDA)"]
    end

    %% ===================== P6 ORCH =====================
    subgraph P6["🪄 p6_orchestration — Dagster"]
        ASSETS["assets.py<br/>bronze_raw_commerce → @dbt_assets"]
        JOBS["Jobs: olist_full_refresh ·<br/>stg_only · gold_mart_only"]
        SCHED["Schedule: olist_nightly<br/>cron 0 2 * * * (SGT)"]
        OBS["observability/<br/>Ops portal + Grafana"]
    end

    %% ===================== INFRA =====================
    subgraph INFRA["🏗️ GCP Infrastructure / CI-CD"]
        GH["GitHub Actions<br/>deploy-*.yml"]
        CB["Cloud Build →<br/>Artifact Registry"]
        VM["Compute Engine VM<br/>Dagster + Nginx (Basic Auth)<br/>recreated nightly"]
        CR["Cloud Run<br/>analytics apps + ops portal"]
    end

    %% ===================== EDGES =====================
    CSV --> DLT
    CSV --> MEL
    PG --> MEL
    DLT --> BRONZE
    MEL --> BRONZE

    SPEC -. contract .-> P3
    BRONZE --> STG --> STAGE
    STAGE --> GLD --> GOLD
    STG -. defines .- STAGE
    XDB -. dialect .- GLD

    GOLD --> DBTEST
    GOLD --> GE
    DBTEST -. gates .-> P5
    GE -. gates .-> P5

    GOLD --> ST
    GOLD --> OTHER

    ASSETS --- JOBS --- SCHED
    P6 ==>|materializes| P1
    P6 ==>|runs dbt| P3
    P6 ==>|runs| P4
    OBS -. monitors .-> P5

    GH --> CB --> VM
    GH --> CR
    VM -. hosts .- P6
    CR -. hosts .- P5

    classDef src fill:#e3f2fd,stroke:#1565c0,color:#0d2b45;
    classDef warehouse fill:#fff8e1,stroke:#f9a825,color:#4a3b00;
    classDef proc fill:#e8f5e9,stroke:#2e7d32,color:#13351a;
    classDef infra fill:#f3e5f5,stroke:#6a1b9a,color:#2e0c3a;
    class CSV,PG src;
    class BRONZE,STAGE,GOLD warehouse;
    class DLT,MEL,STG,GLD,XDB,DBTEST,GE,ST,OTHER,ASSETS,JOBS,SCHED,OBS,SPEC proc;
    class GH,CB,VM,CR infra;
```

---

## Layered View (responsibility per module)

| Layer | Module | Tech | Output |
|-------|--------|------|--------|
| Ingestion | **p1_el** | dlt / Meltano (Singer) | `olist_bronze_dev` raw tables |
| Design contract | **p2_warehouse_design** | drawio / dbdiagram | `star_schema.md` |
| Transformation | **p3_dbt_project** | dbt + BigQuery | `olist_stage_dev`, `olist_gold_mart_dev` |
| Quality gate | **p4_data_quality** | dbt tests + Great Expectations | QA report (gates gold) |
| Serving / BI | **p5_analytics** | Streamlit, Superset, Dash | Exec dashboards |
| Orchestration | **p6_orchestration** | Dagster + Grafana | Asset DAG, nightly schedule |

**Storage:** BigQuery medallion (bronze → silver/stage → gold), gold as Iceberg/BigLake.
**Hosting:** Dagster on Compute Engine VM (Nginx Basic Auth, recreated nightly); analytics
apps + ops portal on Cloud Run. **CI/CD:** GitHub Actions → Cloud Build → Artifact Registry.
