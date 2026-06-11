with raw_sellers as (
    select * from {{ source('olist_source', 'public_olist_sellers_raw') }}
)

select
    -- Primary Key
    seller_id,
    
    -- Attributes/Keys
    seller_zip_code_prefix,
    seller_city,
    seller_state

from raw_sellers