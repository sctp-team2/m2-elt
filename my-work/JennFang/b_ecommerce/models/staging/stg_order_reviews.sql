with raw_reviews as (
    select * from {{ source('olist_source', 'public_olist_order_reviews_raw') }}
)

select
    -- Primary Key
    review_id,
    
    -- Foreign Key
    order_id,
    
    -- Attributes
    review_score,
    review_comment_title,
    review_comment_message,
    
    -- Timestamps
    safe_cast(review_creation_date as timestamp) as created_at,
    safe_cast(review_answer_timestamp as timestamp) as answered_at

from raw_reviews