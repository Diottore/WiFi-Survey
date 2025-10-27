# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `requirements.txt` for Python dependency management
- `.editorconfig` for consistent code formatting across editors
- `config.ini` for centralized configuration
- Configuration loading from `config.local.ini` or `config.ini`
- Input validation for all API endpoints
- Comprehensive error handling and logging
- `.pylintrc` for Python linting configuration
- `CONTRIBUTING.md` with contribution guidelines
- GitHub Actions CI workflow for automated testing
- Issue templates (bug report, feature request)
- Pull request template
- `.pre-commit-config.yaml` for pre-commit hooks
- `SECURITY.md` with security policy and best practices
- Enhanced README.md with badges, better structure, and comprehensive documentation
- Logging throughout the Flask application

### Changed
- Improved `.gitignore` with comprehensive Python patterns
- Enhanced `install.sh` with better error handling and user feedback
- Refactored `app.py` to use centralized configuration
- Updated Flask application to read from config files instead of hardcoded values
- Improved validation for duration, parallel streams, repeats, and point names

### Fixed
- Configuration now properly validates ranges for duration and parallel streams

### Security
- Added input validation to prevent injection attacks
- Added limits on request parameters (max points, max repeats, etc.)
- Improved error handling to prevent information disclosure

## [1.0.0] - Initial Release

### Added
- Flask web application for WiFi survey measurements
- Real-time measurement visualization with Apache ECharts
- Support for single point measurements
- Support for multi-point survey campaigns
- Manual and automatic measurement modes
- CSV and JSON export functionality
- Mobile-friendly web interface
- Bash script for console-based surveys
- iperf3 automation script for multiple agents
- Comprehensive documentation and procedures
