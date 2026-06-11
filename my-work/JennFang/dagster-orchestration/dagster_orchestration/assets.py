from dagster_dbt import DbtCliResource, dbt_assets
from pathlib import Path

# This securely grabs the absolute path to your dbt project directory
DBT_PROJECT_DIR = str(
    Path(__file__).resolve().parent.parent.parent / "b_ecommerce"
)

@dbt_assets(manifest=Path(DBT_PROJECT_DIR) / "target" / "manifest.json")
def b_ecommerce_dbt_assets(context, dbt: DbtCliResource):
    yield from dbt.cli(["build"], context=context).stream()