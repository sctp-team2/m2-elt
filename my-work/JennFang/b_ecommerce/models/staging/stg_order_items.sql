with raw_order_items as (
    select * from {{ source('olist_source', 'public_olist_order_items_raw') }}
)

select
    -- Primary/Composite Key components
    order_id,
    order_item_id,
    
    -- Foreign Keys
    product_id,
    seller_id,
    
    -- Timestamps
    safe_cast(shipping_limit_date as timestamp) as shipping_limit_at,
    
    -- Financials
    price,
    freight_value

from raw_order_items