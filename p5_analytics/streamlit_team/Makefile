# Olist team deck (Streamlit, multipage) — local run, container & Cloud Run deploy.
# Override on the CLI, e.g. `make run PORT=8502`.
ENV        ?= prod
PROJECT    ?= sctp-team2-project2-elt
REGION     ?= us-central1
REPO       ?= olist-elt
SERVICE    ?= olist-streamlit-team
# Versioning: semantic version from the VERSION file, plus the short git SHA so every
# image is traceable. CI overrides GIT_SHA/BUILD_TIME; locally they fall back to git.
VERSION    ?= $(shell cat VERSION 2>/dev/null || echo 0.0.0)
GIT_SHA    ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo dev)
BUILD_TIME ?= $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
# Docker tags can't contain '+', so swap it for '_' (e.g. 0.1.0+build.42 -> 0.1.0_build.42).
TAG        ?= $(subst +,_,$(VERSION))-$(GIT_SHA)
IMAGE      ?= $(REGION)-docker.pkg.dev/$(PROJECT)/$(REPO)/$(SERVICE):$(TAG)
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
	  --platform managed --allow-unauthenticated --memory 1Gi --cpu 1 --port 8080 \
	  --set-env-vars APP_VERSION=$(VERSION),GIT_SHA=$(GIT_SHA),BUILD_TIME=$(BUILD_TIME)

clean:
	rm -rf __pycache__ */__pycache__ lib/__pycache__ pages/__pycache__
