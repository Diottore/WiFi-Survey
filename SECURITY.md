# Security Policy

## Supported Versions

Currently supported versions of WiFi Survey with security updates:

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in WiFi Survey, please report it by:

1. **DO NOT** open a public issue
2. Email the maintainer with details of the vulnerability
3. Include steps to reproduce the issue if possible
4. Allow reasonable time for a fix before public disclosure

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

## Security Best Practices

When using WiFi Survey:

1. **Network Security**
   - Only run the Flask application on trusted networks
   - Use `127.0.0.1` (localhost) unless you need network access
   - If using `0.0.0.0`, ensure your network is properly secured

2. **Configuration**
   - Never commit `config.local.ini` or files with sensitive data
   - Keep your server IP addresses private
   - Use strong network passwords

3. **Updates**
   - Keep dependencies up to date
   - Regularly check for security updates in requirements.txt
   - Monitor GitHub security advisories

4. **Permissions**
   - Only grant necessary Android permissions
   - Review Termux permissions regularly

## Known Security Considerations

1. **No Authentication**: The Flask application does not include authentication. This is by design for local use, but means you should:
   - Only expose it on trusted networks
   - Use firewall rules to restrict access
   - Consider adding authentication if deploying in multi-user environments

2. **Command Injection**: The application executes system commands (ping, iperf3). Input validation is implemented, but:
   - Review code before deploying in production
   - Run with minimal necessary privileges
   - Monitor for unusual activity

3. **Data Privacy**: Survey results may contain sensitive network information:
   - Store results securely
   - Clean up old data regularly
   - Be aware of data protection regulations in your jurisdiction

## Responsible Disclosure

We appreciate responsible disclosure of security vulnerabilities. We will:

- Acknowledge receipt within 48 hours
- Provide an estimated timeline for a fix
- Keep you informed of progress
- Credit you in the security advisory (if desired)

Thank you for helping keep WiFi Survey secure!
