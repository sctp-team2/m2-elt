with raw_customers as (
    select * from {{ source('olist_source', 'public_olist_customers_raw') }}
)

select
    -- Primary Key
    customer_id,
    
    -- Keys/Attributes
    customer_unique_id,
    customer_zip_code_prefix,
    customer_city,
    customer_state

from raw_customers