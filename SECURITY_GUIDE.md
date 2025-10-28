# Security Best Practices for WiFi Survey

## Overview

This document outlines security considerations and best practices for deploying and using the WiFi Survey application.

## Network Security

### 1. Server Exposure

- **Default Configuration**: The application binds to `0.0.0.0` by default, making it accessible from any network interface.
- **Recommendation**: For production use, bind to `127.0.0.1` (localhost only) or specific IP addresses.

```ini
[server]
flask_host = 127.0.0.1  # Only local access
# OR
flask_host = 192.168.1.100  # Specific interface
```

### 2. iperf3 Server Security

- Run iperf3 server on a dedicated, isolated network segment
- Use firewall rules to restrict access to trusted devices only
- Consider using iperf3 authentication if available in your version

### 3. SSH Security (for iperf3_automation.py)

- Always use SSH key-based authentication (never passwords)
- Restrict SSH key permissions: `chmod 600 ~/.ssh/id_rsa`
- Use different keys for different environments
- Consider using SSH certificates for better key management

```python
# Security flags already implemented in iperf3_automation.py
ssh.connect(
    host,
    username=user,
    key_filename=key,
    look_for_keys=False,  # Only use specified key
    allow_agent=False      # Don't use SSH agent
)
```

## Data Security

### 1. Configuration Files

- **Never commit** `config.local.ini` to version control (already in `.gitignore`)
- Store sensitive configuration separately
- Use environment variables for sensitive data in production

### 2. Results Data

- Results in `raw_results/` and CSV files may contain sensitive network information
- Review data before sharing
- Consider encrypting stored results if they contain sensitive information

### 3. API Endpoints

- The application does not implement authentication by default
- For production use, consider adding:
  - API keys
  - OAuth2/JWT authentication
  - Rate limiting
  - CORS restrictions

## Android/Termux Security

### 1. Permissions

Required permissions:
- **Location**: For WiFi information (SSID, BSSID, RSSI)
- **Storage**: For saving results
- **Network**: For iperf3 tests

Minimize permissions:
- Only grant necessary permissions
- Review app permissions regularly

### 2. Network Restrictions

- Only run tests on trusted WiFi networks
- Avoid running on public WiFi
- Be aware of data usage for cellular connections

### 3. Battery Optimization

- Disable battery optimization for Termux during active surveys
- Use `termux-wake-lock` to prevent sleep during tests
- Remember to `termux-wake-unlock` when finished

## Input Validation

The application implements comprehensive input validation:

- Device names: Max 100 characters
- Point IDs: Max 50 characters
- Run index: 1-1000
- Duration: 1-300 seconds
- Parallel streams: 1-16
- Repeats: 1-100
- Points count: Max 1000

All inputs are validated and sanitized to prevent:
- Command injection
- Path traversal
- Buffer overflow
- DoS attacks

## Secure Deployment Checklist

### Pre-deployment

- [ ] Review and update `config.local.ini`
- [ ] Change default flask_host if needed
- [ ] Verify iperf3 server is properly secured
- [ ] Check SSH keys permissions (600)
- [ ] Review firewall rules

### During Deployment

- [ ] Use HTTPS if exposing to internet (requires reverse proxy)
- [ ] Implement authentication if multi-user
- [ ] Set up logging and monitoring
- [ ] Configure backup for results

### Post-deployment

- [ ] Monitor logs for suspicious activity
- [ ] Regular security updates
- [ ] Rotate SSH keys periodically
- [ ] Review stored data retention policies

## Common Security Mistakes to Avoid

1. **Don't expose the Flask development server to the internet**
   - Use a production WSGI server (gunicorn, uWSGI) with nginx/apache

2. **Don't use root/administrator privileges**
   - Run as a regular user with minimal permissions

3. **Don't share config files**
   - They may contain network topology information

4. **Don't ignore HTTPS**
   - If accessible from network, use TLS/SSL

5. **Don't skip updates**
   - Keep dependencies updated for security patches

## Reporting Security Issues

If you discover a security vulnerability:

1. **Do NOT** open a public issue
2. Email the maintainers privately (see SECURITY.md)
3. Provide detailed information about the vulnerability
4. Allow time for a fix before public disclosure

## Additional Resources

- [Flask Security Best Practices](https://flask.palletsprojects.com/en/latest/security/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Termux Wiki - Security](https://wiki.termux.com/wiki/Main_Page)

## Version

Last updated: 2025-10-28
Document version: 1.0
