with customers as (
    select * from {{ ref('stg_customers') }}
),

orders as (
    select * from {{ ref('stg_orders') }}
),

items as (
    select * from {{ ref('stg_order_items') }}
),

-- Calculate lifetime value directly by linking orders to item prices
customer_lifetime_metrics as (
    select
        o.customer_id,
        count(distinct o.order_id) as total_orders_placed,
        -- Changed shipping_value to freight_value to match the Olist schema
        sum(i.price + i.freight_value) as customer_lifetime_value,
        min(o.purchase_at) as first_purchase_at,
        max(o.purchase_at) as most_recent_purchase_at
    from orders o
    join items i on o.order_id = i.order_id
    group by 1
),

final as (
    select
        c.customer_id,
        c.customer_unique_id,
        c.customer_zip_code_prefix,
        c.customer_city,
        c.customer_state,
        coalesce(m.total_orders_placed, 0) as total_orders_placed,
        coalesce(m.customer_lifetime_value, 0.0) as customer_lifetime_value,
        m.first_purchase_at,
        m.most_recent_purchase_at

    from customers c
    left join customer_lifetime_metrics m on c.customer_id = m.customer_id
)

select * from final