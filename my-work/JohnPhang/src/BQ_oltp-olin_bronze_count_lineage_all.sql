SELECT 'oltp_olist_customers' AS table_name, COUNT(*) AS row_count,
       COUNTIF(created_at IS NULL) AS missing_created_at,
       COUNTIF(updated_at IS NULL) AS missing_updated_at,
       COUNTIF(source_file IS NULL) AS missing_source_file,
       COUNTIF(source_gcs_path IS NULL) AS missing_source_gcs_path,
       COUNTIF(batch_name IS NULL) AS missing_batch_name
FROM `western-beanbag-496804-a4.olin_bronze.oltp_olist_customers`

UNION ALL
SELECT 'oltp_olist_geolocation', COUNT(*),
       COUNTIF(created_at IS NULL), COUNTIF(updated_at IS NULL),
       COUNTIF(source_file IS NULL), COUNTIF(source_gcs_path IS NULL),
       COUNTIF(batch_name IS NULL)
FROM `western-beanbag-496804-a4.olin_bronze.oltp_olist_geolocation`

UNION ALL
SELECT 'oltp_olist_orders', COUNT(*),
       COUNTIF(created_at IS NULL), COUNTIF(updated_at IS NULL),
       COUNTIF(source_file IS NULL), COUNTIF(source_gcs_path IS NULL),
       COUNTIF(batch_name IS NULL)
FROM `western-beanbag-496804-a4.olin_bronze.oltp_olist_orders`

UNION ALL
SELECT 'oltp_olist_order_items', COUNT(*),
       COUNTIF(created_at IS NULL), COUNTIF(updated_at IS NULL),
       COUNTIF(source_file IS NULL), COUNTIF(source_gcs_path IS NULL),
       COUNTIF(batch_name IS NULL)
FROM `western-beanbag-496804-a4.olin_bronze.oltp_olist_order_items`

UNION ALL
SELECT 'oltp_olist_order_payments', COUNT(*),
       COUNTIF(created_at IS NULL), COUNTIF(updated_at IS NULL),
       COUNTIF(source_file IS NULL), COUNTIF(source_gcs_path IS NULL),
       COUNTIF(batch_name IS NULL)
FROM `western-beanbag-496804-a4.olin_bronze.oltp_olist_order_payments`

UNION ALL
SELECT 'oltp_olist_order_reviews', COUNT(*),
       COUNTIF(created_at IS NULL), COUNTIF(updated_at IS NULL),
       COUNTIF(source_file IS NULL), COUNTIF(source_gcs_path IS NULL),
       COUNTIF(batch_name IS NULL)
FROM `western-beanbag-496804-a4.olin_bronze.oltp_olist_order_reviews`

UNION ALL
SELECT 'oltp_olist_products', COUNT(*),
       COUNTIF(created_at IS NULL), COUNTIF(updated_at IS NULL),
       COUNTIF(source_file IS NULL), COUNTIF(source_gcs_path IS NULL),
       COUNTIF(batch_name IS NULL)
FROM `western-beanbag-496804-a4.olin_bronze.oltp_olist_products`

UNION ALL
SELECT 'oltp_olist_sellers', COUNT(*),
       COUNTIF(created_at IS NULL), COUNTIF(updated_at IS NULL),
       COUNTIF(source_file IS NULL), COUNTIF(source_gcs_path IS NULL),
       COUNTIF(batch_name IS NULL)
FROM `western-beanbag-496804-a4.olin_bronze.oltp_olist_sellers`

UNION ALL
SELECT 'oltp_product_category_name_translation', COUNT(*),
       COUNTIF(created_at IS NULL), COUNTIF(updated_at IS NULL),
       COUNTIF(source_file IS NULL), COUNTIF(source_gcs_path IS NULL),
       COUNTIF(batch_name IS NULL)
FROM `western-beanbag-496804-a4.olin_bronze.oltp_product_category_name_translation`

ORDER BY table_name;