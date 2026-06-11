SELECT 'dim_customer' AS table_name, COUNT(*) AS row_count
FROM `western-beanbag-496804-a4.olist.dim_customer`

UNION ALL
SELECT 'dim_product', COUNT(*)
FROM `western-beanbag-496804-a4.olist.dim_product`

UNION ALL
SELECT 'dim_seller', COUNT(*)
FROM `western-beanbag-496804-a4.olist.dim_seller`

UNION ALL
SELECT 'dim_date', COUNT(*)
FROM `western-beanbag-496804-a4.olist.dim_date`

UNION ALL
SELECT 'dim_location', COUNT(*)
FROM `western-beanbag-496804-a4.olist.dim_location`

UNION ALL
SELECT 'fact_sales', COUNT(*)
FROM `western-beanbag-496804-a4.olist.fact_sales`;