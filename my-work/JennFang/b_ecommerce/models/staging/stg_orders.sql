with raw_orders as (
    select * from {{ source('olist_source', 'public_olist_orders_raw') }}
)

select
    -- Primary Key
    order_id,
    
    -- Foreign Keys
    customer_id,
    
    -- Status
    order_status,
    
    -- Timestamps (Casting string/text to proper timestamp types)
    safe_cast(order_purchase_timestamp as timestamp) as purchase_at,
    safe_cast(order_approved_at as timestamp) as approved_at,
    safe_cast(order_delivered_carrier_date as timestamp) as delivered_to_carrier_at,
    safe_cast(order_delivered_customer_date as timestamp) as delivered_to_customer_at,
    safe_cast(order_estimated_delivery_date as timestamp) as estimated_delivery_at

from raw_orders