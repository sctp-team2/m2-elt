with raw_products as (
    select * from {{ source('olist_source', 'public_olist_products_raw') }}
)

select
    -- Primary Key
    product_id,
    
    -- Attributes
    product_category_name,
    product_name_lenght as product_name_length,  -- Fixing a typo from the raw source data!
    product_description_lenght as product_description_length, -- Fixing a typo
    product_photos_qty as product_photos_quantity,
    
    -- Physical Dimensions
    product_weight_g,
    product_length_cm,
    product_height_cm,
    product_width_cm

from raw_products