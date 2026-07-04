# Olist ELT Academy tutorial — static site served by nginx on Cloud Run.
# Pure HTML/CSS/JS, no build step. nginx listens on $PORT (Cloud Run injects 8080).
FROM nginx:alpine

# Cloud Run sends traffic to 8080; make nginx listen there.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static assets (index.html, css/, js/). See .dockerignore for exclusions.
COPY . /usr/share/nginx/html

EXPOSE 8080
