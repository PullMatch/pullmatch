# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in PullMatch, please report it responsibly.

**Email:** security@pullmatch.dev

Please include:

- A description of the vulnerability
- Steps to reproduce the issue
- Any potential impact you've identified

We will acknowledge receipt within 48 hours and aim to provide a fix or mitigation plan within 7 days for critical issues.

**Do not** open a public GitHub issue for security vulnerabilities.

## What Data PullMatch Accesses

PullMatch is a GitHub App with **read-only** permissions:

- **Pull request metadata** — title, description, changed file list, author
- **Commit history** — contributor names and file-level commit counts (used for reviewer scoring)
- **CODEOWNERS file** — parsed to boost designated code owners in suggestions
- **Repository metadata** — organization, repo name, default branch

## What PullMatch Does NOT Access

- **Source code content** — PullMatch never reads, downloads, or stores the contents of your files
- **Credentials or secrets** — no access to environment variables, tokens, or secret scanning results
- **Issues, wikis, or discussions** — only pull request events are processed
- **Write access** — PullMatch cannot push code, merge PRs, or modify repository settings (except posting PR comments and optionally assigning reviewers)

## Data Handling

- **No persistent storage of your code.** All analysis is transient — performed in memory at the time a PR event is received, then discarded.
- **No data is shared with third parties.**
- **Webhook payloads** are verified via HMAC signature (`X-Hub-Signature-256`) before processing.
- **Private keys and secrets** are stored securely and never committed to source control.

## Supported Versions

| Version | Supported |
| ------- | --------- |
| Latest  | Yes       |

We only support the latest deployed version of PullMatch. Update by reinstalling the GitHub App if prompted.

## Security Best Practices for Users

- Use a strong, unique webhook secret when self-hosting
- Rotate your GitHub App private key periodically
- Review the App's permissions in your GitHub organization settings
- Monitor the GitHub App's installation access in **Settings > Integrations**
