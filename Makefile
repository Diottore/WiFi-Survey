.PHONY: help install install-dev test lint format clean run

help:  ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

install:  ## Install production dependencies
	pip install -r requirements.txt

install-dev:  ## Install development dependencies
	pip install -r requirements.txt
	pip install pylint flake8 black isort pre-commit
	pre-commit install

test:  ## Run syntax checks
	@echo "Checking Python syntax..."
	python3 -m py_compile app.py
	python3 -m py_compile iperf3_automation.py
	@echo "✓ Syntax checks passed"

lint:  ## Run linters
	@echo "Running flake8..."
	flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics --exclude=.venv,venv,env || true
	flake8 . --count --max-complexity=10 --max-line-length=120 --statistics --exclude=.venv,venv,env || true
	@echo "Running pylint..."
	pylint app.py iperf3_automation.py || true

format:  ## Format code with black and isort
	@echo "Formatting Python code..."
	black --line-length=120 *.py || echo "black not installed, skipping"
	isort --profile=black --line-length=120 *.py || echo "isort not installed, skipping"
	@echo "✓ Code formatted"

clean:  ## Clean generated files
	@echo "Cleaning generated files..."
	find . -type f -name '*.pyc' -delete
	find . -type d -name '__pycache__' -delete
	find . -type f -name '*.log' -delete
	rm -rf .pytest_cache
	rm -rf htmlcov
	rm -rf .coverage
	@echo "✓ Cleaned"

run:  ## Run the Flask application
	python3 app.py

setup-config:  ## Create local configuration file
	@if [ ! -f config.local.ini ]; then \
		cp config.ini config.local.ini; \
		echo "✓ Created config.local.ini - Please edit with your settings"; \
	else \
		echo "config.local.ini already exists"; \
	fi

check-deps:  ## Check if required commands are available
	@echo "Checking dependencies..."
	@command -v python3 >/dev/null 2>&1 || echo "⚠️  python3 not found"
	@command -v pip >/dev/null 2>&1 || echo "⚠️  pip not found"
	@command -v iperf3 >/dev/null 2>&1 || echo "⚠️  iperf3 not found"
	@command -v jq >/dev/null 2>&1 || echo "⚠️  jq not found"
	@echo "✓ Dependency check complete"
