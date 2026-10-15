# Security Policy

## Reporting Security Vulnerabilities

If you discover a security vulnerability in Evolu, please help keep the project secure by disclosing it responsibly.

### How to Report

**Please DO NOT open a public GitHub issue for security vulnerabilities.**

Instead, use GitHub's [private vulnerability reporting](https://github.com/evoluhq/evolu/security/advisories/new) feature.

If private vulnerability reporting is unavailable, or you suspect that the evoluhq GitHub organization or an Evolu package on npm or Docker Hub has been compromised, email daniel@steigerwald.cz. If a published version is malicious, also [report it to npm](https://docs.npmjs.com/reporting-malware-in-an-npm-package), which can remove it without waiting for the maintainer.

### Response Time

This project is maintained by a single volunteer. Expect a first response within one day.

## Supported Versions

Security fixes are released only for the latest version of each package.

## Security Considerations

### Important Notice

While Evolu is developed with care, please note:

- This is a volunteer-maintained project
- It has NOT undergone professional security audits yet
- Use in production or security-critical contexts is at your own risk

### Supply Chain

How releases reach npm and Docker Hub, and how to verify them, is described in [Supply chain](https://www.evolu.dev/docs/supply-chain).

## Disclosure Policy

When a vulnerability is confirmed:

1. A fix is developed privately in a GitHub security advisory
2. A new version is released with the fix
3. The advisory is published with the release, so that Dependabot and `npm audit` can warn apps that use an affected version

For non-security issues, please use GitHub Issues.
