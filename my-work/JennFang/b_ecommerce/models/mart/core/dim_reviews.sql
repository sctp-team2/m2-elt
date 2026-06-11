with reviews as (
    select * from {{ ref('stg_order_reviews') }}
)

select
    -- Primary Key
    review_id,
    
    -- Foreign Key (To link back to your fact tables)
    order_id,
    
    -- Review Details
    review_score,
    review_comment_title,
    review_comment_message,
    
    -- Flag to easily filter reviews that actually left written text feedback
    case 
        when review_comment_message is not null then true 
        else false 
    end as has_written_comment,
    
    -- Timestamps
    created_at,
    answered_at

from reviews