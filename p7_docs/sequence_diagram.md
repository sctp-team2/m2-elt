# Olist ELT Platform — End-to-End Sequence Diagram

This document focuses on the **end-to-end pipeline flow**, showing how a nightly run
travels through every component (p1 → p6) from raw CSV ingestion to executive analytics.

The flow is driven by **p6 (Dagster)**, which materializes the asset DAG:
`bronze_raw_commerce → dbt stage → dbt gold → data-quality tests`, after which
**p5 (analytics)** serves the gold marts to executives.

---

## Nightly Pipeline Run — Sequence

```mermaid
sequenceDiagram
    autonumber
    participant SCH as ⏰ p6 Schedule (nightly)
    participant DAG as 🪄 p6 Dagster
    participant EL as ⚙️ p1_el (dlt/Meltano)
    participant SRC as 📥 Sources
    participant BRZ as 🥉 BQ Bronze
    participant DBT as 🔧 p3 dbt
    participant STG as 🥈 BQ Stage
    participant GLD as 🥇 BQ Gold
    participant DQ as ✅ p4 Data Quality
    participant BI as 📊 p5 Analytics
    participant EXE as 👔 Executives

    Note over SCH,DAG: p2 star-schema contract pre-defines dims, fact & marts

    SCH->>DAG: Trigger olist_full_refresh
    activate DAG

    %% P1 Extract and Load
    rect rgb(227,242,253)
    Note over DAG,BRZ: p1 — Extract and Load (bronze)
    DAG->>EL: Materialize bronze_raw_commerce
    activate EL
    EL->>SRC: Extract 9 Olist tables
    SRC-->>EL: Raw rows (CSV / postgres tap)
    EL->>BRZ: Load 1:1 raw_* tables (+ load metadata)
    BRZ-->>EL: Row counts / load IDs
    EL-->>DAG: Bronze assets materialized
    deactivate EL
    end

    %% ---- P3: Stage / Silver ----
    rect rgb(232,245,233)
    Note over DAG,STG: p3 — dbt stage (silver)
    DAG->>DBT: Run dbt (tag: stage)
    activate DBT
    DBT->>BRZ: SELECT raw_* sources
    DBT->>STG: Build stg_* VIEWs (dedup + typed)
    STG-->>DBT: Views compiled
    DBT-->>DAG: Stage assets materialized
    deactivate DBT
    end

    %% ---- P3: Gold ----
    rect rgb(255,248,225)
    Note over DAG,GLD: p3 — dbt gold (star schema)
    DAG->>DBT: Run dbt (tag: gold_mart)
    activate DBT
    DBT->>STG: SELECT stg_* views
    DBT->>GLD: Build dim_* (incl. SCD2),<br/>fact_orders, mart_* (Iceberg)
    GLD-->>DBT: Tables materialized
    DBT-->>DAG: Gold assets materialized
    deactivate DBT
    end

    %% ---- P4: Quality Gate ----
    rect rgb(252,228,236)
    Note over DAG,DQ: p4 — Quality gate (must pass)
    DAG->>DQ: Run dbt tests + Great Expectations
    activate DQ
    DQ->>GLD: unique · not_null · relationships ·<br/>accepted_values · stat checks
    GLD-->>DQ: Test results
    alt All checks pass
        DQ-->>DAG: ✅ Gold marts certified
    else Any check fails
        DQ-->>DAG: ❌ Fail run — gold NOT released
        DAG-->>SCH: Alert (run failed)
    end
    deactivate DQ
    end

    DAG-->>SCH: Run complete (lineage in Dagster UI)
    deactivate DAG

    %% ---- P5: Serving ----
    rect rgb(243,229,245)
    Note over EXE,GLD: p5 — Analytics serving (on demand)
    EXE->>BI: Open exec deck (Cloud Run)
    activate BI
    BI->>GLD: Query gold marts only<br/>(RFM, GMV, delivery KPIs)
    GLD-->>BI: Aggregated results (cached)
    BI-->>EXE: Retention / Delivery / Reviews dashboards
    deactivate BI
    end
```

---

## Flow summary (p1 → p6)

| # | Stage | Component | Action |
|---|-------|-----------|--------|
| 1 | Trigger | **p6** Dagster `olist_nightly` | Kicks off `olist_full_refresh` at 02:00 SGT |
| 2 | Extract & Load | **p1_el** | dlt / Meltano pulls 9 sources → bronze `raw_*` |
| 3 | Stage / Silver | **p3** dbt | `stg_*` views: dedup + type-clean (per **p2** contract) |
| 4 | Gold | **p3** dbt | `dim_*` (SCD2), `fact_orders`, `mart_*` Iceberg tables |
| 5 | Quality gate | **p4** | dbt tests + Great Expectations — gold released only if green |
| 6 | Serve | **p5** | Streamlit exec deck queries gold marts for CEO/COO/CMO |

> **p2 (warehouse design)** is the up-front contract, not a runtime step — it defines the
> dim/fact/mart shapes that p3 implements and p4 validates. **p6** orchestrates and
> observes steps 2–5; **p5** consumes the certified gold marts on demand.
