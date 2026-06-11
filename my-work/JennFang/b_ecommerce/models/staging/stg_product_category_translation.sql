with raw_translation as (
    select * from {{ source('olist_source', 'public_product_category_name_translation_raw') }}
)

select
    -- Attributes
    product_category_name,
    product_category_name_english

from raw_translation