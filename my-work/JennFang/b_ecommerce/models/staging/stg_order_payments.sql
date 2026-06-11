with raw_payments as (
    select * from {{ source('olist_source', 'public_olist_order_payments_raw') }}
)

select
    -- Foreign Key
    order_id,
    
    -- Attributes
    payment_sequential,
    payment_type,
    payment_installments,
    payment_value

from raw_payments