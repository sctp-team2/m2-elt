# Docs & Executive Presentation  (Module 7)
**Owner:** All team members · **Role:** Cross-functional Delivery

## Purpose
Tell the story of the whole project: technical documentation, architecture diagrams, the final report, and the executive slide deck.

## Needs (inputs)
- Outputs from every module: EL scripts, ERD, dbt models/lineage, QA report, analytics insights, orchestration graph.

## Produces (outputs)
- **[`tutorial/`](tutorial/README.md)** — 🎓 the **Olist ELT Academy**, an interactive
  step-by-step tutorial webapp covering the entire project (technical + business tracks,
  15 lessons, quizzes, progress tracking). Run with
  `cd p7_docs/tutorial && python3 -m http.server 8080`.
- **`architecture.drawio`** — the pipeline architecture diagram.
- **`final_report.md`** — technical approach, tool-choice justifications (why dlt over Meltano, why Iceberg, why Dagster), schema-design rationale, and findings.
- **Slide deck** — exec summary → business value → architecture → insights → risks → roadmap.
- **`presentation_outline.md`** — speaker structure for the 10-min + 5-min Q&A.

## Maps to the brief's evaluation criteria
- Pipeline accuracy/integrity → show the Dagster run + QA report.
- Code quality/best practices → dbt structure, contracts, migration seams.
- Architecture/scalability → medallion + lakehouse + the roadmap to on-prem.
- Documentation of tool choices → the comparison tables in the report.

## Note
`MIGRATION.md` (repo root) is also an M7 deliverable: the GCP → on-prem OSS sovereign path.
