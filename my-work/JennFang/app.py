import streamlit as st
from google.cloud import bigquery
import pandas as pd
import altair as alt  # Added for advanced chart sorting

# 1. Set up the page layout
st.set_page_config(page_title="Olist Advanced Analytics Dashboard", layout="wide")
st.title("🌟 Olist Executive Data Dashboard")
st.markdown("Directly reading from Gold-layer tables in BigQuery")
2
# 2. Initialize BigQuery Client
client = bigquery.Client(project="olist-data-pipeline-498714")

# 3. Fetch Data from DimCustomer
@st.cache_data
def load_dashboard_data():
    query = """
        SELECT 
            customer_id, 
            total_orders_placed, 
            customer_lifetime_value
        FROM `olist-data-pipeline-498714.analytics_analytics.DimCustomer`
        ORDER BY customer_lifetime_value DESC
    """
    query_job = client.query(query)
    df = query_job.to_dataframe()
    
    # Shorten the customer ID for clean display on the graph axis
    df['customer_display_id'] = df['customer_id'].str.slice(0, 8)
    return df

@st.cache_data
def load_sample_sales():
    query = """
        SELECT 
            order_id,
            price,
            freight_value,
            total_sale_amount, 
            total_order_payment_amount, 
            average_review_score
        FROM `olist-data-pipeline-498714.analytics_analytics.FactSales`
        LIMIT 50
    """
    query_job = client.query(query)
    return query_job.to_dataframe()

# Load the data blocks
df_customers = load_dashboard_data()
df_sales = load_sample_sales()

# 4. Create High-Level Metrics (KPIs)
total_customers = len(df_customers)
total_revenue = df_customers['customer_lifetime_value'].sum()

col1, col2 = st.columns(2)
with col1:
    st.metric(label="Total Unique Customers", value=f"{total_customers:,}")
with col2:
    st.metric(label="Total Lifetime Value (Revenue)", value=f"${total_revenue:,.2f}")

st.write("---")

# 5. Visualizing Top Customer Value (FORCED DESCENDING VIA ALTAIR)
st.subheader("📊 Visualizing Top Customer Value (Descending)")

# Grab top 10 for the chart
top_10_customers = df_customers.head(10)

# Build an Altair chart that explicitly forces descending sort on the X axis
chart = alt.Chart(top_10_customers).mark_bar().encode(
    x=alt.X('customer_display_id:N', sort='-y', title='Customer ID (Shortened)'),
    y=alt.Y('customer_lifetime_value:Q', title='Customer Lifetime Value ($)'),
    color=alt.value('#1f77b4')  # Nice clean blue color
).properties(
    height=400
)

# Render the chart inside Streamlit
st.altair_chart(chart, use_container_width=True)

# 6. Show Customer Table
st.subheader("🏆 Top Customers Rankings")
st.dataframe(df_customers.drop(columns=['customer_display_id']).head(10), use_container_width=True)

st.write("---")

# 7. New Derived Columns Section (Task 3 Verification)
st.subheader("🔍 FactSales Derived Metrics Verification")
st.markdown("This section showcases the 3 derived metrics engineered in your `FactSales` table:")

st.dataframe(
    df_sales[[
        'order_id', 
        'price', 
        'freight_value', 
        'total_sale_amount', 
        'total_order_payment_amount', 
        'average_review_score'
    ]].head(10), 
    use_container_width=True
)