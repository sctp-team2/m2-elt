from dagster import Definitions, ScheduleDefinition, define_asset_job
from dagster_dbt import DbtCliResource
from .assets import b_ecommerce_dbt_assets, DBT_PROJECT_DIR

# 1. Define a "Job" using the correct lowercase function name
b_ecommerce_dbt_job = define_asset_job(
    name="b_ecommerce_dbt_job", 
    selection=[b_ecommerce_dbt_assets]
)

# 2. Define a "Schedule" to trigger that job automatically
daily_dbt_schedule = ScheduleDefinition(
    name="daily_dbt_schedule",
    job=b_ecommerce_dbt_job,
    cron_schedule="0 0 * * *", # Midnight every day
)

# 3. Register everything into your project definitions
defs = Definitions(
    assets=[b_ecommerce_dbt_assets],
    schedules=[daily_dbt_schedule],
    resources={
        "dbt": DbtCliResource(project_dir=DBT_PROJECT_DIR),
    },
)