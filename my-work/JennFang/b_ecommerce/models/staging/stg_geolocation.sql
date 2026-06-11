with raw_geolocation as (
    select * from {{ source('olist_source', 'public_olist_geolocation_raw') }}
)

select
    -- Keys/Attributes
    geolocation_zip_code_prefix as zip_code_prefix,
    geolocation_lat as latitude,
    geolocation_lng as longitude,
    geolocation_city as city,
    geolocation_state as state

from raw_geolocation