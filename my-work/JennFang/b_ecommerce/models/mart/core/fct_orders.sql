with orders as (
    select * from {{ ref('stg_orders') }}
),

order_items as (
    select 
        order_id,
        sum(price) as total_item_value,
        sum(freight_value) as total_freight_value,
        count(order_item_id) as total_items_ordered
    from {{ ref('stg_order_items') }}
    group by 1
),

order_payments as (
    select 
        order_id,
        sum(payment_value) as total_payment_value
    from {{ ref('stg_order_payments') }}
    group by 1
)

select
    -- Keys
    o.order_id,
    o.customer_id,
    
    -- Status
    o.order_status,
    
    -- Timestamps
    o.purchase_at,
    o.approved_at,
    o.delivered_to_carrier_at,
    o.delivered_to_customer_at,
    o.estimated_delivery_at,
    
    -- Metrics (The Facts)
    coalesce(i.total_items_ordered, 0) as total_items_ordered,
    coalesce(i.total_item_value, 0.0) as total_item_value,
    coalesce(i.total_freight_value, 0.0) as total_freight_value,
    coalesce(p.total_payment_value, 0.0) as total_payment_value

from orders o
left join order_items i on o.order_id = i.order_id
left join order_payments p on o.order_id = p.order_id