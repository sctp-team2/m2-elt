with products as (
    select * from {{ ref('stg_products') }}
),

translations as (
    select * from {{ ref('stg_product_category_translation') }}
)

select
    p.product_id,
    -- Handle missing translations safely by falling back to the Portuguese name if needed
    coalesce(t.product_category_name_english, p.product_category_name) as product_category_name,
    p.product_name_length,
    p.product_description_length,
    p.product_photos_quantity,
    p.product_weight_g,
    p.product_length_cm,
    p.product_height_cm,
    p.product_width_cm

from products p
left join translations t 
    on p.product_category_name = t.product_category_name