.PHONY: help setup test test-python test-js test-sdk test-libs build data site zip clean

VENV := python-toolkit/venv
PY := $(CURDIR)/$(VENV)/bin/python

help:
	@echo "make setup        create a Python venv and install Python + Node dependencies"
	@echo "make test         run all test suites"
	@echo "make test-libs    run the shared-library tests (Python + JS)"
	@echo "make build        rebuild botbench-sdk/dist from src"
	@echo "make data         regenerate files derived from data/reference-data.json"
	@echo "make site         assemble the GitHub Pages site into _site/"
	@echo "make zip          make release/botbench-dev.zip (committed files only inside a git repo)"

setup: $(VENV)/bin/pip
	cd python-toolkit && $(PY) -m pip install -q -r requirements.txt -r requirements-extra.txt
	cd js-toolkit && npm ci
	cd botbench-sdk && npm ci
	cd libs/js && npm ci

$(VENV)/bin/pip:
	python3 -m venv $(VENV)

test: test-python test-js test-sdk test-libs

test-python: $(VENV)/bin/pip
	cd python-toolkit && $(PY) -m unittest discover -s tests

test-js:
	cd js-toolkit && npm test

test-sdk: build
	cd botbench-sdk && npm test

test-libs: $(VENV)/bin/pip
	cd libs/python && $(PY) -m unittest discover -s tests
	cd libs/js && npm test

build:
	cd botbench-sdk && node build.js

data:
	node scripts/generate-data.js
	cd botbench-sdk && node build.js

site:
	bash scripts/build-site.sh

zip:
	bash scripts/make-zip.sh dev

clean:
	rm -rf _site release $(VENV)
	find . -name __pycache__ -type d -prune -exec rm -rf {} +
	find . -name "*.egg-info" -type d -prune -exec rm -rf {} +
