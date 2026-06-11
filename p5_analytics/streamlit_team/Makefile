# Olist team deck (Streamlit, multipage) — local run, container & Cloud Run deploy.
# Override on the CLI, e.g. `make run PORT=8502`.
ENV        ?= prod
PROJECT    ?= sctp-team2-project2-elt
REGION     ?= us-central1
REPO       ?= olist-elt
SERVICE    ?= olist-streamlit-team
IMAGE      ?= $(REGION)-docker.pkg.dev/$(PROJECT)/$(REPO)/$(SERVICE):latest
PORT       ?= 8501
PY         ?= .venv/bin/python

.PHONY: help venv run docker-build docker-run deploy clean

help:
	@echo "make venv          - create .venv (Python 3.11) and install requirements"
	@echo "make run           - run the app locally on :$(PORT) (live BigQuery)"
	@echo "make docker-build  - build the container image"
	@echo "make docker-run    - run the image locally on :$(PORT)"
	@echo "make deploy        - build via Cloud Build + deploy to Cloud Run (live BQ)"

venv:
	python3.11 -m venv .venv && $(PY) -m pip install -U pip && $(PY) -m pip install -r requirements.txt

run:
	ENV=$(ENV) .venv/bin/streamlit run app.py --server.port=$(PORT)

docker-build:
	docker build -t $(SERVICE):local .

docker-run:
	docker run --rm -p $(PORT):8080 -e PORT=8080 $(SERVICE):local

deploy:
	gcloud builds submit --tag $(IMAGE) --project $(PROJECT) .
	gcloud run deploy $(SERVICE) --image $(IMAGE) --project $(PROJECT) --region $(REGION) \
	  --platform managed --allow-unauthenticated --memory 1Gi --cpu 1 --port 8080

clean:
	rm -rf __pycache__ */__pycache__ lib/__pycache__ pages/__pycache__
