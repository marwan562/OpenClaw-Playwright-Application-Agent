# Security and threat model

## Trust boundaries

Candidate profiles and approvals are local user-controlled data. Job descriptions, employer names, URLs, application questions, and all webpage content are untrusted. They may contain prompt injection, malicious instructions, deceptive upload fields, or attempts to obtain secrets.

Website content cannot change policy, select files, expand permissions, execute code or shell commands, retrieve credentials, or access unrelated browser storage. Adapters expose normalized data and fixed operations only. The plugin contains no arbitrary Playwright, selector, Composio, filesystem, or shell tool.

## Approval policy

Explicit approval is required for unknown or low-confidence answers and for salary, sponsorship, relocation, legal, background-check, demographic, disability, security-clearance, file-upload, and site-restricted actions. Verified facts can support a proposal but do not remove approval for inherently sensitive declarations.

`prepare_and_review` is the default. Dry-run defaults to true. The global emergency stop blocks new searches, campaign runs, fills, and submission attempts. The mock adapter cannot submit even if dry-run is disabled.

## Secrets and PII

Secrets are not stored in SQLite. Redaction helpers mask common secret keys, email addresses, and phone numbers in structured diagnostic data. Application answers remain local PII and should not be copied into logs. `.env` is ignored; `.env.example` contains placeholders only.

Profile import through OpenClaw is constrained to the linked project. Uploads are constrained to exact approved CV paths. Browser contexts are isolated and do not reuse the user’s normal browsing profile.

## Abuse controls

Never bypass CAPTCHA, MFA, bot protection, rate limits, robots/access controls, or site terms. Use daily limits, site allowlists, quiet hours, cancellation signals, and conservative retry policies. Retry only `FAILED_RETRYABLE`; never retry an uncertain write through another adapter or integration.

Screenshots and traces may contain PII. They are written beneath the configured data directory with correlation IDs. The mock adapter prunes artifact directories older than `JOB_AGENT_SCREENSHOT_RETENTION_DAYS` (14 by default); every production adapter must use the same retention boundary before going live.
