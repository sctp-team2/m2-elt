# Olist team deck (Streamlit, multipage) — image for Cloud Run / local.
#
# Connects to BigQuery live at runtime. Locally, mount or bake a service-account key
# and set GOOGLE_APPLICATION_CREDENTIALS; on Cloud Run, rely on the attached service
# account (ADC) — no key needed.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8080

# Streamlit binds to $PORT (Cloud Run injects it).
CMD exec streamlit run app.py \
    --server.port=$PORT \
    --server.address=0.0.0.0 \
    --server.headless=true \
    --browser.gatherUsageStats=false
