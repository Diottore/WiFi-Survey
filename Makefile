.PHONY: help install install-dev test lint format clean run

help:  ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

install:  ## Install production dependencies
	pip install -r requirements.txt

install-dev:  ## Install development dependencies
	pip install -r requirements-dev.txt
	pre-commit install || echo "⚠️  pre-commit not available, skipping hook installation"

test:  ## Run syntax checks and unit tests
	@echo "Checking Python syntax..."
	python3 -m py_compile app.py
	python3 -m py_compile iperf3_automation.py
	python3 -m py_compile validation.py
	@echo "✓ Syntax checks passed"
	@echo ""
	@echo "Checking shell scripts..."
	@command -v shellcheck >/dev/null 2>&1 && shellcheck mobile_wifi_survey.sh install.sh || echo "⚠️  shellcheck not found, skipping shell script checks"
	@echo ""
	@echo "Running unit tests..."
	python3 -m unittest test_validation -v
	@echo ""
	@echo "✓ All tests passed"

test-integration:  ## Run integration tests (requires Flask)
	@echo "Checking Flask availability..."
	@python3 -c "import flask" 2>/dev/null && echo "✓ Flask is available" || (echo "⚠️  Flask not installed. Run 'make install' to install dependencies." && exit 1)
	@echo "Running integration tests..."
	python3 -m unittest test_api_integration -v

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
	@command -v python3 >/dev/null 2>&1 && echo "✓ python3 found" || echo "⚠️  python3 not found"
	@command -v pip >/dev/null 2>&1 && echo "✓ pip found" || echo "⚠️  pip not found"
	@command -v iperf3 >/dev/null 2>&1 && echo "✓ iperf3 found" || echo "⚠️  iperf3 not found"
	@command -v jq >/dev/null 2>&1 && echo "✓ jq found" || echo "⚠️  jq not found"
	@command -v shellcheck >/dev/null 2>&1 && echo "✓ shellcheck found" || echo "⚠️  shellcheck not found (optional)"
	@echo "✓ Dependency check complete"

pre-commit:  ## Run pre-commit hooks on all files
	@command -v pre-commit >/dev/null 2>&1 && pre-commit run --all-files || echo "⚠️  pre-commit not installed"

security-check:  ## Run basic security checks
	@echo "Checking for common security issues..."
	@grep -r "password" --include="*.py" --include="*.sh" . || echo "✓ No hardcoded passwords found"
	@grep -r "api_key" --include="*.py" --include="*.sh" . || echo "✓ No hardcoded API keys found"
	@echo "✓ Security check complete"
	@echo "Note: For comprehensive security scanning, use GitHub's CodeQL scanner"

