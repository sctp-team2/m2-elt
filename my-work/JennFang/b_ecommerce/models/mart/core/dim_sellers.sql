with sellers as (
    select * from {{ ref('stg_sellers') }}
),

geolocation as (
    select 
        zip_code_prefix,
        avg(latitude) as latitude,
        avg(longitude) as longitude
    from {{ ref('stg_geolocation') }}
    group by 1
)

select
    s.seller_id,
    s.seller_zip_code_prefix,
    s.seller_city,
    s.seller_state,
    g.latitude,
    g.longitude

from sellers s
left join geolocation g 
    on s.seller_zip_code_prefix = g.zip_code_prefix